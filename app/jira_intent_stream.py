#!/usr/bin/env python3
"""CLI entrypoint for the Jira intent streaming app.

Usage:
  cp .env.example .env   # then edit keys
  pip install -r requirements.txt
  python jira_intent_stream.py "https://meet.google.com/abc-defg-hij"

  # or
  python -m jira_intent "MEETING_URL"

Docker:
  docker build -t vexa-jira-intent .
  docker run --rm -it --add-host=host.docker.internal:host-gateway vexa-jira-intent "MEETING_URL"
"""

from jira_intent.cli.main import main

if __name__ == "__main__":
    main()
