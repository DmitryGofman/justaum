/* ============ AI layer ============
   The AI proposes, the engine renders, the human decides.
   Every call returns JSON that fills an interface — the model
   never touches pixels. Works in two environments:
   - claude.ai artifact: fetch to the API is proxied, no key needed
   - standalone (this repo, `npm run dev`): paste an API key in Settings */

import { canonPrompt, CANON } from "./canon.js";
import { imgToB64 } from "./engine.js";
import { TAGPOOL } from "./presets.js";

export const DEFAULT_MODEL = "claude-sonnet-5";

let cfg = { apiKey: "", model: DEFAULT_MODEL };
export function configureAI(c) { cfg = { ...cfg, ...c }; }

export async function callClaude(messages, { tools, maxTokens = 1500, system } = {}) {
  const body = { model: cfg.model || DEFAULT_MODEL, max_tokens: maxTokens, messages };
  if (tools) body.tools = tools;
  if (system) body.system = system;
  const headers = { "Content-Type": "application/json" };
  if (cfg.apiKey) {
    headers["x-api-key"] = cfg.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers, body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "API error");
  return data;
}

export function extractJSON(data) {
  const texts = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const clean = texts.replace(/```json|```/g, "").trim();
  const m = clean.match(/[\[{][\s\S]*[\]}]/);
  return JSON.parse(m ? m[0] : clean);
}

const HONESTY_RULES = `Attribution honesty rules — these are absolute:
- Only attribute a quote to a person/source if you are genuinely confident they said or wrote it. Include the source work when you know it (e.g. "Marcus Aurelius, Meditations 5.20").
- status:"verified" only for quotes with a documented source you are confident in.
- status:"disputed" for anything widely circulated but doubtful, paraphrased, or commonly misattributed (most internet Rumi/Buddha quotes are this) — and say so in attr, e.g. "attributed to Rumi (unverified)".
- status:"modern" for living or recent authors quoted accurately.
- NEVER invent a quote and pin it on a real person. If nothing real fits, return fewer quotes.
- Keep each quote under 30 words: it must fit on an image in large capitals.`;

/* -------- Compose: layout + quotes (library AND fresh AI finds) -------- */
export async function aiCompose(item, presets, quotes) {
  const b64 = await imgToB64(item.img);
  const unused = quotes.filter((q) => !(q.usedAt || []).length);
  const qlist = (unused.length ? unused : quotes).map((q) => ({ id: q.id, text: q.text, cat: q.cat })).slice(0, 160);
  const prompt = `You are the layout engine and curator for a spiritual Instagram art account (style: elegant Trajan capitals over sacred/cosmic art, like @just.aum).
Analyze this image and respond ONLY with JSON, no prose, no markdown fences:
{"anchor":{"x":0-1,"y":0-1},"styleId":"classic|golden|whisper","overrides":{"color":"#hex optional","size":number optional,"scrim":{"shape":"band|box|vignette|none","color":"#hex","opacity":0-1,"softness":0-1} optional},"quoteCandidates":["id","id","id"],"freshQuotes":[{"text":"...","attr":"...","cat":"presence|mind|freedom|impermanence|strength|love|self-mastery|silence","status":"verified|disputed|modern","why":"one short clause tying it to THIS image"}],"mood":["word","word","word"],"palette":["#hex","#hex","#hex","#hex"],"lowConfidence":false}
Rules:
- anchor = center of the calmest region suited to text (usually lower third or a clear sky/dark area).
- quoteCandidates: exactly 3 ids from the library below whose meaning resonates with THIS image's subject and mood — not generic fits.
- freshQuotes: exactly 3 REAL quotes from your own knowledge that fit this image even better than the library can — drawn from world scripture, philosophy, poetry, or named modern teachers. These must NOT duplicate library entries. ${HONESTY_RULES}
- overrides only when the preset truly needs bending (e.g. white scrim + dark text for bright art).
- Set lowConfidence:true if the image itself gives you little to work with.
Presets: ${JSON.stringify(presets.map((p) => ({ id: p.id, color: p.color, scrim: p.scrim })))}
Quote library: ${JSON.stringify(qlist)}`;
  const data = await callClaude([
    { role: "user", content: [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
      { type: "text", text: prompt },
    ]},
  ], { maxTokens: 2000 });
  return extractJSON(data);
}

