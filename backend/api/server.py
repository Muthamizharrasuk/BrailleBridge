from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.braille.translator import translate_to_cells, BrailleError
from backend.braille.pagination import paginate

app = FastAPI(title="BrailleBridge Text-to-Braille")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class TranslateRequest(BaseModel):
    source: Literal["text", "speech", "website", "camera"] = "text"
    text: str = Field(max_length=50000)
    mode: Literal["verbatim", "compressed"] = "verbatim"
    grade: Literal[1, 2] = 1


class TranslateResponse(BaseModel):
    braille_unicode: str
    cells: list[int]
    pages: list[list[int]]
    cell_count: int


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/braille/translate", response_model=TranslateResponse)
def translate(req: TranslateRequest):
    try:
        braille, cells = translate_to_cells(req.text, req.grade)
    except BrailleError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return TranslateResponse(braille_unicode=braille, cells=cells,
                             pages=paginate(cells), cell_count=len(cells))
