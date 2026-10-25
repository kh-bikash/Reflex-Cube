import json
import random
import time
from typing import Any

import requests

# --- CONFIGURATION ---
# In a real app, these would be in config.py or .env
POLLINATIONS_URL = "https://text.pollinations.ai/"
HF_INFERENCE_URL = "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2"
# Use a free token if available, or rely on publicly available endpoints that might be rate-limited
# Fast CPU Dedicated Models (Transformers)
GENERAL_MODEL_PATH = "Qwen/Qwen2.5-0.5B-Instruct"
CODE_MODEL_PATH = "Qwen/Qwen2.5-Coder-0.5B-Instruct"

_local_engines = {"general": None, "code": None}


def get_local_engine(engine_type="general"):
    """Lazy loads optimized Transformers pipelines into memory."""
    global _local_engines

    if _local_engines[engine_type] is None:
        model_path = GENERAL_MODEL_PATH if engine_type == "general" else CODE_MODEL_PATH
        print(f"[AI Router] Loading optimized Transformers LOCAL model: {model_path}...")
        try:
            import torch
            from transformers import pipeline

            _local_engines[engine_type] = pipeline(
                "text-generation",
                model=model_path,
                device_map="auto" if torch.cuda.is_available() else "cpu",
            )
            print(
                f"[AI Router] {engine_type.capitalize()} Transformers Engine Loaded Successfully."
            )
        except Exception as e:
            print(f"[AI Router] Failed to load {model_path}: {e}")
            _local_engines[engine_type] = False  # Mark as failed to prevent retries

    return _local_engines[engine_type]


def query_ai(
    system_prompt: str,
    user_prompt: str,
    model_preference: str = "mistral",
    allow_pollinations: bool = False,
    engine_type: str = "general",
) -> str:
    """
    Queries AI with robust usage of multiple providers:
    1. Pollinations.ai (Free, Fast, sometimes unstable) - OPT IN ONLY
    2. Local Dedicated Pipelines (Qwen General / Qwen Coder)
    3. Emergency Static Fallback (If everything explodes)
    """

    # 1. Try Pollinations.ai (If admitted)
    if allow_pollinations:
        for attempt in range(2):
            try:
                print(f"[AI Router] Attempting Pollinations.ai (Try {attempt + 1})...")
                response = requests.post(
                    POLLINATIONS_URL,
                    headers={"Content-Type": "application/json"},
                    json={
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "model": model_preference,
                        "seed": random.randint(0, 1000),
                        "jsonMode": True,
                    },
                    timeout=60,
                )
                if response.status_code == 200 and len(response.text) > 10:
                    print("[AI Router] Success via Pollinations.")
                    return response.text
                else:
                    print(f"[AI Router] Pollinations failed with status {response.status_code}")
            except Exception as e:
                print(f"[AI Router] Pollinations Error: {e}")
                time.sleep(1)

    # 2. Try Hugging Face Inference (Optional/If configured)
    # Skipped for now to keep it simple, jumping to local or fallback.

    # 3. Try Local Dedicated Pipelines (Transformers)
    local_model = get_local_engine(engine_type)
    if local_model:
        try:
            print(f"[AI Router] Engaging Local {engine_type.capitalize()} Engine (Transformers)...")

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ]

            # The pipeline automatically uses the model's chat template
            outputs = local_model(
                messages,
                max_new_tokens=384,
                do_sample=True,
                temperature=0.7,
                return_full_text=False,  # Crucial: Omits the prompt from the returned string
            )

            response_text = outputs[0]["generated_text"]

            print(f"[AI Router] Local {engine_type.capitalize()} Generation Complete.")
            return response_text
        except Exception as e:
            print(f"[AI Router] Local Inference Failed: {e}")

    # 4. Ultimate Failover (Prevents crashes)
    print("[AI Router] All engines failed. Returning Static Fallback.")

    # Return a safe, generic JSON structure that works for most cubes
    # This mocks a valid response so the frontend doesn't crash.
    fallback_json = {
        "status": "success",
        "data": {
            "analysis": "AI Service Unavailable. Using offline mode.",
            "response": "I am currently offline, but here is a standard response.",
            "candidates": ["Offline Mode"],
            "suggestions": [{"name": "Standard Option", "desc": "Service is temporarily offline."}],
        },
    }
    return json.dumps(fallback_json)


