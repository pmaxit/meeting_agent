from __future__ import annotations

import argparse
import asyncio
import contextlib
import os
import signal
from typing import Any

from jira_intent.config import (
    DEFAULT_API_BASE,
    load_env,
    normalize_openrouter_model,
    ws_url_from_api_base,
)
from jira_intent.console import log
from jira_intent.intents import JiraIntentAnalyzer, analysis_loop
from jira_intent.streaming import rest_poll_loop, websocket_loop
from jira_intent.transcripts import TranscriptStore, print_transcript_segments
from jira_intent.vexa import (
    VexaMeetingClient,
    clear_bot_cleanup,
    leave_meeting,
    parse_meeting_url,
    register_bot_cleanup,
)


async def run_meeting_session(meeting_url: str, args: argparse.Namespace) -> None:
    load_env()

    api_key = args.api_key or os.getenv("VEXA_API_KEY") or os.getenv("API_KEY")
    if not api_key:
        raise SystemExit("Missing API key. Set VEXA_API_KEY or pass --api-key.")

    if not os.getenv("OPENROUTER_API_KEY"):
        raise SystemExit("Missing OPENROUTER_API_KEY for ADK LiteLLM / OpenRouter.")

    api_base = args.api_base or os.getenv("API_BASE") or DEFAULT_API_BASE
    ws_url = args.ws_url or os.getenv("WS_URL") or ws_url_from_api_base(api_base)
    model = normalize_openrouter_model(args.model)

    vexa = VexaMeetingClient(api_base, api_key)
    analyzer = JiraIntentAnalyzer(model=model)
    show_transcript = not args.quiet

    parsed_url: dict[str, str | None] = {}
    with contextlib.suppress(ValueError):
        parsed_url = parse_meeting_url(meeting_url)

    platform_hint = parsed_url.get("platform")
    native_hint = parsed_url.get("native_id")

    log(f"Starting bot for {meeting_url}")
    log(f"OpenRouter model: {model}")
    bot = await vexa.start_bot(
        meeting_url,
        platform=platform_hint,
        native_id=native_hint,
        passcode=parsed_url.get("passcode"),
        language=args.language,
        replace_existing=args.replace_bot,
    )

    platform = bot.get("platform")
    native_id = bot.get("native_meeting_id")
    if not platform or not native_id:
        try:
            parsed = parse_meeting_url(meeting_url)
            platform = platform or parsed["platform"]
            native_id = native_id or parsed["native_id"]
        except ValueError as exc:
            raise SystemExit(f"Could not determine platform/native_id from bot response: {exc}") from exc

    platform = str(platform)
    native_id = str(native_id)
    register_bot_cleanup(api_base, api_key, platform, native_id)

    stop_event = asyncio.Event()
    update_event = asyncio.Event()
    ws_task: asyncio.Task[Any] | None = None
    poll_task: asyncio.Task[Any] | None = None
    analysis_task: asyncio.Task[Any] | None = None
    listen_task: asyncio.Task[Any] | None = None
    shutdown_task: asyncio.Task[Any] | None = None

    try:
        if bot.get("status") == "active":
            log(f"Using bot id={bot.get('id')} (already active)")
        else:
            log(f"Bot id={bot.get('id')} — waiting for active state...")
        log("Admit the bot in the meeting lobby if prompted.")

        if bot.get("status") != "active":
            await vexa.wait_until_active(platform, native_id, timeout_sec=args.join_timeout)
        log("Bot is active. Bootstrapping transcript and opening WebSocket...")

        store = TranscriptStore()
        seen_lines: set[str] = set()
        bootstrap_segments = await vexa.bootstrap_transcript(platform, native_id)
        store.bootstrap(bootstrap_segments)
        if bootstrap_segments and show_transcript:
            log(f"Bootstrapped {len(bootstrap_segments)} segment(s) from REST")
            print_transcript_segments(bootstrap_segments, seen_lines)

        if store.by_start:
            update_event.set()

        ws_task = asyncio.create_task(
            websocket_loop(
                ws_url,
                api_key,
                platform,
                native_id,
                store,
                update_event,
                stop_event,
                seen_lines,
                show_transcript,
                args.verbose,
            )
        )
        poll_task = asyncio.create_task(
            rest_poll_loop(
                vexa, platform, native_id, store, update_event, stop_event, seen_lines, show_transcript
            )
        )
        analysis_task = asyncio.create_task(
            analysis_loop(
                analyzer, store, update_event, stop_event, args.debounce, args.verbose
            )
        )

        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            with contextlib.suppress(NotImplementedError):
                loop.add_signal_handler(sig, stop_event.set)

        log("Listening for live transcript (speak in the meeting to test)...")

        listen_task = asyncio.create_task(
            asyncio.gather(ws_task, poll_task, analysis_task, return_exceptions=True)
        )
        shutdown_task = asyncio.create_task(stop_event.wait())
        try:
            await asyncio.wait(
                [listen_task, shutdown_task],
                return_when=asyncio.FIRST_COMPLETED,
            )
        except asyncio.CancelledError:
            pass
    finally:
        stop_event.set()
        update_event.set()
        for task in (shutdown_task, listen_task, ws_task, poll_task, analysis_task):
            if task is not None:
                task.cancel()
        for task in (shutdown_task, listen_task, ws_task, poll_task, analysis_task):
            if task is not None:
                with contextlib.suppress(asyncio.CancelledError):
                    await task
        await leave_meeting(vexa, platform, native_id)
        clear_bot_cleanup()
