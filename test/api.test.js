import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  callAnalyze,
  callSearchCorpus,
  callReviewSession,
  downloadArtifactUrl,
  reviewSignupUrl,
  searchCorpusUrl,
  functionsBaseUrl,
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

test('searchCorpusUrl and functionsBaseUrl honor env overrides', () => {
  const prev = { ...process.env };
  try {
    process.env.PRECHECK_SEARCH_URL = 'https://example.test/search-corpus';
    process.env.PRECHECK_API_URL = 'https://example.test/analyze';
    assert.equal(searchCorpusUrl(), 'https://example.test/search-corpus');
    assert.equal(functionsBaseUrl(), 'https://example.test');
  } finally {
    process.env = prev;
  }
});

test('downloadArtifactUrl builds a signed download link', () => {
  const url = downloadArtifactUrl({
    reportId: 'PPC-2026-06-15-ABCDE',
    artifact: 'filing_packet',
    sessionKey: 'secret',
  });
  const u = new URL(url);
  assert.match(u.pathname, /download-artifact/);
  assert.equal(u.searchParams.get('report_id'), 'PPC-2026-06-15-ABCDE');
  assert.equal(u.searchParams.get('artifact'), 'filing_packet');
  assert.equal(u.searchParams.get('k'), 'secret');
});

test('callSearchCorpus posts to the search endpoint', async () => {
  const orig = globalThis.fetch;
  let captured;
  globalThis.fetch = async (_url, init) => {
    captured = { url: _url, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ prior_art_match_count: 1, matches: [] }), { status: 200 });
  };
  try {
    const res = await callSearchCorpus({ code: 'a sufficiently long invention description', limit: 8 });
    assert.equal(res.ok, true);
    assert.equal(captured.body.limit, 8);
  } finally {
    globalThis.fetch = orig;
  }
});

test('callReviewSession requires report_id and session_key', async () => {
  const res = await callReviewSession({ action: 'status' });
  assert.equal(res.ok, false);
  assert.match(res.error, /report_id and session_key/);
});
