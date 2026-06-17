// Resolve invention text from MCP tool arguments (inline code or local path).

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { MIN_CODE_CHARS } from './api.js';

/**
 * @returns {Promise<{ ok: true, text: string, filename: string | undefined } | { ok: false, error: string }>}
 */
export async function resolveInventionInput({ code, path: filePath, filename } = {}) {
  let text = typeof code === 'string' ? code : '';
  let name = typeof filename === 'string' ? filename : undefined;

  if (!text && filePath) {
    try {
      text = await readFile(filePath, 'utf8');
    } catch (err) {
      return { ok: false, error: `Could not read file "${filePath}": ${err.message}` };
    }
    if (!name) name = path.basename(filePath);
  }

  if (!text || text.trim().length < MIN_CODE_CHARS) {
    return {
      ok: false,
      error: `Provide at least ${MIN_CODE_CHARS} characters via "code" or a readable "path".`,
    };
  }

  return { ok: true, text, filename: name };
}
