import base64
import io
import os
import random
import shutil
import threading
import time
from typing import Any

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from PIL import Image
from torchvision import transforms

from ..utils import cube_dir
from .base import Cube
from .vision_core.model import get_model


# --- Global State ---
class VisionState:
    def __init__(self):
        self.is_training = False
        self.stop_requested = False
        self.current_epoch = 0
        self.logs = []
        self.stats = {"loss": [], "accuracy": []}
        self.model = None
        self.classes = []
        self.class_to_idx = {}
        # Simple dataset storage: memory mapping {class_name: [image_path, ...]}
        self.dataset_paths = {}
        self.models_dir = str(cube_dir("vision_models"))
        self.data_dir = str(cube_dir("vision_data"))

        # Augmentation Settings
        self.aug_config = {
            "rotation": 15,
            "noise": 0.0,
            "blur": 0.0,
            "brightness": 0.2,
            "flip": True,
        }

        # Ensure dirs exist
        os.makedirs(self.models_dir, exist_ok=True)
        os.makedirs(self.data_dir, exist_ok=True)

        self.dataset_paths = {}
        self._load_existing_data()

    def _load_existing_data(self):
        # Scan data directory for existing classes and images
        if not os.path.exists(self.data_dir):
            return

        print(f"[Vision State] Scanning {self.data_dir} for datasets...")
        for class_name in os.listdir(self.data_dir):
            class_path = os.path.join(self.data_dir, class_name)
            if os.path.isdir(class_path):
                images = []
                for f in os.listdir(class_path):
                    if f.lower().endswith((".png", ".jpg", ".jpeg")):
                        images.append(os.path.join(class_path, f))

                # Load even if empty (persisted class)
                self.dataset_paths[class_name] = images or []
                if images:
                    print(f"  - Loaded '{class_name}': {len(images)} samples")
                else:
                    print(f"  - Loaded '{class_name}': 0 samples (Empty Class)")

        self.classes = sorted(self.dataset_paths.keys())


state = VisionState()


