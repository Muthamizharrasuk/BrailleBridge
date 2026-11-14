# BrailleBridge Shared API Contract

## Translation endpoint
POST /api/braille/translate

### Request
```json
{"source":"speech","text":"Hello","mode":"verbatim","grade":1}
```

### Response (Grade 1 example)
```json
{"braille_unicode":"⠓⠑⠇⠇⠕","cells":[19,17,7,7,21],"pages":[[19,17,7],[7,21,0]],"cell_count":5}
```

## Rules
- Sources: text, speech, website, camera.
- Modes: verbatim, compressed.
- Grades: 1 or 2.
- Each cell is a six-dot mask from 0 to 63.
- Standard dots: 1=1, 2=2, 3=4, 4=8, 5=16, 6=32.
- Each page contains exactly three cell masks.
- Zero-pad only the final page.
- Translate text before splitting it into pages.
- For contracted Braille, use actual Liblouis output.

## Future Arduino protocol
P,<cell1>,<cell2>,<cell3>\n
Example: P,19,17,7\n
The integration teammate owns hardware serial communication.