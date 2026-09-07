# mcp-3xui

MCP server for the [3x-ui](https://github.com/MHSanaei/3x-ui) panel API (v3.7+).

Recent panel versions treat a client as a global object attached to many inbounds. MCP
servers written against the older per-inbound API cannot express that, so operations like
"create a client on three servers" or "drop one server from someone's subscription" are out
of reach through them. This one speaks the current API.

The rest of the panel is covered too. 3x-ui serves its own OpenAPI document at
`/panel/api/openapi.json`, and `search_api` / `describe_api` / `call_api` read it at runtime —
so nodes, routing, backups and Xray control are reachable without a dedicated wrapper, and
nothing here goes stale when the panel is upgraded.

## Setup

Create a token in the panel under **Settings → Security → API Token**. It is shown once and
stored only as a hash, so copy it right away.

```jsonc
{
  "mcpServers": {
    "3xui": {
      "command": "npx",
      "args": ["-y", "github:ArteshokV/mcp-3xui"],
      "env": {
        "XUI_BASE_URL": "https://panel.example.com:2053",
        "XUI_API_TOKEN": "..."
      }
    }
  }
}
```

| Variable | Required | Default | |
|---|---|---|---|
| `XUI_BASE_URL` | yes | — | Panel root URL |
| `XUI_API_TOKEN` | yes | — | Bearer token from the panel |
| `XUI_TIMEOUT_MS` | no | `20000` | Per-request timeout |
| `XUI_MAX_RESPONSE_CHARS` | no | `60000` | Output above this is truncated with a notice |

## Tools

**Clients** — `list_clients`, `get_client`, `create_client`, `update_client`, `delete_client`,
`attach_clients`, `detach_clients`, `reset_client_traffic`, `list_online_clients`,
`list_client_groups`, `get_subscription_url`

**Inbounds and server** — `list_inbounds`, `get_inbound`, `server_status`

**Everything else** — `search_api`, `describe_api`, `call_api`

## Notes

- `totalGB` is in bytes and `expiryTime` is a Unix ms timestamp; `0` means unlimited and never.
- The panel answers **404** to a request with a missing, wrong or revoked token rather than 401.
  Errors from this server point that out, since the status alone reads like a bad path.
- Responses are wrapped as `{success, msg, obj}`. A `success: false` body is raised as a tool
  error carrying the panel's own message.
- With an admin-scoped token `call_api` can modify or delete inbounds, nodes and panel settings.

## License

MIT
