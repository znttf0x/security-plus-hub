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
