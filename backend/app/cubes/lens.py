import base64
import io
from typing import Any

import easyocr
import numpy as np
import torch
from PIL import Image
from transformers import pipeline

from .base import Cube

# Cache the models globally
_classifier = None
_ocr_reader = None


def get_classifier():
    global _classifier
    if _classifier is None:
        print("[Lens Cube] Loading ViT Model...")
        _classifier = pipeline("image-classification", model="google/vit-base-patch16-224")
    return _classifier


def get_ocr_reader():
    global _ocr_reader
    if _ocr_reader is None:
        print("[Lens Cube] Loading EasyOCR Model...")
        # 'en' for English. GPU=True if CUDA available, else False.
        # This will download the model weights (~80MB) on first run.
        use_gpu = torch.cuda.is_available()
        _ocr_reader = easyocr.Reader(["en"], gpu=use_gpu)
    return _ocr_reader


class LensCube(Cube):
    @property
    def name(self) -> str:
        return "Lens Cube"

    @property
    def description(self) -> str:
        return "Universal Object Identifier & OCR Scanner."

    def run(self, input_data: Any) -> dict[str, Any]:
        """
        Input: Dictionary containing 'image' (base64 string)
        """
        image_b64 = input_data.get("image")

        if not image_b64:
            return {"status": "error", "message": "No image provided."}

        try:
            # 1. Decode Base64
            if "base64," in image_b64:
                image_b64 = image_b64.split("base64,")[1]

            image_data = base64.b64decode(image_b64)
            image = Image.open(io.BytesIO(image_data)).convert("RGB")

            # Convert to numpy for EasyOCR
            image_np = np.array(image)

            # 2. Run Object Detection (ViT)
            classifier = get_classifier()
            predictions = classifier(image)
            top_prediction = predictions[0]
            label = top_prediction["label"].title()
            score = f"{top_prediction['score'] * 100:.1f}%"

            # 3. Run OCR
            ocr_reader = get_ocr_reader()
            # detail=0 returns just the text list
            ocr_results = ocr_reader.readtext(image_np, detail=0)
            ocr_text = "\n".join(ocr_results) if ocr_results else None

            details_text = f"Identified as {label} ({score})."
            if ocr_text:
                details_text += " Text content detected."

            return {
                "status": "success",
                "result": {
                    "type": "Scan Result",
                    "identified": label,
                    "confidence": score,
                    "details": details_text,
                    "ocr_text": ocr_text,
                },
            }

        except Exception as e:
            print(f"[Lens Cube Error] {e!s}")
            return {"status": "error", "message": f"Failed to analyze image: {e!s}"}
