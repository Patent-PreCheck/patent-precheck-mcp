// Human-readable rendering of analyze results, shared by the CLI and the MCP
// server so an agent and a terminal user see the same summary.

import { reviewSignupUrl } from './api.js';

export const PILLARS = [
  { key: 'eligibility', label: 'Eligibility', statute: '§101 (Alice/Mayo)', weight: '25%', question: 'Is it more than an abstract idea?' },
  { key: 'novelty', label: 'Novelty', statute: '§102', weight: '25%', question: 'Is it new?' },
  { key: 'non_obvious', label: 'Non-obviousness', statute: '§103', weight: '30%', question: 'Is it inventive?' },
  { key: 'utility', label: 'Utility', statute: '§101 (utility)', weight: '10%', question: 'Does it work and does it matter?' },
  { key: 'filing_readiness', label: 'Filing readiness', statute: '§112', weight: '10%', question: 'Is your documentation strong enough to file?' },
];

export const BANDS = [
  { band: 'file_ready', label: 'File Ready', score: '\u2265 80', floor: 'every pillar \u2265 70' },
  { band: 'close_to_ready', label: 'Close to Ready', score: '\u2265 60', floor: 'every pillar \u2265 50' },
  { band: 'building', label: 'Building', score: '\u2265 40', floor: '\u2014' },
  { band: 'not_ready', label: 'Not Ready', score: '0\u201339', floor: '\u2014' },
];

function humanizePillar(key) {
  const found = PILLARS.find((p) => p.key === key);
  return found ? `${found.label} (${found.statute})` : key || '\u2014';
}

/** Render the pillars/bands reference (no network). */
export function renderPillarsReference() {
  const lines = [];
  lines.push('Patent PreCheck scores four statutory patentability pillars (weighted) plus a');
  lines.push('separate Filing Readiness (\u00a7112) signal, behind a \u00a7101 subject-matter gate.');
  lines.push('');
  lines.push('Pillars:');
  for (const p of PILLARS) {
    lines.push(`  ${p.label.padEnd(18)} ${p.statute.padEnd(18)} ${p.weight.padEnd(5)} ${p.question}`);
  }
  lines.push('');
  lines.push('Bands (enforced floors, not just a weighted average):');
  for (const b of BANDS) {
    lines.push(`  ${b.label.padEnd(16)} score ${b.score.padEnd(6)}  floor: ${b.floor}`);
  }
  lines.push('');
  lines.push('A composite of 82 with one pillar at 55 does NOT reach File Ready; band_held_back_by');
  lines.push('names the limiting pillar so you know exactly what to strengthen.');
  return lines.join('\n');
}

/** Render an analyze result as a compact, terminal-friendly report. */
export function renderScoreText(data, { filename, medium = 'cli' } = {}) {
  if (!data || typeof data !== 'object') return 'No result.';

  const lines = [];
  const title = filename ? `Patent PreCheck \u2014 ${filename}` : 'Patent PreCheck';
  lines.push(title);
  lines.push('='.repeat(title.length));

  if (data.gate_passed === false) {
    lines.push('');
    lines.push('Gate: NOT eligible patentable subject matter (\u00a7101).');
    if (data.gate_reason) lines.push(`Reason: ${data.gate_reason}`);
    lines.push('No patentability score is issued for non-eligible subject matter.');
    return lines.join('\n');
  }

  const score = data.patentability_score ?? data.overall_score;
  const bandLabel = data.patentability_band_label || data.band_label || data.band || '\u2014';
  const heldBack = data.patentability_held_back_by || data.band_held_back_by;

  lines.push('');
  lines.push(`Band:  ${bandLabel}  (patentability ${score ?? '\u2014'}/100)`);
  if (data.filing_readiness_score != null) {
    lines.push(`Filing readiness (\u00a7112): ${data.filing_readiness_score}/100  ${data.filing_readiness_band_label || ''}`.trimEnd());
  }
  if (heldBack) lines.push(`Held back by: ${humanizePillar(heldBack)}`);
  if (data.technology_domain) lines.push(`Domain: ${data.technology_domain}`);

  const ps = data.pillar_scores || {};
  if (Object.keys(ps).length) {
    lines.push('');
    lines.push('Pillars:');
    for (const p of PILLARS) {
      if (ps[p.key] == null) continue;
      const tag = p.key === 'filing_readiness' ? '  (secondary)' : '';
      lines.push(`  ${(`${p.label} (${p.statute})`).padEnd(34)} ${String(ps[p.key]).padStart(3)}${tag}`);
    }
  }

  const opps = Array.isArray(data.top_opportunities) ? data.top_opportunities : [];
  if (opps.length) {
    lines.push('');
    lines.push('Top opportunities to strengthen:');
    opps.slice(0, 5).forEach((o, i) => {
      const area = o.area || humanizePillar(o.pillar);
      lines.push(`  ${i + 1}. ${area}${o.action ? ` \u2014 ${o.action}` : ''}`);
    });
  }

  if (data.prior_art_match_count != null) {
    lines.push('');
    lines.push(`Prior art consulted: ${data.prior_art_match_count}`);
    const teaser = Array.isArray(data.prior_art_teaser) ? data.prior_art_teaser : [];
    teaser.slice(0, 5).forEach((t) => {
      const label = typeof t === 'string' ? t : t.title || t.publication_number || '';
      if (label) lines.push(`  \u2022 ${label}`);
    });
  }

  lines.push('');
  lines.push(`Next step \u2014 strengthen this with a live, evidence-backed Interactive Code Review:`);
  lines.push(`  ${reviewSignupUrl({ medium })}`);

  return lines.join('\n');
}

