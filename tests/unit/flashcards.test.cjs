/* Unit tests for docs/assets/js/flashcards.js — run: node tests/unit/flashcards.test.cjs
   Proves the shared state engine is behavior-identical to the old inline controllers and
   never corrupts progress: sanitizeCards/nextRecord/weightOf are checked against a verbatim
   reference copy of the original logic across legacy/NaN/negative/unknown-id/ema-range cases,
   plus idempotency. Keep green before shipping any SRS change. */
'use strict';
const SRS = require('../../docs/assets/js/srs.js');
global.SECPLUS_SRS = SRS;                      // flashcards.js resolves the SECPLUS_SRS global
const FC = require('../../docs/assets/js/flashcards.js');

const NOW = 1756000000000, ALPHA = 0.5, W_NEW = 3.0;
let pass = 0, fail = 0, nan = 0;

// ---- verbatim reference of the OLD inline logic (concepts/acronyms, gate injected) ----
function oClamp(n) { n = Math.round(n); return (n >= 1 && n <= 5) ? n : null; }
function oDerived(c, w) { const a = c + w; if (a <= 0) return null; const r = c / a; if (r >= 0.85) return 4; if (r >= 0.60) return 3; if (r >= 0.35) return 2; return 1; }
function oSanitize(cards, known, now) {
  const clean = {}; if (!cards || typeof cards !== 'object') return clean;
  for (const k in cards) {
    if (!known(k)) continue;
    const c = cards[k] || {};
    let s = parseInt(c.seen, 10), co = parseInt(c.correct, 10), wr = parseInt(c.wrong, 10);
    if (!Number.isFinite(s) || s < 0) s = 0;
    if (!Number.isFinite(co) || co < 0) co = 0;
    if (!Number.isFinite(wr) || wr < 0) wr = 0;
    const rec = { seen: s, correct: co, wrong: wr };
    let lvl = oClamp(c.lvl); if (lvl == null) lvl = oDerived(co, wr);
    if (lvl != null) { rec.lvl = lvl; let e = parseFloat(c.ema); if (!Number.isFinite(e) || e < 1 || e > 5) e = lvl; rec.ema = Math.round(e * 10) / 10; }
    SRS.carryOrSeedTime(c, rec, SRS.seedGradedCard, now);
    clean[k] = rec;
  }
  return clean;
}
function oCommit(prev, lvl, now) {
  prev = prev || { seen: 0, correct: 0, wrong: 0 };
  const ema = (prev.ema == null) ? lvl : Math.round((prev.ema + ALPHA * (lvl - prev.ema)) * 10) / 10;
  const sr = SRS.review(prev.h, prev.lastSeen, now, SRS.gradeForRating(lvl));
  return { seen: prev.seen + 1, correct: prev.correct + (lvl >= 4 ? 1 : 0), wrong: prev.wrong + (lvl <= 2 ? 1 : 0), lvl, ema, h: sr.h, lastSeen: sr.lastSeen };
}
function oWeight(st, now) { if (!st || !st.seen || st.ema == null) return W_NEW; return SRS.srsWeight(SRS.recall(st.h, st.lastSeen, now)); }

const KEYS = ['seen', 'correct', 'wrong', 'lvl', 'ema', 'h', 'lastSeen'];
function eq(a, b) { for (const k of KEYS) { if (a[k] === undefined && b[k] === undefined) continue; if (a[k] !== b[k] && !(Number.isNaN(a[k]) && Number.isNaN(b[k]))) return false; } return true; }
function hasNaN(r) { return KEYS.some(k => r[k] !== undefined && typeof r[k] === 'number' && Number.isNaN(r[k])); }
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL:', m); } }

// ---- sanitizeCards parity + counter preservation (both gates) ----
const known = new Set(['a', 'b', 'c', 'x1', 'x2', '10', '20', 'withTime']);
const isKnown = (k) => known.has(k);
const seed = {
  a: { seen: 5, correct: 4, wrong: 1 }, b: { seen: 3, correct: 1, wrong: 2 }, c: { seen: 0, correct: 0, wrong: 0 },
  x1: { seen: 2, correct: 2, wrong: 0, lvl: 5, ema: 4.7 }, x2: { seen: 9, correct: 9, wrong: 0, lvl: 4, ema: 9.9 },
  '10': { seen: '7', correct: 'x', wrong: -3 }, '20': { seen: NaN, correct: 3, wrong: 1, lvl: 99, ema: 'z' },
  UNKNOWN: { seen: 1, correct: 1, wrong: 0 },
  withTime: { seen: 4, correct: 2, wrong: 2, lvl: 3, ema: 3.0, h: 5.5, lastSeen: NOW - 86400000 }
};
const oldOut = oSanitize(seed, isKnown, NOW);
const newOut = FC.sanitizeCards(seed, isKnown, NOW);
for (const k of new Set([...Object.keys(oldOut), ...Object.keys(newOut)])) {
  const o = oldOut[k], n = newOut[k];
  if (!o || !n) { ok(false, 'sanitize key mismatch ' + k); continue; }
  if (hasNaN(n)) { nan++; ok(false, 'NaN in ' + k); continue; }
  ok(eq(o, n), 'sanitize parity ' + k);
}
ok(newOut.UNKNOWN === undefined, 'unknown id dropped by gate');
// counters never invented/lost: known valid ids keep exact tallies
ok(newOut.a.seen === 5 && newOut.a.correct === 4 && newOut.a.wrong === 1, 'counters preserved (a)');
ok(newOut['10'].seen === 7 && newOut['10'].correct === 0 && newOut['10'].wrong === 0, 'bad counters coerced (10)');

// ---- nextRecord parity ----
const prevs = [null, { seen: 0, correct: 0, wrong: 0 }, { seen: 3, correct: 2, wrong: 1, lvl: 3, ema: 3.2, h: 4, lastSeen: NOW - 100000 }, { seen: 10, correct: 8, wrong: 2, lvl: 4, ema: 4.6, h: 12, lastSeen: NOW - 5000000 }];
for (const p of prevs) for (let lvl = 1; lvl <= 5; lvl++) {
  const n = FC.nextRecord(p, lvl, NOW);
  if (hasNaN(n)) { nan++; ok(false, 'NaN nextRecord lvl ' + lvl); continue; }
  ok(eq(oCommit(p, lvl, NOW), n), 'nextRecord parity prev=' + JSON.stringify(p) + ' lvl=' + lvl);
}

// ---- weightOf parity ----
for (const st of [null, { seen: 0 }, { seen: 1, correct: 1, wrong: 0, lvl: 3, ema: 3, h: 6, lastSeen: NOW - 200000 }, ...Object.values(newOut)]) {
  const n = FC.weightOf(st, NOW, W_NEW);
  if (Number.isNaN(n)) { nan++; ok(false, 'NaN weight'); }
  ok(oWeight(st, NOW) === n, 'weightOf parity');
}

// ---- idempotency ----
const once = FC.sanitizeCards(seed, isKnown, NOW), twice = FC.sanitizeCards(once, isKnown, NOW);
for (const k of Object.keys(once)) ok(eq(once[k], twice[k]), 'idempotent ' + k);

console.log(`flashcards.js: ${pass} passed, ${fail} failed, ${nan} NaN`);
process.exit(fail === 0 && nan === 0 ? 0 : 1);
