// Thin client for the public Patent PreCheck analyze API.
//
// The MCP server / CLI never talks to the database or any LLM directly — it
// POSTs to the hosted endpoint, so an installing developer needs no API keys
// or secrets. The scoring engine, prior-art corpus, and source registry all
// stay server-side.

const DEFAULT_API = 'https://patentprecheck.com/.netlify/functions/analyze';
const DEFAULT_SEARCH = 'https://patentprecheck.com/.netlify/functions/search-corpus';
const DEFAULT_LOOKUP = 'https://patentprecheck.com/.netlify/functions/lookup-patent';
const DEFAULT_COMPARE = 'https://patentprecheck.com/.netlify/functions/compare-to-patent';
const DEFAULT_REVIEW = 'https://patentprecheck.com/.netlify/functions/review-session';
const DEFAULT_SITE = 'https://patentprecheck.com';

// Mirror the env conventions already used by scripts/precheck-from-file.js so
// the CLI and MCP server behave identically. PRECHECK_* is preferred; the
// legacy PPC_* names are accepted as fallbacks.
export function apiUrl() {
  return process.env.PRECHECK_API_URL || process.env.PPC_API_URL || DEFAULT_API;
}

export function searchCorpusUrl() {
  return process.env.PRECHECK_SEARCH_URL || process.env.PPC_SEARCH_URL || DEFAULT_SEARCH;
}

export function lookupPatentUrl() {
  return process.env.PRECHECK_LOOKUP_URL || process.env.PPC_LOOKUP_URL || DEFAULT_LOOKUP;
}

export function compareToPatentUrl() {
  return process.env.PRECHECK_COMPARE_URL || process.env.PPC_COMPARE_URL || DEFAULT_COMPARE;
}

export function reviewSessionUrl() {
  return process.env.PRECHECK_REVIEW_SESSION_URL || process.env.PPC_REVIEW_SESSION_URL || DEFAULT_REVIEW;
}

export function functionsBaseUrl() {
  const analyze = apiUrl();
  return analyze.replace(/\/analyze$/, '');
}

export function downloadArtifactUrl({ reportId, artifact, sessionKey }) {
  const params = new URLSearchParams({
    report_id: reportId,
    artifact: artifact || 'filing_packet',
  });
  if (sessionKey) params.set('k', sessionKey);
  return `${functionsBaseUrl()}/download-artifact?${params.toString()}`;
}

export function siteUrl() {
  return process.env.PRECHECK_SITE_URL || process.env.PPC_SITE_URL || DEFAULT_SITE;
}

export function defaultTier() {
  return process.env.PRECHECK_TIER || process.env.PPC_TIER || 'free';
}

export function defaultAiAssistance() {
  return process.env.PRECHECK_AI_ASSISTANCE || process.env.PPC_AI_ASSISTANCE || 'yes_some';
}

export const MIN_CODE_CHARS = 10;

/**
 * Call the hosted analyze endpoint.
 * @returns {Promise<{ok: boolean, status: number, data: any, error: string|null}>}
 */
export async function callAnalyze({
  code,
  filename,
  tier,
  aiAssistance,
  agentInsights = false,
  priorArtLimit,
  timeoutMs = 60000,
} = {}) {
  if (typeof code !== 'string' || code.trim().length < MIN_CODE_CHARS) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: `Provide at least ${MIN_CODE_CHARS} characters of code or an invention description.`,
    };
  }

  const body = {
    code,
    filename: filename || 'invention.txt',
    tier: tier || defaultTier(),
    ai_assistance_declared: aiAssistance || defaultAiAssistance(),
  };
  if (agentInsights) {
    body.agent_insights = true;
    if (Number.isFinite(Number(priorArtLimit))) {
      body.prior_art_limit = Math.min(Math.max(Number(priorArtLimit), 1), 15);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(apiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const msg = err && err.name === 'AbortError' ? 'analyze request timed out' : err.message;
    return { ok: false, status: 0, data: null, error: `request failed: ${msg}` };
  }
  clearTimeout(timer);

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return {
      ok: false,
      status: res.status,
      data: null,
      error: `non-JSON response (${res.status}): ${text.slice(0, 300)}`,
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      data,
      error: data.error || `analyze failed (HTTP ${res.status})`,
    };
  }

  return { ok: true, status: res.status, data, error: null };
}

