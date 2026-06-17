// Shared MCP tool handlers — used by the stdio server and the hosted mcp.mjs endpoint.

import {
  callAnalyze,
  callSearchCorpus,
  callReviewSession,
  downloadArtifactUrl,
  reviewSignupUrl,
  MIN_CODE_CHARS,
} from './api.js';
import { resolveInventionInput } from './input.js';
import { suggestCpcCodes } from './cpc_suggest.js';
import {
  renderScoreText,
  renderPillarsReference,
  renderPriorArtText,
  renderRejectionPatternsText,
  renderLegalContextText,
  renderCorpusSearchText,
  renderCpcSuggestText,
  renderSessionStatusText,
  renderDeliverablesText,
} from './render.js';

function textResult(text, { isError = false } = {}) {
  return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) };
}

function upgradeHint(medium) {
  return (
    ' (this invention has used its free analysis; start an Interactive Code Review at ' +
    `${reviewSignupUrl({ medium })})`
  );
}

function analyzeErrorResult(error, medium) {
  const hint = error && /HTTP 402|Upgrade/i.test(error) ? upgradeHint(medium) : '';
  return textResult(`Patent PreCheck error: ${error}${hint}`, { isError: true });
}

async function runAgentAnalyze({ code, path: filePath, filename, tier, priorArtLimit, allowPath }) {
  let text = typeof code === 'string' ? code : '';
  let name = filename;

  if (allowPath && !text && filePath) {
    const resolved = await resolveInventionInput({ path: filePath, filename });
    if (!resolved.ok) return { ok: false, result: textResult(resolved.error, { isError: true }) };
    text = resolved.text;
    name = resolved.filename;
  } else if (!text || text.trim().length < MIN_CODE_CHARS) {
    const hint = allowPath ? '"code" or a readable "path"' : '"code"';
    return {
      ok: false,
      result: textResult(`Provide at least ${MIN_CODE_CHARS} characters via ${hint}.`, {
        isError: true,
      }),
    };
  }

  const { ok, data, error } = await callAnalyze({
    code: text,
    filename: name,
    tier,
    agentInsights: true,
    priorArtLimit,
  });
  if (!ok) return { ok: false, result: analyzeErrorResult(error, 'ai-agent') };
  return { ok: true, data, filename: name };
}

