from __future__ import annotations

from typing import Any


def extract_segments_from_ws_message(msg: dict[str, Any]) -> list[dict[str, Any]]:
    """Support both current bot format (type=transcript) and legacy (transcript.mutable)."""
    msg_type = msg.get("type")
    segments: list[dict[str, Any]] = []

    if msg_type == "transcript":
        speaker = msg.get("speaker") or ""
        for key in ("confirmed", "pending"):
            for seg in msg.get(key) or []:
                if not isinstance(seg, dict):
                    continue
                item = dict(seg)
                if not item.get("speaker"):
                    item["speaker"] = speaker
                segments.append(item)
        return segments

    if msg_type == "transcript.mutable":
        return list((msg.get("payload") or {}).get("segments") or [])

    return segments
