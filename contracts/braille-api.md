# BrailleBridge Shared API Contract

## Translation endpoint
POST /api/braille/translate

### Request
```json
{"source":"speech","text":"Hello","mode":"verbatim","grade":1}
```

### Response (Grade 1 example)
```json
{"braille_unicode":"⠠⠓⠑⠇⠇⠕","cells":[32,19,17,7,7,21],"pages":[[32,19,17],[7,7,21]],"cell_count":6}
```

## Rules
- Sources: text, speech, website, camera.
- Modes: verbatim, compressed. `compressed` means the text was already
  compressed upstream (owned by the AI/speech side). The Braille endpoint never
  compresses or rewrites text; both modes run the exact same translation.
- Grades: 1 or 2.
- Each cell is a six-dot mask from 0 to 63.
- Standard dots: 1=1, 2=2, 3=4, 4=8, 5=16, 6=32.
- Each page contains exactly three cell masks.
- Zero-pad only the final page.
- Translate text before splitting it into pages.
- For contracted Braille, use actual Liblouis output.

## Translation details
- Tables: Liblouis `en-us-g1.ctb` (grade 1) and `en-us-g2.ctb` (grade 2), i.e.
  traditional American Braille (EBAE/ABAE), not Unified English Braille.
- Liblouis indicators are preserved and count as cells (not stripped to save space):
  capital sign (32) before a capital letter, double capital sign (32,32) before an
  all-caps word, number sign (60) before digits, and letter sign (48) before a lone
  single letter such as "a". Cell counts are therefore often larger than the character count.
- Newlines: each line break becomes one blank cell (mask 0). Spaces, including runs
  of spaces, are kept as blank cells; no other whitespace normalization is done.
  Line structure is not preserved on the three-cell display. `\r\n` counts as one break.
- Empty text returns `braille_unicode: ""`, `cells: []`, `pages: []`, `cell_count: 0`.
- Invalid requests (bad source, mode or grade, missing text) return HTTP 422.

## Future Arduino protocol
P,<cell1>,<cell2>,<cell3>\n
Example: P,19,17,7\n
The integration teammate owns hardware serial communication.