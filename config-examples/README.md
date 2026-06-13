# Agent configuration examples

## Cursor

Copy `cursor-mcp.json` into your project as `.cursor/mcp.json` (or merge into your
global `~/.cursor/mcp.json`), then reload. The `patent_lookup`-style tools appear as
`precheck_score`, `precheck_pillars`, and `precheck_start_review`.

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
