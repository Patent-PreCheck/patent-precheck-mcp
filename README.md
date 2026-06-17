# @patentprecheck/mcp — Patent PreCheck CLI + MCP server

[![npm version](https://img.shields.io/npm/v/@patentprecheck/mcp.svg)](https://www.npmjs.com/package/@patentprecheck/mcp)
[![npm downloads](https://img.shields.io/npm/dm/@patentprecheck/mcp.svg)](https://www.npmjs.com/package/@patentprecheck/mcp)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-listed-1f6feb.svg)](https://registry.modelcontextprotocol.io)
[![license](https://img.shields.io/npm/l/@patentprecheck/mcp.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/@patentprecheck/mcp.svg)](https://nodejs.org)

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=patent-precheck&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBwYXRlbnRwcmVjaGVjay9tY3AiLCJtY3AiXX0=)

[![Patent-PreCheck/patent-precheck-mcp MCP server](https://glama.ai/mcp/servers/Patent-PreCheck/patent-precheck-mcp/badges/score.svg)](https://glama.ai/mcp/servers/Patent-PreCheck/patent-precheck-mcp)

Run a patentability pre-check on your code from inside your terminal or your AI
coding agent (Cursor, Claude Code, Codex, Antigravity). It wraps the hosted
[Patent PreCheck](https://patentprecheck.com) engine, so **no API keys are
required** — the scoring engine and prior-art corpus stay server-side.

> Informational only — not legal advice and not a substitute for a licensed patent attorney.

## What it does

- Scores code or an invention description across the four USPTO statutory pillars
  (§101 eligibility, §102 novelty, §103 non-obviousness, §101 utility) plus a
  separate §112 filing-readiness signal.
- Reports the band (Not Ready → File Ready), the pillar holding the band back,
  top opportunities to strengthen, and how much prior art was consulted.
- Exposes MCP tools so an agent can score the code it just wrote, inline.

## Install

```sh
# Run directly (no install)
npx -y @patentprecheck/mcp score ./src/widget.ts

# Or install globally
npm i -g @patentprecheck/mcp
precheck score ./src/widget.ts
```

## CLI

```sh
precheck score ./path/to/file.ts          # human-readable report
precheck score ./file.ts --format json    # raw JSON
cat invention.md | precheck score -        # read from stdin
precheck score ./file.ts --min-score 60    # exit 4 if below threshold (CI gate)
precheck pillars                           # scoring reference (no network)
precheck review                            # Interactive Code Review signup URL
precheck mcp                               # run as an MCP server over stdio
```

Exit codes: `0` ok · `1` usage · `2` request error · `3` §101 gate not passed ·
`4` below `--min-score`. stdout is clean data; progress/errors go to stderr.

## Use in an AI coding agent

See [`config-examples/`](./config-examples/). Quickest paths:

```sh
# Claude Code
claude mcp add patent-precheck -- npx -y @patentprecheck/mcp mcp
```

```json
// Cursor — .cursor/mcp.json
{ "mcpServers": { "patent-precheck": { "command": "npx", "args": ["-y", "@patentprecheck/mcp", "mcp"] } } }
```

MCP tools: `precheck_score`, `precheck_prior_art`, `precheck_rejection_patterns`, `precheck_legal_context`, `precheck_pillars`, `precheck_start_review`, `precheck_search_corpus`, `precheck_cpc_suggest`, `precheck_session_status`, `precheck_deliverables`, `precheck_lookup_patent`, `precheck_compare_to_patent`.

Cursor users can skip the JSON and use the **Add to Cursor** button at the top.
The server is published to the [official MCP Registry](https://registry.modelcontextprotocol.io)
(`io.github.Patent-PreCheck/patent-precheck`), so MCP-aware clients can discover it directly.

### Hosted endpoint (no install)

There's also a hosted, keyless **Streamable HTTP** MCP server, so remote-capable
clients can connect without `npx` or a local Node install:

```
https://patentprecheck.com/mcp
```

```json
// Cursor — remote server, no command needed
{ "mcpServers": { "patent-precheck": { "url": "https://patentprecheck.com/mcp" } } }
```

Same three tools and the same scoring engine. The hosted variant takes invention
text inline via `code` (it never reads files from your machine — use the local
`npx` server above if you want the `path` argument).

## Develop from source

```sh
git clone https://github.com/Patent-PreCheck/patent-precheck-mcp.git
cd patent-precheck-mcp
npm install
node bin/precheck.js pillars
echo "a novel rate limiter that ..." | node bin/precheck.js score - --format text
node bin/precheck.js mcp   # stdio server; blocks waiting for an MCP client
```
