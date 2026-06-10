from __future__ import annotations

import logging
import os
from pathlib import Path

from jira_intent.config.constants import APP_DIR, DEFAULT_MODEL

try:
    import litellm
except ImportError:  # pragma: no cover
    litellm = None

try:
    from dotenv import load_dotenv as _load_dotenv
except ImportError:  # pragma: no cover
    _load_dotenv = None


def configure_quiet_llm_logs() -> None:
    """Silence LiteLLM 'Provider List' spam and ADK debug event warnings."""
    if litellm is not None:
        litellm.suppress_debug_info = True
    os.environ.setdefault("LITELLM_LOG", "ERROR")
    for name in ("litellm", "google.adk", "google_adk"):
        logging.getLogger(name).setLevel(logging.ERROR)


def load_env() -> None:
    """Load app/.env so keys work regardless of cwd."""
    if _load_dotenv is None:
        return
    for path in (
        APP_DIR / ".env",
        Path.cwd() / ".env",
    ):
        if path.is_file():
            _load_dotenv(path, override=False)
            return
    _load_dotenv(override=False)


def normalize_openrouter_model(model: str) -> str:
    model = (model or DEFAULT_MODEL).strip()
    if model.startswith("openrouter/"):
        return model
    return f"openrouter/{model}"


def ws_url_from_api_base(api_base: str) -> str:
    api_base = api_base.rstrip("/")
    if api_base.startswith("https://"):
        return "wss://" + api_base[len("https://") :] + "/ws"
    if api_base.startswith("http://"):
        return "ws://" + api_base[len("http://") :] + "/ws"
    return "ws://" + api_base + "/ws"
