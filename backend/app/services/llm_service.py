from __future__ import annotations

import os
import re
import threading
from multiprocessing import get_context
from pathlib import Path

from app.agents import get_agent_spec
from app.core.config import LOCAL_MODELS_DIR, OFFLINE_MODELS_DIR
from app.core.logging_config import logger

_MODEL_LOCK = threading.Lock()
_WORKER_LOCK = threading.Lock()
_INFERENCE_LOCK = threading.Lock()

_MAX_PROMPT_CHARS = int(os.getenv("VAGMI_AI_PROMPT_CHARS", "9000"))
_WORKER_START_TIMEOUT = int(os.getenv("VAGMI_AI_WORKER_START_TIMEOUT", "90"))
_WORKER_RESPONSE_TIMEOUT = int(os.getenv("VAGMI_AI_WORKER_RESPONSE_TIMEOUT", "180"))

_WORKER_PROCESS = None
_WORKER_CONN = None
_WORKER_MODEL_PATH = None

_GGUF_CANDIDATE_NAMES = (
    "qwen2.5-7b-instruct-q4",
    "qwen2.5-3b-instruct-q4",
    "qwen2.5-7b-instruct-q4_k_m.gguf",
    "qwen2.5-3b-instruct-q4_k_m.gguf",
)


def resolve_local_model_path() -> str | None:
    """Resolve a usable local model path/file without touching the network."""
    env_override = os.getenv("VAGMI_AI_MODEL_PATH", "").strip() or None
    candidates: list[str] = [c for c in (env_override,) if c]

    for root in (LOCAL_MODELS_DIR, OFFLINE_MODELS_DIR):
        if not root.exists():
            continue
        for name in _GGUF_CANDIDATE_NAMES:
            candidates.append(str(root / name))
        candidates.extend(str(p) for p in root.glob("*.gguf"))

    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return str(Path(candidate))
    return None


def has_local_model() -> bool:
    return resolve_local_model_path() is not None


def _extract_reply_text(result) -> str:
    if not isinstance(result, dict):
        return ""
    choices = result.get("choices") or []
    if not choices:
        return ""
    first = choices[0] or {}
    text = first.get("text")
    if isinstance(text, str) and text.strip():
        return text.strip()
    message = first.get("message") or {}
    if isinstance(message, dict):
        content = message.get("content")
        if isinstance(content, str):
            return content.strip()
    return ""


def _collapse_repeated_lines(text: str) -> str:
    lines: list[str] = []
    previous = None
    for raw_line in (text or "").splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if not line:
            if lines and lines[-1] != "":
                lines.append("")
            continue
        if line == previous:
            continue
        previous = line
        lines.append(line)
    return "\n".join(lines).strip()


def _dedupe_sentences(text: str) -> str:
    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", _collapse_repeated_lines(text)) if part.strip()]
    if not sentences:
        return ""

    deduped: list[str] = []
    seen: set[str] = set()
    for sentence in sentences:
        normalized = re.sub(r"\s+", " ", sentence).strip().lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(sentence)

    return " ".join(deduped).strip()


def _looks_repetitive(text: str) -> bool:
    cleaned = _collapse_repeated_lines(text)
    if not cleaned:
        return True

    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", cleaned) if part.strip()]
    if len(sentences) < 3:
        return False

    normalized = [re.sub(r"\s+", " ", sentence).lower() for sentence in sentences]
    if len(set(normalized)) <= max(1, len(normalized) // 4):
        return True

    repeated_runs = 1
    longest_run = 1
    for prev, current in zip(normalized, normalized[1:]):
        if current == prev:
            repeated_runs += 1
            longest_run = max(longest_run, repeated_runs)
        else:
            repeated_runs = 1
    return longest_run >= 4


def _clean_reply_text(text: str) -> str:
    cleaned = _dedupe_sentences(text)
    if not cleaned:
        return ""

    boilerplate_patterns = (
        r"^(here is|here's) what the retrieved passages say[:\-\s]*",
        r"^(here is|here's) a grounded summary based on the retrieved passages[:\-\s]*",
        r"^(here is|here's) a draft grounded in the retrieved passages[:\-\s]*",
        r"^(this document appears to focus on)\s+",
        r"^(this response is grounded in \d+ retrieved passage\(s\)\.\s*)",
        r"^(answer|summary|diagram|document|clarification)[:\-]\s*",
    )
    for pattern in boilerplate_patterns:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE).strip()

    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def _strip_prompt_echo(text: str) -> str:
    text = (text or "").strip()
    for prefix in ("Assistant:", "assistant:", "Response:", "response:"):
        if text.startswith(prefix):
            text = text[len(prefix):].lstrip()
    return text.strip()


