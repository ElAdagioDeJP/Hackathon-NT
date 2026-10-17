#!/usr/bin/env bash
# Model gate (T+2h): chat on both ports, Qwen guided JSON + tool call, no-key rejected.
# Usage: HOST=<droplet-ip> LLM_DRAFT_API_KEY=... LLM_EXTRACT_API_KEY=... ./smoke.sh
set -uo pipefail
HOST="${HOST:-localhost}"
GEMMA_MODEL="${GEMMA_MODEL:-google/gemma-3-27b-it}"
QWEN_MODEL="${QWEN_MODEL:-Qwen/Qwen2.5-7B-Instruct}"
fail=0
check() { if eval "$2"; then echo "PASS $1"; else echo "FAIL $1"; fail=1; fi; }
post() { curl -s -m 120 "http://$HOST:$1/v1/chat/completions" -H "Authorization: Bearer $2" -H 'content-type: application/json' -d "$3"; }

check "gemma chat" "post 8000 \"$LLM_DRAFT_API_KEY\" '{\"model\":\"$GEMMA_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Rispondi solo: ciao\"}],\"max_tokens\":10}' | grep -q '\"content\"'"
check "qwen chat" "post 8001 \"$LLM_EXTRACT_API_KEY\" '{\"model\":\"$QWEN_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Say hi\"}],\"max_tokens\":10}' | grep -q '\"content\"'"
check "qwen guided json" "post 8001 \"$LLM_EXTRACT_API_KEY\" '{\"model\":\"$QWEN_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Extract: fatturato minimo 500.000 euro\"}],\"response_format\":{\"type\":\"json_schema\",\"json_schema\":{\"name\":\"t\",\"schema\":{\"type\":\"object\",\"properties\":{\"amount\":{\"type\":\"number\"}},\"required\":[\"amount\"]}}}}' | python3 -c 'import sys,json; c=json.load(sys.stdin)[\"choices\"][0][\"message\"][\"content\"]; assert isinstance(json.loads(c)[\"amount\"],(int,float))'"
check "qwen tool call" "post 8001 \"$LLM_EXTRACT_API_KEY\" '{\"model\":\"$QWEN_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"What is the weather in Rome?\"}],\"tools\":[{\"type\":\"function\",\"function\":{\"name\":\"get_weather\",\"parameters\":{\"type\":\"object\",\"properties\":{\"city\":{\"type\":\"string\"}},\"required\":[\"city\"]}}}],\"tool_choice\":\"auto\"}' | grep -q 'get_weather'"
check "gemma rejects no key" "[ \"\$(curl -s -o /dev/null -w '%{http_code}' http://$HOST:8000/v1/models)\" = 401 ]"
check "qwen rejects no key" "[ \"\$(curl -s -o /dev/null -w '%{http_code}' http://$HOST:8001/v1/models)\" = 401 ]"
exit $fail
