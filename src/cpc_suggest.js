// Standalone CPC hints for the published npm package (mirrors backend/patentability/cpc_suggest.js).

const DOMAIN_KEYWORDS = {
  ai_ml: ['neural', 'transformer', 'llm', 'model', 'training', 'embedding', 'prompt', 'token'],
  networking: ['protocol', 'tcp', 'packet', 'latency', 'rate limit', 'throttl', 'token bucket'],
  crypto: ['crypto', 'cipher', 'encrypt', 'hash', 'signature', 'merkle', 'zero-knowledge'],
  distributed: ['consensus', 'raft', 'distributed', 'replication', 'gossip', 'quorum'],
  data_systems: ['database', 'query', 'index', 'sql', 'transaction', 'cache', 'lsm'],
  ui_ux: ['render', 'ui', 'component', 'react', 'widget', 'layout'],
  compilers: ['compiler', 'parser', 'ast', 'lexer', 'bytecode'],
  security: ['auth', 'oauth', 'csrf', 'xss', 'sandbox', 'permission'],
};

const DOMAIN_CPC = {
  ai_ml: [
    { code: 'G06N', label: 'Computing arrangements based on specific computational models' },
    { code: 'G06N20/00', label: 'Machine learning' },
  ],
  networking: [
    { code: 'H04L', label: 'Transmission of digital information' },
    { code: 'H04L47/00', label: 'Traffic control; congestion management' },
  ],
  crypto: [
    { code: 'H04L9/00', label: 'Cryptographic mechanisms' },
    { code: 'G06F21/00', label: 'Security arrangements for protecting computers' },
  ],
  distributed: [
    { code: 'G06F9/50', label: 'Allocation of resources in distributed systems' },
    { code: 'G06F16/00', label: 'Information retrieval; database structures' },
  ],
  data_systems: [
    { code: 'G06F16/00', label: 'Information retrieval; database structures' },
    { code: 'G06F12/00', label: 'Caching; memory access' },
  ],
  ui_ux: [
    { code: 'G06F3/00', label: 'Input/output arrangements for transferring data' },
    { code: 'G06F9/44', label: 'Presentation of data; user interfaces' },
  ],
  compilers: [
    { code: 'G06F8/40', label: 'Translation of programs' },
    { code: 'G06F8/00', label: 'Arrangements for software engineering' },
  ],
  security: [
    { code: 'G06F21/00', label: 'Security arrangements for protecting computers' },
    { code: 'H04L9/00', label: 'Cryptographic mechanisms' },
  ],
  general: [
    { code: 'G06F', label: 'Electric digital data processing' },
    { code: 'G06Q', label: 'Data processing for commercial/financial/administrative purposes' },
    { code: 'H04L', label: 'Transmission of digital information' },
  ],
};

function classifyDomain(text) {
  const lower = (text || '').toLowerCase();
  const scores = {};
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    scores[domain] = keywords.reduce((n, k) => n + (lower.includes(k) ? 1 : 0), 0);
  }
  const sorted = Object.entries(scores).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  return sorted.length ? sorted[0][0] : 'general';
}

export function suggestCpcCodes(text, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 5, 1), 10);
  const input = typeof text === 'string' ? text.trim() : '';
  const domain = classifyDomain(input);
  const rows = DOMAIN_CPC[domain] || DOMAIN_CPC.general;
  return {
    domain,
    suggestions: rows.slice(0, limit).map((row) => ({
      ...row,
      confidence: domain === 'general' ? 'medium' : 'high',
      reason: `Primary domain: ${domain.replace(/_/g, ' ')}`,
    })),
  };
}