/** JSON Schema tool definitions for the hosted HTTP MCP server. */
export const HTTP_TOOL_SCHEMAS = [
  {
    name: 'precheck_score',
    title: 'Patent PreCheck \u2014 score patentability',
    description:
      'Run a patentability pre-check on source code or an invention description. ' +
      'Returns a 0\u2013100 patentability score across the four USPTO statutory pillars ' +
      '(\u00a7101 eligibility, \u00a7102 novelty, \u00a7103 non-obviousness, \u00a7101 utility), a ' +
      'separate \u00a7112 filing-readiness signal, the band (Not Ready \u2192 File Ready), the ' +
      'pillar that holds the band back, top opportunities to strengthen, and a count of ' +
      'prior-art matches consulted. Pass the text to analyze inline via `code`.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The source code or invention description to analyze (>= 10 chars).',
        },
        filename: {
          type: 'string',
          description: 'Optional filename hint (e.g. main.ts) used for language/context.',
        },
        tier: {
          type: 'string',
          enum: ['free', 'paid_review', 'enterprise'],
          description: 'Analysis tier. Defaults to free; paid tiers require server-side entitlement.',
        },
      },
      required: ['code'],
      additionalProperties: false,
    },
  },
  {
    name: 'precheck_prior_art',
    title: 'Patent PreCheck \u2014 prior art matches',
    description:
      'Return the closest prior-art matches consulted for an invention (titles, sources, ' +
      'similarity scores, URLs). Runs the same analyze pipeline as precheck_score but focuses ' +
      'on retrieval results. Pass invention text via `code`.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Source code or invention description (>= 10 chars).' },
        filename: { type: 'string', description: 'Optional filename hint.' },
        limit: {
          type: 'integer',
          description: 'Max matches to return (1\u201315, default 8).',
          minimum: 1,
          maximum: 15,
        },
        tier: {
          type: 'string',
          enum: ['free', 'paid_review', 'enterprise'],
          description: 'Analysis tier. Defaults to free.',
        },
      },
      required: ['code'],
      additionalProperties: false,
    },
  },
  {
    name: 'precheck_rejection_patterns',
    title: 'Patent PreCheck \u2014 rejection pattern preview',
    description:
      'Preview examination-risk signals: similar office-action rejections, abandonment ' +
      'patterns, and the primary statutory basis an examiner might cite (\u00a7101/\u00a7102/\u00a7103). ' +
      'Use after precheck_score to explain prosecution risk.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Source code or invention description (>= 10 chars).' },
        filename: { type: 'string', description: 'Optional filename hint.' },
        tier: {
          type: 'string',
          enum: ['free', 'paid_review', 'enterprise'],
          description: 'Analysis tier. Defaults to free.',
        },
      },
      required: ['code'],
      additionalProperties: false,
    },
  },
  {
    name: 'precheck_legal_context',
    title: 'Patent PreCheck \u2014 legal intelligence context',
    description:
      'Return a short snippet of current US software-patent legal guidance (CAFC, USPTO, ' +
      'Alice/\u00a7101) relevant to scoring this invention. Informational only \u2014 not legal advice.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Source code or invention description (>= 10 chars).' },
        filename: { type: 'string', description: 'Optional filename hint.' },
      },
      required: ['code'],
      additionalProperties: false,
    },
  },
  {
    name: 'precheck_pillars',
    title: 'Patent PreCheck \u2014 scoring reference',
    description:
      'List the five patentability pillars (with statutes and weights) and the band rules ' +
      'used by precheck_score. Use this to explain a score to the user. No network call.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'precheck_start_review',
    title: 'Patent PreCheck \u2014 start an Interactive Code Review',
    description:
      'Return the URL where the user can start a paid (or promo-unlocked) Interactive Code ' +
      'Review that strengthens each pillar with evidence and produces a filing package. Use ' +
      'after precheck_score when the user wants to act on the result.',
    inputSchema: {
      type: 'object',
      properties: {
        promo: {
          type: 'string',
          description: 'Optional promo / beta access code (e.g. Beta) to skip payment.',
        },
        report_id: {
          type: 'string',
          description: 'Optional free-score report id (PPC-YYYY-MM-DD-XXXXX) to carry forward.',
        },
        email: {
          type: 'string',
          description: 'Optional email hint (prefill only; user confirms on signup).',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'precheck_search_corpus',
    title: 'Patent PreCheck — semantic corpus search',
    description:
      'Fast semantic search against the 1M+ prior-art corpus without LLM scoring. ' +
      'Returns ranked matches with similarity scores. Cheaper than precheck_score when ' +
      'you only need references.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Source code or invention description (>= 10 chars).' },
        filename: { type: 'string', description: 'Optional filename hint.' },
        limit: { type: 'integer', description: 'Max matches (1\u201320, default 12).', minimum: 1, maximum: 20 },
        tier: {
          type: 'string',
          enum: ['free', 'paid_review', 'enterprise'],
          description: 'Search tier. Defaults to free.',
        },
      },
      required: ['code'],
      additionalProperties: false,
    },
  },
  {
    name: 'precheck_cpc_suggest',
    title: 'Patent PreCheck — CPC classification hints',
    description:
      'Suggest Cooperative Patent Classification (CPC) codes for an invention description. ' +
      'Offline heuristic — informational only. No network call.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Source code or invention description (>= 10 chars).' },
        limit: { type: 'integer', description: 'Max suggestions (1\u201310, default 5).', minimum: 1, maximum: 10 },
      },
      required: ['code'],
      additionalProperties: false,
    },
  },
  {
    name: 'precheck_session_status',
    title: 'Patent PreCheck — ICR session status',
    description:
      'Return status for an active Interactive Code Review session. Requires report_id and ' +
      'session_key from the user access email link.',
    inputSchema: {
      type: 'object',
      properties: {
        report_id: { type: 'string', description: 'Report id (PPC-YYYY-MM-DD-XXXXX).' },
        session_key: { type: 'string', description: 'Session secret from the access email (?k=…).' },
      },
      required: ['report_id', 'session_key'],
      additionalProperties: false,
    },
  },
  {
    name: 'precheck_deliverables',
    title: 'Patent PreCheck — deliverable download links',
    description:
      'Return download URLs for finalized ICR deliverables (filing packet, coaching report, ' +
      'package zip, scorecard PDF). Requires report_id and session_key.',
    inputSchema: {
      type: 'object',
      properties: {
        report_id: { type: 'string', description: 'Report id (PPC-YYYY-MM-DD-XXXXX).' },
        session_key: { type: 'string', description: 'Session secret from the access email (?k=…).' },
      },
      required: ['report_id', 'session_key'],
      additionalProperties: false,
    },
  },
];

/**
 * @param {{ allowPath?: boolean, medium?: string }} options
 */
