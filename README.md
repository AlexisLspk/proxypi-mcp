<pre style="color: #a855f7">
________                            ________________
___  __ \________________  ______  ____  __ \___  _/
__  /_/ /_  ___/  __ \_  |/_/_  / / /_  /_/ /__  /  
_  ____/_  /   / /_/ /_>  < _  /_/ /_  ____/__/ /   
/_/     /_/    \____//_/|_| _\__, / /_/     /___/   
                            /____/                 
</pre>

## What it is

Self-healing API proxy MCP for Cursor, Claude Code, or any MCP-compatible client. Send any REST request — if it fails, ProxyPI reads the error, diagnoses the problem using Claude, patches the request, and retries. Successful fixes are remembered and applied instantly next time, without calling Claude.

---

## How it works

```
You: proxipi_request → POST https://api.example.com/users

ProxyPI:  try → fail → diagnose (Claude) → patch → retry → remember
```

Next time the same error occurs on the same host and path, the fix is applied from memory instantly — no Claude call needed.

---

## Demo

```bash
npx proxipi
```

<pre>
<span style="color: #22d3ee">▶</span> <span style="color: #a855f7">proxipi</span>  sending → POST https://api.example.com/users
<span style="color: #f59e0b">⚠</span> <span style="color: #a855f7">proxipi</span>  422 — checking memory for known fix...
<span style="color: #22d3ee">▶</span> <span style="color: #a855f7">proxipi</span>  healing attempt 1 — asking Claude to diagnose...
<span style="color: #22d3ee">▶</span> <span style="color: #a855f7">proxipi</span>  retrying with patch: body uses 'name' but API expects 'full_name'
<span style="color: #22c55e">✔</span> <span style="color: #a855f7">proxipi</span>  healed in 1 attempt — 200 — 1843ms
</pre>

---

## Install

```bash
npx proxipi
```

---

## Config

Add to `.cursor/mcp.json` (project root or `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "proxipi": {
      "command": "npx",
      "args": ["-y", "proxipi"],
      "env": {
        "ANTHROPIC_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Restart Cursor. Four tools: `proxipi_request`, `proxipi_history`, `proxipi_replay`, `proxipi_clear`.

---

## Tools

| Tool | Description |
|------|-------------|
| `proxipi_request` | Send any REST request — auto-heals on failure |
| `proxipi_history` | View past fixes, filter by API host |
| `proxipi_replay` | Re-run a stored fix to verify it still works |
| `proxipi_clear` | Wipe all healing records from memory |

---

## What ProxyPI can fix

| Error | What ProxyPI does |
|-------|------------------|
| `401 Unauthorized` | Fixes Authorization header format (Bearer vs Basic vs token prefix) |
| `400 Bad Request` | Fixes body field names, types, or missing required fields |
| `422 Unprocessable` | Corrects schema mismatches, enum values, date formats |
| `404 Not Found` | Fixes URL path, API version prefix, trailing slashes |
| `405 Method Not Allowed` | Switches to the correct HTTP method |

---

## More

- **Memory:** Fixes stored in `~/.proxipi/memory.json`
- **Env:** `ANTHROPIC_API_KEY` required (only when using healing — server starts without it)
- **Local dev:** `cp .env.example .env`, add key, then `npm run dev`
- **Tests:** `npm test`

MIT · [GitHub](https://github.com/AlexisLspk/proxipi)
