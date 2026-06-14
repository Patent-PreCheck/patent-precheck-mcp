import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startStub, runMcp } from './helpers.js';

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

test('MCP server initializes and lists all three tools', async () => {
  const { responses } = await runMcp([INIT, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]);
  const init = byId(responses, 1);
  assert.equal(init.result.serverInfo.name, 'patent-precheck');

  const list = byId(responses, 2);
  const names = list.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['precheck_pillars', 'precheck_score', 'precheck_start_review']);
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
        params: { name: 'precheck_start_review', arguments: {} },
      },
    ],
    { env: { PRECHECK_SITE_URL: 'https://example.test' } },
  );
  const res = byId(responses, 6);
  assert.match(res.result.content[0].text, /example\.test\/review-signup/);
  assert.match(res.result.content[0].text, /utm_medium=ai-agent/);
});
