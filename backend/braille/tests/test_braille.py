import pytest
from fastapi.testclient import TestClient

from backend.api.server import app
from backend.braille.translator import translate_to_cells, translate_text
from backend.braille.pagination import paginate, format_serial_command, BraillePager

client = TestClient(app)


def cells(t, g=1):
    return translate_to_cells(t, g)[1]


def test_abc_grade1():
    assert cells("abc") == [1, 3, 9]


def test_capital_sign():
    assert cells("Ab") == [32, 1, 3]  # capital sign + a b
    assert cells("A") == [48, 32, 1]  # lone letter gets letter sign
    assert cells("ABC")[:2] == [32, 32]  # word capital indicator


def test_numbers():
    assert cells("123") == [60, 1, 3, 9]  # number sign + a b c


def test_punctuation():
    assert translate_text("hi, you.") == translate_text("hi, you.")
    assert translate_text("hi, ok.") == "⠓⠊⠂⠀⠕⠅⠲"


def test_spaces():
    assert cells("ab cd") == [1, 3, 0, 9, 25]


def test_grade2_contractions():
    assert translate_text("the and", 2) == "⠮⠯"
    assert len(cells("the and", 2)) < len(cells("the and", 1))


def test_multiline():
    assert cells("ab\ncd") == cells("ab cd")


def test_empty():
    assert translate_to_cells("") == ("", [])
    assert paginate([]) == []


def test_multiple_pages_and_padding():
    p = paginate(cells("abcdefg"))
    assert p == [[1, 3, 9], [25, 17, 11], [27, 0, 0]]


def test_masks_in_range():
    c = cells("Hello, World! 123\nThe quick brown fox.", 2) + cells("Zebra 42?", 1)
    assert c and all(0 <= m <= 63 for m in c)


def test_pager_navigation_and_reset():
    pg = BraillePager()
    pg.load(cells("abcdefg"))
    assert (pg.index, pg.total) == (0, 3)
    pg.next(); pg.next(); pg.next()
    assert pg.index == 2
    pg.previous()
    assert pg.index == 1
    pg.load(cells("ab"))
    assert pg.index == 0 and pg.total == 1
    pg.previous()
    assert pg.index == 0


def test_serial_format():
    assert format_serial_command([19, 17, 7]) == "P,19,17,7\n"
    with pytest.raises(ValueError):
        format_serial_command([1, 2])
    with pytest.raises(ValueError):
        format_serial_command([1, 2, 64])


def test_api_health():
    assert client.get("/api/health").json() == {"status": "ok"}


def test_api_translate():
    r = client.post("/api/braille/translate",
                    json={"source": "speech", "text": "abcd", "mode": "verbatim", "grade": 1})
    assert r.status_code == 200
    assert r.json() == {"braille_unicode": "⠁⠃⠉⠙", "cells": [1, 3, 9, 25],
                        "pages": [[1, 3, 9], [25, 0, 0]], "cell_count": 4}


def test_api_validation():
    assert client.post("/api/braille/translate", json={"text": "a", "grade": 3}).status_code == 422
    assert client.post("/api/braille/translate", json={"source": "x", "text": "a"}).status_code == 422
    assert client.post("/api/braille/translate", json={}).status_code == 422
