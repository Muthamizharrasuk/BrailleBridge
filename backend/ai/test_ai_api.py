from fastapi.testclient import TestClient

from backend.api.server import app
from backend.ai.uno_client import UnoAITimeout

client = TestClient(app)


class MockAI:
    async def health(self): return {"status": "ok", "model": "Qwen3.5-0.8B"}
    async def simplify(self, text): return "Please help."


def setup_function(): app.state.ai_client = MockAI()
def teardown_function():
    if hasattr(app.state, "ai_client"): del app.state.ai_client


def test_ai_status_and_simplify_contract():
    status = client.get("/api/ai/status")
    assert status.status_code == 200
    assert status.json()["connected"] is True
    response = client.post("/api/ai/simplify", json={"text": "Please provide assistance."})
    assert response.status_code == 200
    assert response.json() == {"simplified": "Please help."}


def test_ai_validation_and_timeout():
    assert client.post("/api/ai/simplify", json={"text": " "}).status_code == 422
    class SlowAI(MockAI):
        async def simplify(self, text): raise UnoAITimeout("UNO Q AI simplification timed out.")
    app.state.ai_client = SlowAI()
    response = client.post("/api/ai/simplify", json={"text": "hello"})
    assert response.status_code == 504
    assert "timed out" in response.json()["detail"]
