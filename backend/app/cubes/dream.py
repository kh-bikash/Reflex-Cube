import base64
import hashlib
import io
import os
import random
import tempfile
import threading
import time
from typing import Any

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image
from torchvision import transforms

from ..utils import cube_dir
from .base import Cube


def _prompt_to_ids(prompt: str, length: int = 10, vocab: int = 1000):
    """Map a prompt to a fixed-length, deterministic id sequence.

    The Dream model conditions on token ids but ships without a tokenizer, so
    hash successive characters into the embedding's id range. Same prompt, same
    conditioning; an empty prompt yields a constant neutral sequence.
    """
    digest = hashlib.sha256(prompt.encode("utf-8")).digest()
    ids = [digest[i % len(digest)] * 4 % vocab for i in range(length)]
    return torch.tensor([ids], dtype=torch.long)


# --- 1. The "From Scratch" Model Architecture (Mini U-Net) ---
# We build this explicitly so the user owns the architecture.


# --- 1. The "From Scratch" Model Architecture (Attention U-Net) ---


class SinusoidalPositionEmbeddings(nn.Module):
    def __init__(self, dim):
        super().__init__()
        self.dim = dim

    def forward(self, time):
        device = time.device
        half_dim = self.dim // 2
        embeddings = np.log(10000) / (half_dim - 1)
        embeddings = torch.exp(torch.arange(half_dim, device=device) * -embeddings)
        embeddings = time[:, None] * embeddings[None, :]
        embeddings = torch.cat((embeddings.sin(), embeddings.cos()), dim=-1)
        return embeddings


class CrossAttention(nn.Module):
    def __init__(self, dim, context_dim):
        super().__init__()
        self.scale = dim**-0.5
        self.to_q = nn.Linear(dim, dim, bias=False)
        self.to_k = nn.Linear(context_dim, dim, bias=False)
        self.to_v = nn.Linear(context_dim, dim, bias=False)
        self.to_out = nn.Linear(dim, dim)

    def forward(self, x, context=None):
        # x: [B, C, H, W] -> Flatten to [B, H*W, C] for attention
        b, c, h, w = x.shape
        x_flat = x.view(b, c, -1).permute(0, 2, 1)  # [B, Seq, C]

        # If no context (unconditional), self-attention
        if context is None:
            context = x_flat

        q = self.to_q(x_flat)
        k = self.to_k(context)
        v = self.to_v(context)

        dots = torch.bmm(q, k.transpose(1, 2)) * self.scale
        attn = dots.softmax(dim=-1)
        out = torch.bmm(attn, v)

        out = self.to_out(out)
        out = out.permute(0, 2, 1).reshape(b, c, h, w)
        return x + out  # Residual


class SimpleBlock(nn.Module):
    def __init__(self, in_ch, out_ch):
        super().__init__()
        self.conv1 = nn.Conv2d(in_ch, out_ch, 3, padding=1)
        self.bn1 = nn.BatchNorm2d(out_ch)
        self.conv2 = nn.Conv2d(out_ch, out_ch, 3, padding=1)
        self.bn2 = nn.BatchNorm2d(out_ch)

    def forward(self, x):
        x = F.relu(self.bn1(self.conv1(x)))
        x = F.relu(self.bn2(self.conv2(x)))
        return x


