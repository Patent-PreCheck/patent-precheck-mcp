import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  callAnalyze,
  reviewSignupUrl,
  apiUrl,
  siteUrl,
  defaultTier,
  MIN_CODE_CHARS,
} from '../src/api.js';

test('apiUrl / siteUrl / defaultTier honor env overrides', () => {
  const prev = { ...process.env };
  try {
    process.env.PRECHECK_API_URL = 'https://example.test/analyze';
    process.env.PRECHECK_SITE_URL = 'https://example.test';
    process.env.PRECHECK_TIER = 'enterprise';
    assert.equal(apiUrl(), 'https://example.test/analyze');
    assert.equal(siteUrl(), 'https://example.test');
    assert.equal(defaultTier(), 'enterprise');
  } finally {
    process.env = prev;
  }
});

test('reviewSignupUrl carries UTM attribution and medium', () => {
  const url = reviewSignupUrl({ medium: 'ai-agent' });
  const u = new URL(url);
  assert.equal(u.searchParams.get('utm_source'), 'patent-precheck-mcp');
  assert.equal(u.searchParams.get('utm_medium'), 'ai-agent');
  assert.equal(u.searchParams.get('utm_campaign'), 'in-tool-precheck');
  assert.match(u.pathname, /review-signup/);
});

test('callAnalyze rejects input below the minimum length without a network call', async () => {
  let fetched = false;
  const orig = globalThis.fetch;
  globalThis.fetch = async () => {
    fetched = true;
    throw new Error('should not be called');
  };
  try {
    const res = await callAnalyze({ code: 'too short' });
    assert.equal(res.ok, false);
    assert.equal(res.status, 0);
    assert.match(res.error, new RegExp(String(MIN_CODE_CHARS)));
    assert.equal(fetched, false);
  } finally {
    globalThis.fetch = orig;
  }
});

test('callAnalyze returns parsed data on a 200 response', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ patentability_score: 80 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  try {
    const res = await callAnalyze({ code: 'a sufficiently long invention description' });
    assert.equal(res.ok, true);
    assert.equal(res.data.patentability_score, 80);
    assert.equal(res.error, null);
  } finally {
    globalThis.fetch = orig;
  }
});

test('callAnalyze surfaces HTTP error status and message', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: 'Upgrade required' }), { status: 402 });
  try {
    const res = await callAnalyze({ code: 'a sufficiently long invention description' });
    assert.equal(res.ok, false);
    assert.equal(res.status, 402);
    assert.match(res.error, /Upgrade required/);
  } finally {
    globalThis.fetch = orig;
  }
});

test('callAnalyze handles a non-JSON response body', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html>502</html>', { status: 502 });
  try {
    const res = await callAnalyze({ code: 'a sufficiently long invention description' });
    assert.equal(res.ok, false);
    assert.match(res.error, /non-JSON/);
  } finally {
    globalThis.fetch = orig;
  }
});
