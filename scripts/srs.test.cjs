/* Unit tests for docs/assets/js/srs.js — run: node scripts/srs.test.cjs
   Guards the forgetting-curve math AND the progress-preserving migration (carryOrSeedTime
   must never touch seen/correct/wrong/lvl/ema). Keep green before shipping SRS changes. */
const S = require('../docs/assets/js/srs.js');
let fail = 0, pass = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  FAIL:', msg); } }
function fin(x) { return typeof x === 'number' && isFinite(x); }
const NOW = 1_700_000_000_000;              // frozen "now"
const DAY = S.DAY;

// ---- recall ----
ok(Math.abs(S.recall(1, NOW, NOW) - S.R_FRESH) < 1e-9, 'recall Δt=0 → R_FRESH');
ok(Math.abs(S.recall(1, NOW - DAY, NOW) - (S.R_FLOOR + (S.R_FRESH - S.R_FLOOR) * 0.5)) < 1e-9, 'recall Δt=h → midpoint');
ok(S.recall(1, NOW - 100 * DAY, NOW) <= S.R_FLOOR + 1e-6, 'recall far past → floor');
ok(S.recall(1, NOW + DAY, NOW) === S.R_FRESH, 'recall future lastSeen → Δt clamped 0 → fresh (rests)');
// monotonic decreasing in Δt
let prev = 1;
for (let d = 0; d <= 30; d += 3) { const r = S.recall(2, NOW - d * DAY, NOW); ok(r <= prev + 1e-9, 'recall monotonic @' + d); prev = r; ok(fin(r) && r >= S.R_FLOOR && r <= S.R_FRESH, 'recall bounded @' + d); }
// guards: never throw, never NaN
[[NaN, NOW], [1, NaN], [-1, NOW], [0, NOW], [1, 0], ['x', 'y'], [Infinity, NOW]].forEach(([h, ls]) => {
  const r = S.recall(h, ls, NOW); ok(fin(r) && r >= S.R_FLOOR && r <= S.R_FRESH, 'recall guard h=' + h + ' ls=' + ls + ' → ' + r);
});

// ---- srsWeight (division-by-zero is the danger) ----
ok(S.srsWeight(S.R_FRESH) === S.W_MIN, 'srsWeight(fresh) → W_MIN');
ok(S.srsWeight(S.R_FLOOR) === S.W_MAX, 'srsWeight(floor) → W_MAX');
ok(Math.abs(S.srsWeight(0.5) - 1) < 1e-9, 'srsWeight(0.5) = 1');
[0, -1, NaN, Infinity, 1, 2, 'x'].forEach(R => { const w = S.srsWeight(R); ok(fin(w) && w >= S.W_MIN && w <= S.W_MAX, 'srsWeight guard R=' + R + ' → ' + w); });

// ---- updateHalfLife ----
ok(S.updateHalfLife(1, NOW - DAY, NOW, 0.9) > 1, 'spaced success grows h');
ok(S.updateHalfLife(4, NOW - DAY, NOW, 0.15) < 4, 'lapse shrinks h');
ok(S.updateHalfLife(1e9, NOW - DAY, NOW, 1) <= S.H_MAX, 'h clamped to H_MAX');
ok(S.updateHalfLife(0.0001, NOW, NOW, 0) >= S.H_MIN, 'h clamped to H_MIN');
[[NaN, NOW, 0.9], [1, NaN, 0.9], [1, NOW, NaN], [1, NOW, 5], [1, NOW, -3]].forEach(([h, ls, g]) => {
  const nh = S.updateHalfLife(h, ls, NOW, g); ok(fin(nh) && nh >= S.H_MIN && nh <= S.H_MAX, 'updateHalfLife guard → ' + nh);
});