function priorArtRows(data, limit = 8) {
  const matches = Array.isArray(data.prior_art_matches) ? data.prior_art_matches : [];
  if (matches.length) {
    return matches.slice(0, limit).map((m) => ({
      title: m.title,
      source: m.source || m.source_id,
      similarity: m.similarity,
      url: m.url,
      doc_type: m.doc_type,
    }));
  }
  const teaser = Array.isArray(data.prior_art_teaser) ? data.prior_art_teaser : [];
  return teaser.slice(0, limit).map((t) =>
    typeof t === 'string'
      ? { title: t, source: null, similarity: null, url: null, doc_type: null }
      : {
          title: t.title,
          source: t.source,
          similarity: t.similarity,
          url: t.url,
          doc_type: t.doc_type,
        },
  );
}

function formatSimilarity(sim) {
  const n = Number(sim);
  if (!Number.isFinite(n)) return null;
  const pct = n <= 1 ? Math.round(n * 100) : Math.round(n);
  return `${pct}%`;
}

/** Render prior-art matches from an analyze result. */
export function renderPriorArtText(data, { filename, limit = 8 } = {}) {
  if (!data || typeof data !== 'object') return 'No prior-art data.';
  const lines = [];
  const title = filename ? `Prior art — ${filename}` : 'Prior art matches';
  lines.push(title);
  lines.push('='.repeat(title.length));
  lines.push('');
  lines.push(`Total consulted: ${data.prior_art_match_count ?? priorArtRows(data, limit).length}`);
  if (data.prior_art_status) lines.push(`Search status: ${data.prior_art_status}`);

  const rows = priorArtRows(data, limit);
  if (!rows.length) {
    lines.push('');
    lines.push('No prior-art matches were returned for this invention.');
    return lines.join('\n');
  }

  lines.push('');
  lines.push(`Top ${rows.length} matches:`);
  rows.forEach((row, i) => {
    const sim = formatSimilarity(row.similarity);
    const meta = [row.source, row.doc_type, sim ? `similarity ${sim}` : null]
      .filter(Boolean)
      .join(' · ');
    lines.push(`  ${i + 1}. ${row.title || '(untitled)'}`);
    if (meta) lines.push(`     ${meta}`);
    if (row.url) lines.push(`     ${row.url}`);
  });

  lines.push('');
  lines.push('Informational only — not legal advice.');
  return lines.join('\n');
}

/** Render rejection-pattern preview from an analyze result. */
export function renderRejectionPatternsText(data, { filename } = {}) {
  if (!data || typeof data !== 'object') return 'No rejection-pattern data.';
  const lines = [];
  const title = filename ? `Examination risk — ${filename}` : 'Examination risk preview';
  lines.push(title);
  lines.push('='.repeat(title.length));

  const summary = data.examination_risk_summary || null;
  const neighbors = Array.isArray(data.rejection_neighbors) ? data.rejection_neighbors : [];

  lines.push('');
  if (summary) {
    lines.push(`Risk level: ${summary.risk_level || 'unknown'}`);
    if (summary.primary_basis) lines.push(`Primary basis: ${summary.primary_basis}`);
    lines.push(`Pattern neighbors: ${summary.neighbor_count ?? neighbors.length}`);
  } else if (!neighbors.length) {
    lines.push('No examination-risk patterns were identified from the prior-art corpus.');
    lines.push('Informational only — not legal advice.');
    return lines.join('\n');
  }

  if (neighbors.length) {
    lines.push('');
    lines.push('Similar rejection / abandonment patterns:');
    neighbors.forEach((n, i) => {
      const sim = Number.isFinite(Number(n.similarity)) ? `${n.similarity}%` : null;
      lines.push(`  ${i + 1}. ${n.title || '(untitled)'}`);
      const meta = [n.rejection_basis, n.source_id, sim ? `similarity ${sim}` : null]
        .filter(Boolean)
        .join(' · ');
      if (meta) lines.push(`     ${meta}`);
      if (n.snippet) lines.push(`     “${String(n.snippet).slice(0, 180)}…”`);
      if (n.url) lines.push(`     ${n.url}`);
    });
  }

  lines.push('');
  lines.push('Informational only — not legal advice.');
  return lines.join('\n');
}

