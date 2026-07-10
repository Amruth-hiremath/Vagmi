from __future__ import annotations

import os
from pathlib import Path

from app.core.config import LOCAL_MODELS_DIR, OFFLINE_MODELS_DIR


def resolve_local_model_path() -> str | None:
    candidates = [
        os.getenv("VAGMI_AI_MODEL_PATH", "").strip() or None,
        os.getenv("OLLAMA_MODEL_PATH", "").strip() or None,
        str(LOCAL_MODELS_DIR / "qwen2.5-7b-instruct-q4"),
        str(OFFLINE_MODELS_DIR / "qwen2.5-7b-instruct-q4"),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return str(Path(candidate))
    return None


def has_local_model() -> bool:
    return resolve_local_model_path() is not None


def generate_local_reply(prompt_bundle: str, routed_agent: str, context: dict) -> str | None:
    """
    Offline-safe placeholder hook for the next implementation step.

    This intentionally does not attempt any network access or model downloads.
    It returns None when no configured local generator is available, so the
    orchestrator can fall back to the deterministic scaffold response.
    """
    _ = (prompt_bundle, routed_agent, context)
    return None
