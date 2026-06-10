from __future__ import annotations

import asyncio
from typing import Any

import httpx

from jira_intent.console import log


class VexaMeetingClient:
    def __init__(self, api_base: str, api_key: str) -> None:
        self.api_base = api_base.rstrip("/")
        self.api_key = api_key
        self.headers = {"X-API-Key": api_key, "Content-Type": "application/json"}

    async def list_running_bots(self) -> list[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{self.api_base}/bots/status",
                headers={"X-API-Key": self.api_key},
            )
            resp.raise_for_status()
            return resp.json().get("running_bots") or []

    async def find_running_bot(self, platform: str, native_id: str) -> dict[str, Any] | None:
        for bot in await self.list_running_bots():
            if (
                bot.get("platform") == platform
                and str(bot.get("native_meeting_id")) == native_id
            ):
                return bot
        return None

    async def stop_bot(self, platform: str, native_id: str) -> None:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.delete(
                f"{self.api_base}/bots/{platform}/{native_id}",
                headers={"X-API-Key": self.api_key},
            )
            if resp.status_code not in (202, 200):
                resp.raise_for_status()

    def _bot_from_running_status(self, running: dict[str, Any]) -> dict[str, Any]:
        meeting_id = running.get("meeting_id_from_name")
        return {
            "id": int(meeting_id) if meeting_id and str(meeting_id).isdigit() else meeting_id,
            "platform": running.get("platform"),
            "native_meeting_id": running.get("native_meeting_id"),
            "status": running.get("meeting_status") or running.get("status"),
        }

    async def start_bot(
        self,
        meeting_url: str,
        *,
        platform: str | None = None,
        native_id: str | None = None,
        passcode: str | None = None,
        language: str | None = None,
        replace_existing: bool = False,
    ) -> dict[str, Any]:
        if replace_existing and platform and native_id:
            log(f"Stopping existing bot for {platform}/{native_id}...")
            await self.stop_bot(platform, native_id)
            await asyncio.sleep(3)

        payload: dict[str, Any] = {
            "meeting_url": meeting_url,
            "bot_name": "Jira Intent Stream",
            "transcribe_enabled": True,
            "transcription_tier": "realtime",
            "recording_enabled": False,
        }
        if language:
            payload["language"] = language
        if platform:
            payload["platform"] = platform
        if passcode:
            payload["passcode"] = passcode

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{self.api_base}/bots",
                headers=self.headers,
                json=payload,
            )

            if resp.status_code == 409 and platform and native_id:
                running = await self.find_running_bot(platform, native_id)
                if running:
                    log(
                        f"Bot already active for {platform}/{native_id} "
                        f"(meeting id={running.get('meeting_id_from_name')}) — reusing it"
                    )
                    return self._bot_from_running_status(running)

                log(
                    f"Meeting exists for {platform}/{native_id} but no live bot found — "
                    "stopping stale record and retrying..."
                )
                await self.stop_bot(platform, native_id)
                await asyncio.sleep(3)
                retry = await client.post(
                    f"{self.api_base}/bots",
                    headers=self.headers,
                    json=payload,
                )
                retry.raise_for_status()
                return retry.json()

            resp.raise_for_status()
            return resp.json()

    async def wait_until_active(
        self,
        platform: str,
        native_id: str,
        timeout_sec: int = 300,
        poll_sec: float = 5.0,
    ) -> None:
        deadline = asyncio.get_event_loop().time() + timeout_sec
        async with httpx.AsyncClient(timeout=30.0) as client:
            while asyncio.get_event_loop().time() < deadline:
                resp = await client.get(
                    f"{self.api_base}/bots/status",
                    headers={"X-API-Key": self.api_key},
                )
                resp.raise_for_status()
                bots = resp.json().get("running_bots", [])
                for bot in bots:
                    if (
                        bot.get("platform") == platform
                        and bot.get("native_meeting_id") == native_id
                        and bot.get("meeting_status") == "active"
                    ):
                        return
                await asyncio.sleep(poll_sec)
        raise TimeoutError(
            f"Bot for {platform}/{native_id} did not become active within {timeout_sec}s. "
            "Admit the bot in the meeting lobby if needed."
        )

    async def bootstrap_transcript(self, platform: str, native_id: str) -> list[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{self.api_base}/transcripts/{platform}/{native_id}",
                headers={"X-API-Key": self.api_key},
            )
            if resp.status_code == 404:
                return []
            resp.raise_for_status()
            data = resp.json()
            return data.get("segments") or []
