// Thin client for the public Patent PreCheck analyze API.
//
// The MCP server / CLI never talks to the database or any LLM directly — it
// POSTs to the hosted endpoint, so an installing developer needs no API keys
// or secrets. The scoring engine, prior-art corpus, and source registry all
// stay server-side.

const DEFAULT_API = 'https://patentprecheck.com/.netlify/functions/analyze';
const DEFAULT_SITE = 'https://patentprecheck.com';

// Mirror the env conventions already used by scripts/precheck-from-file.js so
// the CLI and MCP server behave identically. PRECHECK_* is preferred; the
// legacy PPC_* names are accepted as fallbacks.
export function apiUrl() {
  return process.env.PRECHECK_API_URL || process.env.PPC_API_URL || DEFAULT_API;
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
export async function callAnalyze({ code, filename, tier, aiAssistance, timeoutMs = 60000 } = {}) {
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
export function reviewSignupUrl({ medium = 'cli' } = {}) {
  const params = new URLSearchParams({
    utm_source: 'patent-precheck-mcp',
    utm_medium: medium,
    utm_campaign: 'in-tool-precheck',
  });
  return `${siteUrl()}/review-signup?${params.toString()}`;
}
