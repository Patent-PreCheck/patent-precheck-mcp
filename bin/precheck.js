#!/usr/bin/env node
// Patent PreCheck CLI.
//
//   precheck score <file|->   Score a file (or stdin) for patentability
//   precheck pillars          Print the scoring reference (pillars + bands)
//   precheck review           Print the Interactive Code Review signup URL
//   precheck mcp              Run as an MCP server over stdio (for AI agents)
//
// stdout carries data; progress/errors go to stderr; exit codes are typed so
// the command composes in scripts and CI.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { callAnalyze, reviewSignupUrl } from '../src/api.js';
import { renderScoreText, renderPillarsReference } from '../src/render.js';
import { runStdio } from '../src/server.js';

const EXIT_OK = 0;
const EXIT_USAGE = 1;
const EXIT_REQUEST = 2;
const EXIT_GATE = 3;
const EXIT_BELOW_MIN = 4;

function version() {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    return JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version;
  } catch {
    return '0.0.0';
  }
}

function usage() {
  process.stderr.write(
    `precheck \u2014 Patent PreCheck CLI + MCP server (v${version()})\n\n` +
      'Usage:\n' +
      '  precheck score <file|->  [--filename name.ext] [--tier free] [--format text|json] [--min-score N]\n' +
      '  precheck pillars\n' +
      '  precheck review\n' +
      '  precheck mcp\n\n' +
      'Env: PRECHECK_API_URL, PRECHECK_TIER, PRECHECK_SITE_URL, PRECHECK_AI_ASSISTANCE\n',
  );
}

function parseScoreArgs(argv) {
  const opts = { input: null, filename: null, tier: undefined, format: 'text', minScore: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--filename') opts.filename = argv[++i];
    else if (a === '--tier') opts.tier = argv[++i];
    else if (a === '--format') opts.format = argv[++i];
    else if (a === '--min-score') opts.minScore = Number(argv[++i]);
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (!a.startsWith('-') || a === '-') opts.input = a;
  }
  return opts;
}

function readStdin() {
  return fs.readFileSync(0, 'utf8');
}

async function cmdScore(argv) {
  const opts = parseScoreArgs(argv);
  if (opts.help || !opts.input) {
    usage();
    process.exit(opts.help ? EXIT_OK : EXIT_USAGE);
  }

  let code;
  let filename = opts.filename;
  if (opts.input === '-') {
    code = readStdin();
    if (!filename) filename = 'stdin.txt';
  } else {
    const filePath = path.resolve(opts.input);
    if (!fs.existsSync(filePath)) {
      process.stderr.write(`File not found: ${filePath}\n`);
      process.exit(EXIT_USAGE);
    }
    code = fs.readFileSync(filePath, 'utf8');
    if (!filename) filename = path.basename(filePath);
  }

  process.stderr.write('Analyzing with Patent PreCheck\u2026\n');
  const { ok, data, error } = await callAnalyze({ code, filename, tier: opts.tier });
  if (!ok) {
    process.stderr.write(`${error}\n`);
    process.exit(EXIT_REQUEST);
  }

  if (opts.format === 'json') {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  } else {
    process.stdout.write(renderScoreText(data, { filename }) + '\n');
  }

  if (data.gate_passed === false) process.exit(EXIT_GATE);

  const score = Number(data.patentability_score ?? data.overall_score);
  if (Number.isFinite(opts.minScore) && Number.isFinite(score) && score < opts.minScore) {
    process.stderr.write(`Patentability score ${score} is below --min-score ${opts.minScore}\n`);
    process.exit(EXIT_BELOW_MIN);
  }
  process.exit(EXIT_OK);
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  switch (cmd) {
    case 'score':
      await cmdScore(rest);
      break;
    case 'pillars':
      process.stdout.write(renderPillarsReference() + '\n');
      break;
    case 'review':
      process.stdout.write(reviewSignupUrl() + '\n');
      break;
    case 'mcp':
      await runStdio();
      break;
    case '--version':
    case '-V':
      process.stdout.write(version() + '\n');
      break;
    case '--help':
    case '-h':
    case undefined:
      usage();
      process.exit(cmd === undefined ? EXIT_USAGE : EXIT_OK);
      break;
    default:
      process.stderr.write(`Unknown command: ${cmd}\n`);
      usage();
      process.exit(EXIT_USAGE);
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(EXIT_REQUEST);
});
