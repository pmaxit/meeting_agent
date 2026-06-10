from __future__ import annotations

import hashlib
import json
from typing import Any


def intent_fingerprint(payload: dict[str, Any]) -> str:
    action = payload.get("action") or {}
    core = {
        "intent_type": payload.get("intent_type"),
        "operation": action.get("operation"),
        "ticket_key": action.get("ticket_key"),
        "summary": action.get("summary"),
        "description": action.get("description"),
        "status": action.get("status"),
        "assignee": action.get("assignee"),
    }
    blob = json.dumps(core, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(blob.encode()).hexdigest()
