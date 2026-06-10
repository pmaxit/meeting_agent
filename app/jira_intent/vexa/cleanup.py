from __future__ import annotations

import atexit
from dataclasses import dataclass

import httpx

from jira_intent.console import log
from jira_intent.vexa.client import VexaMeetingClient


@dataclass
class BotCleanup:
    api_base: str
    api_key: str
    platform: str
    native_id: str


_pending_bot_cleanup: BotCleanup | None = None


def register_bot_cleanup(
    api_base: str,
    api_key: str,
    platform: str,
    native_id: str,
) -> None:
    global _pending_bot_cleanup
    _pending_bot_cleanup = BotCleanup(api_base, api_key, platform, native_id)


def clear_bot_cleanup() -> None:
    global _pending_bot_cleanup
    _pending_bot_cleanup = None


def stop_bot_sync_fallback() -> None:
    cleanup = _pending_bot_cleanup
    if not cleanup:
        return
    try:
        httpx.delete(
            f"{cleanup.api_base.rstrip('/')}/bots/{cleanup.platform}/{cleanup.native_id}",
            headers={"X-API-Key": cleanup.api_key},
            timeout=30.0,
        )
    except Exception:
        pass


atexit.register(stop_bot_sync_fallback)


async def leave_meeting(vexa: VexaMeetingClient, platform: str, native_id: str) -> None:
    log(f"Leaving meeting ({platform}/{native_id})...")
    try:
        await vexa.stop_bot(platform, native_id)
        log("Bot stop requested.")
    except Exception as exc:  # noqa: BLE001 - best-effort cleanup on exit
        log(f"Failed to stop bot: {exc}")
