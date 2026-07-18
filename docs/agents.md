# Agent-team infrastructure

The app is designed so that autonomous agents (Claude sessions, scheduled
Routines, or a future multi-agent team) can feed it **through git** — no backend,
no database. The deployed site re-reads its content files on every load.

```
┌─ agents ────────────────┐        ┌─ repo ────────────────────────────┐
│ /art-scout    (skill)   │  git   │ public/content/scout-inbox.json   │
│ /quote-harvest (skill)  │ ─────► │ public/content/quotes-extended.json│
│ future: critic, poster  │  push  │ src/canon.js (the shared taste)   │
└─────────────────────────┘        └───────────────┬───────────────────┘
                                                   │ push to main → CI
                                                   ▼
                                   GitHub Pages: the live app
                                   Scout → Agent inbox  (art candidates)
                                   Deck  → library      (merged quote stock)
```

## The two channels

| File | Consumed by | Written by |
| --- | --- | --- |
| `public/content/scout-inbox.json` | Scout tab → **Agent inbox** (add-to-queue for rights-clear items, link-only for pending ones) | `/art-scout` skill |
| `public/content/quotes-extended.json` | merged into the quote library at boot, deduped by text | `/quote-harvest` skill |

Both files carry their schema in a `note` field. The app treats them as optional:
missing or unreachable files degrade silently (bundled packs still load).

## Ground rules every agent inherits

- **Taste lives in `src/canon.js`** — one source of truth for "good art", used by
  the human-readable Canon tab and the AI curator prompt alike.
- **Rights before pixels.** Direct image URLs only for CC0/public-domain or
  artist-permission work. Instagram / ArtStation / Pixiv / AI-art communities are
  link-only until the artist says yes.
- **Attribution honesty.** Quote statuses (verified / disputed / modern / original)
  are the account's credibility; when unsure, mark disputed and say why in `attr`.
- **Build must pass** (`npm run build`) before any push.

## Growing the team

Add a new skill under `.claude/skills/<name>/SKILL.md` (these load in every Claude
session on this repo) or a subagent definition under `.claude/agents/`. Candidate
next members: a **critic** that runs canon critiques over the inbox and prunes it,
a **caption writer** that pre-drafts captions for queued items, and a **scheduler**
that assembles the next nine posts into a balanced 3×3 grid.
