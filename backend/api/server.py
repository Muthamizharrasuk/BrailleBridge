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
    import threading
    import time
    from backend.hardware.serial_manager import SerialManager
    from backend.hardware.page_controller import PageController

    manager = SerialManager(port="/dev/ttyACM0", baudrate=115200)
    controller = PageController()
    stop_events = threading.Event()

    application.state.serial_manager = manager
    application.state.display_controller = controller

    def process_serial_events():
        while not stop_events.is_set():
            for event in manager.get_events():
                if event == "EV,NEXT":
                    auto_navigate(controller, "next")
            stop_events.wait(0.1)

    event_thread = threading.Thread(
        target=process_serial_events,
        name="braillebridge-buttons",
        daemon=True,
    )

    manager.start()
    event_thread.start()

    try:
        yield
    finally:
        stop_events.set()
        event_thread.join(timeout=2)
        manager.stop()
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
    manager = getattr(app.state, "serial_manager", None)

    if manager is None or not manager.connected:
        return {
            "state": "disconnected",
            "connected": False,
            "configured": True,
            "message": "Arduino UNO R3 not connected.",
        }

    return {
        "state": "connected",
        "connected": True,
        "configured": True,
        "port": manager.port,
        "message": "Arduino UNO R3 connected.",
    }


@app.post("/api/hardware/page")
def send_hardware_page(req: HardwarePageRequest):
    from backend.hardware.safety import motor_commands_enabled

    manager = getattr(app.state, "serial_manager", None)

    if not motor_commands_enabled():
        raise HTTPException(
            status_code=423,
            detail="Motor movement is disabled by the safety lock.",
        )

    if manager is None or not manager.connected:
        raise HTTPException(
            status_code=503,
            detail="Arduino UNO R3 is not connected.",
        )

    try:
        response = manager.send_page(req.cells)
    except (RuntimeError, TimeoutError) as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    return {
        "state": "connected",
        "connected": True,
        "cells": req.cells,
        "response": response,
        "duplicate": False,
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

# Serve the built BrailleBridge React website from the UNO Q.
from pathlib import Path
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

WEB_DIR = Path("/home/arduino/braillebridge-web")

app.mount(
    "/assets",
    StaticFiles(directory=WEB_DIR / "assets"),
    name="frontend-assets",
)

@app.get("/", include_in_schema=False)
def frontend_home():
    return FileResponse(WEB_DIR / "index.html")

# UNO Q on-device image recognition using IndraOCR.
from fastapi import File, UploadFile
import httpx

@app.post("/api/ocr/recognize")
async def recognize_image(file: UploadFile = File(...)):
    image_data = await file.read()

    if not image_data or len(image_data) > 15 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="Image must be between 1 byte and 15 MB."
        )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "http://127.0.0.1:8766/recognize",
                content=image_data,
                headers={"Content-Type": "application/octet-stream"}
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as error:
        raise HTTPException(
            status_code=503,
            detail=f"Local IndraOCR unavailable: {error}"
        ) from error

# Local French-to-English translation via SMaLL-100 on the UNO Q.
from pydantic import BaseModel as TranslationBaseModel

class TranslationRequest(TranslationBaseModel):
    text: str
    target: str = "en"

@app.post("/api/translate")
async def translate_text(request: TranslationRequest):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
    if request.target != "en":
        raise HTTPException(status_code=400, detail="Only English output is supported.")

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.post(
                "http://127.0.0.1:8767/translate",
                json={"text": request.text, "target": request.target}
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as error:
        raise HTTPException(
            status_code=503,
            detail=f"Local translation service unavailable: {error}"
        ) from error

# Offline speech recognition using Cactus Whistle on UNO Q.
@app.post("/api/speech/transcribe")
async def transcribe_speech(file: UploadFile = File(...)):
    audio_data = await file.read()

    if not audio_data or len(audio_data) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="Audio must be between 1 byte and 5 MB."
        )

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                "http://127.0.0.1:8768/transcribe",
                content=audio_data,
                headers={"Content-Type": "audio/wav"},
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as error:
        raise HTTPException(
            status_code=503,
            detail=f"Local Whistle unavailable: {error}"
        ) from error

# Shared Braille pagination for web and physical controls.
from backend.hardware.page_controller import PageController

class DisplayLoadRequest(BaseModel):
    cells: list[CellMask] = Field(max_length=50000)

def display_controller():
    controller = getattr(app.state, "display_controller", None)
    if controller is None:
        controller = PageController()
        app.state.display_controller = controller
    return controller

@app.get("/api/display/status")
def display_status():
    return display_controller().status()

@app.post("/api/display/load")
def display_load(req: DisplayLoadRequest):
    return display_controller().load(req.cells)

def auto_navigate(controller, action):
    import logging
    from backend.hardware.safety import motor_commands_enabled

    # Keep navigation and its motor command in the same order.
    with controller.lock:
        before = controller.status()
        after = getattr(controller, action)()

        # No motion when there is no page or navigation did not change it.
        if after["total"] == 0 or after["page"] == before["page"]:
            return after

        manager = getattr(app.state, "serial_manager", None)

        if not motor_commands_enabled():
            after["hardware_error"] = "Motor safety lock is enabled."
        elif manager is None or not manager.connected:
            after["hardware_error"] = "Arduino disconnected."
        else:
            try:
                manager.send_page(after["cells"])
                after["hardware_response"] = "OK"
            except (RuntimeError, TimeoutError) as error:
                after["hardware_error"] = str(error)

        if "hardware_error" in after:
            logging.getLogger("braillebridge.navigation").warning(
                "Auto display failed: %s", after["hardware_error"]
            )

        return after


@app.post("/api/display/next")
def display_next():
    return auto_navigate(display_controller(), "next")

@app.post("/api/display/previous")
def display_previous():
    return auto_navigate(display_controller(), "previous")

@app.post("/api/display/restart")
def display_restart():
    return auto_navigate(display_controller(), "restart")
