# Agent configuration examples

## Fastest: hosted MCP (recommended)

No `npx`, no API keys. Copy into `.cursor/mcp.json` and reload:

```json
{
  "mcpServers": {
    "patent-precheck": { "url": "https://patentprecheck.com/mcp" }
  }
}
```

See `cursor-mcp-hosted.json`. **12 tools** including `precheck_score`, `precheck_prior_art`, `precheck_lookup_patent`, `precheck_compare_to_patent`.

## Cursor (local npx)

Copy `cursor-mcp.json` into your project as `.cursor/mcp.json` (or merge into your
global `~/.cursor/mcp.json`), then reload. Enables all 12 `precheck_*` tools plus local `path` file reads.

If you've cloned this repo and want to run from source instead of `npx`:

```json
{
  "mcpServers": {
    "patent-precheck": {
      "command": "node",
      "args": ["/absolute/path/to/tools/precheck-mcp/bin/precheck.js", "mcp"]
    }
  }
}
```

## Claude Code

```sh
claude mcp add patent-precheck -- npx -y @patentprecheck/mcp mcp
```

Or add to `.mcp.json` at the project root:

```json
{
  "mcpServers": {
    "patent-precheck": { "command": "npx", "args": ["-y", "@patentprecheck/mcp", "mcp"] }
  }
}
```

## Codex CLI

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.patent-precheck]
command = "npx"
args = ["-y", "@patentprecheck/mcp", "mcp"]
```

## Environment overrides (optional)

| Var | Default | Purpose |
|-----|---------|---------|
| `PRECHECK_API_URL` | `https://patentprecheck.com/.netlify/functions/analyze` | Analyze endpoint |
| `PRECHECK_SITE_URL` | `https://patentprecheck.com` | Used to build the review signup link |
| `PRECHECK_TIER` | `free` | Analysis tier |
| `PRECHECK_AI_ASSISTANCE` | `yes_some` | Declared AI assistance level |

## More

- Product site: https://patentprecheck.com/integrations
- Free web score: https://patentprecheck.com/analyze
- Glama: https://glama.ai/mcp/servers/Patent-PreCheck/patent-precheck-mcp
