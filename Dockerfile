# Container image used by directories (e.g. Glama) to run the stdio MCP server
# and verify it starts and responds to introspection (initialize + tools/list).
# Scoring calls the hosted Patent PreCheck engine over HTTPS at runtime; no
# API keys or build-time secrets are required.
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

# Run as the MCP server over stdio.
ENTRYPOINT ["node", "bin/precheck.js", "mcp"]
