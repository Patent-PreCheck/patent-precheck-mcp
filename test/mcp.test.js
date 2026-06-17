import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startStub, runMcp, SAMPLE_CORPUS_RESULT } from './helpers.js';

const INIT = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test', version: '1' },
  },
};

const LONG_INPUT =
  'A novel distributed rate limiter using a probabilistic sketch to bound memory ' +
  'while reconciling per-key counts via gossip every 50ms across a cluster.';

function byId(responses, id) {
  return responses.find((r) => r.id === id);
}

test('MCP server initializes and lists all tools', async () => {
  const { responses } = await runMcp([INIT, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]);
  const init = byId(responses, 1);
  assert.equal(init.result.serverInfo.name, 'patent-precheck');

  const list = byId(responses, 2);
  const names = list.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    'precheck_compare_to_patent',
    'precheck_cpc_suggest',
    'precheck_deliverables',
    'precheck_legal_context',
    'precheck_lookup_patent',
    'precheck_pillars',
    'precheck_prior_art',
    'precheck_rejection_patterns',
    'precheck_score',
    'precheck_search_corpus',
    'precheck_session_status',
    'precheck_start_review',
  ]);
});

test('precheck_score tool returns a summary plus raw JSON', async () => {
  const stub = await startStub();
  try {
    const { responses } = await runMcp(
      [
        INIT,
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'precheck_score', arguments: { code: LONG_INPUT } },
        },
      ],
      { env: { PRECHECK_API_URL: stub.url, PRECHECK_SITE_URL: 'https://example.test' } },
    );
    const res = byId(responses, 3);
    assert.ok(res.result, 'expected a tool result');
    assert.ok(!res.result.isError, 'should not be an error');
    const texts = res.result.content.map((c) => c.text).join('\n');
    assert.match(texts, /patentability 72\/100/);
    assert.match(texts, /Raw result JSON/);
    assert.equal(stub.requests.length, 1);
  } finally {
    await stub.close();
  }
});

test('precheck_score returns an isError result for too-short input (no network)', async () => {
  const { responses } = await runMcp([
    INIT,
    {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'precheck_score', arguments: { code: 'short' } },
    },
  ]);
  const res = byId(responses, 4);
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /at least 10 characters/);
});

test('precheck_pillars returns the reference without a network call', async () => {
  const { responses } = await runMcp([
    INIT,
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'precheck_pillars', arguments: {} } },
  ]);
  const res = byId(responses, 5);
  assert.match(res.result.content[0].text, /Pillars:/);
});

test('precheck_start_review returns the attributed signup URL', async () => {
  const { responses } = await runMcp(
    [
      INIT,
      {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: { name: 'precheck_start_review', arguments: { promo: 'Beta' } },
      },
    ],
    { env: { PRECHECK_SITE_URL: 'https://example.test' } },
  );
  const res = byId(responses, 6);
  assert.match(res.result.content[0].text, /example\.test\/review-signup/);
  assert.match(res.result.content[0].text, /promo=Beta/);
  assert.match(res.result.content[0].text, /utm_medium=ai-agent/);
});

test('precheck_prior_art returns formatted matches', async () => {
  const stub = await startStub();
  try {
    const { responses } = await runMcp(
      [
        INIT,
        {
          jsonrpc: '2.0',
          id: 7,
          method: 'tools/call',
          params: { name: 'precheck_prior_art', arguments: { code: LONG_INPUT, limit: 3 } },
        },
      ],
      { env: { PRECHECK_API_URL: stub.url, PRECHECK_SITE_URL: 'https://example.test' } },
    );
    const res = byId(responses, 7);
    assert.ok(!res.result.isError);
    assert.match(res.result.content[0].text, /Prior art/);
    assert.match(res.result.content[0].text, /US1234567/);
    assert.equal(stub.requests.length, 1);
    assert.equal(stub.requests[0].body.agent_insights, true);
    assert.equal(stub.requests[0].body.prior_art_limit, 3);
  } finally {
    await stub.close();
  }
});

test('precheck_rejection_patterns returns risk summary', async () => {
  const stub = await startStub();
  try {
    const { responses } = await runMcp(
      [
        INIT,
        {
          jsonrpc: '2.0',
          id: 8,
          method: 'tools/call',
          params: { name: 'precheck_rejection_patterns', arguments: { code: LONG_INPUT } },
        },
      ],
      { env: { PRECHECK_API_URL: stub.url } },
    );
    const res = byId(responses, 8);
    assert.match(res.result.content[0].text, /Risk level: moderate/);
    assert.match(res.result.content[0].text, /§103/);
  } finally {
    await stub.close();
  }
});

