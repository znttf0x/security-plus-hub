/*
 * fc-util.js — shared, view-layer helpers for the flashcard decks (Conceitos and
 * Siglas): HTML escaping, the "Aprofundar" sources row, the service/acronym term
 * linkifier, the shared term tooltip, and the per-level breakdown. These are the
 * byte-identical (or trivially generalizable) blocks that were duplicated inline
 * in both pages; extracting them gives a single source of truth for terms /
 * tooltip / sources without touching any per-deck state.
 *
 * Nothing here reads or writes localStorage or the deck's progress state — the
 * page still owns its state and DOM. Functions that need per-deck context (the
 * built service index, the acronym popup map, the async "ready" flag, the skip
 * token) receive it explicitly, so behavior is identical to the old inline code.
 *
 * UMD-tolerant: window.SECPLUS_FCUTIL in the browser (jsdom included).
 */
(function () {
  'use strict';

  /** Escape a string for safe insertion as HTML text. */
  function escapeHtml(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
  /** Escape a string for safe insertion into a double-quoted HTML attribute. */
  function escAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  /** Build the per-level count breakdown HTML (optionally including the unrated bucket). */
  function levelBreakdownHTML(lc, includeZero) {
    var parts = [];
    for (var i = includeZero ? 0 : 1; i <= 5; i++)
      parts.push('<span class="lv lv' + i + '" title="' + (i === 0 ? 'sem nota' : 'nota ' + i) + '">' + lc[i] + '</span>');
    return parts.join(' · ');
  }

  /**
   * Build the "Aprofundar" (deep-dive) links row: the matched Professor Messer
   * lesson (site + YouTube), or the NIST glossary fallback, plus objective +
   * sub-topic and a pt-BR Google search. Pure — every map is passed in by the caller.
   * @returns {string} - HTML for the sources row
   */
  function sourcesHTML(id, MAP, NMAP, SUBMAP, GMAP) {
    var ML = (typeof window !== 'undefined' && window.SECPLUS_MESSER_LESSON) || {};
    var slug = MAP ? MAP[id] : null;
    var les = slug ? ML[slug] : null;
    var nist = (!les && NMAP) ? NMAP[id] : null;
    var sub = SUBMAP ? SUBMAP[id] : null;   // [objective, official sub-topic]
    var h = '<span class="ff-label">Aprofundar</span>';
    if (sub && sub[0]) h += '<span class="ff-sep">·</span><span class="ff-obj">Objetivo ' + sub[0] + '</span>';
    if (sub && sub[1]) h += '<span class="ff-sep">·</span><span class="ff-topic">' + escapeHtml(sub[1]) + '</span>';
    var pills = [];
    if (les) {
      var tt = les[2] ? ' title="Aula: ' + String(les[2]).replace(/"/g, '') + '"' : '';
      pills.push('<a href="' + les[0] + '" target="_blank" rel="noopener noreferrer"' + tt + '>Professor Messer</a>');
      if (les[1]) pills.push('<a href="' + les[1] + '" target="_blank" rel="noopener noreferrer"' + tt + '>YouTube</a>');
    } else if (nist && nist[0]) {
      var ttn = nist[1] ? ' title="NIST: ' + String(nist[1]).replace(/"/g, '') + '"' : '';
      pills.push('<a href="' + nist[0] + '" target="_blank" rel="noopener noreferrer"' + ttn + '>NIST Glossary</a>');
    }
    var g = GMAP ? GMAP[id] : null;   // [term_pt, term_en]
    if (g && g[0]) {
      var terms = g[1] ? (g[0] + ' ' + g[1]) : g[0];
      var url = 'https://www.google.com/search?q=' + encodeURIComponent('o que é ' + terms).replace(/%20/g, '+') + '&hl=pt-BR&gl=BR';
      pills.push('<a href="' + url + '" target="_blank" rel="noopener noreferrer" title="Buscar no Google (resposta em pt-br)">Google</a>');
    }
    for (var i = 0; i < pills.length; i++) h += (i === 0 ? '<span class="ff-sep">·</span>' : '') + pills[i];   // "·" only before the first pill
    return h;
  }

  /**
   * Build the service/tool index from a services list (window.SECPLUS_SERVICES).
   * @returns {{map: object, re: RegExp|null}} - lowercase-form -> {label, exp}, and the matcher
   */
  function buildServiceIndex(list) {
    var SERVICE_MAP = {}; var forms = [];
    list = list || [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (!s || !s.t || !s.e) continue;
      var all = [s.t].concat(s.a || []);
      for (var j = 0; j < all.length; j++) {
        var f = all[j];
        if (!f) continue; var k = f.toLowerCase();
        if (!SERVICE_MAP[k]) { SERVICE_MAP[k] = { label: s.t, exp: s.e }; forms.push(f); }
      }
    }
    if (!forms.length) return { map: SERVICE_MAP, re: null };
    forms.sort(function (a, b) { return b.length - a.length; });
    var esc = forms.map(function (f) { return f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    var re = new RegExp('(?<![A-Za-z0-9])(' + esc.join('|') + ')(?![A-Za-z0-9])', 'gi');
    return { map: SERVICE_MAP, re: re };
  }

  /**
   * Escape text, then wrap known service names (1st pass, placeholder-guarded) and
   * UPPERCASE acronyms (2nd pass) as .term popup spans. Pure given ctx.
   * @param {string} text - source text
   * @param {object} ctx - { serviceRe, serviceMap, acronymsUp, ready, skip }
   *   serviceRe/serviceMap: from buildServiceIndex; acronymsUp: UPPER -> {exp,explic};
   *   ready: whether the acronym map is populated; skip: acronym to leave untouched.
   * @returns {string} - HTML with cited terms wrapped in .term spans
   */
  function linkifyTerms(text, ctx) {
    ctx = ctx || {};
    var serviceRe = ctx.serviceRe, serviceMap = ctx.serviceMap || {};
    var acronymsUp = ctx.acronymsUp || {};
    var esc = escapeHtml(text);
    var store = [];
    if (serviceRe) {
      esc = esc.replace(serviceRe, function (m) {
        var rec = serviceMap[m.toLowerCase()]; if (!rec) return m;
        store.push('<span class="term" tabindex="0" data-term="' + escAttr(m.toLowerCase()) +
          '" aria-label="' + escAttr(rec.label + ': ' + rec.exp) + '">' + m + '</span>');
        return '\u0000' + (store.length - 1) + '\u0000';
      });
    }
    if (ctx.ready) {
      var SKIP = ctx.skip ? String(ctx.skip).toUpperCase() : null;
      esc = esc.replace(/\b([A-Z][A-Z0-9]{1,7})\b/g, function (m, tok) {
        if (tok === SKIP || !acronymsUp[tok]) return m;
        return '<span class="term" tabindex="0" data-acronym="' + tok + '" aria-label="' + escAttr(tok + ': ' + acronymsUp[tok].exp) + '">' + m + '</span>';
      });
    }
    return esc.replace(/\u0000(\d+)\u0000/g, function (_, i) { return store[+i]; });
  }

  /**
   * Create the shared #term-tip element and wire the delegated hover/focus/scroll
   * listeners for .term popups. Reads the live serviceMap and acronymsUp refs the
   * caller passes (so async-filled acronym maps show up without re-init).
   * @param {object} ctx - { serviceMap, acronymsUp }
   */
  function initTermTooltip(ctx) {
    ctx = ctx || {};
    var serviceMap = ctx.serviceMap || {};
    var acronymsUp = ctx.acronymsUp || {};
    var termTip = document.createElement('div');
    termTip.id = 'term-tip'; termTip.setAttribute('role', 'tooltip'); document.body.appendChild(termTip);
    function showTip(elx) {
      var tm = elx.getAttribute('data-term');
      var html = null;
      if (tm) { var r = serviceMap[tm]; if (r) html = '<b>' + escapeHtml(r.label) + '</b><div class="tt-ex">' + escapeHtml(r.exp) + '</div>'; }
      else { var s = elx.getAttribute('data-acronym'); var rec = acronymsUp[s]; if (rec) html = '<b>' + escapeHtml(s) + '</b> — ' + escapeHtml(rec.exp) + (rec.explic ? '<div class="tt-ex">' + escapeHtml(rec.explic) + '</div>' : ''); }
      if (!html) return;
      termTip.innerHTML = html;
      termTip.classList.add('show');
      var rr = elx.getBoundingClientRect(); var w = termTip.offsetWidth, h = termTip.offsetHeight;
      termTip.style.left = Math.min(Math.max(rr.left, 8), window.innerWidth - w - 8) + 'px';
      termTip.style.top = (rr.top > h + 12 ? rr.top - h - 8 : rr.bottom + 8) + 'px';
    }
    function hideTip() { termTip.classList.remove('show'); }
    document.addEventListener('mouseover', function (e) { var t = e.target.closest && e.target.closest('.term'); if (t) showTip(t); });
    document.addEventListener('mouseout', function (e) { if (e.target.closest && e.target.closest('.term')) hideTip(); });
    document.addEventListener('focusin', function (e) { var t = e.target.closest && e.target.closest('.term'); if (t) showTip(t); });
    document.addEventListener('focusout', function (e) { if (e.target.closest && e.target.closest('.term')) hideTip(); });
    window.addEventListener('scroll', hideTip, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideTip(); });
    return { showTip: showTip, hideTip: hideTip };
  }

  var api = {
    escapeHtml: escapeHtml,
    escAttr: escAttr,
    levelBreakdownHTML: levelBreakdownHTML,
    sourcesHTML: sourcesHTML,
    buildServiceIndex: buildServiceIndex,
    linkifyTerms: linkifyTerms,
    initTermTooltip: initTermTooltip
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SECPLUS_FCUTIL = api;
})();
