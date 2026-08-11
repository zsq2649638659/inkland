import os
import logging
import asyncio
from functools import lru_cache
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from nudenet import NudeDetector


app = FastAPI(title="Inkland NudeNet moderation service", version="1.0.0")
logger = logging.getLogger("inkland-moderation")
DOWNLOAD_ATTEMPTS = 3


class ImageInput(BaseModel):
    index: int = Field(ge=0)
    url: str


class ModerationRequest(BaseModel):
    images: list[ImageInput] = Field(min_length=1, max_length=9)


# These labels represent exposed or explicitly sexual body parts. Face/feet/belly
# detections alone are not treated as an automatic rejection.
RISK_LABELS = {
    "EXPOSED_ANUS",
    "EXPOSED_BREAST_F",
    "EXPOSED_BREAST_M",
    "EXPOSED_GENITALIA_F",
    "EXPOSED_GENITALIA_M",
    "EXPOSED_BUTTOCKS",
    "BUTTOCKS_EXPOSED",
    "FEMALE_GENITALIA_EXPOSED",
    "MALE_GENITALIA_EXPOSED",
    "PENIS_EXPOSED",
    "VAGINA_EXPOSED",
}


@lru_cache(maxsize=1)
def detector() -> NudeDetector:
    model_path = os.getenv("NUDENET_MODEL_PATH", "").strip()
    if model_path:
        resolution = int(os.getenv("NUDENET_RESOLUTION", "320"))
        return NudeDetector(model_path=model_path, inference_resolution=resolution)
    return NudeDetector()


def is_risky(label: str) -> bool:
    normalized = label.upper().replace(" ", "_")
    return normalized in RISK_LABELS or "EXPOSED" in normalized and any(
        word in normalized for word in ("BREAST", "GENITAL", "BUTTOCK", "ANUS", "PENIS", "VAGINA")
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "engine": "nudenet-onnx"}


@app.post("/moderate")
async def moderate(payload: ModerationRequest, x_moderation_secret: str | None = Header(default=None)) -> dict[str, Any]:
    expected = os.getenv("MODERATION_SERVICE_SECRET", "").strip()
    if not expected or x_moderation_secret != expected:
        raise HTTPException(status_code=401, detail="unauthorized")

    findings: list[dict[str, Any]] = []
    timeout = httpx.Timeout(75.0, connect=25.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        for image in payload.images:
            last_error: Exception | None = None
            image_bytes: bytes | None = None
            for attempt in range(1, DOWNLOAD_ATTEMPTS + 1):
                try:
                    response = await client.get(image.url)
                    response.raise_for_status()
                    if not response.content:
                        raise RuntimeError("downloaded_image_is_empty")
                    image_bytes = response.content
                    break
                except Exception as error:
                    last_error = error
                    logger.warning("moderation_image_download_retry index=%s attempt=%s", image.index, attempt)
                    if attempt < DOWNLOAD_ATTEMPTS:
                        await asyncio.sleep(attempt)
            if image_bytes is None:
                logger.error("moderation_image_failed index=%s url=%s error=%r", image.index, image.url[:160], last_error)
                raise HTTPException(status_code=502, detail=f"image_{image.index}_download_failed") from last_error
            try:
                detections = detector().detect(image_bytes)
            except Exception as error:
                logger.exception("moderation_inference_failed index=%s", image.index)
                raise HTTPException(status_code=500, detail=f"image_{image.index}_inference_failed") from error
            for item in detections:
                label = str(item.get("class", "unknown"))
                score = float(item.get("score", 0))
                if is_risky(label) and score >= 0.35:
                    findings.append({
                        "image_index": image.index,
                        "category": label.lower(),
                        "score": score,
                        "details": "NudeNet 服务端检测到潜在风险区域",
                        "box": item.get("box"),
                    })

    return {
        "engine": "nudenet-onnx",
        "model": os.getenv("NUDENET_MODEL_PATH", "bundled-320n"),
        "outcome": "flagged" if findings else "approved",
        "findings": findings,
    }
