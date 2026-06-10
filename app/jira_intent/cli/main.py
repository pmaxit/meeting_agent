from __future__ import annotations

import asyncio
import contextlib
import os

from jira_intent.cli.parser import build_parser
from jira_intent.cli.test_openrouter import test_openrouter
from jira_intent.config import DEFAULT_MODEL, configure_quiet_llm_logs, load_env
from jira_intent.console import log
from jira_intent.session import run_meeting_session
from jira_intent.vexa import clear_bot_cleanup, stop_bot_sync_fallback


def main() -> None:
    configure_quiet_llm_logs()
    load_env()
    parser = build_parser()
    args = parser.parse_args()
    if args.model == DEFAULT_MODEL and os.getenv("OPENROUTER_MODEL"):
        args.model = os.getenv("OPENROUTER_MODEL", DEFAULT_MODEL)

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        if args.test_openrouter:
            loop.run_until_complete(test_openrouter(args.model))
        elif not args.meeting_url:
            parser.error("meeting_url is required unless --test-openrouter is set")
        else:
            loop.run_until_complete(run_meeting_session(args.meeting_url, args))
    except KeyboardInterrupt:
        log("Stopped.")
    finally:
        stop_bot_sync_fallback()
        clear_bot_cleanup()
        pending = asyncio.all_tasks(loop)
        for task in pending:
            task.cancel()
        with contextlib.suppress(Exception):
            loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
        loop.close()
