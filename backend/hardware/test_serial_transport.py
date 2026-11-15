import serial
import pytest

from backend.hardware.serial_transport import (
    SerialBusy, SerialNotConfigured, SerialResponseTimeout, SerialTransport,
    response_matches,
)


class FakeSerial:
    def __init__(self, response=b"Received: P,32,19,17\n"):
        self.response = response
        self.is_open = True
        self.writes = []
        self.closed = False

    def reset_input_buffer(self): pass
    def write(self, data): self.writes.append(data)
    def flush(self): pass
    def readline(self): return self.response
    def close(self): self.closed = True; self.is_open = False


def test_reuses_connection_and_suppresses_duplicate_commands():
    connection = FakeSerial()
    factory_calls = []
    def factory(**kwargs):
        factory_calls.append(kwargs)
        return connection
    transport = SerialTransport("/dev/test", serial_factory=factory)
    first = transport.send_page([32, 19, 17])
    duplicate = transport.send_page([32, 19, 17])
    assert first.response == "Received: P,32,19,17"
    assert not first.duplicate and duplicate.duplicate
    assert connection.writes == [b"P,32,19,17\n"]
    assert len(factory_calls) == 1


@pytest.mark.parametrize("cells", ([1, 2], [1, 2, 64], [1, True, 3], [1, 2, 3.5]))
def test_rejects_invalid_pages(cells):
    with pytest.raises(ValueError):
        SerialTransport("/dev/test", serial_factory=lambda **_: FakeSerial()).send_page(cells)


def test_configuration_timeout_and_busy_errors():
    with pytest.raises(SerialNotConfigured):
        SerialTransport(None).send_page([1, 2, 3])
    with pytest.raises(SerialResponseTimeout):
        SerialTransport("/dev/test", serial_factory=lambda **_: FakeSerial(b"")).send_page([1, 2, 3])
    def busy(**_): raise serial.SerialException("Resource busy")
    with pytest.raises(SerialBusy):
        SerialTransport("/dev/test", serial_factory=busy).send_page([1, 2, 3])


def test_verified_monitor_response_parser():
    assert response_matches("P,32,19,17\n", "Received: P,32,19,17")
    assert not response_matches("P,32,19,17\n", "ACK")
