/* End-to-end page tests (jsdom) — run: node tests/e2e/pages.test.mjs
 * Loads each real page from disk (executing srs.js + the shared engine + the inline
 * controller), captures uncaught JS errors, and exercises the progress-preserving flows
 * against the CURRENT UI (real ids: #btn-flip, #fc-rate .conf, #fc-next; keys secplus:*).
 * jsdom-only gaps (layout/scroll/canvas/fonts/CSS) are filtered. Needs `npm install` (jsdom).
 * Exit codes: 0 pass, 1 fail, 3 jsdom not installed (skipped). */
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.resolve(HERE, '..', '..', 'docs');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = await import('jsdom')); }
catch { console.log('e2e SKIPPED — jsdom not installed. Run `npm install` in tests/.'); process.exit(3); }

const IGNORE = /Not implemented|matchMedia|scrollTo|scrollIntoView|scrollBy|HTMLCanvas|getContext|requestAnimationFrame|fonts\.googleapis|gstatic|favicon|Could not load|stylesheet|parse CSS|ResizeObserver|IntersectionObserver|navigation \(except hash|window\.scroll/i;

async function loadPage(rel, seedLS) {
  const file = path.join(DOCS, rel);
  const fileUrl = pathToFileURL(file).href;
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('jsdomError: ' + ((e && e.detail && e.detail.message) || (e && e.message) || e)));
  const dom = await JSDOM.fromFile(file, {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(win) {
      // jsdom blocks localStorage on the file:// (opaque) origin — install an in-memory shim
      // so the real loadState/persist path runs exactly as it would in a browser.
      const store = new Map();
      Object.defineProperty(win, 'localStorage', {
        configurable: true,
        value: {
          getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
          setItem: (k, v) => { store.set(String(k), String(v)); },
          removeItem: (k) => { store.delete(String(k)); },
          clear: () => store.clear(),
          key: (i) => { const ks = [...store.keys()]; return i < ks.length ? ks[i] : null; },
          get length() { return store.size; }
        }
      });
      if (seedLS) for (const k of Object.keys(seedLS)) { try { win.localStorage.setItem(k, seedLS[k]); } catch {} }
      // jsdom lacks fetch: read the page's .txt data from disk (resolve relative to the page)
      win.fetch = (u) => {
        let p; try { p = fileURLToPath(new URL(u, fileUrl)); } catch { p = String(u); }
        return readFile(p, 'utf8').then(d => ({ ok: true, status: 200, text: () => Promise.resolve(d) }),
          () => ({ ok: false, status: 404, text: () => Promise.resolve('') }));
      };
      win.addEventListener('error', e => errors.push('winerror: ' + ((e.error && e.error.message) || e.message)));
      win.addEventListener('unhandledrejection', e => errors.push('rejection: ' + ((e.reason && e.reason.message) || e.reason)));
    }
  });
  await new Promise(r => setTimeout(r, 1500));
  return { dom, window: dom.window, errors: errors.filter(e => !IGNORE.test(e)) };
}

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

// ── 1. every page loads clean ──
const PAGES = [
  ['questions/index.html', 'Questoes', true], ['concepts/index.html', 'Conceitos', true],
  ['acronyms/index.html', 'Siglas', true], ['exam/index.html', 'Simulado', true],
  ['index.html', 'Hub', false], ['methodology/index.html', 'Metodologia', false],
];
for (const [rel, name, srs] of PAGES) {
  const { window: w, errors, dom } = await loadPage(rel);
  ok(errors.length === 0, `${name}: uncaught JS error(s): ` + errors.slice(0, 3).join(' | '));
  ok(!!w.document.body && w.document.body.textContent.trim().length > 150, `${name}: rendered`);
  if (srs) ok(typeof w.SECPLUS_SRS !== 'undefined' && typeof w.SECPLUS_SRS.review === 'function', `${name}: SECPLUS_SRS present`);
  dom.window.close();
}

