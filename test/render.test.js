import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderPillarsReference, renderScoreText, PILLARS, BANDS } from '../src/render.js';
import { SAMPLE_RESULT } from './helpers.js';

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

test('renderScoreText degrades gracefully on empty/invalid input', () => {
  assert.equal(renderScoreText(null), 'No result.');
  const sparse = renderScoreText({ patentability_score: 50 }, {});
  assert.match(sparse, /patentability 50\/100/);
});
