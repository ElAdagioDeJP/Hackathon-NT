# Evolus OpenAI-compatible chat for Matching

Matching judgment runs in an Evolus agent. We chose `POST /v1/chat/completions` (Bearer app key, `model` = `applicationId:agentId`) over workflows or MCP so v1 stays a single synchronous call with a validated JSON reply. Agent instructions and model choice live in the Evolus portal; the app owns orchestration and schema validation. Each Find matches run starts a new conversation.
