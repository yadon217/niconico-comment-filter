#!/usr/bin/env node
/**
 * Cross-platform launcher for auto-git-sync.sh (Cursor stop hook).
 *
 * hooks.json uses: node .cursor/hooks/auto-git-sync.mjs
 *
 * - Linux/macOS: bash from PATH
 * - Windows: Git Bash if installed, else bash on PATH
 *
 * Do not point hooks.json at .sh directly on Windows (Cursor may open it in the editor).
 * auto-git-sync.cmd remains a manual fallback on Windows.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const script = join(__dirname, 'auto-git-sync.sh');

function resolveBash() {
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    ];
    for (const p of candidates) {
      if (existsSync(p)) return p;
    }
  }
  return 'bash';
}

let input = '';
try {
  input = readFileSync(0, 'utf8');
} catch {
  // fail-open: same as auto-git-sync.sh
}

const bash = resolveBash();
spawnSync(bash, [script], {
  input,
  stdio: ['pipe', 'inherit', 'inherit'],
  windowsHide: true,
});

process.exit(0);
