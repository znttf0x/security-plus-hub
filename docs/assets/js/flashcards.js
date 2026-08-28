/*
 * flashcards.js — shared, PURE state-transform core for the flashcard decks
 * (Conceitos and Siglas). No module state, no DOM: every function takes its
 * inputs explicitly and returns a value, so each page keeps its own controller
 * shell (state var, DOM wiring, showCard/init) unchanged and only delegates the
 * duplicated logic here. This is the single source of truth for the migration
 * (sanitizeCards), the confidence/level derivation and the per-review record.
 *
 * The record shape is IDENTICAL across both decks:
 *   { seen, correct, wrong, [lvl, ema], h, lastSeen }
 * The only per-deck differences are injected: the localStorage key, the
 * id-membership gate (concept ids vs internal acronym ids), and — outside this
 * module — the domain filter. This module never reads or writes storage and
 * never touches counters beyond the explicit transforms below.
 *
 * Depends on srs.js (SECPLUS_SRS): forgetting-curve half-life + grading.
 * UMD-tolerant: window.SECPLUS_FC in the browser, module.exports under Node.
 */
(function () {
  'use strict';

  // Resolve srs.js in both the browser (global set by the earlier <script>) and Node (require).
  var SRS = (typeof SECPLUS_SRS !== 'undefined') ? SECPLUS_SRS
          : (typeof require !== 'undefined') ? require('./srs.js')
          : null;

  var ALPHA_DEFAULT = 0.5;   // confidence-EMA smoothing (hysteresis)
  var W_NEW_DEFAULT = 3.0;   // weight of a never-rated card (between level 2 and 3)

  /** Round n and keep it only when it falls in the 1..5 level range, else null. */
  function clampLvl(n) { n = Math.round(n); return (n >= 1 && n <= 5) ? n : null; }

  /** Derive a legacy level (1..4) from a correct/wrong tally, or null when there is no history. */
  function derivedLvl(correct, wrong) {
    var a = correct + wrong;
    if (a <= 0) return null;
    var r = correct / a;
    if (r >= 0.85) return 4;
    if (r >= 0.60) return 3;
    if (r >= 0.35) return 2;
    return 1;
  }

  /**
   * Validate and migrate a stored cards map: drop ids the caller doesn't know,
   * coerce counters to safe non-negative integers, carry/derive lvl+ema and
   * attach the forgetting-curve half-life. Non-destructive and idempotent.
   * @param {object} cards - raw cards object from storage or import
   * @param {function(string):boolean} isKnownId - keeps only ids the deck owns (BY vs BY_ID)
   * @param {number} [now] - timestamp used for seeding/carrying time (defaults to Date.now())
   * @returns {object} - a clean cards map safe to assign to state
   */
  function sanitizeCards(cards, isKnownId, now) {
    var clean = {};
    if (!cards || typeof cards !== 'object') return clean;
    var t = (now == null) ? Date.now() : now;
    var known = (typeof isKnownId === 'function') ? isKnownId : function () { return true; };
    for (var k in cards) {
      if (!known(k)) continue;
      var c = cards[k] || {};
      var seen = parseInt(c.seen, 10);
      var correct = parseInt(c.correct, 10);
      var wrong = parseInt(c.wrong, 10);
      if (!Number.isFinite(seen) || seen < 0) seen = 0;
      if (!Number.isFinite(correct) || correct < 0) correct = 0;
      if (!Number.isFinite(wrong) || wrong < 0) wrong = 0;
      var rec = { seen: seen, correct: correct, wrong: wrong };
      var lvl = clampLvl(c.lvl);
      if (lvl == null) lvl = derivedLvl(correct, wrong);
      if (lvl != null) {
        rec.lvl = lvl;
        var ema = parseFloat(c.ema);
        if (!Number.isFinite(ema) || ema < 1 || ema > 5) ema = lvl;
        rec.ema = Math.round(ema * 10) / 10;
      }
      SRS.carryOrSeedTime(c, rec, SRS.seedGradedCard, t);   // attach/carry h+lastSeen; never touches the counters
      clean[k] = rec;
    }
    return clean;
  }

  /**
   * Sampling weight for a card from the forgetting-curve recall.
   * @param {object|null} st - the stored record (statusOf result), or null/undefined
   * @param {number} now - current timestamp
   * @param {number} [wNew] - weight of a never-rated card (default 3.0)
   */
  function weightOf(st, now, wNew) {
    var W_NEW = (wNew == null) ? W_NEW_DEFAULT : wNew;
    if (!st || !st.seen || st.ema == null) return W_NEW;   // never rated -> W_NEW
    return SRS.srsWeight(SRS.recall(st.h, st.lastSeen, now));
  }

  /**
   * Compute the new per-card record when committing a self-rating (1..5).
   * The EMA (hysteresis) drives the weight; correct/wrong tallies feed the Hub;
   * a low rating stays due via SECPLUS_SRS.review. Pure — the caller assigns the
   * result into state.cards[id] and persists.
   * @param {object|null} prev - the previous record (or null for a first review)
   * @param {number} lvl - the committed rating, 1..5
   * @param {number} now - current timestamp
   * @param {number} [alpha] - EMA smoothing (default 0.5)
   * @returns {object} - { seen, correct, wrong, lvl, ema, h, lastSeen }
   */
  function nextRecord(prev, lvl, now, alpha) {
    var A = (alpha == null) ? ALPHA_DEFAULT : alpha;
    var p = prev || { seen: 0, correct: 0, wrong: 0 };
    var ema = (p.ema == null) ? lvl : Math.round((p.ema + A * (lvl - p.ema)) * 10) / 10;
    var sr = SRS.review(p.h, p.lastSeen, now, SRS.gradeForRating(lvl));
    return {
      seen: p.seen + 1,
      correct: p.correct + (lvl >= 4 ? 1 : 0),
      wrong: p.wrong + (lvl <= 2 ? 1 : 0),
      lvl: lvl, ema: ema,
      h: sr.h, lastSeen: sr.lastSeen
    };
  }

  var api = {
    ALPHA_DEFAULT: ALPHA_DEFAULT,
    W_NEW_DEFAULT: W_NEW_DEFAULT,
    clampLvl: clampLvl,
    derivedLvl: derivedLvl,
    sanitizeCards: sanitizeCards,
    weightOf: weightOf,
    nextRecord: nextRecord
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SECPLUS_FC = api;
})();