class VisionCube(Cube):
    @property
    def name(self) -> str:
        return "Vision Cube"

    @property
    def description(self) -> str:
        return "Train Custom Computer Vision Models."

    def log(self, msg):
        print(f"[Vision] {msg}")
        state.logs.append(f"[{time.strftime('%H:%M:%S')}] {msg}")
        if len(state.logs) > 50:
            state.logs.pop(0)

    def run(self, input_data: Any) -> dict[str, Any]:
        action = input_data.get("action", "status")

        if action == "status":
            return {
                "is_training": state.is_training,
                "epoch": state.current_epoch,
                "logs": state.logs,
                "stats": state.stats,
                "classes": state.classes,
                "dataset_counts": {k: len(v) for k, v in state.dataset_paths.items()},
                "aug_config": state.aug_config,
            }

        elif action == "upload_sample":
            # Saves an image sample for a specific class
            return self._handle_upload(input_data)

        elif action == "update_augment":
            # Update Augmentation Config
            new_config = input_data.get("config", {})
            state.aug_config.update(new_config)
            return {"status": "success", "config": state.aug_config}

        elif action == "preview_augment":
            # Return grid of augmented views
            return self._handle_augment_preview(input_data)

        elif action in ["create_class", "delete_class"]:
            return self._handle_class_action(action, input_data)

        elif action == "clear_dataset":
            # Resets the dataset
            try:
                if os.path.exists(state.data_dir):
                    shutil.rmtree(state.data_dir)
                os.makedirs(state.data_dir, exist_ok=True)
                state.dataset_paths = {}
                state.classes = []
                self.log("Dataset cleared.")
                return {"status": "success", "message": "Dataset cleared"}
            except Exception as e:
                return {"status": "error", "message": str(e)}

        elif action == "train":
            if state.is_training:
                return {"status": "error", "message": "Already training"}
            if len(state.dataset_paths) < 2:
                return {"status": "error", "message": "Need at least 2 classes to train."}

            config = input_data.get("config", {})
            threading.Thread(target=self._train_loop, args=(config,), daemon=True).start()
            return {"status": "success", "message": "Training started"}

        elif action == "stop":
            state.stop_requested = True
            return {"status": "success", "message": "Stopping..."}

        elif action == "predict":
            return self._handle_prediction(input_data)

        elif action == "explain":
            return self._handle_explanation(input_data)

        return {"status": "error", "message": f"Unknown action: {action}"}

    def _handle_upload(self, data):
        try:
            image_b64 = data.get("image")
            label = data.get("label")
            if not image_b64 or not label:
                return {"status": "error", "message": "Missing image or label"}

            # Clean label
            label = "".join([c for c in label if c.isalnum() or c in ("-", "_")])

            # Decode
            if "base64," in image_b64:
                image_b64 = image_b64.split("base64,")[1]
            image_data = base64.b64decode(image_b64)

            # Save to disk
            class_dir = os.path.join(state.data_dir, label)
            os.makedirs(class_dir, exist_ok=True)
            filename = f"{int(time.time() * 1000)}.jpg"
            file_path = os.path.join(class_dir, filename)

            with open(file_path, "wb") as f:
                f.write(image_data)

            # Update state
            if label not in state.dataset_paths:
                state.dataset_paths[label] = []
                state.classes = sorted(state.dataset_paths.keys())
            state.dataset_paths[label].append(file_path)

            return {"status": "success", "count": len(state.dataset_paths[label])}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def _handle_class_action(self, action, data):
        try:
            label = data.get("label")
            if not label:
                return {"status": "error", "message": "Missing label"}

            # Sanitize
            label = "".join([c for c in label if c.isalnum() or c in ("-", "_")])
            class_dir = os.path.join(state.data_dir, label)

            if action == "create_class":
                if os.path.exists(class_dir):
                    return {"status": "error", "message": "Class already exists"}
                os.makedirs(class_dir, exist_ok=True)
                state.dataset_paths[label] = []
                state.classes = sorted(state.dataset_paths.keys())
                return {"status": "success", "classes": state.classes}

            elif action == "delete_class":
                if os.path.exists(class_dir):
                    shutil.rmtree(class_dir)
                if label in state.dataset_paths:
                    del state.dataset_paths[label]
                state.classes = sorted(state.dataset_paths.keys())
                return {"status": "success", "classes": state.classes}

        except Exception as e:
            return {"status": "error", "message": str(e)}

    def _get_transforms(self, mode="train"):
        # Industry grade augmentations
        if mode == "train":
            # Dynamic attributes from state
            rot = state.aug_config.get("rotation", 15)
            br = state.aug_config.get("brightness", 0.2)
            blur_k = state.aug_config.get("blur", 0)
            flip = state.aug_config.get("flip", True)  # Horizontal Flip

            t_list = [
                transforms.Resize((224, 224)),
            ]

            if flip:
                t_list.append(transforms.RandomHorizontalFlip())

            if rot > 0:
                t_list.append(transforms.RandomRotation(rot))

            if br > 0:
                t_list.append(transforms.ColorJitter(brightness=br, contrast=br))

            if blur_k > 0:
                # Only if using odd kernel size
                k = int(blur_k)
                if k % 2 == 0:
                    k += 1
                t_list.append(transforms.GaussianBlur(kernel_size=k))

            t_list.append(transforms.ToTensor())
            t_list.append(
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
            )

            return transforms.Compose(t_list)
        else:
            return transforms.Compose(
                [
                    transforms.Resize((224, 224)),
                    transforms.ToTensor(),
                    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
                ]
            )

    def _handle_augment_preview(self, data):
        # Generate 4 augmented versions of a sample image
        try:
            # 1. Get Image (Uploaded or Random)
            img = None
            if data.get("image"):
                image_b64 = data.get("image")
                if "base64," in image_b64:
                    image_b64 = image_b64.split("base64,")[1]
                image_data = base64.b64decode(image_b64)
                img = Image.open(io.BytesIO(image_data)).convert("RGB")
            else:
                # Pick random existing image
                all_imgs = []
                for paths in state.dataset_paths.values():
                    all_imgs.extend(paths)
                if not all_imgs:
                    return {"status": "error", "message": "No images in dataset to preview."}
                img = Image.open(random.choice(all_imgs)).convert("RGB")

            # 2. Augment 4 times
            previews = []
            transform = self._get_transforms("train")

            # Denormalize helper
            mean = np.array([0.485, 0.456, 0.406])
            std = np.array([0.229, 0.224, 0.225])

            for _ in range(4):
                aug_tensor = transform(img)  # [3, 224, 224] normalized

                # Convert back to visible image
                aug_np = aug_tensor.permute(1, 2, 0).cpu().numpy()
                aug_np = std * aug_np + mean
                aug_np = np.clip(aug_np, 0, 1)
                aug_np = (aug_np * 255).astype(np.uint8)

                # Encode
                aug_img = cv2.cvtColor(aug_np, cv2.COLOR_RGB2BGR)
                _, buffer = cv2.imencode(".jpg", aug_img)
                b64 = "data:image/jpeg;base64," + base64.b64encode(buffer).decode("utf-8")
                previews.append(b64)

            return {"status": "success", "previews": previews}

        except Exception as e:
            return {"status": "error", "message": str(e)}

    def _train_loop(self, config):
        state.is_training = True
        state.stop_requested = False
        state.stats = {"loss": [], "accuracy": []}
        state.current_epoch = 0

        try:
            model_type = config.get("model_type", "scratch")  # scratch | pretrained
            epochs = int(config.get("epochs", 10))
            lr = 0.001

            # Prepare Data
            self.log("Preparing dataset...")
            full_data = []
            state.class_to_idx = {cls: i for i, cls in enumerate(state.classes)}

            for cls in state.classes:
                for path in state.dataset_paths[cls]:
                    full_data.append((path, state.class_to_idx[cls]))

            random.shuffle(full_data)

            # Init Model
            device = "cuda" if torch.cuda.is_available() else "cpu"
            self.log(f"Initializing {model_type} model on {device}...")
            state.model = get_model(model_type, len(state.classes))
            state.model.to(device)

            optimizer = optim.Adam(state.model.parameters(), lr=lr)
            criterion = nn.CrossEntropyLoss()

            # Transform
            transform = self._get_transforms("train")

            state.model.train()

            for epoch in range(epochs):
                if state.stop_requested:
                    self.log("Training stopped.")
                    break

                running_loss = 0.0
                correct = 0
                total = 0

                # Mini-batch loop (simple implementation provided dataset fits in memory usually)
                # For robustness, we process one by one or small manual batches
                batch_size = 8

                for i in range(0, len(full_data), batch_size):
                    batch = full_data[i : i + batch_size]
                    inputs = []
                    labels = []

                    for path, label_idx in batch:
                        try:
                            img = Image.open(path).convert("RGB")
                            inputs.append(transform(img))
                            labels.append(label_idx)
                        except:
                            continue

                    if not inputs:
                        continue

                    inputs_tensor = torch.stack(inputs).to(device)
                    labels_tensor = torch.tensor(labels).to(device)

                    optimizer.zero_grad()
                    outputs = state.model(inputs_tensor)
                    loss = criterion(outputs, labels_tensor)
                    loss.backward()
                    optimizer.step()

                    running_loss += loss.item() * len(inputs)
                    _, predicted = torch.max(outputs.data, 1)
                    total += labels_tensor.size(0)
                    correct += (predicted == labels_tensor).sum().item()

                epoch_loss = running_loss / total if total > 0 else 0
                epoch_acc = (correct / total) * 100 if total > 0 else 0

                state.current_epoch = epoch + 1
                state.stats["loss"].append(epoch_loss)
                state.stats["accuracy"].append(epoch_acc)

                self.log(
                    f"Epoch {epoch + 1}/{epochs} - Loss: {epoch_loss:.4f} - Acc: {epoch_acc:.1f}%"
                )
                time.sleep(0.1)  # UI pacing

            self.log("Training complete!")

        except Exception as e:
            self.log(f"Training Error: {e!s}")
            import traceback

            traceback.print_exc()
        finally:
            state.is_training = False

    def _handle_prediction(self, data):
        if not state.model:
            return {"status": "error", "message": "Model not trained."}

        try:
            image_b64 = data.get("image")
            if "base64," in image_b64:
                image_b64 = image_b64.split("base64,")[1]
            image_data = base64.b64decode(image_b64)
            img = Image.open(io.BytesIO(image_data)).convert("RGB")

            transform = self._get_transforms("eval")
            img_tensor = transform(img).unsqueeze(0)  # Batch dim

            device = "cuda" if torch.cuda.is_available() else "cpu"
            img_tensor = img_tensor.to(device)
            state.model.eval()

            with torch.no_grad():
                outputs = state.model(img_tensor)
                probabilities = torch.nn.functional.softmax(outputs, dim=1)

            probs = probabilities[0].cpu().numpy()

            results = []
            for idx, prob in enumerate(probs):
                results.append({"class": state.classes[idx], "confidence": float(prob)})

            results.sort(key=lambda x: x["confidence"], reverse=True)
            top_result = results[0]

            return {
                "status": "success",
                "prediction": top_result["class"],
                "confidence": top_result["confidence"],
                "all_results": results,
            }

        except Exception as e:
            return {"status": "error", "message": str(e)}

    def _handle_explanation(self, data):
        if not state.model:
            return {"status": "error", "message": "Model not trained."}

        try:
            # 1. Prepare Image
            image_b64 = data.get("image")
            if "base64," in image_b64:
                image_b64 = image_b64.split("base64,")[1]
            image_data = base64.b64decode(image_b64)
            img = Image.open(io.BytesIO(image_data)).convert("RGB")

            # Save original for overlay (cv2 uses BGR)
            img_np = np.array(img)
            img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)

            transform = self._get_transforms("eval")
            img_tensor = transform(img).unsqueeze(0)

            device = "cuda" if torch.cuda.is_available() else "cpu"
            img_tensor = img_tensor.to(device)
            state.model.eval()

            # 2. Identify Target Layer (Last Conv2d)
            target_layer = None

            # Recursive search for last Conv2d
            modules = list(state.model.modules())
            for layer in reversed(modules):
                if isinstance(layer, nn.Conv2d):
                    target_layer = layer
                    break

            if not target_layer:
                return {"status": "error", "message": "Could not find a Conv2d layer."}

            # 3. Hooks
            gradients = []
            activations = []

            def backward_hook(module, grad_input, grad_output):
                gradients.append(grad_output[0])

            def forward_hook(module, input, output):
                activations.append(output)

            # Register
            handle_f = target_layer.register_forward_hook(forward_hook)
            handle_b = target_layer.register_full_backward_hook(backward_hook)

            # 4. Forward & Backward
            state.model.zero_grad()
            output = state.model(img_tensor)

            # Get top prediction class
            pred_idx = output.argmax(dim=1).item()
            score = output[:, pred_idx]

            score.backward()

            # 5. Generate Heatmap (Grad-CAM)
            # Gradients pooling
            if not gradients or not activations:
                return {"status": "error", "message": "No gradients captured (hooks failed)."}

            grads = gradients[0].cpu().data.numpy()[0]  # [C, H, W]
            fmaps = activations[0].cpu().data.numpy()[0]  # [C, H, W]

            weights = np.mean(grads, axis=(1, 2))  # Global Average Pooling -> [C]

            cam = np.zeros(fmaps.shape[1:], dtype=np.float32)
            for i, w in enumerate(weights):
                cam += w * fmaps[i]

            cam = np.maximum(cam, 0)  # ReLU
            # Normalize, unless the map is entirely inactive.
            cam = cam / cam.max() if cam.max() > 0 else np.zeros_like(cam)

            # Resize CAM to image size
            cam = cv2.resize(cam, (img_bgr.shape[1], img_bgr.shape[0]))

            # Colorize
            heatmap = cv2.applyColorMap(np.uint8(255 * cam), cv2.COLORMAP_JET)

            # Overlay
            overlay = cv2.addWeighted(img_bgr, 0.6, heatmap, 0.4, 0)

            # Encode return
            _, buffer = cv2.imencode(".jpg", overlay)
            heatmap_b64 = "data:image/jpeg;base64," + base64.b64encode(buffer).decode("utf-8")

            # Cleanup
            handle_f.remove()
            handle_b.remove()

            return {
                "status": "success",
                "heatmap_image": heatmap_b64,
                "prediction": state.classes[pred_idx],
            }

        except Exception as e:
            import traceback

            traceback.print_exc()
            return {"status": "error", "message": str(e)}
