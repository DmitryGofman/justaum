# Aum Studio

A personal quote-art factory for a spiritual Instagram account.
**The engine renders, the AI proposes, you decide.**

Drop in art (yours, museum CC0, digital, AI-generated), and the studio:

- lays the quote out in Trajan capitals with brand presets, scrims, and a live
  WCAG contrast badge measured against the real pixels behind the text;
- **defines good art** — the house **Art Canon** (Canon tab / `src/canon.js`)
  codifies what a post-worthy image is: universal principles, medium-specific
  bars for classical, digital, AI-generated and photographic work, and
  Instagram-native criteria (4:5 crop survival, 400-px thumb-stop, grid
  cohesion, legibility);
- **judges images against that canon** — the ⚖ Critique button has Claude score
  each image per dimension, with a post / maybe / skip verdict shown on the
  queue and the 3×3 feed preview;
- **finds quotes with AI** — ✦ Find quotes has Claude read the image and recall
  real quotes from its own knowledge of scripture, philosophy and poetry (with
  honest verified / disputed / modern attribution flags), or write original
  lines — no external quote sites involved. ✨ Compose returns both library
  matches and fresh AI finds;
- writes captions in the house formula, batch-exports 1080×1350 / 1080×1080 /
  story PNGs, and stamps quotes as used so nothing repeats.

## Running

```bash
npm install
npm run dev
```

Outside a claude.ai artifact you need an Anthropic API key for the AI features
(⚙ in the header — stored only in your browser's localStorage). Everything
else (layout, scrims, contrast, export, the seed library of 129 quotes) works
with no key at all.

## Architecture

| File | Role |
| --- | --- |
| `src/engine.js` | Deterministic canvas engine — text layout, scrims, zone analysis, palette, contrast. The AI never touches pixels. |
| `src/canon.js` | The Art Canon: the definition of good art, rendered for the human and compiled into the AI curator's rubric. Edit it and the curator's taste changes with it. |
| `src/ai.js` | All Claude calls: compose (layout + quotes), find-quotes, critique, caption. Each returns JSON that fills an interface. |
| `src/presets.js` | Brand style presets, hashtag pool, scout terms. |
| `src/scout.js` | Open-access art sources (The Met, Art Institute of Chicago — CC0). |
| `src/data/seedQuotes.js` | The 129-quote seed library with attribution-status flags. |
| `src/App.jsx` | The workbench UI. |
