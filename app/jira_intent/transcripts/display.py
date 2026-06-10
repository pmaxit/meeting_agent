from __future__ import annotations

from typing import Any

from jira_intent.console import log


def _display_key(speaker: str, text: str) -> str:
    """Dedup key ignores timestamp formatting differences (WS vs REST poll)."""
    return f"{speaker}|{text}"


def print_transcript_segments(segments: list[dict[str, Any]], seen: set[str]) -> None:
    for seg in segments:
        text = (seg.get("text") or "").strip()
        if not text:
            continue
        speaker = seg.get("speaker") or "Unknown"
        key = _display_key(speaker, text)
        if key in seen:
            continue
        seen.add(key)
        stamp = seg.get("absolute_start_time") or seg.get("updated_at") or ""
        if stamp:
            log(f"[{stamp}] {speaker}: {text}")
        else:
            log(f"{speaker}: {text}")
