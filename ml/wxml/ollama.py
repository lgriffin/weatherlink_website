"""A tiny client for a local Ollama server (no extra packages needed)."""

from __future__ import annotations

import json
import os
import urllib.request

REWRITE_PROMPT = (
    'Rewrite this weather forecast so it reads naturally, like a friendly local forecaster. '
    'Keep every number exactly as written, add no new numbers or facts, and keep it under 80 words. '
    'Reply with the forecast only.'
)


def host() -> str:
    h = os.environ.get('OLLAMA_HOST', 'http://localhost:11434')
    return h if h.startswith('http') else f'http://{h}'


def chat(model: str, messages: list[dict], temperature: float = 0.3, timeout: float = 120) -> str:
    body = json.dumps({'model': model, 'messages': messages, 'stream': False,
                       'options': {'temperature': temperature}}).encode()
    req = urllib.request.Request(f'{host()}/api/chat', data=body,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())['message']['content'].strip()


def rewrite(model: str, draft: str, brief: str) -> str:
    return chat(model, [
        {'role': 'system', 'content': REWRITE_PROMPT},
        {'role': 'user', 'content': f'Brief:\n{brief}\n\nForecast to rewrite:\n{draft}'},
    ])
