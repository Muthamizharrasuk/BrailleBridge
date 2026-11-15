from fastapi.testclient import TestClient

from backend.api.server import app
from backend.hardware.serial_transport import SerialBusy, SendResult

client = TestClient(app)


class MockTransport:
    def __init__(self): self.sent = []
    def status(self, connect=True):
        return {"state": "connected", "configured": True, "connected": True, "port": "/dev/test", "error": None}
    def send_page(self, cells, force=False):
        self.sent.append((cells, force))
        return SendResult("P,32,19,17\n", "Received: P,32,19,17", False)


def setup_function():
    app.state.serial_transport = MockTransport()


def teardown_function():
    if hasattr(app.state, "serial_transport"):
        del app.state.serial_transport


def test_hardware_status_and_send_contract():
    assert client.get("/api/hardware/status").json()["state"] == "connected"
    response = client.post("/api/hardware/page", json={"cells": [32, 19, 17]})
    assert response.status_code == 200
    assert response.json() == {
        "state": "connected", "connected": True, "cells": [32, 19, 17],
        "command": "P,32,19,17\n", "response": "Received: P,32,19,17", "duplicate": False,
    }
    assert app.state.serial_transport.sent == [([32, 19, 17], False)]


def test_api_rejects_invalid_masks_and_shape():
    for cells in ([1, 2], [1, 2, 64], [1, True, 3], [1, 2, 3, 4]):
        assert client.post("/api/hardware/page", json={"cells": cells}).status_code == 422


def test_api_reports_busy_port():
    class BusyTransport(MockTransport):
        def send_page(self, cells, force=False): raise SerialBusy("Serial port is busy")
    app.state.serial_transport = BusyTransport()
    response = client.post("/api/hardware/page", json={"cells": [1, 2, 3]})
    assert response.status_code == 423
    assert "busy" in response.json()["detail"]