/**
 * URL that starts a paid Interactive Code Review.
 *
 * Carries UTM attribution so signups that originate from the CLI / MCP tool are
 * distinguishable from organic web traffic in GA4 (utm_source=patent-precheck-mcp).
 * `medium` lets callers separate the CLI ("cli") from an AI agent ("ai-agent").
 */
export function reviewSignupUrl({ medium = 'cli', promo, reportId, email } = {}) {
  const params = new URLSearchParams({
    utm_source: 'patent-precheck-mcp',
    utm_medium: medium,
    utm_campaign: 'in-tool-precheck',
  });
  const promoCode = typeof promo === 'string' ? promo.trim() : '';
  if (promoCode) params.set('promo', promoCode);
  const rid = typeof reportId === 'string' ? reportId.trim() : '';
  if (rid) params.set('report_id', rid);
  const mail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (mail) params.set('email', mail);
  return `${siteUrl()}/review-signup?${params.toString()}`;
}

async function postJson(url, body, { timeoutMs = 45000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const msg = err && err.name === 'AbortError' ? 'request timed out' : err.message;
    return { ok: false, status: 0, data: null, error: `request failed: ${msg}` };
  }
  clearTimeout(timer);

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    return {
      ok: false,
      status: res.status,
      data: null,
      error: `non-JSON response (${res.status}): ${text.slice(0, 300)}`,
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      data,
      error: data.error || `request failed (HTTP ${res.status})`,
    };
  }
  return { ok: true, status: res.status, data, error: null };
}

export async function callSearchCorpus({ code, filename, tier, limit, timeoutMs = 30000 } = {}) {
  if (typeof code !== 'string' || code.trim().length < MIN_CODE_CHARS) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: `Provide at least ${MIN_CODE_CHARS} characters of code or an invention description.`,
    };
  }
  return postJson(
    searchCorpusUrl(),
    {
      code,
      filename: filename || 'invention.txt',
      tier: tier || defaultTier(),
      ...(Number.isFinite(Number(limit)) ? { limit: Number(limit) } : {}),
    },
    { timeoutMs },
  );
}

export async function callLookupPatent({ patentId, includeGrantText = true, timeoutMs = 30000 } = {}) {
  const id = typeof patentId === 'string' ? patentId.trim() : '';
  if (!id) {
    return { ok: false, status: 0, data: null, error: 'patent_id is required (e.g. US1234567B2).' };
  }
  return postJson(
    lookupPatentUrl(),
    { patent_id: id, include_grant_text: includeGrantText },
    { timeoutMs },
  );
}

export async function callCompareToPatent({ code, patentId, filename, timeoutMs = 45000 } = {}) {
  if (typeof code !== 'string' || code.trim().length < MIN_CODE_CHARS) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: `Provide at least ${MIN_CODE_CHARS} characters of code or an invention description.`,
    };
  }
  const id = typeof patentId === 'string' ? patentId.trim() : '';
  if (!id) {
    return { ok: false, status: 0, data: null, error: 'patent_id is required (e.g. US1234567B2).' };
  }
  return postJson(
    compareToPatentUrl(),
    {
      code,
      patent_id: id,
      filename: filename || 'invention.txt',
    },
    { timeoutMs },
  );
}

export async function callReviewSession({ action, reportId, sessionKey, timeoutMs = 30000 } = {}) {
  if (!reportId || !sessionKey) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: 'report_id and session_key are required.',
    };
  }
  return postJson(
    reviewSessionUrl(),
    {
      action: action || 'status',
      report_id: reportId,
      session_key: sessionKey,
    },
    { timeoutMs },
  );
}