def generate_image(
    prompt: str, seed: int | None = None, fallback_keyword: str = "technology"
) -> str:
    """
    Generates an image URL using Pollinations.ai with a robust fallback to Stock Photos.
    Verifies the image service is actually online before returning the URL.
    """
    import urllib.parse

    if seed is None:
        seed = random.randint(0, 9999)

    try:
        # 1. Primary: Pollinations.ai
        # Clean prompt for URL
        safe_prompt = urllib.parse.quote(prompt)
        pollinations_url = (
            f"https://image.pollinations.ai/prompt/{safe_prompt}?nologo=true&seed={seed}"
        )

        # Verify availability (Quick HEAD request with short timeout)
        # We don't download the whole image, just check if the server responds 200 OK
        print(f"[AI Router] Verifying Pollinations availability for: {prompt[:30]}...")
        response = requests.head(pollinations_url, timeout=3.0)

        if response.status_code == 200:
            print("[AI Router] Pollinations Verified Online.")
            return pollinations_url
        else:
            print(
                f"[AI Router] Pollinations returned status {response.status_code}. Using fallback."
            )

    except Exception as e:
        print(f"[AI Router] Pollinations Check Failed: {e}")

    # 2. Fallback: High-Quality Stock Photo (LoremFlickr)
    # Returns a redirect to a real image from Flickr matching keywords
    print(f"[AI Router] Engaging Stock Photo Fallback (Keyword: {fallback_keyword})")
    stock_url = f"https://loremflickr.com/800/600/{fallback_keyword}?lock={seed}"
    return stock_url


def extract_json(text: str) -> dict[str, Any] | None:
    """
    Robustly extracts JSON from a string, handling Markdown code blocks,
    trailing characters, and common LLM syntax errors.
    """
    import re

    # Pre-processing: Strip out typical LLM conversational artifacts at the end
    if text.endswith("</s>"):
        text = text[:-4]

    def _try_parse(json_str: str) -> dict[str, Any] | None:
        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            pass

        # Attempt 1: Fix Unquoted Keys (e.g. cost: "$10" -> "cost": "$10")
        fixed_str = re.sub(r"([{,])\s*([a-zA-Z_]+)\s*:", r'\1 "\2":', json_str)

        # Attempt 2: Fix Missing Commas (very common in local LLMs)
        # Looks for "value" "key": or } "key": or ] "key":
        fixed_str = re.sub(r'(["}\]])\s*(?=\s*"[a-zA-Z0-9_]+"\s*:)', r"\1,", fixed_str)

        # Attempt 3: Fix Trailing Commas
        fixed_str = re.sub(r",\s*([}\]])", r"\1", fixed_str)

        # Attempt 4: Clean up any weird nested double quotes that leaked
        # e.g. "Cost: "$50"" -> "Cost: 50" (heuristic)

        try:
            return json.loads(fixed_str)
        except json.JSONDecodeError:
            return None

    # 1. Try direct parsing
    result = _try_parse(text)
    if result:
        return result

    # 2. Try extracting from Markdown block
    try:
        if "```json" in text:
            content = text.split("```json")[1].split("```")[0].strip()
            result = _try_parse(content)
            if result:
                return result
        elif "```" in text:
            content = text.split("```")[1].split("```")[0].strip()
            result = _try_parse(content)
            if result:
                return result
    except Exception:
        pass

    # 3. Try finding first { and last }
    try:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            json_str = text[start : end + 1]
            result = _try_parse(json_str)
            if result:
                return result
    except Exception:
        pass

    safe_preview = str(text)[:50].encode("ascii", "replace").decode("ascii")
    print(f"[AI Router] Failed to extract JSON from: {safe_preview}...")
    return None