test('precheck_cpc_suggest returns offline CPC hints', async () => {
  const { responses } = await runMcp([
    INIT,
    {
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: { name: 'precheck_cpc_suggest', arguments: { code: LONG_INPUT } },
    },
  ]);
  const res = byId(responses, 9);
  assert.ok(!res.result.isError);
  assert.match(res.result.content[0].text, /CPC classification suggestions/);
  assert.match(res.result.content[0].text, /G06F9\/50/);
});

test('precheck_search_corpus returns formatted matches', async () => {
  const stub = await startStub({ body: SAMPLE_CORPUS_RESULT, path: '/search-corpus' });
  try {
    const { responses } = await runMcp(
      [
        INIT,
        {
          jsonrpc: '2.0',
          id: 10,
          method: 'tools/call',
          params: { name: 'precheck_search_corpus', arguments: { code: LONG_INPUT, limit: 5 } },
        },
      ],
      { env: { PRECHECK_SEARCH_URL: stub.url } },
    );
    const res = byId(responses, 10);
    assert.ok(!res.result.isError);
    assert.match(res.result.content[0].text, /Corpus search/);
    assert.match(res.result.content[0].text, /US1234567/);
    assert.equal(stub.requests.length, 1);
  } finally {
    await stub.close();
  }
});

test('precheck_deliverables returns download URLs', async () => {
  const { responses } = await runMcp(
    [
      INIT,
      {
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'precheck_deliverables',
          arguments: { report_id: 'PPC-2026-06-15-ABCDE', session_key: 'test-key' },
        },
      },
    ],
    { env: { PRECHECK_API_URL: 'https://example.test/.netlify/functions/analyze' } },
  );
  const res = byId(responses, 11);
  assert.match(res.result.content[0].text, /filing_packet/);
  assert.match(res.result.content[0].text, /report_id=PPC-2026-06-15-ABCDE/);
  assert.match(res.result.content[0].text, /k=test-key/);
});

test('precheck_lookup_patent returns formatted metadata', async () => {
  const stub = await startStub({
    path: '/lookup-patent',
    body: {
      query: 'US1234567B2',
      parsed: { display: 'US1234567B2' },
      odp_available: true,
      odp_found: true,
      odp: { title: 'Distributed throttling system', patent_number: '1234567' },
      uspto_public_url: 'https://patents.google.com/patent/US1234567B2',
    },
  });
  try {
    const { responses } = await runMcp(
      [
        INIT,
        {
          jsonrpc: '2.0',
          id: 12,
          method: 'tools/call',
          params: { name: 'precheck_lookup_patent', arguments: { patent_id: 'US1234567B2' } },
        },
      ],
      { env: { PRECHECK_LOOKUP_URL: stub.url } },
    );
    const res = byId(responses, 12);
    assert.ok(!res.result.isError);
    assert.match(res.result.content[0].text, /Patent lookup/);
    assert.match(res.result.content[0].text, /Distributed throttling/);
    assert.equal(stub.requests.length, 1);
  } finally {
    await stub.close();
  }
});

test('precheck_compare_to_patent returns similarity analysis', async () => {
  const stub = await startStub({
    path: '/compare-to-patent',
    body: {
      patent_query: 'US1234567B2',
      patent: { display_id: 'US1234567B2', title: 'Distributed throttling system' },
      relevance_pct: 71,
      prior_art_analysis: {
        prior_art_risk: 'medium',
        summary_sentence: 'Moderate corpus overlap.',
        closest_references: [{ title: 'Distributed throttling system', likely_statute: '§103' }],
      },
    },
  });
  try {
    const { responses } = await runMcp(
      [
        INIT,
        {
          jsonrpc: '2.0',
          id: 13,
          method: 'tools/call',
          params: {
            name: 'precheck_compare_to_patent',
            arguments: { code: LONG_INPUT, patent_id: 'US1234567B2' },
          },
        },
      ],
      { env: { PRECHECK_COMPARE_URL: stub.url } },
    );
    const res = byId(responses, 13);
    assert.ok(!res.result.isError);
    assert.match(res.result.content[0].text, /Compare to patent/);
    assert.match(res.result.content[0].text, /71%/);
    assert.equal(stub.requests.length, 1);
  } finally {
    await stub.close();
  }
});
