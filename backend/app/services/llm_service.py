
from __future__ import annotations

import os
import re
import threading
from pathlib import Path

from app.core.config import LOCAL_MODELS_DIR, OFFLINE_MODELS_DIR
from app.core.logging_config import logger

_MODEL_LOCK = threading.Lock()
_MODEL_INSTANCE = None
_MODEL_LOAD_ATTEMPTED = False

_GGUF_CANDIDATE_NAMES = (
    "qwen2.5-7b-instruct-q4",
    "qwen2.5-3b-instruct-q4",
    "qwen2.5-7b-instruct-q4_k_m.gguf",
    "qwen2.5-3b-instruct-q4_k_m.gguf",
)


def resolve_local_model_path() -> str | None:
    """
    Resolve a usable local model path/file without ever touching the
    network. Checks, in order: an explicit env override, then a small
    set of conventional filenames under the app's local/offline model
    directories.
    """
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


def _try_load_model():
    """
    Attempt to load a local GGUF model through llama-cpp-python, entirely
    offline. Returns None if either the dependency or the model file is unavailable.
    """
    global _MODEL_INSTANCE, _MODEL_LOAD_ATTEMPTED

    with _MODEL_LOCK:
        # If we already successfully loaded it, or permanently failed, return the cached state
        if _MODEL_LOAD_ATTEMPTED:
            return _MODEL_INSTANCE

        model_path = resolve_local_model_path()
        # FIX: Removed the strict .endswith(".gguf") check so models without extensions can load
        if not model_path:
            logger.info("Local LLM scaffold: no local model file found, staying on deterministic fallback.")
            _MODEL_LOAD_ATTEMPTED = True
            return None

        try:
            from llama_cpp import Llama  # offline-only dependency
        except ImportError:
            logger.info("Local LLM scaffold: llama-cpp-python not installed, staying on deterministic fallback.")
            _MODEL_LOAD_ATTEMPTED = True
            return None

        try:
            n_threads = max(1, (os.cpu_count() or 4) - 1)
            print(f"===== ABOUT TO LOAD MODEL: {model_path} =====")
            _MODEL_INSTANCE = Llama(
                model_path=model_path,
                n_ctx=int(os.getenv("VAGMI_AI_CTX", "4096")),
                n_threads=n_threads,
                verbose=False,
            )
            print("===== MODEL LOADED SUCCESSFULLY =====")
            logger.info(
                "Loaded GGUF model: %s | ctx=%s | threads=%s",
                model_path,
                os.getenv("VAGMI_AI_CTX", "4096"),
                n_threads,
            )
            _MODEL_LOAD_ATTEMPTED = True
        except Exception as exc:  # noqa: BLE001
            logger.warning("Local LLM scaffold: failed to load %s (%s), staying on deterministic fallback.", model_path, exc)
            _MODEL_INSTANCE = None
            _MODEL_LOAD_ATTEMPTED = True # Only lock it as failed if it legitimately crashed during load

        return _MODEL_INSTANCE


def _extract_reply_text(result) -> str:
    if not isinstance(result, dict):
        return ""
    choices = result.get("choices") or []
    if not choices:
        return ""
    first = choices[0] or {}
    message = first.get("message") or {}
    if isinstance(message, dict):
        content = message.get("content")
        if isinstance(content, str):
            return content.strip()
    text = first.get("text")
    return text.strip() if isinstance(text, str) else ""


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
    if len(sentences) < 2:
        return False

    normalized = [re.sub(r"\s+", " ", sentence).lower() for sentence in sentences]
    # More lenient check - only reject if 80% or more are duplicates
    if len(set(normalized)) <= max(1, len(normalized) // 5):
        return True

    repeated_runs = 1
    longest_run = 1
    for prev, current in zip(normalized, normalized[1:]):
        if current == prev:
            repeated_runs += 1
            longest_run = max(longest_run, repeated_runs)
        else:
            repeated_runs = 1
    # Only reject if 4+ consecutive identical sentences
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
        r"^(this response is grounded in \d+ retrieved passage\(s\)\.?\s*)",
    )
    for pattern in boilerplate_patterns:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE).strip()

    cleaned = re.sub(r"^(query|summary|diagram|document)[:\-]\s*", "", cleaned, flags=re.IGNORECASE).strip()
    return cleaned



def generate_local_reply(prompt_bundle: str, routed_agent: str, context: dict) -> str | None:
    model = _try_load_model()
    if model is None:
        return None

    # Keep the system instruction incredibly simple
    system_hint = "You are Vāgmi, a helpful and precise offline AI assistant."

    try:
        print("===== STARTING INFERENCE =====")
        messages = [
            {"role": "system", "content": system_hint},
            {"role": "user", "content": prompt_bundle},
        ]

        max_tokens = int(os.getenv("VAGMI_AI_MAX_TOKENS", "512"))
        
        # Rely natively on llama-cpp's auto-formatting for ChatML
        result = model.create_chat_completion(
            messages=messages,
            max_tokens=max_tokens,
            temperature=0.2, 
            top_p=0.85,
        )

        print("===== INFERENCE FINISHED =====")
        
        # Safely extract the text
        raw_text = ""
        if "choices" in result and result["choices"]:
            raw_text = result["choices"][0].get("message", {}).get("content", "")
        
        text = _clean_reply_text(raw_text)

        # Explicit failsafe: Catch if the model generates blanks
        if not text or len(text) < 5:
            print("===== LLM GENERATED EMPTY OR TINY RESPONSE, FALLING BACK TO DETERMINISTIC =====")
            return None

        # Append fallback citations if the model forgot to use them
        if context.get("grounding_chunks") and not re.search(r"\[(\d+)\]", text):
            source_count = min(3, len(context.get("grounding_chunks", [])))
            if source_count:
                text = f"{text}\n\nSources: " + " ".join(
                    f"[{index}]" for index in range(1, source_count + 1)
                )

        logger.info("LLM generated %d characters.", len(text))
        return text

    except Exception as e:
        print(f"===== LOCAL LLM CRASHED: {e} =====")
        logger.exception("Local LLM generation failed. Falling back.")
        return None