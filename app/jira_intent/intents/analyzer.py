from __future__ import annotations

import asyncio
from typing import Any

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from jira_intent.intents.prompt import JIRA_INTENT_INSTRUCTION
from jira_intent.utils.json_extract import extract_json_object


class JiraIntentAnalyzer:
    def __init__(self, model: str, app_name: str = "jira_intent_stream") -> None:
        self.app_name = app_name
        self.agent = LlmAgent(
            model=LiteLlm(model=model),
            name="jira_intent_agent",
            instruction=JIRA_INTENT_INSTRUCTION,
        )
        self.session_service = InMemorySessionService()
        self.runner = Runner(
            agent=self.agent,
            app_name=app_name,
            session_service=self.session_service,
        )
        self.user_id = "meeting-stream"
        self._session_id: str | None = None
        self._lock = asyncio.Lock()

    async def _ensure_session(self) -> str:
        if self._session_id is None:
            session = await self.session_service.create_session(
                app_name=self.app_name,
                user_id=self.user_id,
            )
            self._session_id = session.id
        return self._session_id

    async def analyze(self, transcript: str, already_reported: list[str]) -> dict[str, Any] | None:
        if not transcript.strip():
            return None

        prompt = (
            "Analyze this live meeting transcript excerpt for NEW Jira intents.\n"
            f"Already reported intent fingerprints (do not repeat): {already_reported or '[]'}\n\n"
            f"Transcript:\n{transcript}"
        )

        async with self._lock:
            session_id = await self._ensure_session()
            response_text = ""
            async for event in self.runner.run_async(
                user_id=self.user_id,
                session_id=session_id,
                new_message=types.Content(
                    role="user",
                    parts=[types.Part(text=prompt)],
                ),
            ):
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if part.text:
                            response_text += part.text

        return extract_json_object(response_text)
