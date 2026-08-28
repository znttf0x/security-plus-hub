/* SECPLUS_SRS — shared spaced-repetition core (forgetting-curve / BHL-R model).
 *
 * Pure math + a progress-preserving migration seed, used by all three study
 * engines (questions, acronyms, concepts). No DOM, no localStorage, no clock:
 * `now` is always passed in, so the same functions run in the browser and in a
 * headless Node test/lab (module.exports below).
 *
 * Model: each seen card carries a memory half-life `h` (days) and `lastSeen`
 * (epoch ms). Retrievability now:  R = floor + (fresh - floor) * 2^(-Δt/h).
 * What resurfaces is drawn by the odds of failure (1 - R) / R: the nearly
 * forgotten returns, the mastered rests. `h` grows spacing-aware on a spaced
 * success and shrinks on a lapse.
 *
 * PROGRESS SAFETY (owner's hard rule — never reset/corrupt saved progress):
 *  - This module NEVER reads or writes seen/correct/wrong/lvl/ema — the engines
 *    keep owning those. It only ATTACHES h/lastSeen.
 *  - Every value entering the math is finiteness/range guarded; bad input can
 *    never throw or produce NaN/Infinity (it degrades to the floor).
 *  - The migration seed is deterministic in the counters (idempotent) and dates
 *    lastSeen into the PAST (now - AGE), so legacy cards are "due" with real
 *    spacing instead of being suppressed as freshly-seen.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;   // Node (tests / lab)
  root.SECPLUS_SRS = api;                                                    // browser
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---- tunables (kept in one place; changing them only shifts frequency, never progress) ----
  var DAY = 86400000;          // ms per day
  var H_NEW = 1;               // days: half-life a just-seen card starts at
  var H_MIN = 0.007;           // ~10 min floor
  var H_MAX = 365;             // 1 year ceiling
  var R_FLOOR = 0.05;          // retrievability floor (never 0 → weight can't blow up)
  var R_FRESH = 0.90;          // retrievability right after a review
  var W_MIN = 0.15, W_MAX = 8; // draw-weight clamp (matches the old engine range)
  var SUCCESS = 0.5;           // grade >= this counts as a successful recall
  var GROWTH = 1.1;            // half-life growth strength on success
  var SPACE_CAP = 4;           // cap on the spacing bonus (Δt/h)
  var LAPSE_MIN = 0.2, LAPSE_MAX = 0.6; // half-life shrink band on a lapse (by grade)
  var LAPSE_DUE = 3;                     // on a lapse, back-date lastSeen to ~3 half-lives ago → due now
  var MIGRATION_AGE_MS = 2 * DAY;       // legacy cards seeded as last seen ~2 days ago (modest, no flood)

  function num(x) { return typeof x === 'number' ? x : (typeof x === 'string' ? parseFloat(x) : NaN); }
  function finitePos(x, dflt) { x = num(x); return (isFinite(x) && x > 0) ? x : dflt; }
  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function round3(x) { return Math.round(x * 1000) / 1000; }
  function intGE0(x) { x = parseInt(x, 10); return (isFinite(x) && x > 0) ? x : 0; }

  /** Retrievability now for a card with half-life h (days) last seen at lastSeen (ms). Guarded. */
  function recall(h, lastSeen, now) {
    h = num(h); lastSeen = num(lastSeen); now = num(now);
    if (!isFinite(h) || h <= 0 || !isFinite(lastSeen) || lastSeen <= 0 || !isFinite(now)) return R_FLOOR;
    var dt = Math.max(0, (now - lastSeen) / DAY);   // days; clock skew → 0 (rests, self-heals next review)
    var R = R_FLOOR + (R_FRESH - R_FLOOR) * Math.pow(2, -dt / h);
    return clamp(R, R_FLOOR, R_FRESH);
  }

  /** Draw weight from retrievability: odds of failure, clamped. Transient (never persisted). */
  function srsWeight(R) {
    R = num(R); if (!isFinite(R)) R = R_FLOOR;
    R = clamp(R, R_FLOOR, R_FRESH);                 // clamp BEFORE dividing so it can't blow up
    return clamp((1 - R) / R, W_MIN, W_MAX);
  }

  /** New half-life after a review graded 0..1. Spacing-aware growth on success, shrink on lapse. */
  function updateHalfLife(h, lastSeen, now, grade) {
    h = finitePos(h, H_NEW); grade = num(grade); if (!isFinite(grade)) grade = 0;
    grade = clamp(grade, 0, 1);
    lastSeen = num(lastSeen); now = num(now);
    var dt = (isFinite(lastSeen) && lastSeen > 0 && isFinite(now)) ? Math.max(0, (now - lastSeen) / DAY) : 0;
    var ratio = Math.min(dt / h, SPACE_CAP);        // how overdue the successful recall was
    var nh;
    // growth scales with how far ABOVE the success threshold the grade is, so a neutral
    // rating (a "mais ou menos" lvl3 → grade 0.5 == SUCCESS) leaves h unchanged, matching
    // the counter model (only lvl>=4 counts correct, lvl<=2 wrong, lvl3 neutral).
    if (grade >= SUCCESS) nh = h * (1 + GROWTH * ((grade - SUCCESS) / (1 - SUCCESS)) * (0.5 + ratio));
    else nh = h * (LAPSE_MIN + (LAPSE_MAX - LAPSE_MIN) * grade);
    return clamp(round3(nh), H_MIN, H_MAX);
  }

  /**
   * Apply a review graded 0..1 to a card's (h, lastSeen) at time `now`, returning the
   * NEW {h, lastSeen}. On a successful recall the decay anchor resets to now (the card
   * rests and decays over the new, longer h). On a LAPSE the anchor is back-dated so the
   * card is already due (high draw weight, reappears soon) — restoring the old behaviour
   * where a just-missed item re-drills within the session. Both fields stay valid numbers
   * so the next sanitize carries them verbatim (no re-seed).
   */
  function review(h, lastSeen, now, grade) {
    now = num(now); if (!isFinite(now)) now = Date.now();
    grade = num(grade); if (!isFinite(grade)) grade = 0;
    var nh = updateHalfLife(h, lastSeen, now, grade);
    var nls = (grade >= SUCCESS) ? now : (now - LAPSE_DUE * nh * DAY);
    return { h: nh, lastSeen: Math.min(nls, now) };
  }

  // ---- migration seeds: derive an initial h from EXISTING progress (never touches counters) ----
  /** Questions (binary): more net-correct → longer half-life (rests); more wrong → shorter (returns). */
  function seedQuestionCard(rec) {
    var net = intGE0(rec && rec.correct) - intGE0(rec && rec.wrong);
    return clamp(H_NEW * Math.pow(2, net / 2), H_MIN, H_MAX);   // every +2 net-correct ~doubles h
  }
  /** Flashcards (self-rated): EMA/lvl 1..5 → half-life; ema3 neutral, ema5 long, ema1 short. */
  function seedGradedCard(rec) {
    var ema = num(rec && rec.ema);
    if (!isFinite(ema)) ema = num(rec && rec.lvl);
    if (!isFinite(ema)) ema = 3;
    ema = clamp(ema, 1, 5);
    return clamp(H_NEW * Math.pow(2, ema - 3), H_MIN, H_MAX);
  }

  /** Grade in [0,1] from a question outcome. */
  function gradeForOutcome(outcome) {
    if (outcome === 'correct') return 0.9;
    if (outcome === 'wrong') return 0.15;
    return 0.05;   // 'reveal' / "não sei" — explicit lapse
  }
  /** Grade in [0,1] from a self-rating 1..5. */
  function gradeForRating(lvl) {
    lvl = num(lvl); if (!isFinite(lvl)) return 0;
    return clamp((clamp(lvl, 1, 5) - 1) / 4, 0, 1);
  }

  /**
   * Attach h/lastSeen to `rec` (the freshly rebuilt card literal) without ever
   * touching seen/correct/wrong/lvl/ema. If the saved card already has valid
   * h/lastSeen, carry them verbatim (clamping a future lastSeen to now); else
   * SEED: derive h from the counters and date lastSeen into the past so the card
   * is due with real spacing. Deterministic in (saved counters, now) → idempotent.
   */
  function carryOrSeedTime(saved, rec, seedFn, now) {
    now = num(now); if (!isFinite(now)) now = Date.now();
    var h = saved && num(saved.h), ls = saved && num(saved.lastSeen);
    if (isFinite(h) && h > 0 && isFinite(ls) && ls > 0) {
      rec.h = clamp(round3(h), H_MIN, H_MAX);
      rec.lastSeen = Math.min(ls, now);            // never trust a future timestamp
    } else {
      rec.h = clamp(round3((seedFn || seedQuestionCard)(rec)), H_MIN, H_MAX);
      rec.lastSeen = now - MIGRATION_AGE_MS;
    }
    return rec;
  }

  return {
    DAY: DAY, H_NEW: H_NEW, H_MIN: H_MIN, H_MAX: H_MAX, R_FLOOR: R_FLOOR, R_FRESH: R_FRESH,
    W_MIN: W_MIN, W_MAX: W_MAX, MIGRATION_AGE_MS: MIGRATION_AGE_MS,
    recall: recall, srsWeight: srsWeight, updateHalfLife: updateHalfLife, review: review,
    seedQuestionCard: seedQuestionCard, seedGradedCard: seedGradedCard,
    gradeForOutcome: gradeForOutcome, gradeForRating: gradeForRating,
    carryOrSeedTime: carryOrSeedTime,
  };
});