// ---- seeds ----
ok(S.seedQuestionCard({ correct: 10, wrong: 0 }) > S.seedQuestionCard({ correct: 0, wrong: 0 }), 'more correct → longer h');
ok(S.seedQuestionCard({ correct: 0, wrong: 10 }) < S.seedQuestionCard({ correct: 0, wrong: 0 }), 'more wrong → shorter h');
ok(Math.abs(S.seedQuestionCard({ correct: 0, wrong: 0 }) - S.H_NEW) < 1e-9, 'net 0 → H_NEW');
[{}, { correct: 'x' }, { correct: NaN, wrong: null }].forEach(c => { const h = S.seedQuestionCard(c); ok(fin(h) && h >= S.H_MIN && h <= S.H_MAX, 'seedQ guard → ' + h); });
ok(S.seedGradedCard({ ema: 5 }) > S.seedGradedCard({ ema: 3 }), 'ema5 > ema3');
ok(S.seedGradedCard({ ema: 3 }) > S.seedGradedCard({ ema: 1 }), 'ema3 > ema1');
ok(S.seedGradedCard({ lvl: 4 }) === S.seedGradedCard({ ema: 4 }), 'lvl falls back for ema');
[{}, { ema: 'x' }, { ema: 99 }].forEach(c => { const h = S.seedGradedCard(c); ok(fin(h) && h >= S.H_MIN && h <= S.H_MAX, 'seedG guard → ' + h); });

// ---- carryOrSeedTime: PROGRESS SAFETY (counters untouched, idempotent, no NaN) ----
function counters(o) { return JSON.stringify({ seen: o.seen, correct: o.correct, wrong: o.wrong, lvl: o.lvl, ema: o.ema }); }
// seed path (legacy card, no h/lastSeen)
{
  const saved = { seen: 3, correct: 2, wrong: 1 };
  const rec = { seen: 3, correct: 2, wrong: 1 };
  const before = counters(rec);
  S.carryOrSeedTime(saved, rec, S.seedQuestionCard, NOW);
  ok(counters(rec) === before, 'seed: counters untouched');
  ok(fin(rec.h) && rec.h >= S.H_MIN && rec.h <= S.H_MAX, 'seed: h in range');
  ok(rec.lastSeen === NOW - S.MIGRATION_AGE_MS, 'seed: lastSeen dated into past');
  // idempotent with same now
  const rec2 = { seen: 3, correct: 2, wrong: 1 };
  S.carryOrSeedTime(saved, rec2, S.seedQuestionCard, NOW);
  ok(rec2.h === rec.h && rec2.lastSeen === rec.lastSeen, 'seed: idempotent (same now)');
}
// carry path (already has valid h/lastSeen)
{
  const saved = { seen: 5, correct: 4, wrong: 1, h: 3.5, lastSeen: NOW - 2 * DAY };
  const rec = { seen: 5, correct: 4, wrong: 1 };
  S.carryOrSeedTime(saved, rec, S.seedQuestionCard, NOW);
  ok(rec.h === 3.5, 'carry: h verbatim');
  ok(rec.lastSeen === NOW - 2 * DAY, 'carry: lastSeen verbatim');
  // re-carry from the produced rec → still verbatim (idempotent, no drift)
  const rec2 = { seen: 5, correct: 4, wrong: 1 };
  S.carryOrSeedTime(rec, rec2, S.seedQuestionCard, NOW);
  ok(rec2.h === rec.h && rec2.lastSeen === rec.lastSeen, 'carry: idempotent from prior output');
}
// future lastSeen clamped
{
  const saved = { seen: 1, correct: 1, wrong: 0, h: 2, lastSeen: NOW + 999 * DAY };
  const rec = { seen: 1, correct: 1, wrong: 0 };
  S.carryOrSeedTime(saved, rec, S.seedQuestionCard, NOW);
  ok(rec.lastSeen === NOW, 'carry: future lastSeen clamped to now');
}
// corrupt h/lastSeen → seeds, no NaN, counters intact
{
  const saved = { seen: 2, correct: 0, wrong: 2, h: 'abc', lastSeen: null };
  const rec = { seen: 2, correct: 0, wrong: 2 };
  const before = counters(rec);
  S.carryOrSeedTime(saved, rec, S.seedQuestionCard, NOW);
  ok(counters(rec) === before, 'corrupt: counters untouched');
  ok(fin(rec.h) && fin(rec.lastSeen), 'corrupt: h/lastSeen finite (seeded)');
}
// graded card with ema
{
  const saved = { seen: 4, correct: 3, wrong: 0, lvl: 4, ema: 4.2 };
  const rec = { seen: 4, correct: 3, wrong: 0, lvl: 4, ema: 4.2 };
  const before = counters(rec);
  S.carryOrSeedTime(saved, rec, S.seedGradedCard, NOW);
  ok(counters(rec) === before, 'graded seed: counters (incl lvl/ema) untouched');
  ok(fin(rec.h) && rec.lastSeen === NOW - S.MIGRATION_AGE_MS, 'graded seed: h finite, lastSeen past');
}

