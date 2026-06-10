from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class TranscriptSegment:
    text: str
    speaker: str | None
    absolute_start_time: str
    absolute_end_time: str | None = None
    updated_at: str | None = None


@dataclass
class TranscriptStore:
    by_start: dict[str, TranscriptSegment] = field(default_factory=dict)
    version: int = 0

    def upsert_many(self, segments: list[dict[str, Any]]) -> None:
        changed = False
        for raw in segments:
            text = (raw.get("text") or "").strip()
            abs_start = raw.get("absolute_start_time")
            if not abs_start or not text:
                continue
            incoming = TranscriptSegment(
                text=text,
                speaker=raw.get("speaker"),
                absolute_start_time=abs_start,
                absolute_end_time=raw.get("absolute_end_time"),
                updated_at=raw.get("updated_at"),
            )
            existing = self.by_start.get(abs_start)
            if existing and existing.updated_at and incoming.updated_at:
                if incoming.updated_at < existing.updated_at:
                    continue
            if not existing or existing.text != incoming.text:
                changed = True
            self.by_start[abs_start] = incoming
        if changed:
            self.version += 1

    def bootstrap(self, segments: list[dict[str, Any]]) -> None:
        self.upsert_many(segments)

    def ordered_lines(self) -> list[str]:
        lines: list[str] = []
        for seg in sorted(self.by_start.values(), key=lambda s: s.absolute_start_time):
            speaker = seg.speaker or "Unknown"
            lines.append(f"[{seg.absolute_start_time}] {speaker}: {seg.text}")
        return lines

    def recent_window(self, max_segments: int = 80) -> str:
        lines = self.ordered_lines()
        if len(lines) > max_segments:
            lines = lines[-max_segments:]
        return "\n".join(lines)