/** Render legal guidance snippet from an analyze result. */
export function renderLegalContextText(data, { filename } = {}) {
  if (!data || typeof data !== 'object') return 'No legal context.';
  const lines = [];
  const title = filename ? `Legal context — ${filename}` : 'Legal intelligence context';
  lines.push(title);
  lines.push('='.repeat(title.length));
  lines.push('');

  const snippet =
    typeof data.legal_guidance_snippet === 'string' ? data.legal_guidance_snippet.trim() : '';
  if (!snippet) {
    lines.push('No legal guidance snippet is available for this request.');
    lines.push('The legal-intel feed may be temporarily unavailable.');
  } else {
    lines.push(snippet);
  }

  if (data.technology_domain) {
    lines.push('');
    lines.push(`Technology domain detected: ${data.technology_domain}`);
  }

  lines.push('');
  lines.push('Informational only — not legal advice. Consult a licensed patent attorney.');
  return lines.join('\n');
}

/** Render corpus search results. */
export function renderCorpusSearchText(data, { filename, limit = 12 } = {}) {
  if (!data || typeof data !== 'object') return 'No search results.';
  const lines = [];
  const title = filename ? `Corpus search — ${filename}` : 'Corpus search results';
  lines.push(title);
  lines.push('='.repeat(title.length));
  lines.push('');
  lines.push(`Technology domain: ${data.technology_domain || 'general'}`);
  lines.push(`Matches found: ${data.prior_art_match_count ?? 0}`);
  if (data.prior_art_status) lines.push(`Search status: ${data.prior_art_status}`);

  const matches = Array.isArray(data.matches) ? data.matches.slice(0, limit) : [];
  if (matches.length) {
    lines.push('');
    lines.push(`Top ${matches.length} matches:`);
    matches.forEach((m, i) => {
      const sim =
        m.similarity != null && Number.isFinite(Number(m.similarity))
          ? `${Math.round(Number(m.similarity) <= 1 ? Number(m.similarity) * 100 : Number(m.similarity))}%`
          : null;
      const meta = [m.source, m.doc_type, sim ? `similarity ${sim}` : null].filter(Boolean).join(' · ');
      lines.push(`  ${i + 1}. ${m.title || '(untitled)'}`);
      if (meta) lines.push(`     ${meta}`);
      if (m.url) lines.push(`     ${m.url}`);
    });
  }

  lines.push('');
  lines.push('Informational only — not legal advice.');
  return lines.join('\n');
}

/** Render CPC classification suggestions. */
export function renderCpcSuggestText(result, { filename } = {}) {
  const lines = [];
  const title = filename ? `CPC suggestions — ${filename}` : 'CPC classification suggestions';
  lines.push(title);
  lines.push('='.repeat(title.length));
  lines.push('');
  lines.push(`Detected domain: ${result.domain || 'general'}`);
  const suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
  if (!suggestions.length) {
    lines.push('No CPC suggestions available.');
    return lines.join('\n');
  }
  lines.push('');
  suggestions.forEach((s, i) => {
    lines.push(`  ${i + 1}. ${s.code} — ${s.label}`);
    if (s.confidence || s.reason) {
      lines.push(`     ${[s.confidence, s.reason].filter(Boolean).join(' · ')}`);
    }
  });
  lines.push('');
  lines.push('Informational only — verify classifications with a patent practitioner.');
  return lines.join('\n');
}

/** Render ICR session status summary. */
export function renderSessionStatusText(data) {
  if (!data || typeof data !== 'object') return 'No session data.';
  const lines = [];
  lines.push(`Interactive Code Review — ${data.report_id || 'session'}`);
  lines.push('='.repeat(40));
  lines.push('');
  lines.push(`State: ${data.state || 'unknown'}`);
  lines.push(`Review mode: ${data.review_mode || 'unknown'}`);
  lines.push(`Editable: ${data.session_editable ? 'yes' : 'no'}`);
  if (data.session_end_date) lines.push(`Session ends: ${data.session_end_date}`);

  const session = data.session_state || {};
  if (session.patentability_score != null) {
    lines.push(`Current patentability score: ${session.patentability_score}/100`);
  }
  if (session.coach_started != null) {
    lines.push(`Coach started: ${session.coach_started ? 'yes' : 'no'}`);
  }
  if (session.locked) lines.push('Session finalized: yes');

  lines.push('');
  lines.push('Session key is required for downloads — use precheck_deliverables.');
  return lines.join('\n');
}

