from __future__ import annotations

import asyncio
import contextlib
import json

import websockets

from jira_intent.config.constants import PING_INTERVAL_SEC
from jira_intent.console import log
from jira_intent.transcripts.display import print_transcript_segments
from jira_intent.transcripts.messages import extract_segments_from_ws_message
from jira_intent.transcripts.store import TranscriptStore


async def websocket_loop(
    ws_url: str,
    api_key: str,
    platform: str,
    native_id: str,
    store: TranscriptStore,
    update_event: asyncio.Event,
    stop_event: asyncio.Event,
    seen_lines: set[str],
    show_transcript: bool,
    verbose: bool,
) -> None:
    headers = {"X-API-Key": api_key}
    subscribe = {
        "action": "subscribe",
        "meetings": [{"platform": platform, "native_id": native_id}],
    }

    while not stop_event.is_set():
        try:
            async with websockets.connect(
                ws_url,
                additional_headers=headers,
                ping_interval=None,
            ) as ws:
                await ws.send(json.dumps(subscribe))
                log(f"Subscribed to {platform}/{native_id} — streaming transcripts")

                ping_task = asyncio.create_task(_ping_loop(ws, stop_event))

                try:
                    async for raw in ws:
                        if stop_event.is_set():
                            break
                        try:
                            msg = json.loads(raw)
                        except json.JSONDecodeError:
                            continue

                        if verbose:
                            log(f"WS: {json.dumps(msg, ensure_ascii=False)[:500]}")

                        msg_type = msg.get("type")
                        if msg_type in ("transcript", "transcript.mutable"):
                            segments = extract_segments_from_ws_message(msg)
                            before = store.version
                            store.upsert_many(segments)
                            if store.version != before:
                                update_event.set()
                                if show_transcript:
                                    print_transcript_segments(segments, seen_lines)
                        elif msg_type == "meeting.status":
                            status = (msg.get("payload") or {}).get("status")
                            log(f"Meeting status: {status}")
                        elif msg_type == "error":
                            log(f"WebSocket error: {msg.get('error')}")
                        elif msg_type == "subscribed":
                            log(f"Subscription confirmed: {msg.get('meetings')}")
                finally:
                    ping_task.cancel()
                    with contextlib.suppress(asyncio.CancelledError):
                        await ping_task
        except websockets.ConnectionClosed as exc:
            if stop_event.is_set():
                break
            log(f"WebSocket closed ({exc}); reconnecting in 3s...")
            await asyncio.sleep(3)
        except Exception as exc:  # noqa: BLE001 - reconnect on transient failures
            if stop_event.is_set():
                break
            log(f"WebSocket failure: {exc}; reconnecting in 3s...")
            await asyncio.sleep(3)


async def _ping_loop(ws: websockets.WebSocketClientProtocol, stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        await asyncio.sleep(PING_INTERVAL_SEC)
        try:
            await ws.send(json.dumps({"action": "ping"}))
        except Exception:
            return
