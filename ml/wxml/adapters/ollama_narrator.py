"""Narrator adapter for a local Ollama model (stock or your fine-tune)."""

from __future__ import annotations

from ..brief import messages
from ..ollama import chat


class OllamaNarrator:
    def __init__(self, model: str, temperature: float = 0.3):
        self.model = model
        self.temperature = temperature

    def write(self, brief: str) -> str:
        return chat(self.model, messages(brief), temperature=self.temperature)
