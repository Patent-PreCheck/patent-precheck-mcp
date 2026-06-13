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
