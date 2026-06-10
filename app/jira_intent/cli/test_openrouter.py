from __future__ import annotations

import json
import os

from jira_intent.config import load_env, normalize_openrouter_model
from jira_intent.console import log
from jira_intent.intents import JiraIntentAnalyzer


async def test_openrouter(model: str) -> None:
    load_env()
    if not os.getenv("OPENROUTER_API_KEY"):
        raise SystemExit("Missing OPENROUTER_API_KEY in environment or .env")

    model = normalize_openrouter_model(model)
    log(f"Testing OpenRouter model: {model}")
    analyzer = JiraIntentAnalyzer(model=model)
    result = await analyzer.analyze(
        "Alice: Please create a Jira ticket ENG-99 to move ticket 123 to Done.",
        [],
    )
    if not result:
        raise SystemExit("OpenRouter test failed: no JSON returned")
    log(f"OpenRouter OK. Sample response: {json.dumps(result, ensure_ascii=False)}")
    if result.get("detected"):
        print(json.dumps(result, ensure_ascii=False), flush=True)
