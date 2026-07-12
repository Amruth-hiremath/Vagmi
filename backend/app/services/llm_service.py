from __future__ import annotations

import os
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
    network. Checks, in order: explicit env override, an Ollama-style
    model path override, then a small set of conventional filenames
    under the app's local/offline model directories.
    """
    env_override = os.getenv("VAGMI_AI_MODEL_PATH", "").strip() or None
    ollama_override = os.getenv("OLLAMA_MODEL_PATH", "").strip() or None

    candidates: list[str] = [c for c in (env_override, ollama_override) if c]

    for root in (LOCAL_MODELS_DIR, OFFLINE_MODELS_DIR):
        if not root.exists():
            continue
        for name in _GGUF_CANDIDATE_NAMES:
            candidates.append(str(root / name))
        # Also accept any single top-level .gguf file the user dropped in.
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
    offline. Returns None (and logs once) if either the dependency or the
    model file is unavailable — the orchestrator treats that as "no local
    generation available yet" and falls back to the deterministic,
    retrieval-grounded scaffold reply instead of failing the request.
    """
    global _MODEL_INSTANCE, _MODEL_LOAD_ATTEMPTED

    with _MODEL_LOCK:
        if _MODEL_LOAD_ATTEMPTED:
            return _MODEL_INSTANCE
        _MODEL_LOAD_ATTEMPTED = True

        model_path = resolve_local_model_path()
        if not model_path or not model_path.endswith(".gguf"):
            logger.info("Local LLM scaffold: no .gguf model file found, staying on deterministic fallback.")
            return None

        try:
            from llama_cpp import Llama  # optional, offline-only dependency
        except ImportError:
            logger.info("Local LLM scaffold: llama-cpp-python not installed, staying on deterministic fallback.")
            return None

        try:
            n_threads = max(1, (os.cpu_count() or 4) - 1)
            print("===== ABOUT TO LOAD MODEL =====")
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
        except Exception as exc:  # noqa: BLE001 - never let model load crash a chat turn
            logger.warning("Local LLM scaffold: failed to load %s (%s), staying on deterministic fallback.", model_path, exc)
            _MODEL_INSTANCE = None

        return _MODEL_INSTANCE


def generate_local_reply(prompt_bundle: str, routed_agent: str, context: dict) -> str | None:
    """
    Try local generation first; return None to let the orchestrator use its
    deterministic, retrieval-grounded fallback. This keeps the offline flow
    stable whether or not a GGUF model + llama-cpp-python are present.
    """
    model = _try_load_model()
    if model is None:
        return None

    system_hint = (
        "You are Vāgmi, an offline assistant. Answer only from the retrieved "
        "passages and conversation context given below. If the passages do "
        "not contain the answer, say so plainly instead of guessing."
    )
    full_prompt = f"{system_hint}\n\n{prompt_bundle}\n\nAssistant:"
    

    try:
        print("===== STARTING INFERENCE =====")
        result = model(
            full_prompt,
            max_tokens=int(os.getenv("VAGMI_AI_MAX_TOKENS", "512")),
            temperature=float(os.getenv("VAGMI_AI_TEMPERATURE", "0.2")),
            top_p=float(os.getenv("VAGMI_AI_TOP_P", "0.9")),
            repeat_penalty=float(os.getenv("VAGMI_AI_REPEAT_PENALTY", "1.1")),
            stop=[
                "User request:",
                "\nUser:",
                "<|im_end|>",
                "<|endoftext|>",
            ],
        )
        print("===== INFERENCE FINISHED =====")
        text = (result.get("choices") or [{}])[0].get("text", "").strip()
        logger.info(
            "LLM generated %d characters.",
            len(text),
        )
        return text or None
    except Exception as exc:  # noqa: BLE001
        logger.exception("Local LLM generation failed. Falling back to deterministic response.")
        return None