// ---- review(): lapse must stay DUE (the regression the review caught) ----
{
  const succ = S.review(1, NOW - DAY, NOW, 0.9);
  const lapse = S.review(1, NOW - DAY, NOW, 0.15);
  ok(succ.h > 1 && succ.lastSeen === NOW, 'review success: h grows, anchor = now (rests)');
  ok(lapse.h < 1 && lapse.lastSeen < NOW, 'review lapse: h shrinks, anchor back-dated (due)');
  const wSucc = S.srsWeight(S.recall(succ.h, succ.lastSeen, NOW));
  const wLapse = S.srsWeight(S.recall(lapse.h, lapse.lastSeen, NOW));
  ok(wSucc === S.W_MIN, 'just-mastered rests at min weight');
  ok(wLapse > 3, 'just-missed is strongly due (weight ' + wLapse.toFixed(2) + ')');
  ok(wLapse > wSucc, 'just-missed weight > just-mastered weight (no inversion)');
  const t20 = NOW + 20 * 60 * 1000;
  ok(S.srsWeight(S.recall(lapse.h, lapse.lastSeen, t20)) > 3, 'just-missed still due 20 min later');
  // new card first-answered-wrong: valid finite fields (so a later sanitize carries them) + due
  const nl = S.review(undefined, undefined, NOW, 0.05);
  ok(fin(nl.h) && fin(nl.lastSeen) && nl.lastSeen < NOW, 'review lapse on new card: finite h/lastSeen, due');
  ok(S.srsWeight(S.recall(nl.h, nl.lastSeen, NOW)) > 3, 'new wrong card is due');
  // review output persists through carry (both fields valid → carried verbatim, no re-seed)
  const rec = { seen: 1, correct: 0, wrong: 1 };
  S.carryOrSeedTime({ h: lapse.h, lastSeen: lapse.lastSeen }, rec, S.seedQuestionCard, NOW);
  ok(rec.h === S.updateHalfLife(lapse.h, lapse.lastSeen, NOW, 0) || (rec.h === Math.round(lapse.h*1000)/1000), 'review→carry keeps h');
  ok(rec.lastSeen === lapse.lastSeen, 'review→carry keeps lastSeen (no re-seed)');
}
// ---- lvl3 neutral (grade == SUCCESS leaves h ~unchanged) ----
ok(Math.abs(S.updateHalfLife(2, NOW - 2 * DAY, NOW, S.gradeForRating(3)) - 2) < 0.02, 'lvl3 leaves h ~unchanged');
ok(S.updateHalfLife(2, NOW - 2 * DAY, NOW, S.gradeForRating(4)) > 2.05, 'lvl4 grows h');
ok(S.updateHalfLife(2, NOW - 2 * DAY, NOW, S.gradeForRating(2)) < 1.95, 'lvl2 shrinks h');

// ---- grade maps ----
ok(S.gradeForOutcome('correct') === 0.9 && S.gradeForOutcome('wrong') === 0.15 && S.gradeForOutcome('reveal') === 0.05, 'gradeForOutcome');
ok(S.gradeForRating(5) === 1 && S.gradeForRating(3) === 0.5 && S.gradeForRating(1) === 0, 'gradeForRating');

console.log(`\nsrs.js unit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
