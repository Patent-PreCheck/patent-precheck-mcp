// Patent PreCheck MCP server.
//
// Exposes the hosted patentability engine as MCP tools so a developer inside
// Cursor / Claude Code / Codex can score the code they just wrote without
// leaving their agent. Transport is stdio; launch via `precheck mcp`.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { handleMcpTool } from './tool_handlers.js';

function readPkgVersion() {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const tierSchema = z.enum(['free', 'paid_review', 'enterprise']).optional();

/** Build and return the configured MCP server. */
export function buildServer(version = readPkgVersion()) {
  const server = new McpServer({ name: 'patent-precheck', version });

  const inventionSchema = {
    code: z.string().optional().describe('Source code or invention description (>= 10 chars).'),
    path: z
      .string()
      .optional()
      .describe('Path to a local file to read and analyze instead of passing `code` inline.'),
    filename: z.string().optional().describe('Optional filename hint (e.g. main.ts).'),
    tier: tierSchema.describe('Analysis tier. Defaults to free.'),
  };

  server.registerTool(
    'precheck_score',
    {
      title: 'Patent PreCheck — score patentability',
      description:
        'Run a patentability pre-check on source code or an invention description. ' +
        'Returns pillar scores, band, opportunities, prior-art count, rejection patterns, ' +
        'and legal context when available. Provide `code` or `path`.',
      inputSchema: { ...inventionSchema },
    },
    async (args) => handleMcpTool('precheck_score', args, { allowPath: true, medium: 'ai-agent' }),
  );

  server.registerTool(
    'precheck_prior_art',
    {
      title: 'Patent PreCheck — prior art matches',
      description:
        'Return the closest prior-art matches (titles, sources, similarity, URLs) for an invention.',
      inputSchema: {
        ...inventionSchema,
        limit: z
          .number()
          .int()
          .min(1)
          .max(15)
          .optional()
          .describe('Max matches to return (default 8).'),
      },
    },
    async (args) =>
      handleMcpTool('precheck_prior_art', args, { allowPath: true, medium: 'ai-agent' }),
  );

  server.registerTool(
    'precheck_rejection_patterns',
    {
      title: 'Patent PreCheck — rejection pattern preview',
      description:
        'Preview examination-risk signals and similar office-action / abandonment patterns.',
      inputSchema: { ...inventionSchema },
    },
    async (args) =>
      handleMcpTool('precheck_rejection_patterns', args, { allowPath: true, medium: 'ai-agent' }),
  );

  server.registerTool(
    'precheck_legal_context',
    {
      title: 'Patent PreCheck — legal intelligence context',
      description:
        'Return a short snippet of current US software-patent legal guidance relevant to this invention.',
      inputSchema: {
        code: inventionSchema.code,
        path: inventionSchema.path,
        filename: inventionSchema.filename,
      },
    },
    async (args) =>
      handleMcpTool('precheck_legal_context', args, { allowPath: true, medium: 'ai-agent' }),
  );

  server.registerTool(
    'precheck_pillars',
    {
      title: 'Patent PreCheck — scoring reference',
      description:
        'List the patentability pillars and band rules used by precheck_score. No network call.',
      inputSchema: {},
    },
    async () => handleMcpTool('precheck_pillars', {}, { medium: 'ai-agent' }),
  );

  server.registerTool(
    'precheck_start_review',
    {
      title: 'Patent PreCheck — start an Interactive Code Review',
      description:
        'Return the URL to start an Interactive Code Review (optionally with a promo code).',
      inputSchema: {
        promo: z.string().optional().describe('Promo / beta code to skip payment (e.g. Beta).'),
        report_id: z.string().optional().describe('Free-score report id to carry forward.'),
        email: z.string().optional().describe('Optional email prefill hint.'),
      },
    },
    async (args) => handleMcpTool('precheck_start_review', args, { medium: 'ai-agent' }),
  );

  server.registerTool(
    'precheck_search_corpus',
    {
      title: 'Patent PreCheck — semantic corpus search',
      description:
        'Fast semantic search against the 1M+ prior-art corpus without LLM scoring. ' +
        'Returns ranked matches with similarity scores.',
      inputSchema: {
        code: inventionSchema.code,
        filename: inventionSchema.filename,
        tier: tierSchema,
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe('Max matches (default 12).'),
      },
    },
    async (args) =>
      handleMcpTool('precheck_search_corpus', args, { allowPath: true, medium: 'ai-agent' }),
  );

  server.registerTool(
    'precheck_cpc_suggest',
    {
      title: 'Patent PreCheck — CPC classification hints',
      description:
        'Suggest Cooperative Patent Classification (CPC) codes for an invention description. ' +
        'Offline heuristic — informational only.',
      inputSchema: {
        code: inventionSchema.code,
        path: inventionSchema.path,
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe('Max suggestions (default 5).'),
      },
    },
    async (args) =>
      handleMcpTool('precheck_cpc_suggest', args, { allowPath: true, medium: 'ai-agent' }),
  );

  server.registerTool(
    'precheck_session_status',
    {
      title: 'Patent PreCheck — ICR session status',
      description:
        'Return status for an active Interactive Code Review session. Requires report_id and session_key.',
      inputSchema: {
        report_id: z.string().describe('Report id (PPC-YYYY-MM-DD-XXXXX).'),
        session_key: z.string().describe('Session secret from the access email (?k=…).'),
      },
    },
    async (args) => handleMcpTool('precheck_session_status', args, { medium: 'ai-agent' }),
  );

  server.registerTool(
    'precheck_deliverables',
    {
      title: 'Patent PreCheck — deliverable download links',
      description:
        'Return download URLs for finalized ICR deliverables (filing packet, coaching report, package zip, scorecard PDF).',
      inputSchema: {
        report_id: z.string().describe('Report id (PPC-YYYY-MM-DD-XXXXX).'),
        session_key: z.string().describe('Session secret from the access email (?k=…).'),
      },
    },
    async (args) => handleMcpTool('precheck_deliverables', args, { medium: 'ai-agent' }),
  );

  return server;
}

/** Connect the server over stdio and block until the client disconnects. */
export async function runStdio() {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
