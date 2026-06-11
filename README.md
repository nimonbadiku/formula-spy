# Formula Spy

A mobile-first PWA that scores hair care products against your personal hair
profile. Built around an existing, untouched scoring engine.

## What it does

1. **Hair quiz / profile** — required before any analysis. Saved locally.
2. **Paste an ingredient list (INCI)** — one product at a time, with a product type.
3. **Analyze** — runs the real scoring engine in the browser.
4. **Result** — an overall score first, then:
   - **Overview tab**: plain-language summary + key subscores.
   - **Ingredients tab**: per-ingredient breakdown (unrecognized items shown honestly).
5. **History** — every analysis is saved locally and can be reopened or deleted.

v1 scope: simple score only, no product recommendations, English only.

## Architecture

The scoring engine and database live in `scoringlogic+database/` and are used
**as-is**. The app never reimplements scoring; it only calls the engine's public
`analyze()` entry point.

```
src/
  engine-bridge/   Thin adapter: loads/caches the DB, maps quiz -> HairProfile,
                   calls the untouched engine. No scoring logic here.
  components/      Reusable UI (GlassPanel, ScoreRing, Tabs, Button, etc.)
  screens/         Welcome, Quiz, Paste, Analyzing, Result, History
  store/           Zustand store + localStorage persistence (profile + history)
  lib/             Quiz config, product types, plain-language result helpers
  theme/           Design tokens + global styles
scoringlogic+database/   The scoring engine + ingredient DB (UNTOUCHED)
public/data/             Runtime copy of ingredients.v3.json (served as a static asset)
```

### Engine isolation notes

- The only engine entry point used is `scoringlogic+database/engine/index.ts`
  (`analyze`, `parseIngredients`, `countTokens`, and types).
- The engine's Node-only unknown-ingredient logger is redirected to its own
  browser stub via a Vite alias (`vite.config.ts`). The engine source is not modified.
- The ingredient database (~28 MB) is fetched once and cached in memory.

### Keeping the database in sync

`public/data/ingredients.v3.json` is a copy of
`scoringlogic+database/database/ingredients.v3.json`. If the source DB changes,
refresh the copy:

```
copy "scoringlogic+database\database\ingredients.v3.json" "public\data\ingredients.v3.json"
```

## Scripts

```
npm install      # install dependencies
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # type-check + production build
npm run preview  # preview the production build
```
