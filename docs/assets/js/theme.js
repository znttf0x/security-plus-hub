/* theme.js — palette selector (Black Pearl / Black Aura / Light Mode).
   The palette is applied early by an inline script in <head> (anti-FOUC);
   here we only wire up the toggle UI and persist the choice.
   Also owns the shared nav UI: palette/donate popovers, language flag,
   hamburger menu, and syncNavHeight. */
(function () {
  var KEY = 'secplus-palette';
  var root = document.documentElement;

  /** Returns the currently active palette id. */
  function current() { return root.getAttribute('data-palette') || 'black-pearl'; }

  /**
   * Applies a palette: sets the root attribute, persists it, and syncs the
   * checked state of the option controls.
   * @param {string} p - palette id
   */
  function apply(p) {
    root.setAttribute('data-palette', p);
    try { localStorage.setItem(KEY, p); } catch (e) {}
    var opts = document.querySelectorAll('.pal-opt');
    for (var i = 0; i < opts.length; i++) {
      opts[i].setAttribute('aria-checked', opts[i].getAttribute('data-p') === p ? 'true' : 'false');
    }
  }

  /** Wires up all nav interactions: popovers, palette choice, language, hamburger. */
  function init() {
    var pal = document.querySelector('.pal');
    var donate = document.querySelector('.donate');
    var pops = [pal, donate];

    // Close every popover (palette/donate) except the one passed in `except`.
    function closePops(except) {
      for (var k = 0; k < pops.length; k++) {
        var w = pops[k];
        if (!w || w === except) continue;
        w.setAttribute('data-open', 'false');
        var b = w.querySelector('button');
        if (b) b.setAttribute('aria-expanded', 'false');
      }
    }
    // Wire one popover: opening one closes the other.
    function wirePop(wrap) {
      if (!wrap) return;
      var b = wrap.querySelector('button');
      if (!b) return;
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var willOpen = wrap.getAttribute('data-open') !== 'true';
        closePops(wrap);
        wrap.setAttribute('data-open', String(willOpen));
        b.setAttribute('aria-expanded', String(willOpen));
      });
    }
    wirePop(pal);
    wirePop(donate);
    // lazy-load the donation widget iframe only when the popover is first opened (keeps the app offline-first)
    if (donate) {
      var dbtn = donate.querySelector('.donate-btn');
      if (dbtn) dbtn.addEventListener('click', function () {
        var fr = donate.querySelector('iframe[data-src]');
        if (fr && !fr.getAttribute('src')) fr.setAttribute('src', fr.getAttribute('data-src'));
      });
    }

    // Palette: color choice
    if (pal) {
      var opts = pal.querySelectorAll('.pal-opt');
      for (var i = 0; i < opts.length; i++) {
        (function (o) {
          o.addEventListener('click', function (e) {
            e.stopPropagation();
            apply(o.getAttribute('data-p'));
            closePops(null);
            var pb = pal.querySelector('.pal-btn'); if (pb) pb.focus();
          });
        })(opts[i]);
      }
      apply(current());   // sync the checked state (palette already applied in <head>)
    }

    // Language: toggle the BR ↔ US flag (actual language switch comes later).
    var lang = document.querySelector('.lang');
    if (lang) {
      var lb = lang.querySelector('.lang-btn');
      if (lb) lb.addEventListener('click', function (e) {
        e.stopPropagation();
        lang.setAttribute('data-lang', lang.getAttribute('data-lang') === 'en' ? 'pt' : 'en');
      });
    }

    // Hamburger: open/close the mobile links dropdown.
    var burger = document.querySelector('.nav-burger');
    var links = document.getElementById('nav-links');
    function closeMenu() {
      if (links) links.classList.remove('open');
      if (burger) burger.setAttribute('aria-expanded', 'false');
    }
    if (burger && links) {
      burger.addEventListener('click', function (e) {
        e.stopPropagation();
        var willOpen = !links.classList.contains('open');
        links.classList.toggle('open', willOpen);
        burger.setAttribute('aria-expanded', String(willOpen));
      });
      links.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a')) closeMenu(); });
    }

    // Outside-click and Escape close the popovers and the menu.
    document.addEventListener('click', function (e) {
      if ((!pal || !pal.contains(e.target)) && (!donate || !donate.contains(e.target))) closePops(null);
      if (burger && links && !burger.contains(e.target) && !links.contains(e.target)) closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') { closePops(null); closeMenu(); }
    });

    closePops(null);
    closeMenu();
  }

  /* Sync --nav-height with the REAL nav height (the nav is height:auto in theme.css,
     so the fixed 3.5rem from the inline script left the sticky stats-wrapper ~4px below
     the nav's end, opening a transparent gap on mobile scroll). This keeps them flush. */
  function syncNavHeight() {
    var nav = document.querySelector('nav');
    if (nav) root.style.setProperty('--nav-height', nav.offsetHeight + 'px');
  }

  /** Entry point: wire the UI, then keep the nav height synced. */
  function boot() {
    init();
    syncNavHeight();
    window.addEventListener('resize', syncNavHeight);
    window.addEventListener('load', syncNavHeight);   // after fonts/icons settle
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
