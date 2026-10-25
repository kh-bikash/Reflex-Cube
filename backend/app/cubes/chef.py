import base64
import io
import random
from typing import Any

from PIL import Image
from transformers import BlipForConditionalGeneration, BlipProcessor

from .base import Cube

# Global Caches for Vision (Switching to BLIP for Scene Understanding)
_vision_processor = None
_vision_model = None


def get_vision_model():
    global _vision_model, _vision_processor
    if _vision_model is None:
        print("[Chef Cube] Loading BLIP Image Captioning...")
        # Use BLIP Base - it's fast enough on CPU and gives great descriptions
        _vision_processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base")
        _vision_model = BlipForConditionalGeneration.from_pretrained(
            "Salesforce/blip-image-captioning-base"
        )
    return _vision_processor, _vision_model


class ChefCube(Cube):
    @property
    def name(self) -> str:
        return "Chef Cube"

    @property
    def description(self) -> str:
        return "Advanced AI Culinary Assistant."

    def run(self, input_data: Any) -> dict[str, Any]:
        image_b64 = input_data.get("image")
        text_input = input_data.get("text")

        vision_context = ""

        # 1. Vision (BLIP - Local)
        if image_b64:
            try:
                if "base64," in image_b64:
                    image_b64 = image_b64.split("base64,")[1]

                image_data = base64.b64decode(image_b64)
                image = Image.open(io.BytesIO(image_data)).convert("RGB")

                processor, model = get_vision_model()
                # Generate a descriptive caption
                inputs = processor(image, return_tensors="pt")
                out = model.generate(**inputs, max_new_tokens=50)
                vision_context = processor.decode(out[0], skip_special_tokens=True)
                print(f"[Chef Cube] Vision Caption: {vision_context}")

            except Exception as e:
                return {"status": "error", "message": f"Vision Error: {e!s}"}
        elif text_input:
            vision_context = f"User explicitly lists: {text_input}"

        if not vision_context:
            return {
                "status": "error",
                "message": "I couldn't clearly see or understand the ingredients. Please try again.",
            }

        # Context is the "candidate"
        candidates = [vision_context] if vision_context else []

        # 2. Expert Chef Logic (Pollinations AI - Text)
        print(f"[Chef Cube] Context: {vision_context}")

        try:
            # Massive System Prompt based on User Spec
            system_prompt = (
                "You are an Advanced AI Culinary Assistant and Food Vision Expert.\n"
                "Your goal is to be helpful, accurate, friendly, and beginner-focused.\n\n"
                "INPUT: A visual description of a fridge or ingredients.\n"
                "TASK:\n"
                "1. ANALYZE: Extract ingredients from the description. Ignore non-food. Mention if unsure.\n"
                "2. SUGGEST: Propose 3 distinct dishes (give Cuisine, Difficulty, Time).\n"
                "3. SELECT: Choose the BEST dish from the suggestions to cook right now.\n"
                "4. RECIPE: Provide a full step-by-step recipe for the SELECTED dish.\n"
                "5. SAFETY: Warn about allergies or unsafe combinations.\n"
                "6. IMAGE PROMPT: Write a simple 5-word visual prompt for the dish.\n\n"
                "OUTPUT FORMAT: Valid JSON only. Do not wrap in markdown code blocks. Structure:\n"
                "{\n"
                "  'analysis': 'I see [ingredients]...',\n"
                "  'suggestions': [\n"
                "    {'name': 'Dish Name', 'cuisine': 'Italian', 'difficulty': 'Easy', 'time': '20m'}\n"
                "  ],\n"
                "  'selected_dish': {\n"
                "    'name': 'The Chosen Dish',\n"
                "    'description': 'Why this is great...',\n"
                "    'ingredients_list': ['Item 1', 'Item 2'],\n"
                "    'steps': ['1. Step one...', '2. Step two...'],\n"
                "    'tips': 'Chef tip...',\n"
                "    'calories': '500 kcal'\n"
                "  },\n"
                "  'safety_warning': 'None' or 'Warning text...'\n"
                "}"
            )

            user_prompt = f"Visual Description: {vision_context}. Please guide me."

            # API Call via Router
            from ..utils.ai_router import extract_json, query_ai

            content = query_ai(
                system_prompt, user_prompt, model_preference="openai", allow_pollinations=True
            )

            if content:
                print(f"[Chef Cube] AI Response: {content}")
                data = extract_json(content)
            else:
                print("[Chef Cube] AI Provider Failed (All Routes).")
                data = None

            # --- FALLBACK LOGIC ---
            if not data:
                print("[Chef Cube] Using Fallback Recipe due to options failure.")
                # Fallback Recipe to avoid "Brain Offline" error
                data = {
                    "analysis": f"I couldn't reach my culinary brain right now, but here is a reliable suggestion for: {vision_context}",
                    "suggestions": [
                        {
                            "name": "Quick Stir Fry",
                            "cuisine": "Asian",
                            "difficulty": "Easy",
                            "time": "15m",
                        }
                    ],
                    "selected_dish": {
                        "name": "Classic Comfort Stir-Fry",
                        "description": "A reliable and delicious dish you can make with almost anything.",
                        "ingredients_list": [
                            "Vegetables (Any)",
                            "Protein (Chicken/Tofu/Beef)",
                            "Soy Sauce",
                            "Rice/Noodles",
                            "Garlic",
                            "Ginger",
                        ],
                        "steps": [
                            "1. Slice your protein and vegetables into bite-sized pieces.",
                            "2. Heat oil in a pan over high heat.",
                            "3. Cook protein until browned, then remove.",
                            "4. Stir fry vegetables for 3-5 minutes.",
                            "5. Return protein, add soy sauce, garlic, and ginger.",
                            "6. Toss everything together and serve over rice or noodles.",
                        ],
                        "tips": "Add chili flakes for some heat, or sesame oil for aroma.",
                        "calories": "~450 kcal",
                    },
                    "safety_warning": "Ensure all ingredients are fresh and cooked thoroughly.",
                }

            # Extract parts
            analysis = data.get("analysis", "Ingredients analyzed.")
            suggestions = data.get("suggestions", [])
            selected = data.get("selected_dish", {})
            safety = data.get("safety_warning")

            # Generate Image (Robust)
            # API Call via Router
            from ..utils.ai_router import extract_json, generate_image, query_ai

            # Helper to sanitize string for URL
            def sanitize(text):
                return "".join([c for c in text if c.isalnum() or c in " ,"])

            clean_title = sanitize(selected.get("name", "Food"))

            # Construct Prompts
            visual_prompt = f"delicious {clean_title} michelin presentation 8k"

            # Add random seed
            seed = random.randint(0, 9999)

            # Uses Router to ensure we get a working URL (Pollinations or Stock Photo)
            image_url = generate_image(
                visual_prompt, seed=seed, fallback_keyword="food,restaurant,meal"
            )

            print(f"[Chef Cube] Final Image URL: {image_url}")

            # Return structure matching what frontend WILL expect
            return {
                "status": "success",
                "detected": candidates,
                "analysis": analysis,
                "suggestions": suggestions,
                "safety": safety,
                "recipe": {
                    "title": selected.get("name", "Chef's Choice"),
                    "description": selected.get("description", ""),
                    "calories": selected.get("calories", "N/A"),
                    "time": suggestions[0].get("time", "30m") if suggestions else "30m",
                    "ingredients": selected.get("ingredients_list", candidates),
                    "steps": selected.get("steps", ["Cook well.", "Enjoy."]),
                    "tips": selected.get("tips", ""),
                    "image_url": image_url,
                },
            }

        except Exception as e:
            print(f"[Chef Cube Error] {e!s}")
            # Fallback
            return {"status": "error", "message": f"My culinary brain is offline: {e!s}"}
