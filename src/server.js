// Patent PreCheck MCP server.
//
// Exposes the hosted patentability engine as MCP tools so a developer inside
// Cursor / Claude Code / Codex can score the code they just wrote without
// leaving their agent. Transport is stdio; launch via `precheck mcp`.

import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { callAnalyze, reviewSignupUrl, MIN_CODE_CHARS } from './api.js';
import { renderScoreText, renderPillarsReference } from './render.js';

function readPkgVersion() {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function textResult(text, { isError = false } = {}) {
  return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) };
}

/** Build and return the configured MCP server. */
export function buildServer(version = readPkgVersion()) {
  const server = new McpServer({ name: 'patent-precheck', version });

  server.registerTool(
    'precheck_score',
    {
      title: 'Patent PreCheck — score patentability',
      description:
        'Run a patentability pre-check on source code or an invention description. ' +
        'Returns a 0\u2013100 patentability score across the four USPTO statutory pillars ' +
        '(\u00a7101 eligibility, \u00a7102 novelty, \u00a7103 non-obviousness, \u00a7101 utility), a ' +
        'separate \u00a7112 filing-readiness signal, the band (Not Ready \u2192 File Ready), the ' +
        'pillar that holds the band back, top opportunities to strengthen, and a count of ' +
        'prior-art matches consulted. Provide either `code` (the text) or `path` (a local file to read).',
      inputSchema: {
        code: z
          .string()
          .optional()
          .describe('The source code or invention description to analyze (>= 10 chars).'),
        path: z
          .string()
          .optional()
          .describe('Path to a local file to read and analyze instead of passing `code` inline.'),
        filename: z
          .string()
          .optional()
          .describe('Optional filename hint (e.g. main.ts) used for language/context.'),
        tier: z
          .enum(['free', 'paid_review', 'enterprise'])
          .optional()
          .describe('Analysis tier. Defaults to free; paid tiers require server-side entitlement.'),
      },
    },
    async ({ code, path: filePath, filename, tier }) => {
      let text = typeof code === 'string' ? code : '';
      let name = filename;
      if (!text && filePath) {
        try {
          text = await readFile(filePath, 'utf8');
        } catch (err) {
          return textResult(`Could not read file "${filePath}": ${err.message}`, { isError: true });
        }
        if (!name) name = path.basename(filePath);
      }
      if (!text || text.trim().length < MIN_CODE_CHARS) {
        return textResult(
          `Provide at least ${MIN_CODE_CHARS} characters via "code" or a readable "path".`,
          { isError: true },
        );
      }

      const { ok, data, error } = await callAnalyze({ code: text, filename: name, tier });
      if (!ok) {
        const hint =
          error && /HTTP 402|Upgrade/i.test(error)
            ? ' (this invention has used its free analysis; start an Interactive Code Review at ' +
              reviewSignupUrl({ medium: 'ai-agent' }) +
              ')'
            : '';
        return textResult(`Patent PreCheck error: ${error}${hint}`, { isError: true });
      }

      const summary = renderScoreText(data, { filename: name, medium: 'ai-agent' });
      const compact = JSON.stringify(data);
      return {
        content: [
          { type: 'text', text: summary },
          { type: 'text', text: `Raw result JSON:\n\`\`\`json\n${compact}\n\`\`\`` },
        ],
      };
    },
  );

  server.registerTool(
    'precheck_pillars',
    {
      title: 'Patent PreCheck — scoring reference',
      description:
        'List the five patentability pillars (with statutes and weights) and the band rules ' +
        'used by precheck_score. Use this to explain a score to the user. No network call.',
      inputSchema: {},
    },
    async () => textResult(renderPillarsReference()),
  );

  server.registerTool(
    'precheck_start_review',
    {
      title: 'Patent PreCheck — start an Interactive Code Review',
      description:
        'Return the URL where the user can start a paid, live Interactive Code Review that ' +
        'strengthens each pillar with evidence and produces a filing package. Use after a ' +
        'precheck_score when the user wants to act on the result.',
      inputSchema: {},
    },
    async () =>
      textResult(
        `Start an Interactive Code Review (live coaching + evidence + filing package):\n${reviewSignupUrl({ medium: 'ai-agent' })}`,
      ),
  );

  return server;
}

/** Connect the server over stdio and block until the client disconnects. */
export async function runStdio() {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