class AttentionUNet(nn.Module):
    def __init__(self, in_channels=3, out_channels=3, time_emb_dim=32, context_dim=32):
        super().__init__()

        # Time Embedding
        self.time_mlp = nn.Sequential(
            SinusoidalPositionEmbeddings(time_emb_dim),
            nn.Linear(time_emb_dim, time_emb_dim),
            nn.ReLU(),
        )

        # Text Embedding (Simple Lookup for "Scratch" feel)
        self.text_emb = nn.Embedding(1000, context_dim)  # Vocab 1000

        # Encoder
        self.down1 = SimpleBlock(in_channels, 64)
        self.pool1 = nn.MaxPool2d(2)
        self.down2 = SimpleBlock(64, 128)
        self.attn2 = CrossAttention(128, context_dim)  # Attention at 32x32
        self.pool2 = nn.MaxPool2d(2)
        self.down3 = SimpleBlock(128, 256)
        self.attn3 = CrossAttention(256, context_dim)  # Attention at 16x16

        # Decoder
        self.up1 = nn.ConvTranspose2d(256, 128, 2, stride=2)
        self.up_block1 = SimpleBlock(256, 128)
        self.attn_up1 = CrossAttention(128, context_dim)

        self.up2 = nn.ConvTranspose2d(128, 64, 2, stride=2)
        self.up_block2 = SimpleBlock(128, 64)

        # Output
        self.out_conv = nn.Conv2d(64, out_channels, 1)

    def forward(self, x, t, text_ids=None):
        # Time
        t = self.time_mlp(t)

        # Text Context
        context = None
        if text_ids is not None:
            context = self.text_emb(text_ids)  # [B, Seq, Dim]

        # Down
        x1 = self.down1(x)
        x2 = self.pool1(x1)

        x2 = self.down2(x2)
        if context is not None:
            x2 = self.attn2(x2, context)
        x3 = self.pool2(x2)

        x3 = self.down3(x3)
        if context is not None:
            x3 = self.attn3(x3, context)

        # Up
        x = self.up1(x3)
        x = torch.cat([x, x2], dim=1)
        x = self.up_block1(x)
        if context is not None:
            x = self.attn_up1(x, context)

        x = self.up2(x)
        x = torch.cat([x, x1], dim=1)
        x = self.up_block2(x)

        out = self.out_conv(x)
        return out


# --- 2. Diffusion Logic ---


class DiffusionManager:
    def __init__(self, steps=300):
        self.steps = steps
        self.beta = torch.linspace(1e-4, 0.02, steps)
        self.alpha = 1.0 - self.beta
        self.alpha_hat = torch.cumprod(self.alpha, dim=0)

    def noise_images(self, x, t):
        sqrt_alpha_hat = torch.sqrt(self.alpha_hat[t])[:, None, None, None]
        sqrt_one_minus_alpha_hat = torch.sqrt(1 - self.alpha_hat[t])[:, None, None, None]
        epsilon = torch.randn_like(x)
        return sqrt_alpha_hat * x + sqrt_one_minus_alpha_hat * epsilon, epsilon

    def sample_timesteps(self, n):
        return torch.randint(low=1, high=self.steps, size=(n,))


# --- 3. The Cube Application ---


class DreamState:
    def __init__(self):
        self.is_training = False
        self.stop_requested = False
        self.epoch = 0
        self.logs = []
        self.loss_history = []
        self.model = None
        self.quantized_model = None  # For Nano export
        self.optimizer = None
        self.diffusion = None
        self.model_size_mb = 0.0

        # Config
        self.image_size = 128  # Upgraded to 128 for "High Quality" request
        self.dataset_dir = str(cube_dir("dream_data"))
        self.model_dir = str(cube_dir("dream_models"))

        os.makedirs(self.dataset_dir, exist_ok=True)
        os.makedirs(self.model_dir, exist_ok=True)

        self.images = self._load_images()

    def _load_images(self):
        imgs = []
        if os.path.exists(self.dataset_dir):
            for f in os.listdir(self.dataset_dir):
                if f.lower().endswith((".png", ".jpg", ".jpeg")):
                    imgs.append(os.path.join(self.dataset_dir, f))
        return imgs


state = DreamState()


