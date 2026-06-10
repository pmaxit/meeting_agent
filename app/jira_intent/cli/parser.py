from __future__ import annotations

import argparse
import os

from jira_intent.config import ANALYSIS_DEBOUNCE_SEC, DEFAULT_API_BASE, DEFAULT_MODEL


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Stream a Vexa meeting and detect Jira intents with Google ADK + OpenRouter.",
    )
    parser.add_argument("meeting_url", nargs="?", help="Google Meet or Teams meeting URL")
    parser.add_argument("--api-base", default=None, help=f"Vexa API base (default: {DEFAULT_API_BASE})")
    parser.add_argument("--ws-url", default=None, help="Vexa WebSocket URL (derived from --api-base if omitted)")
    parser.add_argument("--api-key", default=None, help="Vexa API key (default: VEXA_API_KEY env)")
    parser.add_argument(
        "--model",
        default=os.getenv("OPENROUTER_MODEL", DEFAULT_MODEL),
        help=f"OpenRouter model via LiteLLM (default: {DEFAULT_MODEL})",
    )
    parser.add_argument(
        "--debounce",
        type=float,
        default=ANALYSIS_DEBOUNCE_SEC,
        help="Seconds to wait after transcript updates before running intent analysis",
    )
    parser.add_argument(
        "--join-timeout",
        type=int,
        default=300,
        help="Seconds to wait for the bot to reach active state",
    )
    parser.add_argument(
        "--language",
        default=os.getenv("TRANSCRIPTION_LANGUAGE", "en"),
        help="Force transcription language (e.g. en). Improves accuracy vs auto-detect.",
    )
    parser.add_argument(
        "--replace-bot",
        action="store_true",
        help="Stop any existing bot for this meeting before starting a new one",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Hide live transcript lines on stderr (intents still print to stdout)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Log raw WebSocket frames and analysis passes to stderr",
    )
    parser.add_argument(
        "--test-openrouter",
        action="store_true",
        help="Verify OPENROUTER_API_KEY + model, then exit",
    )
    return parser
