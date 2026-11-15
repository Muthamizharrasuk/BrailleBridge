"""Regression tests pinned to the shared contract (contracts/braille-api.md)."""
from fastapi.testclient import TestClient

from backend.api.server import app
from backend.braille.translator import translate_to_cells, _import_louis, TABLES

client = TestClient(app)


def post(text, grade=1, mode="verbatim", source="text"):
    r = client.post("/api/braille/translate",
                    json={"source": source, "text": text, "mode": mode, "grade": grade})
    assert r.status_code == 200, r.text
    return r.json()


def test_contract_hello_example():
    assert post("Hello", source="speech") == {
        "braille_unicode": "⠠⠓⠑⠇⠇⠕",
        "cells": [32, 19, 17, 7, 7, 21],
        "pages": [[32, 19, 17], [7, 7, 21]],
        "cell_count": 6,
    }


def test_modes_are_identical():
    for grade in (1, 2):
        text = "Hello World. The quick brown fox 123"
        assert post(text, grade, "verbatim") == post(text, grade, "compressed")


def test_all_sources_accepted():
    for src in ("text", "speech", "website", "camera", "document"):
        assert post("abc", source=src)["cells"] == [1, 3, 9]


def test_newline_is_one_blank_cell():
    assert post("ab\ncd")["cells"] == post("ab cd")["cells"] == [1, 3, 0, 9, 25]
    assert post("ab\r\ncd")["cells"] == [1, 3, 0, 9, 25]
    assert post("ab\n\ncd")["cells"] == [1, 3, 0, 0, 9, 25]  # not collapsed


def test_spaces_preserved():
    assert post("ab  cd")["cells"] == [1, 3, 0, 0, 9, 25]


def test_standalone_letter_keeps_letter_sign():
    assert post("a")["cells"] == [48, 1]
    assert post("A")["cells"] == [48, 32, 1]


def test_numbers_keep_number_sign():
    assert post("1")["cells"] == [60, 1]
    assert post("123")["cells"] == [60, 1, 3, 9]


def test_all_caps_word_indicator():
    assert post("ABC")["cells"] == [32, 32, 1, 3, 9]


def test_empty_text():
    assert post("") == {"braille_unicode": "", "cells": [], "pages": [], "cell_count": 0}


def test_pages_shape_and_padding():
    d = post("The quick brown fox jumps over the lazy dog", 1)
    assert d["cell_count"] == len(d["cells"])
    assert all(len(p) == 3 for p in d["pages"])
    flat = [m for p in d["pages"] for m in p]
    assert flat[:d["cell_count"]] == d["cells"]
    assert all(m == 0 for m in flat[d["cell_count"]:])  # padding only at the end


def test_tables_are_traditional_american_not_ueb():
    assert TABLES == {1: "en-us-g1.ctb", 2: "en-us-g2.ctb"}


def test_liblouis_version_available():
    assert _import_louis().version()
