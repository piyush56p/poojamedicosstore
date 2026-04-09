import json
import os

import google.generativeai as genai
from PIL import Image

SYSTEM_PROMPT = (
    "You are an OCR + medical prescription parser. "
    "Read the prescription image and return strict JSON with keys: "
    "extracted_text (string) and medicines (array). "
    "Each medicine item must include: name, dosage, frequency, duration, notes. "
    "If any field is missing in the prescription, keep it as empty string. "
    "Never return markdown, only valid JSON."
)


def _extract_json_object(raw_text):
    raw_text = (raw_text or "").strip()
    if not raw_text:
        return {}

    if raw_text.startswith("```"):
        raw_text = raw_text.strip("`")
        raw_text = raw_text.replace("json", "", 1).strip()

    if raw_text.startswith("{") and raw_text.endswith("}"):
        return json.loads(raw_text)

    start = raw_text.find("{")
    end = raw_text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return {}
    return json.loads(raw_text[start : end + 1])


def _gemini_vision_extract(image_path):
    api_key = os.getenv("GEMINI_API_KEY")
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    if not api_key:
        return None

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(model_name)

    with Image.open(image_path) as img:
        response = model.generate_content(
            [
                SYSTEM_PROMPT,
                "Extract medicines and dosage from this prescription image.",
                img,
            ]
        )

    content = getattr(response, "text", "") or ""
    return _extract_json_object(content)


def analyze_prescription_image(image_path):
    """
    Returns:
        {
            "extracted_text": str,
            "medicines": list[dict],
            "ai_used": bool
        }
    """
    parsed = _gemini_vision_extract(image_path)
    if parsed is None:
        return {
            "extracted_text": "",
            "medicines": [],
            "ai_used": False,
        }

    medicines = parsed.get("medicines") or []
    if not isinstance(medicines, list):
        medicines = []

    normalized = []
    for item in medicines:
        if not isinstance(item, dict):
            continue
        normalized.append(
            {
                "name": str(item.get("name", "")).strip(),
                "dosage": str(item.get("dosage", "")).strip(),
                "frequency": str(item.get("frequency", "")).strip(),
                "duration": str(item.get("duration", "")).strip(),
                "notes": str(item.get("notes", "")).strip(),
            }
        )

    return {
        "extracted_text": str(parsed.get("extracted_text", "")).strip(),
        "medicines": normalized,
        "ai_used": True,
    }