/* -------- Find quotes with AI: the model looks at the image and draws
   from its own knowledge — no library, no web, no external list. -------- */
export async function aiFindQuotes(item, { topic = "", original = false, count = 6 } = {}) {
  const content = [];
  if (item) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: await imgToB64(item.img) } });
  const subject = item
    ? "Look closely at this image — its subject, light, mood, symbolism, tradition."
    : `Theme: ${topic || "stillness"}.`;
  const ask = original
    ? `Write ${count} ORIGINAL short aphorisms in the voice of timeless contemplative wisdom — no attribution, they are new. Each must feel inevitable, not clever; concrete, not abstract-vague; under 20 words. Set status:"original" and attr:"".`
    : `From your own knowledge of world scripture, philosophy and poetry (Dhammapada, Tao Te Ching, Bhagavad Gita, Upanishads, Stoics, Rumi, Zen, Kabbalah, mystics, named modern teachers), recall the ${count} REAL quotes that resonate most precisely with ${item ? "this exact image" : "this theme"}${topic && item ? ` and the theme "${topic}"` : ""}. Precision beats fame: a lesser-known verse that names what the image shows beats a famous generic line. ${HONESTY_RULES}`;
  content.push({ type: "text", text: `You are the quote curator for a spiritual Instagram art account. ${subject}
${ask}
Respond ONLY with a JSON array, no prose, no fences:
[{"text":"...","attr":"Author, source if known","cat":"presence|mind|freedom|impermanence|strength|love|self-mastery|silence","status":"verified|disputed|modern|original","why":"one short clause: why THIS ${item ? "image" : "theme"}"}]` });
  const data = await callClaude([{ role: "user", content }], { maxTokens: 1800 });
  const arr = extractJSON(data);
  return Array.isArray(arr) ? arr : [];
}

/* -------- Critique: score the image against the house art canon -------- */
export async function aiCritique(item) {
  const b64 = await imgToB64(item.img);
  const dims = CANON.dimensions.map((d) => `"${d.key}"`).join(",");
  const prompt = `You are the in-house art curator for a spiritual Instagram account. Judge this image strictly against the house canon below. Be honest — a wrong "post" verdict costs the account more than a wrong "skip".

${canonPrompt()}

Respond ONLY with JSON, no prose, no fences:
{"scores":{${CANON.dimensions.map((d) => `"${d.key}":0-10`).join(",")}},"medium":"classical|digital|ai|photo|other","verdict":"post|maybe|skip","summary":"one honest sentence","strengths":["...","..."],"risks":["...","..."],"cropSafe":true|false}
Scoring guide: 9-10 exceptional, 7-8 solid post, 5-6 usable with work, below 5 skip. Score dimensions ${dims} independently — do not average them into sameness. "risks" = specific, checkable problems (e.g. "signature in lower-left text zone", "banding in the sky gradient", "hands malformed — likely AI artifact"). cropSafe = subject AND a text-worthy calm region both survive a centered 4:5 crop.`;
  const data = await callClaude([
    { role: "user", content: [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
      { type: "text", text: prompt },
    ]},
  ], { maxTokens: 1200 });
  return extractJSON(data);
}

/* -------- Caption -------- */
export async function aiCaption(quote, mood, handle) {
  const prompt = `Write an Instagram caption for a spiritual art post. The image mood: ${(mood || []).join(", ") || "contemplative"}. The quote on the image: "${quote.text}" — ${quote.attr || "unattributed"}.
Respond ONLY with JSON: {"hook":"one short poetic line expanding the quote's idea (not repeating it)","body":"2-3 short reflective sentences that motivate inner growth, warm and grounded, no emoji spam","hashtags":["14-18 tags mixing these ${JSON.stringify(TAGPOOL.slice(0, 10))} with mood-specific ones"]}`;
  const data = await callClaude([{ role: "user", content: prompt }]);
  return extractJSON(data);
}
