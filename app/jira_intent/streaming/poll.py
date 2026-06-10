from __future__ import annotations

import asyncio

from jira_intent.config.constants import REST_POLL_INTERVAL_SEC
from jira_intent.console import log
from jira_intent.transcripts.display import print_transcript_segments
from jira_intent.transcripts.store import TranscriptStore
from jira_intent.vexa.client import VexaMeetingClient


async def rest_poll_loop(
    vexa: VexaMeetingClient,
    platform: str,
    native_id: str,
    store: TranscriptStore,
    update_event: asyncio.Event,
    stop_event: asyncio.Event,
    seen_lines: set[str],
    show_transcript: bool,
) -> None:
    """Fallback: poll REST transcripts in case WS messages are missed."""
    while not stop_event.is_set():
        try:
            segments = await vexa.bootstrap_transcript(platform, native_id)
            before = store.version
            store.upsert_many(segments)
            if store.version != before:
                update_event.set()
                if show_transcript:
                    print_transcript_segments(segments, seen_lines)
        except Exception as exc:  # noqa: BLE001
            log(f"REST poll error: {exc}")
        await asyncio.sleep(REST_POLL_INTERVAL_SEC)
