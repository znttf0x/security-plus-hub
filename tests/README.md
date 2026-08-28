# Test suite — Security+ Hub

Versioned tests for the static site in `docs/`. Reflects the **current** UI (real
element ids and `secplus:*` localStorage keys) and guards the one thing that must never
break: **user progress is never reset or corrupted**.

## Run

```sh
cd tests
npm install        # installs jsdom (only dependency, for the e2e tier)
npm test
```

`npm test` runs three tiers and exits non-zero if any fails:

| Tier | File | Needs | What it checks |
|------|------|-------|----------------|
| unit — SRS math | `../scripts/srs.test.cjs` | node only | forgetting-curve recall/weight/half-life + `carryOrSeedTime` never touches counters |
| unit — engine | `unit/flashcards.test.cjs` | node only | `flashcards.js` (`sanitizeCards`/`nextRecord`/`weightOf`) is byte-identical to the old inline logic across legacy / NaN / negative / unknown-id / ema-range cases; idempotent; zero NaN |
| e2e — pages | `e2e/pages.test.mjs` | node + jsdom | all 6 pages load with no uncaught JS error; `SECPLUS_SRS` + the shared engine are wired; **seed old progress → drive a review → counters stay intact, unknown ids dropped, no NaN, no read-only**; questions migration keeps its key |

The two unit tiers need **node only** (no install). The e2e tier needs **jsdom**; without it
that tier is reported `SKIP` (not a failure) so `npm test` still runs on a bare checkout.

Individual tiers:

```sh
node ../scripts/srs.test.cjs
node unit/flashcards.test.cjs
node e2e/pages.test.mjs
```

## Notes

- The e2e tier loads the real `docs/**/index.html` files directly from disk (`jsdom.fromFile`),
  executing every `<script src>` and the inline controller. jsdom has no `fetch`, so the suite
  shims it to read each deck's `*.txt` data from disk. jsdom-only gaps (layout, scroll, canvas,
  fonts, CSS parsing) are filtered from the error check.
- A real headless browser (Playwright/Puppeteer) is intentionally **not** used: it does not
  install in the CI sandbox. jsdom exercises the same scripts and the progress-critical flows.

## Pre-push gate (validate before the Pages deploy)

GitHub Pages serves `docs/` statically and never runs `validate.py`, so a broken bank or a
stale `counts.js` could ship silently. A versioned git hook runs those checks **before the
push** that triggers the deploy. Enable it once per clone:

```sh
git config core.hooksPath scripts/hooks
```

Then every `git push` first runs `scripts/hooks/pre-push`, which:
1. runs `python3 scripts/validate.py` (blocks the push on any bank error; the 121 intentional
   warnings stay warnings), and
2. fails if `docs/assets/js/counts.js` is out of sync with the data.

Emergency bypass: `git push --no-verify`.

A stronger **server-side** equivalent (also runs on pull requests) lives at
`scripts/ci/pages-validate.yml`. It is not active yet — pushing under `.github/workflows/`
needs the `workflow` OAuth scope. To turn it on: `gh auth refresh -h github.com -s workflow`,
then `git mv scripts/ci/pages-validate.yml .github/workflows/validate.yml` and commit.
