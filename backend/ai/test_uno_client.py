import httpx
import pytest

from backend.ai.uno_client import UnoAIClient, UnoAITimeout, UnoAIUnavailable, validate_local_url


def mock_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://127.0.0.1:8765")


@pytest.mark.anyio
async def test_health_and_simplify_contract():
    async def handler(request):
        if request.url.path == "/health": return httpx.Response(200, json={"status": "ok"})
        assert request.url.path == "/simplify"
        assert request.read() == b'{"text":"Please provide assistance."}'
        return httpx.Response(200, json={"simplified": "Please help."})
    client = UnoAIClient("http://127.0.0.1:8765", client=mock_client(handler))
    assert (await client.health())["status"] == "ok"
    assert await client.simplify("Please provide assistance.") == "Please help."
    await client._client.aclose()


@pytest.mark.anyio
async def test_timeout_and_bad_response():
    async def timeout(_): raise httpx.ReadTimeout("slow")
    client = UnoAIClient("http://localhost:8765", client=mock_client(timeout))
    with pytest.raises(UnoAITimeout): await client.simplify("hello")
    await client._client.aclose()

    async def unavailable(_): return httpx.Response(503, text="offline")
    client = UnoAIClient("http://localhost:8765", client=mock_client(unavailable))
    with pytest.raises(UnoAIUnavailable): await client.health()
    await client._client.aclose()


def test_rejects_cloud_or_malformed_urls():
    assert validate_local_url("http://127.0.0.1:8765/") == "http://127.0.0.1:8765"
    for url in ("https://cloud.example", "http://cloud.example", "file:///tmp/model"):
        with pytest.raises(ValueError): validate_local_url(url)
