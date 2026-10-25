from typing import Any

from .base import Cube


class FitPalCube(Cube):
    @property
    def name(self) -> str:
        return "FitPal Cube"

    @property
    def description(self) -> str:
        return "AI Personal Trainer - Logic & Workout Generation."

    def run(self, input_data: Any) -> dict[str, Any]:
        # Input can be a list of equipment strings OR raw text description
        equipment_input = input_data.get("equipment", [])
        goal = input_data.get("goal", "Build Muscle")
        experience = input_data.get("experience", "Intermediate")

        # If input is text (comma separated), parse it
        if isinstance(equipment_input, str):
            equipment_input = [e.strip() for e in equipment_input.split(",")]

        # Default fallback if empty
        if not equipment_input:
            equipment_input = ["Bodyweight"]

        # 1. AI Analysis & Workout Generation
        try:
            system_prompt = (
                "You are an Elite Strength & Conditioning Coach (CSCS).\n"
                "Your goal is to design a high-quality, scientifically sound workout routine based STRICTLY on the available equipment.\n"
                "Do not prescribe exercises that cannot be performed with the listed equipment.\n\n"
                "INPUT:\n"
                f"- Goal: {goal}\n"
                f"- Experience Level: {experience}\n"
                f"- Available Equipment: {', '.join(equipment_input)}\n\n"
                "OUTPUT FORMAT (JSON ONLY):\n"
                "{\n"
                '  "workout_name": "Full Body Dumbbell Destruction",\n'
                '  "duration_minutes": 45,\n'
                '  "equipment_used": ["Dumbbells", "Bench"],\n'
                '  "warmup": [\n'
                '    {"name": "Arm Circles", "duration": "1 min", "notes": "Dynamic movement"}\n'
                "  ],\n"
                '  "main_circuit": [\n'
                '    {"name": "Goblet Squats", "sets": 4, "reps": "12-15", "rest": "60s", "notes": "Keep chest up, depth parallel"},\n'
                '    {"name": "Dumbbell Bench Press", "sets": 4, "reps": "10-12", "rest": "90s", "notes": "Full ROM"}\n'
                "  ],\n"
                '  "cooldown": [\n'
                '    {"name": "Static Stretching", "duration": "5 min"}\n'
                "  ],\n"
                '  "coach_tip": "Focus on time under tension since weight is limited."\n'
                "}"
            )

            user_prompt = "Generate the workout now. JSON Only."

            # API Call via Router
            from ..utils.ai_router import extract_json, query_ai

            content = query_ai(
                system_prompt, user_prompt, model_preference="mistral", allow_pollinations=True
            )

            if content:
                data = extract_json(content)
                if not data:
                    raise Exception("Failed to parse AI response.")

                # Ensure structure
                data["workout_name"] = data.get("workout_name", "Custom Workout")
                data["main_circuit"] = data.get("main_circuit", [])

                return {"status": "success", "data": data}
            else:
                raise Exception("AI Provider Unavailable (All Routes Failed)")

        except Exception as e:
            print(f"[FitPal Cube Error] {e!s}")
            return {"status": "error", "message": f"Generation failed: {e!s}"}
