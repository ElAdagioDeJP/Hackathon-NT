#!/usr/bin/env bash
# Qwen (extraction + tool calling) on port 8001, ~25% VRAM. Start after Gemma is up.
# Requires: LLM_EXTRACT_API_KEY.
set -euo pipefail
: "${LLM_EXTRACT_API_KEY:?set LLM_EXTRACT_API_KEY}"
IMAGE="${VLLM_IMAGE:-rocm/vllm:latest}"
MODEL="${QWEN_MODEL:-Qwen/Qwen2.5-7B-Instruct}"

docker rm -f vllm-qwen 2>/dev/null || true
docker run -d --name vllm-qwen --restart unless-stopped \
  --network host --ipc host --shm-size 16g \
  --device /dev/kfd --device /dev/dri --group-add video \
  --security-opt seccomp=unconfined \
  -v "$HOME/.cache/huggingface:/root/.cache/huggingface" \
  -e HF_TOKEN \
  "$IMAGE" \
  vllm serve "$MODEL" --host 0.0.0.0 --port 8001 \
    --api-key "$LLM_EXTRACT_API_KEY" \
    --gpu-memory-utilization 0.25 --max-model-len 32768 \
    --enable-auto-tool-choice --tool-call-parser hermes

echo "Waiting for Qwen on :8001 ..."
until curl -sf -H "Authorization: Bearer $LLM_EXTRACT_API_KEY" http://localhost:8001/v1/models >/dev/null; do sleep 10; done
echo "Qwen ready: $MODEL"
