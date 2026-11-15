"""Single-owner serial connection for the BrailleBridge UNO R3."""
import logging
import queue
import threading
import time

import serial

log = logging.getLogger("braillebridge.serial")
log.setLevel(logging.INFO)
if not log.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(
        "BRAILLE SERIAL %(levelname)s: %(message)s"
    ))
    log.addHandler(handler)
log.propagate = False


class SerialManager:
    def __init__(self, port="/dev/ttyACM0", baudrate=115200):
        self.port = port
        self.baudrate = baudrate
        self.commands = queue.Queue()
        self.events = queue.Queue(maxsize=100)
        self.connected = False
        self.last_error = ""
        self._running = threading.Event()
        self._thread = None
        self._last_page_time = 0.0

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._running.set()
        self._thread = threading.Thread(
            target=self._worker,
            name="braillebridge-serial",
            daemon=True,
        )
        self._thread.start()

    def stop(self):
        self._running.clear()
        if self._thread:
            self._thread.join(timeout=3)

    def send_page(self, standard_cells):
        from backend.hardware.safety import motor_commands_enabled
        from backend.braille.pagination import format_serial_command

        if not motor_commands_enabled():
            raise RuntimeError("Motor commands are disabled.")

        command = format_serial_command(standard_cells)
        return self._submit(command)

    def blank(self):
        from backend.hardware.safety import motor_commands_enabled

        if not motor_commands_enabled():
            raise RuntimeError("Motor commands are disabled.")

        return self._submit("Z\n")

    def _submit(self, command):
        if not self.connected:
            raise RuntimeError("Display disconnected.")

        result = queue.Queue(maxsize=1)
        self.commands.put((command, result))

        try:
            success, response = result.get(timeout=20)
        except queue.Empty:
            raise RuntimeError("Arduino command timed out.")

        if not success:
            raise RuntimeError(response)

        return response

    def get_events(self):
        events = []
        while True:
            try:
                events.append(self.events.get_nowait())
            except queue.Empty:
                return events

    def _receive(self, line):
        log.info("RX %s", line)

        if line.startswith("EV,"):
            try:
                self.events.put_nowait(line)
            except queue.Full:
                log.warning("Event queue full: %s", line)

    def _worker(self):
        while self._running.is_set():
            try:
                with serial.Serial(
                    self.port,
                    self.baudrate,
                    timeout=0.1,
                    write_timeout=2,
                    exclusive=True,
                ) as connection:
                    self.connected = False
                    self.last_error = ""

                    # Opening USB serial resets the UNO R3.
                    ready = False
                    deadline = time.monotonic() + 2.5

                    while self._running.is_set() and time.monotonic() < deadline:
                        line = connection.readline().decode(
                            errors="replace"
                        ).strip()

                        if line:
                            self._receive(line)
                        if line == "BRAILLE READY":
                            ready = True
                            break

                    if not ready:
                        log.warning("BRAILLE READY not seen; using 2.5s fallback")

                    self.connected = True
                    log.info("Connected to %s", self.port)

                    while self._running.is_set():
                        line = connection.readline().decode(
                            errors="replace"
                        ).strip()

                        if line:
                            self._receive(line)

                        try:
                            command, result = self.commands.get_nowait()
                        except queue.Empty:
                            continue

                        if command.startswith("P,"):
                            elapsed = time.monotonic() - self._last_page_time
                            if elapsed < 1.2:
                                time.sleep(1.2 - elapsed)

                        try:
                            # Safety must also be checked immediately before I/O.
                            from backend.hardware.safety import motor_commands_enabled

                            if not motor_commands_enabled():
                                raise RuntimeError("Motor commands disabled.")

                            log.info("TX %s", command.strip())
                            connection.write(command.encode("ascii"))
                            connection.flush()

                            if command.startswith("P,"):
                                self._last_page_time = time.monotonic()

                            response = None
                            deadline = time.monotonic() + 15

                            while time.monotonic() < deadline:
                                line = connection.readline().decode(
                                    errors="replace"
                                ).strip()

                                if not line:
                                    continue

                                self._receive(line)

                                if line in ("OK", "ERR"):
                                    response = line
                                    break

                            if response != "OK":
                                raise RuntimeError(
                                    f"Arduino response: {response or 'timeout'}"
                                )

                            result.put((True, response))

                        except Exception as error:
                            result.put((False, str(error)))

            except (serial.SerialException, OSError) as error:
                self.last_error = str(error)
                log.warning("Serial disconnected: %s", error)

            finally:
                self.connected = False

            if self._running.is_set():
                time.sleep(3)