// ── 2. shared flashcard engine wired on both decks ──
for (const rel of ['concepts/index.html', 'acronyms/index.html']) {
  const { window: w, dom } = await loadPage(rel);
  ok(typeof w.SECPLUS_FC === 'object' && typeof w.SECPLUS_FC.sanitizeCards === 'function', `${rel}: SECPLUS_FC present`);
  ok(typeof w.SECPLUS_FCUTIL === 'object' && typeof w.SECPLUS_FCUTIL.linkifyTerms === 'function', `${rel}: SECPLUS_FCUTIL present`);
  ok(!!w.document.getElementById('term-tip'), `${rel}: term tooltip initialised`);
  dom.window.close();
}

// ── 3. progress preservation: seed old state, drive a review, assert counters intact ──
const DECKS = [
  { rel: 'concepts/index.html', key: 'secplus:conceitos:v1', seed: { '1': { seen: 5, correct: 4, wrong: 1 }, '2': { seen: 2, correct: 2, wrong: 0, lvl: 5, ema: 4.7 }, '3': { seen: 'x', correct: -2, wrong: NaN, lvl: 99, ema: 'z' }, '999999': { seen: 1, correct: 1, wrong: 0 } }, exp: { '1': [5, 4, 1], '2': [2, 2, 0], '3': [0, 0, 0] } },
  { rel: 'acronyms/index.html', key: 'secplus:siglas:v2', seed: { '1': { seen: 7, correct: 3, wrong: 4 }, '2': { seen: 1, correct: 1, wrong: 0, lvl: 4, ema: 4.0 }, '3': { seen: null, correct: 'q', wrong: -9, lvl: 0, ema: 12 }, '999999': { seen: 3, correct: 3, wrong: 0 } }, exp: { '1': [7, 3, 4], '2': [1, 1, 0], '3': [0, 0, 0] } },
];
for (const d of DECKS) {
  const { window: w, errors, dom } = await loadPage(d.rel, { [d.key]: JSON.stringify({ v: 1, cards: d.seed }) });
  const notice = w.document.getElementById('readonly-notice');
  ok(!(notice && notice.classList.contains('show')), `${d.rel}: not read-only on valid seeded state`);
  try {
    const flip = w.document.getElementById('btn-flip'); if (flip) flip.click();
    const conf = w.document.querySelector('#fc-rate .conf[data-level="3"]') || w.document.querySelector('#fc-rate .conf'); if (conf) conf.click();
    const next = w.document.getElementById('fc-next'); if (next) next.click();
  } catch (e) { ok(false, `${d.rel}: drive threw ${e.message}`); }
  await new Promise(r => setTimeout(r, 120));
  let stored = null; try { stored = JSON.parse(w.localStorage.getItem(d.key)); } catch {}
  ok(stored && typeof stored.cards === 'object', `${d.rel}: persisted valid state`);
  if (stored) {
    ok(stored.cards['999999'] === undefined, `${d.rel}: unknown id dropped`);
    for (const id of Object.keys(d.exp)) {
      const r = stored.cards[id], [es, ec, ew] = d.exp[id];
      if (!r) { ok(false, `${d.rel}: lost card ${id}`); continue; }
      const finite = ['seen', 'correct', 'wrong', 'lvl', 'ema', 'h', 'lastSeen'].every(k => r[k] === undefined || (typeof r[k] !== 'number') || Number.isFinite(r[k]));
      ok(finite, `${d.rel}: no NaN/Inf in card ${id}`);
      ok(r.seen >= es && r.correct >= ec && r.wrong >= ew, `${d.rel}: counters not regressed for ${id} (${r.seen}/${r.correct}/${r.wrong} >= ${es}/${ec}/${ew})`);
    }
  }
  ok(errors.length === 0, `${d.rel}: no JS error under seeded state`);
  dom.window.close();
}

// ── 4. questions migration: old v2 progress survives load ──
{
  const key = 'secplus:progress:questoes:v2';
  const old = JSON.stringify({ v: 2, cards: { '1': { seen: 5, correct: 3, wrong: 2 }, '2': { seen: 1, correct: 0, wrong: 1 } } });
  const { window: w, errors, dom } = await loadPage('questions/index.html', { [key]: old });
  ok(errors.length === 0, 'Questoes: no JS error under seeded old progress');
  let kept = false; for (let i = 0; i < w.localStorage.length; i++) if (w.localStorage.key(i) === key) kept = true;
  ok(kept, 'Questoes: progress key retained after migration');
  dom.window.close();
}

console.log(`e2e pages: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
