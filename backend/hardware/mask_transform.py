"""Convert standard Braille masks to UNO R3 firmware masks."""

def rev3(v):
    # Flip the top and bottom dots of a three-dot column.
    return ((v & 1) << 2) | (v & 2) | ((v >> 2) & 1)


def to_firmware(cells):
    """Convert three standard Braille masks in left-to-right reading order."""
    cells = (list(cells) + [0, 0, 0])[:3]
    out = []

    for m in reversed(cells):
        left = m & 7
        right = (m >> 3) & 7
        out.append(right | (left << 3))

    return out