class DreamCube(Cube):
    @property
    def name(self) -> str:
        return "Dream Cube"

    @property
    def description(self) -> str:
        return "Neural Forge: Latent Diffusion & Quantization."

    def run(self, input_data: Any) -> dict[str, Any]:
        action = input_data.get("action", "status")

        if action == "status":
            return {
                "is_training": state.is_training,
                "epoch": state.epoch,
                "losses": state.loss_history,
                "dataset_count": len(state.images),
                "logs": state.logs[-20:],
                "model_size_mb": state.model_size_mb,
                "is_quantized": state.quantized_model is not None,
            }

        elif action == "upload_sample":
            return self._handle_upload(input_data)

        elif action == "train":
            if state.is_training:
                return {"status": "error", "message": "Already training"}
            state.model = AttentionUNet()
            state.diffusion = DiffusionManager()
            state.optimizer = torch.optim.Adam(
                state.model.parameters(), lr=input_data.get("lr", 3e-4)
            )

            # Reset
            state.quantized_model = None

            steps = input_data.get("steps", 500)
            threading.Thread(target=self._train_loop, args=(steps,), daemon=True).start()
            return {"status": "success", "message": "Training initialized"}

        elif action == "stop":
            state.stop_requested = True
            return {"status": "success"}

        elif action == "quantize":
            # Post-Training Quantization (PTQ)
            if not state.model:
                return {"status": "error", "message": "Train model first"}
            try:
                state.logs.append("Starting INT8 Quantization...")

                # Dynamic Quantization for Linear/LSTM/RNN/Attention layers
                # For Conv2d usually requires static q, but we will use dynamic for simplicity on Linear layers in Attention
                if torch.cuda.is_available():
                    state.logs.append("Note: Quantization is CPU only for this demo backend.")

                m_cpu = state.model.cpu()
                q_model = torch.quantization.quantize_dynamic(m_cpu, {nn.Linear}, dtype=torch.qint8)

                state.quantized_model = q_model

                # Compare sizes via a temp dir that is cleaned up, rather than
                # dropping scratch checkpoints in the process working directory.
                with tempfile.TemporaryDirectory() as tmp:
                    fp32_path = os.path.join(tmp, "fp32.pt")
                    int8_path = os.path.join(tmp, "int8.pt")
                    torch.save(m_cpu.state_dict(), fp32_path)
                    torch.save(q_model.state_dict(), int8_path)

                    fp32_size = os.path.getsize(fp32_path) / (1024 * 1024)
                    int8_size = os.path.getsize(int8_path) / (1024 * 1024)

                state.model_size_mb = int8_size
                state.logs.append(f"Quantization Complete: {fp32_size:.2f}MB -> {int8_size:.2f}MB")
                state.logs.append(f"Compression Ratio: {fp32_size / int8_size:.1f}x")

                return {
                    "status": "success",
                    "original_size": fp32_size,
                    "quantized_size": int8_size,
                }
            except Exception as e:
                return {"status": "error", "message": str(e)}

        elif action == "generate":
            return self._handle_generation(input_data)

        return {"status": "error", "message": f"Unknown action: {action}"}

    def _handle_upload(self, data):
        try:
            image_b64 = data.get("image")
            if not image_b64:
                return {"status": "error"}
            if "base64," in image_b64:
                image_b64 = image_b64.split("base64,")[1]

            data_bytes = base64.b64decode(image_b64)
            name = f"{int(time.time() * 1000)}.jpg"
            path = os.path.join(state.dataset_dir, name)
            with open(path, "wb") as f:
                f.write(data_bytes)

            state.images.append(path)
            return {"status": "success", "count": len(state.images)}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def _train_loop(self, total_epochs):
        state.is_training = True
        state.stop_requested = False
        state.logs.append("Initializing Attention U-Net...")
        device = "cpu"
        if torch.cuda.is_available():
            device = "cuda"

        model = state.model.to(device)
        diffusion = state.diffusion
        opt = state.optimizer
        loss_fn = nn.MSELoss()

        transform = transforms.Compose(
            [
                transforms.Resize((state.image_size, state.image_size)),
                transforms.ToTensor(),
                transforms.Normalize((0.5, 0.5, 0.5), (0.5, 0.5, 0.5)),
            ]
        )

        loaded_imgs = []
        for p in state.images:
            try:
                im = Image.open(p).convert("RGB")
                loaded_imgs.append(transform(im).to(device))
            except:
                pass

        if not loaded_imgs:
            state.is_training = False
            return

        state.logs.append(f"Forge Hot. Device: {device}")

        for epoch in range(total_epochs):
            if state.stop_requested:
                break

            state.epoch = epoch + 1

            x0 = random.choice(loaded_imgs).unsqueeze(0)
            t = diffusion.sample_timesteps(x0.shape[0]).to(device)
            x_t, noise = diffusion.noise_images(x0, t)

            # Dummy Context (Simulating a "positive" prompt for all images)
            # In a real app we'd load text-image pairs.
            dummy_ids = torch.randint(0, 1000, (1, 10)).to(device)  # Random token sequence

            predicted_noise = model(x_t, t, text_ids=dummy_ids)
            loss = loss_fn(noise, predicted_noise)

            opt.zero_grad()
            loss.backward()
            opt.step()

            state.loss_history.append(loss.item())
            if len(state.loss_history) > 100:
                state.loss_history.pop(0)

            if epoch % 50 == 0:
                state.logs.append(f"Step {epoch}: Loss {loss.item():.4f}")

            # Simple latency simulation
            time.sleep(0.01)

        state.logs.append("Training Complete.")

        # Calculate Initial Size
        with tempfile.TemporaryDirectory() as tmp:
            size_probe = os.path.join(tmp, "fp32.pt")
            torch.save(model.cpu().state_dict(), size_probe)
            state.model_size_mb = os.path.getsize(size_probe) / (1024 * 1024)
        if device == "cuda":
            model.cuda()

        state.is_training = False

    def _handle_generation(self, data):
        prompt = data.get("prompt", "")
        # Use Quantized model if available (Simulating Nano inference)
        use_quantized = state.quantized_model is not None

        if use_quantized:
            model = state.quantized_model
            device = "cpu"  # Quantized usually CPU
            state.logs.append("Inference: Using INT8 Quantized Model (Nano Mode)")
        elif state.model:
            model = state.model
            device = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            return {"status": "error", "message": "Model not trained"}

        diffusion = state.diffusion
        model.to(device)
        model.eval()

        n = 1
        x = torch.randn((n, 3, state.image_size, state.image_size)).to(device)

        # Text conditioning. This tiny model has no real tokenizer, so hash the
        # prompt into the id range: the same prompt now conditions identically
        # instead of drawing fresh random ids on every call.
        text_ids = _prompt_to_ids(prompt, length=10).to(device)

        with torch.no_grad():
            for i in reversed(range(1, diffusion.steps)):
                t = (torch.ones(n) * i).long().to(device)
                predicted_noise = model(x, t, text_ids=text_ids)

                alpha = diffusion.alpha[t][:, None, None, None]
                alpha_hat = diffusion.alpha_hat[t][:, None, None, None]
                beta = diffusion.beta[t][:, None, None, None]

                # The final step is deterministic: no noise is re-added.
                noise = torch.randn_like(x) if i > 1 else torch.zeros_like(x)

                x = (1 / torch.sqrt(alpha)) * (
                    x - ((1 - alpha) / (torch.sqrt(1 - alpha_hat))) * predicted_noise
                ) + torch.sqrt(beta) * noise

        model.train()  # Reset mode
        x = (x.clamp(-1, 1) + 1) / 2
        x = (x * 255).type(torch.uint8)
        img = x[0].cpu().permute(1, 2, 0).numpy()
        img_pil = Image.fromarray(img)

        buff = io.BytesIO()
        img_pil.save(buff, format="JPEG")
        b64 = base64.b64encode(buff.getvalue()).decode("utf-8")

        return {"status": "success", "image": "data:image/jpeg;base64," + b64}
