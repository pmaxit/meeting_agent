# Jira Intent Stream

Stream a Vexa meeting transcript and detect Jira-related intents in real time using Google ADK + OpenRouter.

Detected intents are printed as JSON lines on stdout. Status logs go to stderr. Press Ctrl+C to stop and leave the meeting.

## Project structure

```
app/
├── jira_intent_stream.py      # thin CLI entrypoint
├── requirements.txt
├── Dockerfile
├── .env / .env.example
└── jira_intent/               # main package
    ├── __init__.py
    ├── __main__.py            # python -m jira_intent
    ├── console.py             # stderr logging
    ├── session.py             # meeting session orchestration
    ├── config/
    │   ├── constants.py       # defaults, intervals, paths
    │   └── settings.py        # env loading, model normalization
    ├── utils/
    │   └── json_extract.py    # LLM JSON parsing
    ├── transcripts/
    │   ├── store.py           # TranscriptStore
    │   ├── messages.py        # WebSocket message parsing
    │   └── display.py         # transcript output
    ├── intents/
    │   ├── prompt.py          # LLM instruction
    │   ├── analyzer.py        # JiraIntentAnalyzer (ADK)
    │   ├── fingerprint.py     # dedup detected intents
    │   └── loop.py            # analysis background task
    ├── vexa/
    │   ├── client.py          # VexaMeetingClient (REST API)
    │   ├── meetings.py        # URL parsing
    │   └── cleanup.py         # bot stop on exit
    ├── streaming/
    │   ├── websocket.py       # live transcript WebSocket
    │   └── poll.py            # REST fallback polling
    └── cli/
        ├── parser.py          # argparse
        ├── test_openrouter.py # --test-openrouter
        └── main.py            # entry + event loop
```

## Module responsibilities

| Module | Intent |
|--------|--------|
| `config/` | App settings and environment |
| `vexa/` | Vexa API integration |
| `transcripts/` | Transcript storage and display |
| `streaming/` | Real-time data ingestion |
| `intents/` | Jira intent detection via LLM |
| `session.py` | Wires everything for a meeting run |
| `cli/` | Command-line interface |

## Setup

```bash
cd app
cp .env.example .env   # then edit keys
pip install -r requirements.txt
```

Required environment variables (in `.env`):

- `VEXA_API_KEY` — Vexa API key
- `OPENROUTER_API_KEY` — OpenRouter API key
- `OPENROUTER_MODEL` — model name (optional, has a default)
- `API_BASE` — Vexa API URL (default: `http://localhost:8056`)
- `WS_URL` — WebSocket URL (derived from `API_BASE` if omitted)

## Usage

```bash
python jira_intent_stream.py "https://meet.google.com/abc-defg-hij"

# or
python -m jira_intent "MEETING_URL"
```

### Useful flags

| Flag | Description |
|------|-------------|
| `--test-openrouter` | Verify OpenRouter key and model, then exit |
| `--replace-bot` | Stop any existing bot for this meeting before starting |
| `--quiet` | Hide live transcript on stderr (intents still on stdout) |
| `--verbose` | Log raw WebSocket frames and analysis passes |
| `--language en` | Force transcription language (default: `en`) |

### Test OpenRouter

```bash
python jira_intent_stream.py --test-openrouter
```

## Docker

```bash
docker build -t vexa-jira-intent .
docker run --rm -it --add-host=host.docker.internal:host-gateway vexa-jira-intent "MEETING_URL"
```

The image sets `API_BASE` and `WS_URL` to `host.docker.internal:8056` so it can reach the Vexa API running on your host machine.

## Output

- **stdout** — JSON intent objects when Jira-related actions are detected
- **stderr** — status logs, live transcript (unless `--quiet`)

Example intent:

```json
{
  "detected": true,
  "intent_type": "change_status",
  "confidence": 0.9,
  "action": {
    "operation": "transition",
    "ticket_key": "ENG-123",
    "status": "Done"
  },
  "evidence": {
    "speaker": "Alice",
    "quote": "Can you move ticket 123 to done?"
  },
  "detected_at": "2026-06-09T12:00:00+00:00"
}
```
