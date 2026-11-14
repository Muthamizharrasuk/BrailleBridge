"""Three-cell pagination, navigation, and Arduino serial formatting."""
from typing import List, Sequence

CELLS_PER_PAGE = 3


def paginate(cells: Sequence[int], size: int = CELLS_PER_PAGE) -> List[List[int]]:
    """Split into pages of `size`, zero-padding only the final page."""
    pages = []
    for i in range(0, len(cells), size):
        page = list(cells[i:i + size])
        page += [0] * (size - len(page))
        pages.append(page)
    return pages


def format_serial_command(page: Sequence[int]) -> str:
    """Pure function: [19,17,7] -> 'P,19,17,7\\n'. Does no I/O."""
    if len(page) != CELLS_PER_PAGE:
        raise ValueError("page must contain exactly 3 cells")
    for m in page:
        if not isinstance(m, int) or isinstance(m, bool) or not 0 <= m <= 63:
            raise ValueError(f"cell mask out of range 0-63: {m!r}")
    return "P," + ",".join(str(m) for m in page) + "\n"


class BraillePager:
    """Navigation state. Loading new text resets to page 0."""

    def __init__(self):
        self.pages: List[List[int]] = []
        self.index = 0

    def load(self, cells: Sequence[int]):
        self.pages = paginate(cells)
        self.index = 0

    @property
    def total(self) -> int:
        return len(self.pages)

    def current(self) -> List[int]:
        return self.pages[self.index] if self.pages else [0, 0, 0]

    def next(self) -> List[int]:
        if self.index < self.total - 1:
            self.index += 1
        return self.current()

    def previous(self) -> List[int]:
        if self.index > 0:
            self.index -= 1
        return self.current()
