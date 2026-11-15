"""Async, loopback-only client for Qwen running locally on the UNO Q."""

from __future__ import annotations

import os
from urllib.parse import urlparse

import httpx


class UnoAIError(RuntimeError):
    pass


class UnoAITimeout(UnoAIError):
    pass


class UnoAIUnavailable(UnoAIError):
    pass


def validate_local_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise ValueError("BRAILLE_AI_URL must be an HTTP loopback URL; cloud AI services are not allowed.")
    return value.rstrip("/")


class UnoAIClient:
    def __init__(self, base_url: str, timeout: float = 15.0, client: httpx.AsyncClient | None = None):
        self.base_url = validate_local_url(base_url)
        self.timeout = timeout
        self._client = client or httpx.AsyncClient(base_url=self.base_url, timeout=timeout)
        self._owns_client = client is None

    @classmethod
    def from_environment(cls, **kwargs) -> "UnoAIClient":
        return cls(
            os.getenv("BRAILLE_AI_URL", "http://127.0.0.1:8765"),
            float(os.getenv("BRAILLE_AI_TIMEOUT", "15")),
            **kwargs,
        )

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def health(self) -> dict:
        try:
            response = await self._client.get("/health")
            response.raise_for_status()
            data = response.json()
        except httpx.TimeoutException as error:
            raise UnoAITimeout("UNO Q AI health check timed out.") from error
        except (httpx.HTTPError, ValueError) as error:
            raise UnoAIUnavailable(f"Cannot reach the UNO Q AI: {error}") from error
        return data if isinstance(data, dict) else {"status": "ok"}

    async def simplify(self, text: str) -> str:
        try:
            response = await self._client.post("/simplify", json={"text": text})
            response.raise_for_status()
            data = response.json()
        except httpx.TimeoutException as error:
            raise UnoAITimeout("UNO Q AI simplification timed out. Your original text is unchanged.") from error
        except (httpx.HTTPError, ValueError) as error:
            raise UnoAIUnavailable(f"UNO Q AI request failed: {error}") from error
        simplified = data.get("simplified") if isinstance(data, dict) else None
        if not isinstance(simplified, str) or not simplified.strip():
            raise UnoAIError("UNO Q AI returned an empty or invalid simplification.")
        return simplified
