"""Persistent, hardware-independent transport for the three-cell serial protocol."""

from __future__ import annotations

import os
import threading
from dataclasses import dataclass
from typing import Callable, Sequence

import serial

from backend.braille.pagination import format_serial_command


class SerialTransportError(RuntimeError):
    """Base error exposed to the API layer."""


class SerialNotConfigured(SerialTransportError):
    pass


class SerialBusy(SerialTransportError):
    pass


class SerialDisconnected(SerialTransportError):
    pass


class SerialResponseTimeout(SerialTransportError):
    pass


@dataclass(frozen=True)
class SendResult:
    command: str
    response: str
    duplicate: bool


def response_matches(command: str, response: str) -> bool:
    """Accept today's verified Monitor echo; future ACK parsing can be added here."""
    return response.strip() == f"Received: {command.strip()}"


class SerialTransport:
    def __init__(
        self,
        port: str | None,
        baudrate: int = 115200,
        timeout: float = 1.5,
        serial_factory: Callable[..., object] = serial.Serial,
    ):
        self.port = port
        self.baudrate = baudrate
        self.timeout = timeout
        self._serial_factory = serial_factory
        self._connection = None
        self._lock = threading.RLock()
        self._last_command: str | None = None
        self._last_response = ""

    @classmethod
    def from_environment(cls, **kwargs) -> "SerialTransport":
        return cls(
            os.getenv("BRAILLE_SERIAL_PORT"),
            int(os.getenv("BRAILLE_SERIAL_BAUD", "115200")),
            float(os.getenv("BRAILLE_SERIAL_TIMEOUT", "1.5")),
            **kwargs,
        )

    @property
    def configured(self) -> bool:
        return bool(self.port)

    @property
    def connected(self) -> bool:
        return bool(self._connection and getattr(self._connection, "is_open", True))

    def _classify(self, error: Exception) -> SerialTransportError:
        message = str(error)
        if "busy" in message.lower() or "resource temporarily unavailable" in message.lower():
            return SerialBusy(f"Serial port is busy: {message}")
        return SerialDisconnected(f"Serial connection failed: {message}")

    def connect(self) -> None:
        if not self.configured:
            raise SerialNotConfigured("BRAILLE_SERIAL_PORT is not configured.")
        if self.connected:
            return
        try:
            self._connection = self._serial_factory(
                port=self.port,
                baudrate=self.baudrate,
                timeout=self.timeout,
                write_timeout=self.timeout,
            )
            self._last_command = None
            self._last_response = ""
        except (serial.SerialException, OSError) as error:
            self._connection = None
            raise self._classify(error) from error

    def close(self) -> None:
        with self._lock:
            if self._connection:
                try:
                    self._connection.close()
                finally:
                    self._connection = None
                    self._last_command = None
                    self._last_response = ""

    def status(self, connect: bool = True) -> dict:
        if not self.configured:
            return {"state": "simulation", "configured": False, "connected": False, "port": None}
        error = None
        if connect and not self.connected:
            with self._lock:
                try:
                    self.connect()
                except SerialTransportError as exc:
                    error = str(exc)
        return {
            "state": "connected" if self.connected else "disconnected",
            "configured": True,
            "connected": self.connected,
            "port": self.port,
            "error": error,
        }

    def send_page(self, cells: Sequence[int], force: bool = False) -> SendResult:
        command = format_serial_command(cells)
        with self._lock:
            self.connect()
            if not force and command == self._last_command:
                return SendResult(command, self._last_response, True)
            try:
                reset = getattr(self._connection, "reset_input_buffer", None)
                if reset:
                    reset()
                self._connection.write(command.encode("ascii"))
                self._connection.flush()
                response = self._connection.readline().decode("utf-8", errors="replace").strip()
            except (serial.SerialException, serial.SerialTimeoutException, OSError) as error:
                self._connection = None
                raise self._classify(error) from error
            if not response:
                raise SerialResponseTimeout("Timed out waiting for the Arduino response.")
            if not response_matches(command, response):
                raise SerialTransportError(f"Unexpected Arduino response: {response}")
            self._last_command = command
            self._last_response = response
            return SendResult(command, response, False)
