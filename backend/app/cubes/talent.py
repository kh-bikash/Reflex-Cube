import json
from typing import Any

from .base import Cube


class TalentCube(Cube):
    @property
    def name(self) -> str:
        return "Talent Cube"

    @property
    def description(self) -> str:
        return "The Headhunter. AI-powered candidate screening and recruitment assistant."

    def run(self, input_data: Any) -> dict[str, Any]:
        mode = input_data.get("mode", "screen_single")  # screen_single, train_role, batch_screen

        if mode == "train_role":
            return self.train_role_model(input_data.get("job_description"))

        if mode == "batch_screen":
            return self.batch_screen(input_data)

        # Fallback to single mode (legacy support or direct calls)
        return self.batch_screen(
            {
                "criteria": {"raw_jd": input_data.get("job_description", "")},
                "candidates": [input_data.get("resume_text", "")],
            }
        )

    def train_role_model(self, jd: str) -> dict[str, Any]:
        """
        'Trains' a model by extracting critical evaluation criteria from the JD.
        """
        if not jd:
            return {"status": "error", "message": "Job Description required for training."}

        prompt = f"""
You are an Expert HR AI. Extract the 5 MOST CRITICAL evaluation criteria from this Job Description.
For each criteria, provide a weight (1-10) based on importance.

JOB DESCRIPTION:
{jd[:3000]}

Return JSON ONLY:
{{
    "role_title": "Extracted Job Title",
    "summary": "1 sentence summary of the ideal candidate",
    "criteria": [
        {{ "name": "Python Proficiency", "weight": 10, "description": "Must have deep async experience" }},
        {{ "name": "Team Leadership", "weight": 8, "description": "Experience managing 5+ devs" }}
    ]
}}
"""
        try:
            # AI Inference
            # AI Inference via Router
            from ..utils.ai_router import extract_json, query_ai

            response_text = query_ai("Output valid JSON.", prompt, model_preference="mistral-large")

            if response_text:
                data = extract_json(response_text)
                if data:
                    return {"status": "success", "data": data}

            return {"status": "error", "message": "AI Training Failed"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def batch_screen(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Screens a list of candidates against the trained criteria.
        """
        criteria = payload.get("criteria", {})
        candidates = payload.get("candidates", [])  # List of strings (resumes)

        results = []

        for resume in candidates:
            # For 100s of reports, we might need async/background tasks.
            # For now, we process sequentially with a mock/speed multiplier due to API limits.

            prompt = f"""
Evaluate this candidate against the following criteria.

CRITERIA:
{json.dumps(criteria.get("criteria", []))}

CANDIDATE:
{resume[:2000]}

Return JSON:
{{
    "name": "Candidate Name (extract from text)",
    "score": 0-100,
    "decision": "HIRE" | "INTERVIEW" | "REJECT",
    "reasoning": "1 sentence logic"
}}
"""
            try:
                # Real AI call per candidate (Slow but accurate)
                # Optimization: We could batch multiple resumes in one prompt if short.
                # Real AI call via Router
                from ..utils.ai_router import extract_json, query_ai

                res_text = query_ai("Output JSON.", prompt, model_preference="mistral-large")

                parsed_data = extract_json(res_text) if res_text else None

                if parsed_data:
                    results.append(parsed_data)
                else:
                    results.append(
                        {
                            "name": "Unknown",
                            "score": 0,
                            "decision": "ERROR",
                            "reasoning": "AI Failed",
                        }
                    )
            except:
                results.append(
                    {"name": "Unknown", "score": 0, "decision": "ERROR", "reasoning": "Timeout"}
                )

        return {
            "status": "success",
            "data": {"results": sorted(results, key=lambda x: x.get("score", 0), reverse=True)},
        }

    def _parse_ai_response(self, response) -> dict[str, Any]:
        if response.status_code != 200:
            return {"status": "error", "message": "AI Service Unavailable"}

        text = response.text.strip()
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            try:
                return {"status": "success", "data": json.loads(text[start : end + 1])}
            except:
                pass
        return {"status": "error", "message": "Invalid JSON from AI"}
