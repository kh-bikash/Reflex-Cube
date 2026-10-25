import os
import threading
import time
from typing import Any

import tiktoken
import torch

from ..utils import cube_dir
from .base import Cube
from .forge_core.model import NanoGPT


# Global state for the training job
class TrainingState:
    def __init__(self):
        self.is_training = False
        self.stop_requested = False
        self.loss_history = []
        self.current_step = 0
        self.model = None
        self.vocab_size = 50257  # GPT-2 default
        self.data = ""
        self.config = {}  # Store config for saving
        self.logs = []


state = TrainingState()


class ForgeCube(Cube):
    @property
    def name(self) -> str:
        return "Forge Cube"

    @property
    def description(self) -> str:
        return "Build LLMs from Scratch."

    def log(self, msg):
        print(f"[Forge] {msg}")
        state.logs.append(f"[{time.strftime('%H:%M:%S')}] {msg}")
        if len(state.logs) > 50:
            state.logs.pop(0)

    def run(self, input_data: Any) -> dict[str, Any]:
        """
        Commands: 'upload', 'train', 'stop', 'status', 'generate'
        """
        action = input_data.get("action", "status")

        if action == "upload":
            text = input_data.get("text", "")
            if not text:
                return {"status": "error", "message": "No text provided"}
            state.data = text
            self.log(f"Data received: {len(text)} chars.")
            # Simple est. token count
            return {"status": "success", "char_count": len(text)}

        elif action == "train":
            if state.is_training:
                return {"status": "error", "message": "Already training"}

            config = input_data.get("config", {})
            threading.Thread(target=self._train_loop, args=(config,), daemon=True).start()
            return {"status": "success", "message": "Training started"}

        elif action == "stop":
            state.stop_requested = True
            return {"status": "success", "message": "Stopping..."}

        elif action == "status":
            return {
                "is_training": state.is_training,
                "step": state.current_step,
                "loss": state.loss_history[-1] if state.loss_history else 0,
                "history": state.loss_history[-50:],  # Send last 50 points for graph
                "logs": state.logs,
            }

        elif action == "save":
            name = input_data.get("name", f"model_{int(time.time())}")
            # Sanitize name
            name = "".join([c for c in name if c.isalnum() or c in ("-", "_")])
            if not state.model:
                return {"status": "error", "message": "No model to save."}

            save_dir = str(cube_dir("forge_models"))
            save_path = os.path.join(save_dir, f"{name}.pt")

            checkpoint = {
                "config": state.config,  # We need to store the config used to create it!
                "state_dict": state.model.state_dict(),
                "step": state.current_step,
                "loss": state.loss_history[-1] if state.loss_history else 0,
                "vocab_size": state.vocab_size,
            }
            torch.save(checkpoint, save_path)
            return {"status": "success", "message": f"Saved model '{name}'"}

        elif action == "list":
            save_dir = str(cube_dir("forge_models"))
            models = []
            for f in os.listdir(save_dir):
                if f.endswith(".pt"):
                    path = os.path.join(save_dir, f)
                    stats = os.stat(path)
                    models.append(
                        {
                            "name": f.replace(".pt", ""),
                            "size": stats.st_size,  # bytes
                            "modified": stats.st_mtime,
                        }
                    )
            return {"status": "success", "models": models}

        elif action == "load":
            name = input_data.get("name")
            save_path = os.path.join(str(cube_dir("forge_models")), f"{name}.pt")
            if not os.path.exists(save_path):
                return {"status": "error", "message": "Model not found"}

            try:
                self.log(f"Loading model '{name}'...")
                device = "cuda" if torch.cuda.is_available() else "cpu"
                checkpoint = torch.load(save_path, map_location=device)

                # Re-init model with identical config
                conf = checkpoint["config"]
                state.config = conf  # Restore config to state
                state.vocab_size = checkpoint.get("vocab_size", 50257)

                state.model = NanoGPT(
                    state.vocab_size,
                    n_embd=conf["n_embd"],
                    n_head=conf["n_head"],
                    n_layer=conf["n_layer"],
                    block_size=conf.get("block_size", 64),
                )  # Default to 64 to save legacy models if needed, else 128
                state.model.load_state_dict(checkpoint["state_dict"])
                state.model.to(device)
                state.device = device
                state.current_step = checkpoint.get("step", 0)

                self.log(f"Loaded '{name}'. Ready for inference/training.")
                return {"status": "success", "message": f"Loaded {name}", "config": conf}
            except Exception as e:
                return {"status": "error", "message": f"Load failed: {e!s}"}

        elif action == "generate":
            if not state.model:
                return {"status": "error", "message": "No model trained yet."}
            prompt = input_data.get("prompt", "Hello")

            # Extract generation config from frontend, or use safe defaults for tiny models
            temperature = float(input_data.get("temperature", 0.7))
            top_k = int(input_data.get("top_k", 40))
            rep_pen = float(input_data.get("repetition_penalty", 1.2))

            try:
                enc = tiktoken.get_encoding("gpt2")
                tokens = enc.encode(prompt)
                idx = torch.tensor(tokens, dtype=torch.long).unsqueeze(0).to(state.device)

                gen_tokens = state.model.generate(
                    idx,
                    max_new_tokens=100,
                    temperature=temperature,
                    top_k=top_k,
                    repetition_penalty=rep_pen,
                )
                decoded = enc.decode(gen_tokens[0].tolist())
                return {"status": "success", "generated": decoded}
            except Exception as e:
                return {"status": "error", "message": str(e)}

        return {"status": "error", "message": "Unknown action"}

    def _train_loop(self, config):
        if not state.data:
            self.log("Error: No training data.")
            return

        state.is_training = True
        state.stop_requested = False
        state.config = config  # Save config for persistence
        state.loss_history = []
        state.current_step = 0

        # Hyperparams
        n_layer = int(config.get("n_layer", 2))
        n_head = int(config.get("n_head", 2))
        n_embd = int(config.get("n_embd", 64))
        block_size = 128
        batch_size = 8
        max_steps = 500
        lr = 3e-4

        self.log(f"Initializing NanoGPT: L={n_layer}, H={n_head}, Dim={n_embd}")

        # Tokenize
        enc = tiktoken.get_encoding("gpt2")
        self.log("Tokenizing data...")
        dataset = torch.tensor(enc.encode(state.data), dtype=torch.long)
        state.vocab_size = enc.n_vocab

        # Init Model
        device = "cuda" if torch.cuda.is_available() else "cpu"
        state.device = device
        state.model = NanoGPT(
            state.vocab_size, n_embd=n_embd, n_head=n_head, n_layer=n_layer, block_size=block_size
        )
        state.model.to(device)
        optimizer = torch.optim.AdamW(state.model.parameters(), lr=lr)

        state.model.train()

        def get_batch():
            ix = torch.randint(len(dataset) - block_size, (batch_size,))
            x = torch.stack([dataset[i : i + block_size] for i in ix])
            y = torch.stack([dataset[i + 1 : i + block_size + 1] for i in ix])
            return x.to(device), y.to(device)

        self.log(f"Training on {device}...")

        for step in range(max_steps):
            if state.stop_requested:
                self.log("Training stopped by user.")
                break

            xb, yb = get_batch()
            _logits, loss = state.model(xb, yb)

            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()

            state.current_step = step
            state.loss_history.append(loss.item())

            if step % 10 == 0:
                self.log(f"Step {step}: Loss {loss.item():.4f}")

            time.sleep(0.05)  # Slow down slightly for UI demo effect

        state.is_training = False
        self.log("Training complete!")
