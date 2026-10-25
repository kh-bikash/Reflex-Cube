import datetime
import json
from typing import Any

import torch
from transformers import pipeline

from ..utils import cube_dir
from .base import Cube

# Global Cache for LLM to avoid reloading on every request
_llm_pipeline = None


def get_llm():
    global _llm_pipeline
    if _llm_pipeline is None:
        print("[Nexus Cube] Booting Nexus Core v1 (Engine: TinyLlama-1.1B-Chat)...")
        device = 0 if torch.cuda.is_available() else -1
        # TinyLlama is a better chat model than distilgpt2
        _llm_pipeline = pipeline(
            "text-generation", model="TinyLlama/TinyLlama-1.1B-Chat-v1.0", device=device
        )
    return _llm_pipeline


class NexusCube(Cube):
    def __init__(self):
        self.memory_file = cube_dir("nexus") / "nexus_memory.json"
        self.memory: list[dict[str, str]] = []
        self.user_profile: dict[str, str] = {}
        self._load_memory()

    def _load_memory(self):
        try:
            if self.memory_file.exists():
                with open(self.memory_file) as f:
                    data = json.load(f)
                    self.memory = data.get("conversation", [])
                    self.user_profile = data.get("profile", {})
                    print(f"[Nexus Cube] Loaded {len(self.memory)} memories.")
        except Exception as e:
            print(f"[Nexus Cube] Memory Load Error: {e}")

    def _save_memory(self):
        try:
            with open(self.memory_file, "w") as f:
                json.dump(
                    {
                        "conversation": self.memory[
                            -50:
                        ],  # Keep last 50 turns to avoid infinite growth
                        "profile": self.user_profile,
                    },
                    f,
                    indent=2,
                )
        except Exception as e:
            print(f"[Nexus Cube] Memory Save Error: {e}")

    @property
    def name(self) -> str:
        return "Nexus Cube"

    @property
    def description(self) -> str:
        return "The Persistent Second Brain."

    def run(self, input_data: Any) -> dict[str, Any]:
        """
        Input: {'text': "What is the future of AI?", 'mode': 'chat' | 'raw'}
        Output: AI generated response.
        """
        user_input = input_data.get("text", "").strip()
        mode = input_data.get("mode", "chat")  # 'chat' (default) or 'raw'
        timestamp = datetime.datetime.now().strftime("%H:%M")

        if not user_input:
            return {"status": "error", "message": "Empty input."}

        # 1. Memory Extraction (Chat Mode)
        # Scan for explicit "remember" intent
        # 1. Memory Extraction (Chat Mode)
        # Scan for explicit "remember" intent
        if mode == "chat":
            lower_input = user_input.lower()

            # Pattern: "My name is X"
            if "my name is" in lower_input:
                name = lower_input.split("my name is")[-1].strip().title().strip(".,!")
                self.user_profile["name"] = name
                self._save_memory()
                return {
                    "status": "success",
                    "reply": f"Nice to meet you, {name}. I've saved that to my permanent memory.",
                    "memory_size": len(self.user_profile),
                }

            # Pattern: "Remember that X" (including typos)
            if "remember that" in lower_input or "remeber that" in lower_input:
                # Find index of the trigger phrase
                idx = lower_input.find("remember that")
                if idx == -1:
                    idx = lower_input.find("remeber that")

                fact = user_input[
                    idx + 13 :
                ].strip()  # 13 is len("remember that") approx... wait "remeber that" is 12.
                # Let's be safer
                if "remeber that" in lower_input:
                    fact = user_input[lower_input.find("remeber that") + 12 :].strip()
                else:
                    fact = user_input[lower_input.find("remember that") + 13 :].strip()

                if fact:
                    self.user_profile[f"fact_{timestamp}"] = fact
                    self._save_memory()
                    return {
                        "status": "success",
                        "reply": f"Okay, I've noted that: '{fact}'.",
                        "memory_size": len(self.user_profile),
                    }

            # Pattern: "Remember X" (e.g. Remember I like India)
            elif (
                lower_input.startswith("remember ") or lower_input.startswith("remeber ")
            ) and len(lower_input) > 9:
                fact = user_input.split(" ", 1)[1].strip()
                self.user_profile[f"fact_{timestamp}"] = fact
                self._save_memory()
                return {
                    "status": "success",
                    "reply": f"Got it. I'll remember: '{fact}'.",
                    "memory_size": len(self.user_profile),
                }

        # 2. Real LLM Generation
        try:
            generator = get_llm()

            # Context injection
            system_prompt = (
                "You are Nexus. "
                "CRITICAL: When the user asks 'What do I like?' or about themselves, answer ONLY based on the [User Facts] block. "
                "Do not talk about your own preferences. 'I' refers to the User."
            )

            if mode == "chat":
                name = self.user_profile.get("name")
                if name:
                    system_prompt += f" User's name is {name}."

            # MEMORY INJECTION STRATEGY v3:
            # Clear labeling
            memory_context = ""
            if mode == "chat":
                facts = [v for k, v in self.user_profile.items() if k.startswith("fact_")]
                if facts:
                    memory_context = f"\n[User Facts: {'; '.join(facts)}]\n"

            # TinyLlama Chat Format
            prompt = f"<|system|>\n{system_prompt}\n<|user|>\n{memory_context}{user_input}\n<|assistant|>\n"

            if mode == "raw":
                prompt = f"<|user|>\n{user_input}\n<|assistant|>\n"

            # Generate
            output = generator(
                prompt,
                max_new_tokens=150,
                num_return_sequences=1,
                do_sample=True,
                temperature=0.7,
                repetition_penalty=1.1,
            )
            generated_text = output[0]["generated_text"]

            # Clean up response
            response = generated_text[len(prompt) :].strip()
            response = response.replace("<|user|>", "").replace("<|system|>", "").strip()

            if not response:
                response = "I'm thinking..."

            # Append to conversation log
            if mode == "chat":
                self.memory.append({"role": "user", "content": user_input, "time": timestamp})
                self.memory.append({"role": "ai", "content": response, "time": timestamp})
                self._save_memory()

            return {
                "status": "success",
                "reply": response,
                "memory_size": len(self.memory) + len(self.user_profile),
            }

        except Exception as e:
            print(f"[Nexus Error] {e}")
            return {"status": "error", "message": f"Brain freeze: {e!s}"}
