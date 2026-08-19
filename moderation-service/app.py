import os
import logging
import asyncio
import subprocess
import sys
from functools import lru_cache
from typing import Any

import httpx
import numpy as np
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field


app = FastAPI(title="Inkland image moderation service", version="2.0.0")
logger = logging.getLogger("inkland-moderation")
DOWNLOAD_ATTEMPTS = 3
MAX_OCR_BLOCKS_PER_IMAGE = 120
HEADLESS_CV2_VERSION = "4.10.0.84"


class ImageInput(BaseModel):
    index: int = Field(ge=0)
    url: str


class ModerationRequest(BaseModel):
    images: list[ImageInput] = Field(min_length=1, max_length=9)


def _ensure_headless_cv2() -> None:
    """魔搭默认环境缺少 libGL.so.1，而 paddleocr 会连带安装完整版 opencv
    （opencv-contrib-python），导致 import cv2 崩溃。
    这里先试导入；失败时用 headless 版覆盖，之后 paddleocr 才能正常加载。
    """
    try:
        import cv2  # noqa: F401
        return
    except Exception as error:
        logger.warning("cv2 导入失败（%s），正在替换为 opencv-python-headless %s ...", error, HEADLESS_CV2_VERSION)
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "pip",
                "install",
                "--quiet",
                "--no-deps",
                "--force-reinstall",
                f"opencv-python-headless=={HEADLESS_CV2_VERSION}",
            ],
            capture_output=True,
            text=True,
            timeout=300,
        )
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "")[-1000:]
            raise RuntimeError(f"headless_cv2_install_failed: {detail}") from error
        for name in [m for m in list(sys.modules) if m == "cv2" or m.startswith("cv2.")]:
            del sys.modules[name]
        import cv2  # noqa: F401
        logger.info("opencv-python-headless %s 安装完成，cv2 已可正常导入", HEADLESS_CV2_VERSION)


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
def detector() -> Any:
    _ensure_headless_cv2()
    from nudenet import NudeDetector
    model_path = os.getenv("NUDENET_MODEL_PATH", "").strip()
    if model_path:
        resolution = int(os.getenv("NUDENET_RESOLUTION", "320"))
        return NudeDetector(model_path=model_path, inference_resolution=resolution)
    return NudeDetector()


@lru_cache(maxsize=1)
def ocr_engine() -> Any:
    _ensure_headless_cv2()
    from paddleocr import PaddleOCR
    return PaddleOCR(
        lang=os.getenv("PADDLEOCR_LANGUAGE", "ch").strip() or "ch",
        ocr_version=os.getenv("PADDLEOCR_VERSION", "PP-OCRv6").strip() or "PP-OCRv6",
        device="cpu",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=True,
        enable_hpi=False,
        cpu_threads=max(1, int(os.getenv("PADDLEOCR_CPU_THREADS", "4"))),
    )


def _result_value(result: Any, key: str, default: Any) -> Any:
    try:
        value = result.get(key, default)
        if value is not None:
            return value
    except (AttributeError, TypeError):
        pass
    payload = getattr(result, "json", None)
    if isinstance(payload, dict):
        inner = payload.get("res", payload)
        if isinstance(inner, dict):
            return inner.get(key, default)
    return default


def recognize_text(image_bytes: bytes) -> list[dict[str, Any]]:
    _ensure_headless_cv2()
    import cv2
    encoded = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("image_decode_failed")

    threshold = min(1.0, max(0.0, float(os.getenv("PADDLEOCR_SCORE_THRESHOLD", "0.35"))))
    results = list(ocr_engine().predict(image, text_rec_score_thresh=threshold))
    blocks: list[dict[str, Any]] = []
    for result in results:
        texts = list(_result_value(result, "rec_texts", []))
        scores = list(_result_value(result, "rec_scores", []))
        polygons = list(_result_value(result, "rec_polys", []))
        for text, score, polygon in zip(texts, scores, polygons):
            normalized_text = str(text).strip()
            confidence = float(score)
            if not normalized_text or confidence < threshold:
                continue
            points = polygon.tolist() if hasattr(polygon, "tolist") else polygon
            blocks.append({
                "text": normalized_text[:500],
                "confidence": round(confidence, 6),
                "polygon": points,
            })
            if len(blocks) >= MAX_OCR_BLOCKS_PER_IMAGE:
                return blocks
    return blocks


def is_risky(label: str) -> bool:
    normalized = label.upper().replace(" ", "_")
    return normalized in RISK_LABELS or "EXPOSED" in normalized and any(
        word in normalized for word in ("BREAST", "GENITAL", "BUTTOCK", "ANUS", "PENIS", "VAGINA")
    )


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "engines": ["nudenet-onnx", "paddleocr"],
        "ocr_model": os.getenv("PADDLEOCR_VERSION", "PP-OCRv6"),
    }


@app.post("/moderate")
async def moderate(payload: ModerationRequest, x_moderation_secret: str | None = Header(default=None)) -> dict[str, Any]:
    expected = os.getenv("MODERATION_SERVICE_SECRET", "").strip()
    if not expected or x_moderation_secret != expected:
        raise HTTPException(status_code=401, detail="unauthorized")

    findings: list[dict[str, Any]] = []
    ocr_results: list[dict[str, Any]] = []
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
            try:
                blocks = await asyncio.to_thread(recognize_text, image_bytes)
            except Exception as error:
                logger.exception("moderation_ocr_failed index=%s", image.index)
                raise HTTPException(status_code=500, detail=f"image_{image.index}_ocr_failed") from error
            ocr_results.append({
                "image_index": image.index,
                "status": "completed",
                "text": "\n".join(block["text"] for block in blocks),
                "blocks": blocks,
            })

    return {
        "engine": "nudenet-onnx+paddleocr",
        "model": os.getenv("NUDENET_MODEL_PATH", "bundled-320n"),
        "ocr_model": os.getenv("PADDLEOCR_VERSION", "PP-OCRv6"),
        "outcome": "flagged" if findings else "approved",
        "findings": findings,
        "ocr_results": ocr_results,
    }
