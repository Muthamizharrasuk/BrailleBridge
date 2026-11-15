"""Shared Braille page state for web and physical button navigation."""

import threading
import time

from backend.braille.pagination import BraillePager


class PageController:
    def __init__(self):
        self.pager = BraillePager()
        self.lock = threading.RLock()
        self.last_next_time = 0.0

    def status(self):
        with self.lock:
            return {
                "page": self.pager.index + 1 if self.pager.total else 0,
                "total": self.pager.total,
                "cells": self.pager.current(),
            }

    def load(self, cells):
        with self.lock:
            self.pager.load(cells)
            self.last_next_time = 0.0
            return self.status()

    def next(self):
        with self.lock:
            now = time.monotonic()

            if now - self.last_next_time < 1.2:
                return self.status()

            if self.pager.index < self.pager.total - 1:
                self.pager.next()
                self.last_next_time = now

            return self.status()

    def previous(self):
        with self.lock:
            self.pager.previous()
            return self.status()

    def restart(self):
        with self.lock:
            if self.pager.total:
                self.pager.index = 0
            self.last_next_time = 0.0
            return self.status()

    def handle_event(self, event):
        if event == "EV,NEXT":
            return self.next()

        return self.status()