/** Render US patent lookup results. */
export function renderPatentLookupText(data) {
  if (!data || typeof data !== 'object') return 'No patent lookup results.';
  const lines = [];
  const label = data.parsed?.display || data.query || 'Patent lookup';
  lines.push(`Patent lookup — ${label}`);
  lines.push('='.repeat(20 + label.length));
  lines.push('');
  if (!data.odp_available) {
    lines.push('USPTO Open Data Portal is not configured server-side — metadata may be limited.');
    lines.push('');
  }
  if (data.odp) {
    if (data.odp.title) lines.push(`Title: ${data.odp.title}`);
    if (data.odp.patent_number) lines.push(`Patent number: US${data.odp.patent_number}`);
    if (data.odp.application_number) lines.push(`Application: ${data.odp.application_number}`);
    if (data.odp.status) lines.push(`Status: ${data.odp.status}`);
    if (data.odp.filing_date) lines.push(`Filing date: ${data.odp.filing_date}`);
    if (data.odp.grant_date) lines.push(`Grant date: ${data.odp.grant_date}`);
    if (data.odp.first_inventor) lines.push(`First inventor: ${data.odp.first_inventor}`);
    if (data.odp.cpc?.length) lines.push(`CPC: ${data.odp.cpc.join(', ')}`);
  }
  if (data.grant_text?.abstract) {
    lines.push('');
    lines.push('Abstract (excerpt):');
    lines.push(data.grant_text.abstract.slice(0, 500));
  }
  if (data.corpus?.title) {
    lines.push('');
    lines.push(`Corpus match: ${data.corpus.title} (native_id ${data.corpus.native_id})`);
  }
  if (data.uspto_public_url) {
    lines.push('');
    lines.push(data.uspto_public_url);
  }
  lines.push('');
  lines.push('Informational only — not legal advice.');
  return lines.join('\n');
}

/** Render invention vs known-patent comparison. */
export function renderPatentCompareText(data, { filename } = {}) {
  if (!data || typeof data !== 'object') return 'No comparison results.';
  const lines = [];
  const title = filename ? `Compare to patent — ${filename}` : 'Compare to patent';
  lines.push(title);
  lines.push('='.repeat(title.length));
  lines.push('');
  const p = data.patent || {};
  lines.push(`Reference: ${p.display_id || data.patent_query}`);
  if (p.title) lines.push(`Title: ${p.title}`);
  if (data.relevance_pct != null) lines.push(`Embedding similarity: ~${data.relevance_pct}%`);
  const analysis = data.prior_art_analysis || {};
  if (analysis.prior_art_risk) lines.push(`Prior-art risk: ${analysis.prior_art_risk}`);
  if (analysis.summary_sentence) {
    lines.push('');
    lines.push(analysis.summary_sentence);
  }
  const refs = Array.isArray(analysis.closest_references) ? analysis.closest_references : [];
  if (refs.length) {
    lines.push('');
    lines.push('Closest reference:');
    const r = refs[0];
    lines.push(`  ${r.title || '(untitled)'}`);
    if (r.likely_statute) lines.push(`  Likely statute: ${r.likely_statute}`);
    if (r.overlap_theme) lines.push(`  Theme: ${r.overlap_theme}`);
    if (r.examiner_note) lines.push(`  Note: ${r.examiner_note}`);
  }
  const checklist = Array.isArray(analysis.distinction_checklist) ? analysis.distinction_checklist : [];
  if (checklist.length) {
    lines.push('');
    lines.push('Distinction checklist:');
    checklist.forEach((item, i) => lines.push(`  ${i + 1}. ${item}`));
  }
  if (p.url) {
    lines.push('');
    lines.push(p.url);
  }
  lines.push('');
  lines.push('Informational only — not legal advice.');
  return lines.join('\n');
}

/** Render deliverable download URLs. */
export function renderDeliverablesText({ reportId, sessionKey, urls }) {
  const lines = [];
  lines.push(`Deliverables for ${reportId}`);
  lines.push('='.repeat(24));
  lines.push('');
  lines.push('Open these links in a browser (requires the session key from your access email):');
  lines.push('');
  for (const [label, url] of Object.entries(urls || {})) {
    lines.push(`${label}:`);
    lines.push(`  ${url}`);
  }
  lines.push('');
  lines.push('Links expire when the 30-day review window closes.');
  return lines.join('\n');
}
