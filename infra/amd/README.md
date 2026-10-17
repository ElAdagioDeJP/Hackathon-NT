# AMD inference

## Primary: AMD Token Factory (no droplet needed)

The hackathon team key (`rc-…`, redeemed at notebooks.amd.com/tokenfactory) gives free
OpenAI-compatible endpoints running on AMD GPUs. The app only needs `.env`:

```
LLM_EXTRACT_BASE_URL=https://developer.amd.com.cn/radeon/api/v1
LLM_EXTRACT_MODEL=Qwen3.8-27B
LLM_EXTRACT_REASONING_EFFORT=low
LLM_DRAFT_BASE_URL=https://developer.amd.com.cn/radeon/api/v1
LLM_DRAFT_MODEL=Gemma-4-31B-IT
LLM_EXTRACT_API_KEY / LLM_DRAFT_API_KEY = the team key
```

Gate checked on 2026-10-17: Gemma-4-31B-IT chat and `json_schema`, Qwen3.8-27B
`json_schema` and tool calling all returned 200; requests without the key return 401.

Limits are **per team key** (shared by all 6 members): 20 RPM, 8 concurrent requests,
$1/day spend cap (resets 16:00 UTC = 12:00 VET). Check with
`curl $BASE/usage -H "Authorization: Bearer $KEY"`. Qwen models think even at
`reasoning_effort=low`, so keep `max_tokens` generous. Use `GET /v1/models` for the live catalog.

## Fallback: own MI300X droplet (vLLM)

Only if Token Factory is down or rate limits block the demo. Needs droplet credits, which
the team account does not have yet. Two OpenAI-compatible servers on one MI300X droplet (AMD Developer Cloud):

| Port | Model | Role | VRAM |
|---|---|---|---|
| 8000 | `google/gemma-3-27b-it` | draft, translate (`LLM_DRAFT_*`) | 55% |
| 8001 | `Qwen/Qwen2.5-7B-Instruct` | extraction, tool calling (`LLM_EXTRACT_*`) | 25% |

**Plan B:** if Qwen fails the gate, skip `serve-qwen.sh` and point both `LLM_*` pairs at Gemma (port 8000).

## Reproduce in 5 minutes

1. Create an MI300X droplet with the ROCm + Docker image. Note the IP. **Destroy it when idle.**
2. Accept the Gemma license on Hugging Face and create a read token.
3. On the droplet:
   ```bash
   export HF_TOKEN=hf_...
   export LLM_DRAFT_API_KEY=$(openssl rand -hex 24)
   export LLM_EXTRACT_API_KEY=$(openssl rand -hex 24)
   ./serve-gemma.sh   # waits until ready
   ./serve-qwen.sh    # start only after Gemma is up (memory profiling collides otherwise)
   ```
   Override `VLLM_IMAGE`, `GEMMA_MODEL` or `QWEN_MODEL` if needed. Check the current `rocm/vllm` tag first.
4. Firewall: allow 8000/8001 only from the Dokploy IP (and your own for testing):
   ```bash
   ufw allow from <dokploy-ip> to any port 8000,8001 proto tcp
   ufw allow OpenSSH && ufw enable
   ```
5. Gate, from your machine: `HOST=<ip> LLM_DRAFT_API_KEY=... LLM_EXTRACT_API_KEY=... ./smoke.sh` — all lines must print `PASS`.

## App configuration

```
LLM_EXTRACT_BASE_URL=http://<ip>:8001/v1
LLM_EXTRACT_MODEL=Qwen/Qwen2.5-7B-Instruct
LLM_DRAFT_BASE_URL=http://<ip>:8000/v1
LLM_DRAFT_MODEL=google/gemma-3-27b-it
```

Keys go only in `.env` / Dokploy and to teammates over a private channel. Never in git.

Logs: `docker logs -f vllm-gemma` / `docker logs -f vllm-qwen`.
