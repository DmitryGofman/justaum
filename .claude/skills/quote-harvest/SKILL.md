---
name: quote-harvest
description: Grow the Aum Studio quote stock — recall and verify spiritual/philosophical quotes, flag attribution honestly, and append them to the app's extended quote pack via git. Use when asked to find more quotes, grow the quote library, or build quote stock.
---

# Quote Harvest

The app ships with a seed library plus bundled packs (`src/data/seedQuotes.js`,
`src/data/quotePack1.js`) and merges `public/content/quotes-extended.json` at boot,
deduped by text. Your deliverable is new entries in that JSON file, committed and
pushed.

## Rules — these are the brand

1. **Never invent a quote and pin it on a real person.** Recall real material from
   scripture, philosophy, poetry, and named modern teachers.
2. **Status flags are honest:**
   - `verified` — you are confident of the documented source; cite it in `attr`
     (e.g. "Marcus Aurelius, Meditations 5.20", "Dhammapada 80").
   - `disputed` — widely circulated but doubtful, a loose rendering, or commonly
     misattributed; say so in `attr` ("attributed to Rumi (unverified)").
   - `modern` — living/recent author quoted accurately.
3. Use WebSearch/WebFetch to check anything you are not sure of — quote-investigator
   style sources, Wikiquote's sourced/misattributed sections, primary texts.
4. **Under 30 words** — it must sit on an image in large capitals.
5. Dedupe against all three existing sources before adding (match on lowercased text).
6. Categories: `presence | mind | freedom | impermanence | strength | love |
   self-mastery | silence`. Keep the mix balanced; check current counts first.

## Entry format

Append to `quotes` in `public/content/quotes-extended.json`, update `updated`:

```json
{ "text": "…", "attr": "Author, source", "cat": "presence", "status": "verified" }
```

## Batch shape

A good harvest run adds 30–60 quotes: pick 2–3 themes (e.g. dawn, surrender,
attention), sweep sources per theme, verify, then append. State in the commit
message how many were added per status (e.g. "quote-harvest: +42 (28 verified,
9 modern, 5 disputed)"). Run `npm run build` before pushing.
