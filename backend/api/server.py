from contextlib import asynccontextmanager
import inspect
from typing import Annotated, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.braille.translator import translate_to_cells, BrailleError
from backend.braille.pagination import paginate
from backend.ai.uno_client import UnoAIClient, UnoAIError, UnoAITimeout, UnoAIUnavailable
from backend.hardware.serial_transport import (
    SerialBusy, SerialNotConfigured, SerialResponseTimeout, SerialTransport,
    SerialTransportError,
)


@asynccontextmanager
async def lifespan(application: FastAPI):
    yield
    transport = getattr(application.state, "serial_transport", None)
    close = getattr(transport, "close", None)
    if close is not None:
        close()
    ai_client = getattr(application.state, "ai_client", None)
    ai_close = getattr(ai_client, "close", None)
    if ai_close is not None:
        close_result = ai_close()
        if inspect.isawaitable(close_result):
            await close_result


app = FastAPI(title="BrailleBridge Text-to-Braille", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class TranslateRequest(BaseModel):
    source: Literal["text", "speech", "website", "camera", "document"] = "text"
    text: str = Field(max_length=50000)
    mode: Literal["verbatim", "compressed"] = "verbatim"
    grade: Literal[1, 2] = 1


class TranslateResponse(BaseModel):
    braille_unicode: str
    cells: list[int]
    pages: list[list[int]]
    cell_count: int


CellMask = Annotated[int, Field(strict=True, ge=0, le=63)]


class HardwarePageRequest(BaseModel):
    cells: list[CellMask] = Field(min_length=3, max_length=3)
    force: bool = False


class SimplifyRequest(BaseModel):
    text: str = Field(min_length=1, max_length=50000)


def hardware_transport() -> SerialTransport:
    transport = getattr(app.state, "serial_transport", None)
    if transport is None:
        transport = SerialTransport.from_environment()
        app.state.serial_transport = transport
    return transport


def local_ai_client() -> UnoAIClient:
    client = getattr(app.state, "ai_client", None)
    if client is None:
        try:
            client = UnoAIClient.from_environment()
        except ValueError as error:
            raise HTTPException(status_code=500, detail=str(error)) from error
        app.state.ai_client = client
    return client


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/hardware/status")
def hardware_status():
    return hardware_transport().status(connect=True)


@app.post("/api/hardware/page")
def send_hardware_page(req: HardwarePageRequest):
    transport = hardware_transport()
    try:
        result = transport.send_page(req.cells, force=req.force)
    except SerialNotConfigured as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except SerialBusy as error:
        raise HTTPException(status_code=423, detail=str(error)) from error
    except SerialResponseTimeout as error:
        raise HTTPException(status_code=504, detail=str(error)) from error
    except SerialTransportError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    return {
        "state": "connected", "connected": True, "cells": req.cells,
        "command": result.command, "response": result.response, "duplicate": result.duplicate,
    }


@app.get("/api/ai/status")
async def local_ai_status():
    try:
        details = await local_ai_client().health()
    except (UnoAIError, UnoAIUnavailable, UnoAITimeout) as error:
        return {"state": "disconnected", "connected": False, "error": str(error)}
    return {"state": "connected", "connected": True, "service": "UNO Q local AI", "details": details}


@app.post("/api/ai/simplify")
async def simplify_with_local_ai(req: SimplifyRequest):
    if not req.text.strip():
        raise HTTPException(status_code=422, detail="Enter text to simplify.")
    try:
        simplified = await local_ai_client().simplify(req.text)
    except UnoAITimeout as error:
        raise HTTPException(status_code=504, detail=str(error)) from error
    except (UnoAIUnavailable, UnoAIError) as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    return {"simplified": simplified}


@app.post("/api/braille/translate", response_model=TranslateResponse)
def translate(req: TranslateRequest):
    try:
        braille, cells = translate_to_cells(req.text, req.grade)
    except BrailleError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return TranslateResponse(braille_unicode=braille, cells=cells,
                             pages=paginate(cells), cell_count=len(cells))
