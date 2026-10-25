import base64
import io
from typing import Any

from .base import Cube

# Lazy import handling to prevent crashes if dependencies are missing/broken
try:
    import pytesseract
    from PIL import Image
    from pypdf import PdfReader
except ImportError:
    PdfReader = None
    pytesseract = None
    Image = None
    print("[LegalCube] Warning: PDF/Image dependencies not found.")
except Exception as e:
    PdfReader = None
    pytesseract = None
    Image = None
    print(f"[LegalCube] Warning: Dependency error: {e}")


class LegalCube(Cube):
    @property
    def name(self) -> str:
        return "Legal Cube"

    @property
    def description(self) -> str:
        return "AI Legal Assistant - Contract Risk Analysis."

    def run(self, input_data: Any) -> dict[str, Any]:
        pdf_b64 = input_data.get("pdf_base64")

        if not pdf_b64:
            return {"status": "error", "message": "No PDF file provided."}

        # 1. Extract Text from PDF
        try:
            # Decode base64
            if "," in pdf_b64:
                pdf_b64 = pdf_b64.split(",")[1]
            pdf_bytes = base64.b64decode(pdf_b64)

            # Read PDF
            if PdfReader is None:
                return {
                    "status": "error",
                    "message": "PDF Analysis unavailable due to missing server dependencies (pypdf).",
                }

            reader = PdfReader(io.BytesIO(pdf_bytes))
            text = ""
            for page in reader.pages:
                text += page.extract_text() + "\n"

            if not text.strip():
                return {
                    "status": "error",
                    "message": "Could not extract text from PDF. It might be scanned or empty.",
                }

            # Truncate text if too long (approx 15k chars for context window safety)
            # Contracts can be huge, we'll focus on the first 15k characters which usually contain definitions and key terms,
            # but ideally we'd chunk it. For this MVP, truncation is acceptable.
            truncated_text = text[:15000]

        except Exception as e:
            return {"status": "error", "message": f"Failed to parse PDF: {e!s}"}

        # 2. AI Analysis
        try:
            system_prompt = (
                "You are a Senior Corporate Lawyer and Risk Analyst.\n"
                "Review the provided contract text and identify potential risks, red flags, and missing protective clauses.\n"
                "Your audience is a layperson who needs a plain English explanation.\n\n"
                "OUTPUT FORMAT (JSON ONLY):\n"
                "{\n"
                '  "summary": "A brief 2-3 sentence summary of what this contract is about.",\n'
                '  "risk_score": 85,  // 0-100 (100 is very safe, 0 is extremely risky)\n'
                '  "red_flags": [\n'
                '    {"title": "Unlimited Liability", "explanation": "This clause makes you personally responsible for all damages...", "severity": "High"},\n'
                '    {"title": "Non-Compete", "explanation": "Prevents you from working in this industry for 2 years...", "severity": "Medium"}\n'
                "  ],\n"
                '  "missing_clauses": ["Termination Clause", "Dispute Resolution"],\n'
                '  "key_dates": ["Effective Date: Jan 1, 2024", "Termination: 30 days notice"],\n'
                '  "verdict": "Proceed with caution. The liability section needs negotiation."\n'
                "}"
            )

            user_prompt = f"Analyze this contract:\n\n{truncated_text}"

            # API Call via Router
            from ..utils.ai_router import extract_json, query_ai

            content = query_ai(system_prompt, user_prompt, model_preference="mistral")

            if content:
                data = extract_json(content)
                if not data:
                    raise Exception("Failed to parse AI response.")

                # Ensure defaults
                data["risk_score"] = data.get("risk_score", 50)
                data["red_flags"] = data.get("red_flags", [])

                return {"status": "success", "data": data}
            else:
                raise Exception("AI Provider Unavailable (All Routes Failed)")

        except Exception as e:
            print(f"[Legal Cube Error] {e!s}")
            return {
                "status": "error",
                "message": f"Analysis failed: {e!s}",
                # Return dummy data for fallback if AI fails (demo purposes)
                "data": {
                    "summary": "Could not complete full analysis due to connection error. However, we extracted the text successfully.",
                    "risk_score": 0,
                    "red_flags": [
                        {
                            "title": "Analysis Failed",
                            "explanation": "Please try again.",
                            "severity": "High",
                        }
                    ],
                    "missing_clauses": [],
                    "key_dates": [],
                    "verdict": "Error encountered.",
                },
            }
