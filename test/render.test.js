import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  renderPillarsReference,
  renderScoreText,
  renderPriorArtText,
  renderRejectionPatternsText,
  renderLegalContextText,
  renderCorpusSearchText,
  renderCpcSuggestText,
  renderSessionStatusText,
  renderDeliverablesText,
  PILLARS,
  BANDS,
} from '../src/render.js';
import { SAMPLE_RESULT, SAMPLE_CORPUS_RESULT } from './helpers.js';

test('renderPillarsReference lists all five pillars and four bands', () => {
  const out = renderPillarsReference();
  for (const p of PILLARS) assert.ok(out.includes(p.label), `missing pillar ${p.label}`);
  for (const b of BANDS) assert.ok(out.includes(b.label), `missing band ${b.label}`);
  assert.match(out, /\u00a7101/); // statute symbols rendered
});

test('renderScoreText renders band, score, held-back pillar, and opportunities', () => {
  const out = renderScoreText(SAMPLE_RESULT, { filename: 'widget.ts' });
  assert.match(out, /Patent PreCheck \u2014 widget\.ts/);
  assert.match(out, /patentability 72\/100/);
  assert.match(out, /Close to Ready/);
  assert.match(out, /Held back by: Novelty/);
  assert.match(out, /Filing readiness \(\u00a7112\): 65\/100/);
  assert.match(out, /Distributed Systems/);
  assert.match(out, /Document departures/);
  assert.match(out, /Prior art consulted: 42/);
  assert.match(out, /review-signup/); // upsell CTA present
});

test('renderScoreText shows a §101 gate failure instead of a score', () => {
  const out = renderScoreText(
    { gate_passed: false, gate_reason: 'abstract idea with no inventive concept' },
    { filename: 'x.ts' },
  );
  assert.match(out, /NOT eligible patentable subject matter/);
  assert.match(out, /abstract idea/);
  assert.doesNotMatch(out, /patentability \d+\/100/);
});

test('renderPriorArtText and renderRejectionPatternsText format agent insight fields', () => {
  const prior = renderPriorArtText(SAMPLE_RESULT, { filename: 'widget.ts', limit: 3 });
  assert.match(prior, /US1234567/);
  assert.match(prior, /similarity 72%/);
  const rej = renderRejectionPatternsText(SAMPLE_RESULT, { filename: 'widget.ts' });
  assert.match(rej, /Risk level: moderate/);
  assert.match(rej, /§103/);
  const legal = renderLegalContextText(SAMPLE_RESULT, { filename: 'widget.ts' });
  assert.match(legal, /CAFC guidance/);
});

test('renderScoreText degrades gracefully on empty/invalid input', () => {
  assert.equal(renderScoreText(null), 'No result.');
  const sparse = renderScoreText({ patentability_score: 50 }, {});
  assert.match(sparse, /patentability 50\/100/);
});

test('renderCorpusSearchText, renderCpcSuggestText, and session/deliverable helpers', () => {
  const corpus = renderCorpusSearchText(SAMPLE_CORPUS_RESULT, { filename: 'limiter.ts' });
  assert.match(corpus, /Corpus search — limiter\.ts/);
  assert.match(corpus, /US1234567/);
  const cpc = renderCpcSuggestText({
    domain: 'networking',
    suggestions: [{ code: 'H04L47/00', label: 'Traffic control', confidence: 'high', reason: 'Primary domain: networking' }],
  });
  assert.match(cpc, /H04L47\/00/);
  const session = renderSessionStatusText({
    report_id: 'PPC-2026-06-15-ABCDE',
    state: 'active',
    review_mode: 'coach',
    session_editable: true,
    session_state: { patentability_score: 72 },
  });
  assert.match(session, /State: active/);
  assert.match(session, /72\/100/);
  const links = renderDeliverablesText({
    reportId: 'PPC-2026-06-15-ABCDE',
    sessionKey: 'secret',
    urls: { filing_packet: 'https://example.test/download' },
  });
  assert.match(links, /filing_packet/);
  assert.match(links, /example\.test/);
});
