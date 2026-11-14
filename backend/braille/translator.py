"""Text -> Braille using the real Liblouis bindings."""
import glob
import os
import sys

BLANK = "⠀"
TABLES = {1: "en-us-g1.ctb", 2: "en-us-g2.ctb"}
_DISPLAY = "unicode-braille.utb"


class BrailleError(Exception):
    pass


def _import_louis():
    try:
        import louis
        return louis
    except ImportError:
        # Homebrew installs bindings for its own Python; they are pure ctypes,
        # so we can add them to the path for whichever Python we run on.
        for p in glob.glob("/opt/homebrew/opt/liblouis/lib/python*/site-packages") + \
                 glob.glob("/usr/local/opt/liblouis/lib/python*/site-packages"):
            sys.path.append(p)
        try:
            import louis
            return louis
        except ImportError as e:
            raise BrailleError(
                "Liblouis Python bindings not found. Run: brew install liblouis") from e


def unicode_to_mask(ch: str) -> int:
    """U+2800..U+283F -> dot mask (dot1=1 ... dot6=32). Unicode braille uses the same bit order."""
    cp = ord(ch)
    if not 0x2800 <= cp <= 0x28FF:
        raise BrailleError(f"Non-braille character from translator: {ch!r}")
    return cp - 0x2800 & 0x3F  # dots 7/8 are not supported by 3x2 cells


def translate_text(text: str, grade: int = 1) -> str:
    """Return the full Braille Unicode string. Newlines become blank cells."""
    if grade not in TABLES:
        raise BrailleError("grade must be 1 or 2")
    louis = _import_louis()
    tables = [_DISPLAY, TABLES[grade]]
    out = []
    for line in text.split("\n"):
        line = line.rstrip("\r")
        out.append(louis.translateString(tables, line) if line else "")
    return BLANK.join(out)


def translate_to_cells(text: str, grade: int = 1):
    """Return (braille_unicode, cells)."""
    braille = translate_text(text, grade)
    return braille, [unicode_to_mask(c) for c in braille]
