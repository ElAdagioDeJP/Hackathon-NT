#!/usr/bin/env bash
# Gemma (draft/translate) on port 8000, ~55% of MI300X VRAM. Start this first.
# Requires: HF_TOKEN (Gemma license accepted), LLM_DRAFT_API_KEY.
set -euo pipefail
: "${HF_TOKEN:?set HF_TOKEN}" "${LLM_DRAFT_API_KEY:?set LLM_DRAFT_API_KEY}"
IMAGE="${VLLM_IMAGE:-rocm/vllm:latest}"
MODEL="${GEMMA_MODEL:-google/gemma-3-27b-it}"

docker rm -f vllm-gemma 2>/dev/null || true
docker run -d --name vllm-gemma --restart unless-stopped \
  --network host --ipc host --shm-size 16g \
  --device /dev/kfd --device /dev/dri --group-add video \
  --security-opt seccomp=unconfined \
  -v "$HOME/.cache/huggingface:/root/.cache/huggingface" \
  -e HF_TOKEN \
  "$IMAGE" \
  vllm serve "$MODEL" --host 0.0.0.0 --port 8000 \
    --api-key "$LLM_DRAFT_API_KEY" \
    --gpu-memory-utilization 0.55 --max-model-len 16384

echo "Waiting for Gemma on :8000 ..."
until curl -sf -H "Authorization: Bearer $LLM_DRAFT_API_KEY" http://localhost:8000/v1/models >/dev/null; do sleep 10; done
echo "Gemma ready: $MODEL"
