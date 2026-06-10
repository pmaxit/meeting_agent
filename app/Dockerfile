FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    API_BASE=http://host.docker.internal:8056 \
    WS_URL=ws://host.docker.internal:8056/ws

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY jira_intent/ ./jira_intent/
COPY jira_intent_stream.py .
COPY .env .

STOPSIGNAL SIGINT

ENTRYPOINT ["python", "jira_intent_stream.py"]