def _prepare_prompt_for_model(prompt_bundle: str) -> str:
    prompt = (prompt_bundle or "").strip()
    if len(prompt) <= _MAX_PROMPT_CHARS:
        return prompt

    # Preserve the top-level instructions and user request while trimming older context first.
    sections = [
        "Retrieved passages:",
        "Recent messages:",
        "Selected documents:",
    ]
    trimmed = prompt
    for marker in sections:
        if len(trimmed) <= _MAX_PROMPT_CHARS:
            break
        idx = trimmed.find(marker)
        if idx != -1:
            head = trimmed[:idx].rstrip()
            tail = trimmed[idx:]
            tail_limit = max(1000, _MAX_PROMPT_CHARS - len(head) - 120)
            trimmed = (head + "\n\n" + tail[:tail_limit].rstrip()).strip()

    if len(trimmed) > _MAX_PROMPT_CHARS:
        trimmed = trimmed[: _MAX_PROMPT_CHARS - 1].rstrip() + "…"
    return trimmed


def _worker_main(conn, model_path: str, n_ctx: int, n_threads: int) -> None:
    try:
        from llama_cpp import Llama
    except ImportError as exc:
        try:
            conn.send({"type": "load_error", "error": f"llama-cpp-python not installed: {exc}"})
        except Exception:
            pass
        return

    try:
        model = Llama(
            model_path=model_path,
            n_ctx=n_ctx,
            n_threads=n_threads,
            verbose=False,
        )
    except Exception as exc:  # noqa: BLE001
        try:
            conn.send({"type": "load_error", "error": repr(exc)})
        except Exception:
            pass
        return

    try:
        conn.send({"type": "ready"})
    except Exception:
        return

    while True:
        try:
            message = conn.recv()
        except EOFError:
            break
        except Exception:
            break

        if not isinstance(message, dict):
            continue

        kind = message.get("type")
        if kind == "shutdown":
            break
        if kind != "generate":
            continue

        try:
            result = model(
                message.get("prompt", ""),
                max_tokens=int(message.get("max_tokens", 256)),
                temperature=float(message.get("temperature", 0.3)),
                top_p=float(message.get("top_p", 0.9)),
                repeat_penalty=float(message.get("repeat_penalty", 1.1)),
                stop=list(message.get("stop") or []),
                echo=False,
            )
            raw_text = _extract_reply_text(result)
            conn.send({"type": "result", "text": raw_text})
        except Exception as exc:  # noqa: BLE001
            try:
                conn.send({"type": "error", "error": repr(exc)})
            except Exception:
                break

    try:
        conn.close()
    except Exception:
        pass


def _shutdown_worker_locked() -> None:
    global _WORKER_PROCESS, _WORKER_CONN, _WORKER_MODEL_PATH

    conn = _WORKER_CONN
    proc = _WORKER_PROCESS

    _WORKER_CONN = None
    _WORKER_PROCESS = None
    _WORKER_MODEL_PATH = None

    if conn is not None:
        try:
            conn.send({"type": "shutdown"})
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass

    if proc is not None and proc.is_alive():
        try:
            proc.join(timeout=1.0)
        except Exception:
            pass
        if proc.is_alive():
            try:
                proc.terminate()
            except Exception:
                pass
            try:
                proc.join(timeout=2.0)
            except Exception:
                pass


