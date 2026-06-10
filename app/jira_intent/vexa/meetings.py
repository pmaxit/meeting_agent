from __future__ import annotations

import re
from urllib.parse import parse_qs, urlparse


def parse_meeting_url(url: str) -> dict[str, str | None]:
    """Best-effort parse for common Google Meet and Teams URLs."""
    url = url.strip()
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    path = parsed.path or ""
    query = parse_qs(parsed.query or "")

    if host == "meet.google.com":
        code = path.strip("/").split("/")[0] if path else ""
        if re.fullmatch(r"[a-z]{3}-[a-z]{4}-[a-z]{3}", code) or re.fullmatch(
            r"[a-z0-9][a-z0-9-]{3,38}[a-z0-9]", code
        ):
            return {"platform": "google_meet", "native_id": code, "passcode": None}
        raise ValueError(f"Unrecognized Google Meet URL: {url}")

    if "teams" in host:
        m = re.search(r"/meet/(\d{10,15})", path)
        if not m and parsed.fragment:
            m = re.search(r"/meet/(\d{10,15})", parsed.fragment)
        if m:
            return {
                "platform": "teams",
                "native_id": m.group(1),
                "passcode": (query.get("p") or [None])[0],
            }
        raise ValueError(f"Unrecognized Teams URL: {url}")

    raise ValueError(
        f"Unsupported meeting URL host '{host}'. "
        "Pass a Google Meet or Teams URL, or rely on Vexa bot response fields."
    )
