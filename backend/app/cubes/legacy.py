from typing import Any

from .base import Cube


class LegacyCube(Cube):
    @property
    def name(self) -> str:
        return "Legacy Cube"

    @property
    def description(self) -> str:
        return "The Modernizer. Converts legacy code to modern paradigms."

    def run(self, input_data: Any) -> dict[str, Any]:
        source_code = input_data.get("source_code", "")
        target_lang = input_data.get("target_lang", "Python 3")

        if not source_code:
            return {"status": "error", "message": "No source code provided"}

        # Construct Prompt for AI
        prompt = f"""
You are an expert Senior Software Architect specializing in Legacy Code Modernization.
Your task is to REFACTOR and TRANSLATE the following legacy code into clean, modern, production-ready {target_lang}.

RULES:
1. Return ONLY the JSON response.
2. The JSON must have two fields: "modern_code" (string) and "explanation" (string).
3. "modern_code": The full rewritten code. Use modern best practices (e.g. type hinting, async/await, list comprehensions).
4. "explanation": A brief Markdown summary of what you changed (e.g. "Replaced loop with map", "Added error handling").
5. Do not include markdown fencing (```json) in your response, just the raw JSON.

LEGACY CODE:
{source_code}
"""

        # Call AI API using centralized router specifically requesting the code engine
        from ..utils.ai_router import extract_json, query_ai

        try:
            ai_text = query_ai(
                system_prompt="You are a code modernization engine. Output valid JSON only.",
                user_prompt=prompt,
                engine_type="code",
            )

            print(f"[Legacy Cube] Raw AI: {ai_text[:100]}...")  # Debug log

            data = extract_json(ai_text)
            if data:
                return {"status": "success", "data": data}
            else:
                print(f"JSON Parse Error. Raw: {ai_text}")
                return {
                    "status": "success",
                    "data": {
                        "modern_code": ai_text,
                        "explanation": "AI generated code but returned invalid JSON structure. See code pane.",
                    },
                }

        except Exception as e:
            print(f"AI Error: {e}")
            # Fallback Mock if AI fails
            return {
                "status": "success",
                "data": {
                    "modern_code": "# AI Service Unavailable. Mock Conversion:\n\ndef modern_version():\n    pass # Failed to connect to engine",
                    "explanation": "Service timeout. Showing mock result.",
                },
            }
