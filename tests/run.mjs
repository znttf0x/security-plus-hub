/* Test-suite orchestrator — run: npm test  (or: node tests/run.mjs)
 * Runs, in order: the SRS math unit tests, the shared-engine parity/migration unit tests,
 * and the jsdom end-to-end page tests. Exits non-zero if any tier fails. The e2e tier is
 * skipped (not failed) when jsdom is not installed — run `npm install` to enable it. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const TIERS = [
  { name: 'unit: srs.js (forgetting-curve + migration)', file: path.join(ROOT, 'scripts', 'srs.test.cjs') },
  { name: 'unit: flashcards.js (engine parity + preservation)', file: path.join(HERE, 'unit', 'flashcards.test.cjs') },
  { name: 'e2e: pages (jsdom, current UI + progress flows)', file: path.join(HERE, 'e2e', 'pages.test.mjs') },
];

function run(file) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [file], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { out += d; });
    p.on('close', code => resolve({ code, out }));
  });
}

let failed = 0, skipped = 0;
for (const t of TIERS) {
  const { code, out } = await run(t.file);
  const status = code === 0 ? 'PASS' : code === 3 ? 'SKIP' : 'FAIL';
  if (code !== 0 && code !== 3) failed++;
  if (code === 3) skipped++;
  console.log(`\n[${status}] ${t.name}`);
  out.trim().split('\n').forEach(l => console.log('   ' + l));
}

console.log('\n' + '─'.repeat(60));
if (failed === 0) console.log(`ALL GREEN${skipped ? ` (${skipped} tier skipped — run npm install for e2e)` : ''}`);
else console.log(`${failed} TIER(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
