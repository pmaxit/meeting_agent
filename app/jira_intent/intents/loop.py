from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from jira_intent.console import log
from jira_intent.intents.analyzer import JiraIntentAnalyzer
from jira_intent.intents.fingerprint import intent_fingerprint
from jira_intent.transcripts.store import TranscriptStore


async def analysis_loop(
    analyzer: JiraIntentAnalyzer,
    store: TranscriptStore,
    update_event: asyncio.Event,
    stop_event: asyncio.Event,
    debounce_sec: float,
    verbose: bool,
) -> None:
    reported: set[str] = set()
    last_analyzed_version = -1

    while not stop_event.is_set():
        try:
            await asyncio.wait_for(update_event.wait(), timeout=1.0)
        except asyncio.TimeoutError:
            continue
        update_event.clear()

        await asyncio.sleep(debounce_sec)
        if store.version == last_analyzed_version:
            continue

        transcript = store.recent_window()
        if not transcript.strip():
            continue

        if verbose:
            log(f"Analyzing transcript ({len(store.by_start)} segments)...")

        try:
            result = await analyzer.analyze(transcript, sorted(reported))
        except Exception as exc:  # noqa: BLE001 - keep stream alive on model errors
            log(f"Intent analysis error: {exc}")
            continue

        last_analyzed_version = store.version
        if not result or not result.get("detected"):
            continue

        fp = intent_fingerprint(result)
        if fp in reported:
            continue

        reported.add(fp)
        result["detected_at"] = datetime.now(timezone.utc).isoformat()
        print(json.dumps(result, ensure_ascii=False), flush=True)
