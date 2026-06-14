import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startStub, runCli, SAMPLE_RESULT } from './helpers.js';

const LONG_INPUT =
  'A novel distributed rate limiter using a probabilistic sketch to bound memory ' +
  'while reconciling per-key counts via gossip every 50ms across a cluster.';

test('score (text) prints a report and exits 0', async () => {
  const stub = await startStub();
  try {
    const { code, stdout } = await runCli(['score', '-'], {
      env: { PRECHECK_API_URL: stub.url, PRECHECK_SITE_URL: 'https://example.test' },
      input: LONG_INPUT,
    });
    assert.equal(code, 0);
    assert.match(stdout, /patentability 72\/100/);
    assert.match(stdout, /Close to Ready/);
    // The request actually reached our stub with the input body.
    assert.equal(stub.requests.length, 1);
    assert.equal(stub.requests[0].body.code, LONG_INPUT);
  } finally {
    await stub.close();
  }
});

test('score --format json emits raw JSON on stdout', async () => {
  const stub = await startStub();
  try {
    const { code, stdout } = await runCli(['score', '-', '--format', 'json'], {
      env: { PRECHECK_API_URL: stub.url },
      input: LONG_INPUT,
    });
    assert.equal(code, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.patentability_score, 72);
  } finally {
    await stub.close();
  }
});

test('score --min-score above the result exits 4 (CI gate)', async () => {
  const stub = await startStub();
  try {
    const { code, stderr } = await runCli(['score', '-', '--min-score', '80'], {
      env: { PRECHECK_API_URL: stub.url },
      input: LONG_INPUT,
    });
    assert.equal(code, 4);
    assert.match(stderr, /below --min-score 80/);
  } finally {
    await stub.close();
  }
});

test('score --min-score below the result exits 0', async () => {
  const stub = await startStub();
  try {
    const { code } = await runCli(['score', '-', '--min-score', '60'], {
      env: { PRECHECK_API_URL: stub.url },
      input: LONG_INPUT,
    });
    assert.equal(code, 0);
  } finally {
    await stub.close();
  }
});

test('score on §101-gate-failed subject matter exits 3', async () => {
  const stub = await startStub({
    body: { gate_passed: false, gate_reason: 'abstract idea' },
  });
  try {
    const { code, stdout } = await runCli(['score', '-'], {
      env: { PRECHECK_API_URL: stub.url },
      input: LONG_INPUT,
    });
    assert.equal(code, 3);
    assert.match(stdout, /NOT eligible/);
  } finally {
    await stub.close();
  }
});

test('score surfaces an HTTP error from the API and exits 2', async () => {
  const stub = await startStub({ status: 500, body: { error: 'engine down' } });
  try {
    const { code, stderr } = await runCli(['score', '-'], {
      env: { PRECHECK_API_URL: stub.url },
      input: LONG_INPUT,
    });
    assert.equal(code, 2);
    assert.match(stderr, /engine down/);
  } finally {
    await stub.close();
  }
});

test('score with a missing file exits 1', async () => {
  const { code, stderr } = await runCli(['score', '/no/such/file.ts'], {
    env: { PRECHECK_API_URL: 'http://127.0.0.1:1/analyze' },
  });
  assert.equal(code, 1);
  assert.match(stderr, /File not found/);
});

test('score with no input prints usage and exits 1', async () => {
  const { code, stderr } = await runCli(['score']);
  assert.equal(code, 1);
  assert.match(stderr, /Usage:/);
});

test('pillars works offline and exits 0', async () => {
  const { code, stdout } = await runCli(['pillars']);
  assert.equal(code, 0);
  assert.match(stdout, /Pillars:/);
  assert.match(stdout, /Eligibility/);
});

test('review prints the signup URL and exits 0', async () => {
  const { code, stdout } = await runCli(['review'], {
    env: { PRECHECK_SITE_URL: 'https://example.test' },
  });
  assert.equal(code, 0);
  assert.match(stdout, /example\.test\/review-signup/);
  assert.match(stdout, /utm_source=patent-precheck-mcp/);
});

test('--version prints a version and exits 0', async () => {
  const { code, stdout } = await runCli(['--version']);
  assert.equal(code, 0);
  assert.match(stdout.trim(), /^\d+\.\d+\.\d+/);
});

test('unknown command prints usage and exits 1', async () => {
  const { code, stderr } = await runCli(['frobnicate']);
  assert.equal(code, 1);
  assert.match(stderr, /Unknown command/);
});