export async function handleMcpTool(name, args, { allowPath = false, medium = 'ai-agent' } = {}) {
  const a = args || {};

  if (name === 'precheck_pillars') {
    return textResult(renderPillarsReference());
  }

  if (name === 'precheck_start_review') {
    const url = reviewSignupUrl({
      medium,
      promo: typeof a.promo === 'string' ? a.promo : undefined,
      reportId: typeof a.report_id === 'string' ? a.report_id : undefined,
      email: typeof a.email === 'string' ? a.email : undefined,
    });
    const lines = [
      'Start an Interactive Code Review (live coaching + evidence + filing package):',
      url,
    ];
    if (a.promo) {
      lines.push('');
      lines.push('Promo code is included in the URL — payment is bypassed when the code is valid.');
    }
    return textResult(lines.join('\n'));
  }

  if (name === 'precheck_score') {
    if (allowPath && !a.code && a.path) {
      const resolved = await resolveInventionInput(a);
      if (!resolved.ok) return textResult(resolved.error, { isError: true });
      a.code = resolved.text;
      if (!a.filename) a.filename = resolved.filename;
    }
    const code = typeof a.code === 'string' ? a.code : '';
    if (!code || code.trim().length < MIN_CODE_CHARS) {
      const hint = allowPath ? '"code" or a readable "path"' : '"code"';
      return textResult(`Provide at least ${MIN_CODE_CHARS} characters via ${hint}.`, {
        isError: true,
      });
    }
    const { ok, data, error } = await callAnalyze({
      code,
      filename: a.filename,
      tier: a.tier,
      agentInsights: true,
    });
    if (!ok) return analyzeErrorResult(error, medium);
    const summary = renderScoreText(data, { filename: a.filename, medium });
    const compact = JSON.stringify(data);
    return {
      content: [
        { type: 'text', text: summary },
        { type: 'text', text: `Raw result JSON:\n\`\`\`json\n${compact}\n\`\`\`` },
      ],
    };
  }

  if (name === 'precheck_prior_art') {
    const limit = Number.isFinite(Number(a.limit)) ? Number(a.limit) : 8;
    const run = await runAgentAnalyze({
      code: a.code,
      path: a.path,
      filename: a.filename,
      tier: a.tier,
      priorArtLimit: limit,
      allowPath,
    });
    if (!run.ok) return run.result;
    return textResult(renderPriorArtText(run.data, { filename: run.filename, limit }));
  }

  if (name === 'precheck_rejection_patterns') {
    const run = await runAgentAnalyze({
      code: a.code,
      path: a.path,
      filename: a.filename,
      tier: a.tier,
      allowPath,
    });
    if (!run.ok) return run.result;
    return textResult(renderRejectionPatternsText(run.data, { filename: run.filename }));
  }

  if (name === 'precheck_legal_context') {
    const run = await runAgentAnalyze({
      code: a.code,
      path: a.path,
      filename: a.filename,
      allowPath,
    });
    if (!run.ok) return run.result;
    return textResult(renderLegalContextText(run.data, { filename: run.filename }));
  }

  if (name === 'precheck_search_corpus') {
    let text = typeof a.code === 'string' ? a.code : '';
    let filename = a.filename;
    if (allowPath && !text && a.path) {
      const resolved = await resolveInventionInput(a);
      if (!resolved.ok) return textResult(resolved.error, { isError: true });
      text = resolved.text;
      filename = resolved.filename;
    }
    if (!text || text.trim().length < MIN_CODE_CHARS) {
      return textResult(`Provide at least ${MIN_CODE_CHARS} characters via "code".`, { isError: true });
    }
    const limit = Number.isFinite(Number(a.limit)) ? Number(a.limit) : 12;
    const { ok, data, error } = await callSearchCorpus({
      code: text,
      filename,
      tier: a.tier,
      limit,
    });
    if (!ok) return textResult(`Patent PreCheck error: ${error}`, { isError: true });
    return textResult(renderCorpusSearchText(data, { filename, limit }));
  }

  if (name === 'precheck_cpc_suggest') {
    let text = typeof a.code === 'string' ? a.code : '';
    if (allowPath && !text && a.path) {
      const resolved = await resolveInventionInput(a);
      if (!resolved.ok) return textResult(resolved.error, { isError: true });
      text = resolved.text;
    }
    if (!text || text.trim().length < MIN_CODE_CHARS) {
      return textResult(`Provide at least ${MIN_CODE_CHARS} characters via "code".`, { isError: true });
    }
    const limit = Number.isFinite(Number(a.limit)) ? Number(a.limit) : 5;
    return textResult(renderCpcSuggestText(suggestCpcCodes(text, { limit }), { filename: a.filename }));
  }

  if (name === 'precheck_session_status') {
    const reportId = typeof a.report_id === 'string' ? a.report_id.trim() : '';
    const sessionKey = typeof a.session_key === 'string' ? a.session_key.trim() : '';
    if (!reportId || !sessionKey) {
      return textResult('report_id and session_key are required.', { isError: true });
    }
    const { ok, data, error } = await callReviewSession({
      action: 'status',
      reportId,
      sessionKey,
    });
    if (!ok) return textResult(`Session status error: ${error}`, { isError: true });
    return textResult(renderSessionStatusText(data));
  }

  if (name === 'precheck_deliverables') {
    const reportId = typeof a.report_id === 'string' ? a.report_id.trim() : '';
    const sessionKey = typeof a.session_key === 'string' ? a.session_key.trim() : '';
    if (!reportId || !sessionKey) {
      return textResult('report_id and session_key are required.', { isError: true });
    }
    const urls = {
      filing_packet: downloadArtifactUrl({ reportId, artifact: 'filing_packet', sessionKey }),
      coaching_report: downloadArtifactUrl({ reportId, artifact: 'coaching_report', sessionKey }),
      package_zip: downloadArtifactUrl({ reportId, artifact: 'package_zip', sessionKey }),
      scorecard_pdf: downloadArtifactUrl({ reportId, artifact: 'scorecard_pdf', sessionKey }),
    };
    return textResult(renderDeliverablesText({ reportId, sessionKey, urls }));
  }

  const err = new Error(`Unknown tool: ${name}`);
  err.rpcCode = -32602;
  throw err;
}
