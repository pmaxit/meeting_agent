from pathlib import Path

DEFAULT_API_BASE = "http://localhost:8056"
DEFAULT_MODEL = "openrouter/openai/gpt-4o-mini"

ANALYSIS_DEBOUNCE_SEC = 3.0
PING_INTERVAL_SEC = 25.0
REST_POLL_INTERVAL_SEC = 2.0

PACKAGE_DIR = Path(__file__).resolve().parent.parent
APP_DIR = PACKAGE_DIR.parent
