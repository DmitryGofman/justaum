/* ================= THE ART CANON =================
   The house definition of good art for a spiritual quote-art account.
   It is data, not vibes: the Canon tab renders it for the human,
   and canonPrompt() compresses it into the rubric the AI curator
   scores every image against. Change it here and both change together. */

export const CANON = {
  essence:
    "Good art for this account does two things in sequence: it stops the scroll, then it rewards the pause. " +
    "At thumbnail size it must read as one strong shape and one dominant mood; at full size it must hold up to a slow look " +
    "and leave a calm region where words can live. The image is never decoration for the quote and the quote is never a caption " +
    "for the image — they must feel like they were always one object.",

  principles: [
    {
      id: "subject",
      title: "One clear subject",
      body: "A single focal point that reads in a third of a second: a figure, a moon, a temple, a horizon. If the eye wanders looking for the point, the feed already scrolled past. Crowded battle scenes and busy allegories fail here no matter how masterful.",
    },
    {
      id: "composition",
      title: "Deliberate composition",
      body: "The frame is arranged, not cropped by accident — central symmetry for icons and mandalas, thirds and leading lines for landscapes. There is a path for the eye and it ends somewhere meaningful.",
    },
    {
      id: "light",
      title: "Light as meaning",
      body: "One dominant light source doing emotional work: dawn behind a ridge, a candle on a face, moonlight on water. Flat, even lighting is information; directed light is feeling. This niche runs on dusk, dawn, and darkness pierced by light.",
    },
    {
      id: "palette",
      title: "A restrained palette",
      body: "Two or three families of color in agreement — indigo and gold, ink and paper, ember and night. Oversaturated rainbows and HDR punch look like ads, and ads are what people scroll past.",
    },
    {
      id: "space",
      title: "Negative space",
      body: "At least a quarter of the frame is calm — sky, water, shadow, mist — because the words need somewhere to sit without a heavy scrim fighting the picture. An image with no quiet region is a poster, not a canvas.",
    },
    {
      id: "craft",
      title: "Craft you can zoom into",
      body: "Edges, hands, and gradients survive a pinch-zoom: no accidental blur, no compression banding, no smeared anatomy. Age and patina on a museum scan are craft; artifacts are not.",
    },
    {
      id: "resonance",
      title: "Emotional resonance",
      body: "The image carries one nameable feeling — awe, stillness, longing, resolve — that a real quote could plausibly deepen. If you cannot say what it feels like in one word, the pairing engine has nothing to hold onto.",
    },
  ],

  mediums: [
    {
      id: "classical",
      title: "Classical & sacred art",
      body: "Museum scans of thangkas, icons, woodblocks, engravings, Romantic landscapes. The bar: high-resolution scan, subject legible at feed size, and public-domain status confirmed.",
      good: "Friedrich horizons, Hiroshige night scenes, gilded thangka centers, Doré engravings with one blazing light source.",
      avoid: "Low-res scans, images that are 60% frame and museum wall, compositions that only work at gallery size.",
    },
    {
      id: "digital",
      title: "Digital painting & concept art",
      body: "Hand-made digital work — painterly light, atmospheric depth, confident brushwork. Digital is not a lesser medium here; it is where most living sacred-adjacent art actually happens.",
      good: "Matte-painting scale with a lone figure, visible brush economy, fog and volumetric light used as composition rather than garnish.",
      avoid: "Over-rendered plastic skin, video-game HUD energy, neon oversaturation, artist signature sitting in the text zone. Rights must be cleared with the artist before posting.",
    },
    {
      id: "ai",
      title: "AI-generated art",
      body: "Acceptable only when it would pass as intentional art with the generator unknown. The model's taste is not a style; the image must have one.",
      good: "Coherent anatomy and hands, clean gradients, a composition you could defend stroke by stroke, no embedded pseudo-text.",
      avoid: "Six fingers, melted jewelry, garbled script in halos and scrolls, the uncanny airbrushed sameness of default model output. When a follower asks, say it is AI-generated — credibility is the whole business.",
    },
    {
      id: "photo",
      title: "Photography",
      body: "Minimal, long-breath photography: silhouettes at dusk, long exposures of water, a single monk-red robe in a grey landscape.",
      good: "One subject, huge sky, tonal restraint. Underexposed beats overexposed every time in this feed.",
      avoid: "Stock-photo posing, watermark grids, busy street scenes, anything that looks like a travel agency.",
    },
  ],

  instagram: [
    {
      id: "crop",
      title: "Survives the 4:5 crop",
      body: "The subject and the quiet text region must both live inside a 4:5 portrait window. A masterpiece whose meaning lives in its edges is not a masterpiece on Instagram.",
    },
    {
      id: "thumb",
      title: "Thumb-stop at 400 pixels",
      body: "Strong silhouette and tonal contrast at the size of a postage stamp — that is the size at which every decision to stop or scroll is actually made.",
    },
    {
      id: "grid",
      title: "Sits inside the grid",
      body: "The 3×3 grid is the brand. Each tile should belong to the same dusk-and-gold world; one screaming neon tile costs more follows than it earns likes.",
    },
    {
      id: "legibility",
      title: "Words stay legible",
      body: "Text contrast at or above 4.5:1 against the real pixels behind it, at feed size, with the scrim you actually shipped — the badge measures it, believe the badge.",
    },
    {
      id: "clean",
      title: "Clean of noise",
      body: "No watermarks, no signatures under the text block, no borders, no meme energy. And rights cleared: CC0, licensed, or yours.",
    },
    {
      id: "mood",
      title: "Darker outperforms brighter",
      body: "For this niche the moody image with one light source beats the bright busy one nearly every time — the feed is scrolled at night.",
    },
  ],

  /* The scoring rubric the AI curator returns. Weights sum to 1. */
  dimensions: [
    { key: "subject",    label: "Subject clarity",   weight: 0.18 },
    { key: "composition",label: "Composition",       weight: 0.16 },
    { key: "light",      label: "Light & mood",      weight: 0.16 },
    { key: "craft",      label: "Craft / integrity", weight: 0.14 },
    { key: "textSpace",  label: "Room for words",    weight: 0.14 },
    { key: "feedFit",    label: "Feed fit (IG)",     weight: 0.12 },
    { key: "resonance",  label: "Resonance",         weight: 0.10 },
  ],
};

export function weightedScore(scores) {
  if (!scores) return 0;
  let t = 0;
  for (const d of CANON.dimensions) t += (scores[d.key] ?? 0) * d.weight;
  return t;
}

export function verdictOf(total) {
  return total >= 7.5 ? "post" : total >= 5.5 ? "maybe" : "skip";
}

/* Compact text form of the canon for AI prompts. */
export function canonPrompt() {
  const p = CANON.principles.map((x) => `- ${x.title}: ${x.body}`).join("\n");
  const m = CANON.mediums
    .map((x) => `- ${x.title}: ${x.body} Good: ${x.good} Avoid: ${x.avoid}`)
    .join("\n");
  const ig = CANON.instagram.map((x) => `- ${x.title}: ${x.body}`).join("\n");
  return `HOUSE DEFINITION OF GOOD ART\n${CANON.essence}\n\nUniversal principles:\n${p}\n\nMedium-specific bars (classical, digital, AI-generated, photography):\n${m}\n\nInstagram-native criteria:\n${ig}`;
}
