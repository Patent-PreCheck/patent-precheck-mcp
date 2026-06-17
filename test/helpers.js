// Shared test helpers: a stub analyze server and subprocess runners for the
// CLI and the MCP stdio server. Kept out of the *.test.js glob so the runner
// does not execute it as a test file.

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BIN = path.join(here, '..', 'bin', 'precheck.js');

// A canned analyze payload that exercises every branch of renderScoreText.
export const SAMPLE_RESULT = {
  patentability_score: 72,
  patentability_band_label: 'Close to Ready',
  patentability_held_back_by: 'novelty',
  filing_readiness_score: 65,
  filing_readiness_band_label: 'Building',
  technology_domain: 'Distributed Systems',
  pillar_scores: {
    eligibility: 80,
    novelty: 55,
    non_obvious: 70,
    utility: 75,
    filing_readiness: 65,
  },
  top_opportunities: [
    { pillar: 'novelty', action: 'Document departures from the closest references' },
  ],
  prior_art_match_count: 42,
  prior_art_teaser: [
    {
      title: 'US1234567 — distributed throttling',
      source: 'uspto-patentsview',
      similarity: 0.72,
      url: 'https://example.com/patent',
    },
  ],
  rejection_neighbors: [
    {
      title: 'Final rejection — obviousness',
      rejection_basis: '§103 non-obviousness',
      similarity: 68,
      source_id: 'uspto-office-actions',
      snippet: 'The combination of known elements would have been obvious.',
    },
  ],
  examination_risk_summary: {
    risk_level: 'moderate',
    primary_basis: '§103 non-obviousness',
    neighbor_count: 1,
  },
  legal_guidance_snippet: 'Recent CAFC guidance emphasizes technical improvement for §101.',
  gate_passed: true,
};

/**
 * Start a stub analyze endpoint.
 * @param {{status?: number, body?: any, capture?: object}} opts
 * @returns {Promise<{url: string, close: () => Promise<void>, requests: object[]}>}
 */
export function startStub({ status = 200, body = SAMPLE_RESULT, path = '/analyze' } = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let chunks = '';
    req.on('data', (c) => (chunks += c));
    req.on('end', () => {
      let parsed = null;
      try {
        parsed = JSON.parse(chunks);
      } catch {
        /* leave null */
      }
      requests.push({ method: req.method, url: req.url, body: parsed });
      const payload = typeof body === 'string' ? body : JSON.stringify(body);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(payload);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}${path}`,
        requests,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

export const SAMPLE_CORPUS_RESULT = {
  tier: 'free',
  technology_domain: 'networking',
  prior_art_match_count: 3,
  prior_art_status: 'ok',
  matches: [
    {
      title: 'US1234567 — distributed throttling',
      source: 'uspto-patentsview',
      similarity: 0.72,
      url: 'https://example.com/patent',
    },
  ],
};

/**
 * Run the CLI as a subprocess.
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
export function runCli(args, { env = {}, input = null } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    if (input != null) child.stdin.write(input);
    child.stdin.end();
  });
}

/**
 * Drive the MCP stdio server with a sequence of JSON-RPC requests and collect
 * the parsed response objects. Closes stdin after sending so the server exits.
 * @returns {Promise<{responses: object[], stderr: string}>}
 */
export function runMcp(requests, { env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, 'mcp'], {
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', () => {
      const responses = stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      resolve({ responses, stderr });
    });
    for (const r of requests) child.stdin.write(JSON.stringify(r) + '\n');
    child.stdin.end();
  });
}
