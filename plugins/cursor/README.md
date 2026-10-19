# @tronhooks/mcp

Local stdio MCP for [tronhooks.com](https://tronhooks.com/docs/ai/): TRON mainnet USDT/TRX confirmed transfer notifications via webhook or Telegram. Node.js 22+. Free: 3 active watches, 60 requests/minute; billing closed. No balance snapshots/thresholds, arbitrary tokens, other chains, custody or sending funds.

## Run and configure

Download the versioned package from [official client instructions](https://tronhooks.com/docs/ai/clients/) and install it in a dedicated local directory. Then configure your MCP client to execute the installed `tronhooks-mcp` binary (an absolute path works across clients). The capability, validation and creation-preview tools work without a key. For account reads supply `TRONHOOKS_API_KEY` from a local environment/secret manager; never paste the key into chat, URLs, tracked client configuration or command-line arguments. Use a separate API key so the owner can revoke it independently in the console.

Client-specific stdio configuration and the portable Skill: [installation guide](https://tronhooks.com/docs/ai/clients/). Claude Code, Codex, Gemini CLI and Cursor support this transport; actual UI/model compatibility is recorded separately from SDK protocol tests. This is not a hosted HTTP/OAuth server and cannot be connected to a remote-only MCP client such as the xAI API as-is. Public REST/Markdown remain available to all assistants.

## Tools and permissions

| Tool | Effect |
|---|---|
| get_capabilities | Returns bundled versioned product facts and official URLs; no I/O. |
| validate_watch_config | Checks shape/enums/target; no DNS request, account mutation or notification. Server checks checksum, receiver policy, quota and binding at confirmation. |
| list_watches | GETs watches for the local mainnet key; omits receiver path/query and unexpected fields. |
| list_events | GETs retained account delivery records, preserving string amounts and next_cursor. |
| prepare_create_watch | Returns a configuration preview and an owner action link. **Does not create**. |
| prepare_delete_watch | GET verifies the ID belongs to the key's account, then returns an owner action link. **Does not delete**. |

This process's network calls are GET-only, pinned to `https://tronhooks.com`, with no redirects or automatic retries. The current underlying API key is **not** a server-enforced read-only scoped token; keep it local. Tool annotations are metadata, not authentication. No sending/test-notification, shell, filesystem, wallet-signing or arbitrary-URL-fetch tools are exposed.

The owner action link stores an untrusted draft in the browser fragment (not the HTTP request). It contains no API/signing key and allows only supported fields; credential-bearing receiver URLs must be entered privately in the console. Do not publicly share a draft link. After login the console clears the fragment, scopes reads to the signed-in account, shows the full target and requires an explicit confirmation before the existing session/CSRF-protected write. Verify that the console account is the intended account. Preparation never means completion; subsequent GET/read-back verifies the result. Deletion cascades notifications/attempts; an in-flight delivery can finish. Unknown creation outcomes require reconciliation, not blind retries.

## Development acceptance

```sh
pnpm build
pnpm test
```

Tests use the official MCP client over in-memory and real subprocess stdio transports, mocked account HTTP, unsupported inputs, authorization errors, 429, malformed responses, precision, cursor, receiver redaction and duplicate preparation. They never create a production watch or send a notification. The console tests cover no-write preview/cancel, owned deletion, confirmation, uncertainty and read-back.

Plugin installation, optional credentials, validation and directory status: [PLUGINS.md](PLUGINS.md).
