---
name: art-scout
description: Hunt for post-worthy art for the Aum Studio feed across open-access museums, Wikimedia/Openverse, and artist platforms (link-only), judge candidates against the house Art Canon, and deliver them into the app's Scout inbox via git. Use when asked to find art, fill the queue, scout images, or run the art pipeline.
---

# Art Scout

You are scouting images for a spiritual Instagram quote-art account (dusk-and-gold,
sacred/cosmic, Trajan capitals over calm regions). The taste rules live in
`src/canon.js` — **read it first**; you are its enforcement arm. The deliverable is
an updated `public/content/scout-inbox.json`, committed and pushed, which the
deployed app surfaces under **Scout → Agent inbox**.

## Sources, in order of preference

1. **Direct-image sources (rights already clear):**
   - The Met open access: `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=TERM` → object lookup, keep only `isPublicDomain: true`.
   - Art Institute of Chicago: `https://api.artic.edu/api/v1/artworks/search?q=TERM&fields=id,title,image_id,artist_title,is_public_domain` → IIIF URL `https://www.artic.edu/iiif/2/{image_id}/full/1686,/0/default.jpg`.
   - Cleveland Museum of Art: `https://openaccess-api.clevelandart.org/api/artworks?q=TERM&cc0=1`.
   - Rijksmuseum, Smithsonian OA, Wikimedia Commons / Openverse (`https://api.openverse.org/v1/images/?q=TERM&license=cc0,pdm`) via WebFetch/WebSearch.
2. **Artist platforms — link-only, never scrape or hotlink:** Instagram, ArtStation,
   Pixiv, DeviantArt, and AI-art communities. Use WebSearch to find artists whose work
   fits the canon; record profile/post URLs, artist handle, and a draft permission DM.
   These items get `"rights": "unclear — permission required"` and **no image URL**.
   The account owner clears rights before anything is posted.

## Judging

Score each candidate mentally against the canon dimensions (subject clarity,
composition, light, craft, room for words, feed fit, resonance). Only deliver
candidates you would defend as **post** or strong **maybe** — a short inbox of
excellent finds beats a long one of filler. Vary search terms beyond the obvious
(not just "buddha": try dawn pilgrims, ink wash mountains, gilded icons, comet
engravings, desert monastery, bioluminescence).

## Delivery format

Append to `items` in `public/content/scout-inbox.json` (keep existing items;
update the `updated` date):

```json
{
  "title": "The Great Wave off Kanagawa",
  "artist": "Katsushika Hokusai",
  "src": "https://…/full/843,/0/default.jpg",
  "full": "https://…/full/1686,/0/default.jpg",
  "url": "https://www.artic.edu/artworks/24645",
  "source": "Art Institute of Chicago",
  "rights": "CC0",
  "why": "one line: which canon principles it nails and where the text sits",
  "found": "2026-07-18"
}
```

For link-only artist finds, omit `src`/`full` and add `"contact"` (how to reach the
artist) plus `"permissionDraft"` (a short, respectful licensing request naming the
account and the intended use).

## Finish

`npm run build` must still pass. Commit with a message listing source counts
(e.g. "art-scout: 6 Met, 3 AIC, 2 link-only ArtStation") and push. If a GitHub
Pages deploy exists, the inbox goes live on push to main.
