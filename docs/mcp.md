# Claude and other AI clients (MCP)

The dashboard is an MCP server: Claude Desktop, Claude Code, Cursor and any other client of the
[Model Context Protocol](https://modelcontextprotocol.io) can use the assistant's tools with
your data — read your spending, add a task, find a diary entry — without the dashboard's own
chat.

## A token

Settings → Integrations → **AI clients (MCP)** (or the browser extension's popup → Assistant):

- **Read only** — the tools that only read;
- **Read and change** — all of them. A deletion or an overwrite first answers what it would
  affect and changes nothing; the client calls it again to do it (Claude asks you in between).

A token is shown once. Revoke it there, and the client using it loses access at once. Every
change made through a token is in the AI's action log, like the assistant's own.

Sections switched off for the AI (Settings → AI → what the AI sees) are hidden from the
clients; so are the sections that have an AI connection of their own (Health on a local
Ollama) unless "Give … to MCP clients too" is switched on for them — the clients are cloud
models.

## The address

`https://<your dashboard>/api/mcp` — the transport is Streamable HTTP (one POST per message,
answered with JSON). A copy running on your own computer has its own:
`http://localhost:3300/api/mcp`; a token works on both (it syncs).

## Connecting a client

Settings → Integrations shows these lines with your address and a new token filled in.

**Claude Code** — in a terminal:

```sh
claude mcp add --transport http personal-dashboard https://dash.example.com/api/mcp \
  --header "Authorization: Bearer pd_…"
```

**Claude Desktop** — `claude_desktop_config.json` (Settings → Developer → Edit Config). Claude
Desktop runs local MCP servers; `mcp-remote` (Node.js needed) carries the calls to the
dashboard:

```json
{
  "mcpServers": {
    "personal-dashboard": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://dash.example.com/api/mcp", "--header", "Authorization:${AUTH}"],
      "env": {"AUTH": "Bearer pd_…"}
    }
  }
}
```

Restart Claude Desktop; the tools are under the 🔨 in the chat.

**Cursor** — `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "personal-dashboard": {
      "url": "https://dash.example.com/api/mcp",
      "headers": {"Authorization": "Bearer pd_…"}
    }
  }
}
```

Claude.ai's custom connectors (the website and the phone apps) sign in with OAuth, which the
dashboard does not offer yet.

## Your devices add tools of their own

While a device is online, its own tools are offered next to the sections' — to MCP clients
and to the dashboard's assistant:

- **the browser extension** — `browser_current_page` (the address, title and selected text of
  the page in front; its text only if you allow it), `browser_open_tabs`, `browser_open_url`.
  Each is switched on or off in the popup → Assistant; private windows never;
- **the desktop app** — `computer_front_window` (the program and window in front; a private
  window without its title) and `computer_recent_screenshots`;
- **the phone app** — later.

A device holds a WebSocket to `/api/devices/socket` with your session; of two browsers the one
you use answers.