def _ensure_worker(model_path: str) -> bool:
    global _WORKER_PROCESS, _WORKER_CONN, _WORKER_MODEL_PATH

    if not model_path:
        return False

    with _WORKER_LOCK:
        if (
            _WORKER_PROCESS is not None
            and _WORKER_PROCESS.is_alive()
            and _WORKER_CONN is not None
            and _WORKER_MODEL_PATH == model_path
        ):
            return True

        _shutdown_worker_locked()

        try:
            ctx = get_context("spawn")
            parent_conn, child_conn = ctx.Pipe(duplex=True)
            proc = ctx.Process(
                target=_worker_main,
                args=(child_conn, model_path, int(os.getenv("VAGMI_AI_CTX", "4096")), max(1, (os.cpu_count() or 4) - 1)),
                daemon=True,
            )
            proc.start()
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to start the local LLM worker: %s", exc)
            _shutdown_worker_locked()
            return False

        if not parent_conn.poll(_WORKER_START_TIMEOUT):
            logger.warning("Local LLM worker did not become ready in time.")
            try:
                parent_conn.close()
            except Exception:
                pass
            try:
                proc.terminate()
            except Exception:
                pass
            try:
                proc.join(timeout=2.0)
            except Exception:
                pass
            return False

        try:
            ready_message = parent_conn.recv()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to read local LLM worker readiness: %s", exc)
            try:
                parent_conn.close()
            except Exception:
                pass
            try:
                proc.terminate()
            except Exception:
                pass
            try:
                proc.join(timeout=2.0)
            except Exception:
                pass
            return False

        if not isinstance(ready_message, dict) or ready_message.get("type") != "ready":
            logger.warning("Local LLM worker failed to load: %s", ready_message)
            try:
                parent_conn.close()
            except Exception:
                pass
            try:
                proc.terminate()
            except Exception:
                pass
            try:
                proc.join(timeout=2.0)
            except Exception:
                pass
            return False

        _WORKER_PROCESS = proc
        _WORKER_CONN = parent_conn
        _WORKER_MODEL_PATH = model_path
        return True


def generate_local_reply(prompt_bundle: str, routed_agent: str, context: dict) -> str | None:
    model_path = resolve_local_model_path()
    if model_path is None:
        return None

    spec = get_agent_spec(routed_agent)
    generation = spec.generation_defaults()
    max_tokens = int(os.getenv(f"VAGMI_AI_MAX_TOKENS_{spec.name.upper()}", str(generation["max_tokens"])))
    temperature = float(os.getenv(f"VAGMI_AI_TEMPERATURE_{spec.name.upper()}", str(generation["temperature"])))
    top_p = float(os.getenv(f"VAGMI_AI_TOP_P_{spec.name.upper()}", str(generation["top_p"])))
    repeat_penalty = float(os.getenv(f"VAGMI_AI_REPEAT_PENALTY_{spec.name.upper()}", str(generation["repeat_penalty"])))

    full_prompt = _prepare_prompt_for_model(f"{prompt_bundle}\n\nAssistant:")
    stop_tokens = [
        "\nUser:",
        "\nAssistant:",
        "<|im_end|>",
        "<|endoftext|>",
    ]

    with _INFERENCE_LOCK:
        if not _ensure_worker(model_path):
            return None

        conn = _WORKER_CONN
        proc = _WORKER_PROCESS
        if conn is None or proc is None or not proc.is_alive():
            return None

        try:
            conn.send(
                {
                    "type": "generate",
                    "prompt": full_prompt,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "top_p": top_p,
                    "repeat_penalty": repeat_penalty,
                    "stop": stop_tokens,
                }
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to send prompt to the local LLM worker: %s", exc)
            with _WORKER_LOCK:
                _shutdown_worker_locked()
            return None

        if not conn.poll(_WORKER_RESPONSE_TIMEOUT):
            logger.warning("Local LLM worker timed out after %ss.", _WORKER_RESPONSE_TIMEOUT)
            with _WORKER_LOCK:
                _shutdown_worker_locked()
            return None

        try:
            response = conn.recv()
        except EOFError:
            logger.warning("Local LLM worker exited before returning a response.")
            with _WORKER_LOCK:
                _shutdown_worker_locked()
            return None
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to read a response from the local LLM worker: %s", exc)
            with _WORKER_LOCK:
                _shutdown_worker_locked()
            return None

    if not isinstance(response, dict):
        return None

    if response.get("type") == "error":
        logger.warning("Local LLM worker reported an inference error: %s", response.get("error"))
        return None

    if response.get("type") != "result":
        logger.warning("Local LLM worker returned an unexpected payload: %s", response)
        return None

    raw_text = _strip_prompt_echo(str(response.get("text") or ""))
    text = _clean_reply_text(raw_text)

    if not text or len(text) < 20:
        logger.info("Local LLM produced an empty or tiny response; falling back to deterministic reply.")
        return None

    if _looks_repetitive(text):
        cleaned = _clean_reply_text(text)
        if len(cleaned) < 40:
            logger.info("Local LLM response was too repetitive; falling back to deterministic reply.")
            return None
        text = cleaned

    logger.info("LLM generated %d characters.", len(text))
    return text
