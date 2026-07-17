/* ============ Deterministic render engine ============
   Pure canvas ops. The AI never touches pixels — it fills
   interfaces, this engine renders them. */

export function trackW(ctx, text, ls) {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + ls;
  return Math.max(0, w - ls);
}

export function drawTracked(ctx, text, cx, y, ls, rtl) {
  if (rtl || ls <= 0) {
    const a = ctx.textAlign; ctx.textAlign = "center";
    ctx.fillText(text, cx, y);
    ctx.textAlign = a; return;
  }
  let x = cx - trackW(ctx, text, ls) / 2;
  const a = ctx.textAlign; ctx.textAlign = "left";
  for (const ch of text) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + ls; }
  ctx.textAlign = a;
}

export function wrapLines(ctx, text, maxPx, ls, rtl) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const meas = rtl ? (w) => ctx.measureText(w).width : (w) => trackW(ctx, w, ls);
  const sp = ctx.measureText(" ").width + (rtl ? 0 : ls);
  const lines = []; let cur = [], cw = 0;
  for (const w of words) {
    const ww = meas(w);
    if (cur.length && cw + sp + ww > maxPx) { lines.push(cur); cur = [w]; cw = ww; }
    else { cw += (cur.length ? sp : 0) + ww; cur.push(w); }
  }
  if (cur.length) lines.push(cur);
  // widow fix: single short last word steals a companion from the line above
  if (lines.length > 1) {
    const last = lines[lines.length - 1], prev = lines[lines.length - 2];
    if (last.length === 1 && prev.length > 2) last.unshift(prev.pop());
  }
  return lines.map((l) => l.join(" "));
}

export function isHebrew(s) { return /[\u0590-\u05FF]/.test(s); }

export function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function drawScrim(ctx, scrim, W, topY, blockH, fs) {
  if (!scrim || scrim.shape === "none" || scrim.opacity <= 0) return;
  const pad = fs * (scrim.padding ?? 0.8);
  const y0 = topY - pad, y1 = topY + blockH + pad;
  const c = hexToRgb(scrim.color || "#0a0810");
  const col = (a) => `rgba(${c.r},${c.g},${c.b},${a})`;
  const soft = Math.min(1, Math.max(0, scrim.softness ?? 0.7));
  if (scrim.shape === "band") {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    const edge = 0.5 * soft;
    g.addColorStop(0, col(0)); g.addColorStop(Math.min(0.49, edge), col(scrim.opacity));
    g.addColorStop(Math.max(0.51, 1 - edge), col(scrim.opacity)); g.addColorStop(1, col(0));
    ctx.fillStyle = g; ctx.fillRect(0, y0, W, y1 - y0);
  } else if (scrim.shape === "box") {
    const bw = W * 0.86, bx = (W - bw) / 2, r = fs * 0.35;
    ctx.save();
    ctx.shadowColor = col(scrim.opacity); ctx.shadowBlur = soft * fs * 2.2;
    ctx.fillStyle = col(scrim.opacity);
    ctx.beginPath(); ctx.roundRect(bx, y0, bw, y1 - y0, r); ctx.fill();
    ctx.restore();
  } else if (scrim.shape === "vignette") {
    const cy = (y0 + y1) / 2, rad = Math.max(W * 0.55, y1 - y0);
    const g = ctx.createRadialGradient(W / 2, cy, rad * (0.2 + (1 - soft) * 0.4), W / 2, cy, rad);
    g.addColorStop(0, col(scrim.opacity)); g.addColorStop(1, col(0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, ctx.canvas.height);
  }
}

export function composeItem(ctx, W, H, item, preset) {
  const img = item.img;
  const s = Math.max(W / img.width, H / img.height);
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
  if (!item.quote) return null;
  const ov = item.overrides || {};
  const P = { ...preset, ...(ov.size ? { size: ov.size } : {}), ...(ov.color ? { color: ov.color } : {}) };
  const scrim = { ...preset.scrim, ...(ov.scrim || {}) };
  const rtl = isHebrew(item.quote.text);
  const fs = P.size * (W / 1080), ls = rtl ? 0 : P.ls * (W / 1080), maxPx = W * P.maxWidthPct;
  ctx.font = `${P.italic ? "italic " : ""}500 ${fs}px ${rtl ? '"Frank Ruhl Libre",' : ""}${P.fontStack}`;
  const txt = P.caps && !rtl ? item.quote.text.toUpperCase() : item.quote.text;
  const lines = wrapLines(ctx, txt, maxPx, ls, rtl);
  const lh = fs * 1.26, aFs = fs * P.attrScale, aGap = item.quote.attr ? fs * 0.82 : 0;
  const blockH = lines.length * lh + (item.quote.attr ? aGap + aFs : 0);
  const cx = item.pos.x * W;
  let topY = item.pos.y * H - blockH / 2;
  topY = Math.max(fs * 0.7, Math.min(H - blockH - fs * 0.3, topY));
  drawScrim(ctx, scrim, W, topY, blockH, fs);
  ctx.fillStyle = P.color; ctx.textBaseline = "alphabetic";
  const sh = P.shadow * (W / 1080);
  ctx.shadowColor = "rgba(0,0,0,.75)"; ctx.shadowBlur = sh; ctx.shadowOffsetY = sh * 0.15;
  let y = topY + fs;
  for (const l of lines) { drawTracked(ctx, l, cx, y, ls, rtl); y += lh; }
  if (item.quote.attr) {
    y += aGap - lh + aFs;
    ctx.font = `400 ${aFs}px ${P.fontStack}`;
    drawTracked(ctx, rtl ? item.quote.attr : item.quote.attr.toUpperCase(), cx, y, rtl ? 0 : ls * 1.6 + 2 * (W / 1080), rtl);
  }
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  let widest = 0;
  ctx.font = `${P.italic ? "italic " : ""}500 ${fs}px ${P.fontStack}`;
  for (const l of lines) { const w = rtl ? ctx.measureText(l).width : trackW(ctx, l, ls); if (w > widest) widest = w; }
  return { topY, blockH, widest, scrim, color: P.color };
}

/* ---------------- image analysis ---------------- */
export function analyzeImage(img) {
  const w = 96, h = Math.max(8, Math.round((96 * img.height) / img.width));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d"); x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
  const zones = [];
  for (let r = 0; r < 5; r++)
    for (let cc = 0; cc < 4; cc++) {
      let s = 0, s2 = 0, e = 0, n = 0;
      const x0 = Math.floor((cc * w) / 4), x1 = Math.floor(((cc + 1) * w) / 4);
      const y0 = Math.floor((r * h) / 5), y1 = Math.floor(((r + 1) * h) / 5);
      for (let y = y0; y < y1; y++)
        for (let xx = x0; xx < x1; xx++) {
          const L = lum[y * w + xx]; s += L; s2 += L * L; n++;
          if (xx + 1 < x1) e += Math.abs(L - lum[y * w + xx + 1]);
          if (y + 1 < y1) e += Math.abs(L - lum[(y + 1) * w + xx]);
        }
      const m = s / n, v = s2 / n - m * m, zx = (cc + 0.5) / 4, zy = (r + 0.5) / 5;
      zones.push({
        x: zx, y: zy,
        score: (zy > 0.55 ? 12 : 0) + (Math.abs(zx - 0.5) < 0.3 ? 8 : 0) - Math.sqrt(v) * 0.55 - (e / n) * 1.1 - (m > 170 ? 10 : 0),
      });
    }
  zones.sort((a, b) => b.score - a.score);
  return { map: { w, h, lum }, zones };
}

export function contrastRatio(item, box, scrim, colorHex) {
  if (!item.map || !box) return 7;
  const { w, h, lum } = item.map;
  const W = 1080, H = 1350;
  const bx = Math.max(0, Math.floor((item.pos.x - box.widest / W / 2) * w));
  const bx1 = Math.min(w, Math.ceil((item.pos.x + box.widest / W / 2) * w));
  const by = Math.max(0, Math.floor((box.topY / H) * h));
  const by1 = Math.min(h, Math.ceil(((box.topY + box.blockH) / H) * h));
  let s = 0, n = 0;
  for (let y = by; y < by1; y++) for (let x = bx; x < bx1; x++) { s += lum[y * w + x]; n++; }
  let bg = (n ? s / n : 60) / 255;
  if (scrim && scrim.shape !== "none") {
    const sc = hexToRgb(scrim.color || "#0a0810");
    const sl = (0.2126 * sc.r + 0.7152 * sc.g + 0.0722 * sc.b) / 255;
    bg = bg * (1 - scrim.opacity) + sl * scrim.opacity;
  }
  const c = hexToRgb(colorHex);
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const Lt = 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const Lb = Math.pow(bg, 2.2);
  return (Math.max(Lt, Lb) + 0.05) / (Math.min(Lt, Lb) + 0.05);
}

export function extractPalette(img) {
  const c = document.createElement("canvas"); c.width = 48; c.height = 48;
  const x = c.getContext("2d"); x.drawImage(img, 0, 0, 48, 48);
  const d = x.getImageData(0, 0, 48, 48).data, bins = {};
  for (let i = 0; i < 48 * 48; i++) {
    const k = ((d[i * 4] >> 4) << 8) | ((d[i * 4 + 1] >> 4) << 4) | (d[i * 4 + 2] >> 4);
    bins[k] = (bins[k] || 0) + 1;
  }
  const top = Object.entries(bins).sort((a, b) => b[1] - a[1]).slice(0, 24)
    .map(([k]) => { k = +k; return [((k >> 8) & 15) * 17, ((k >> 4) & 15) * 17, (k & 15) * 17]; });
  const pal = [];
  for (const t of top) {
    if (pal.length >= 6) break;
    if (pal.every((p) => Math.abs(p[0] - t[0]) + Math.abs(p[1] - t[1]) + Math.abs(p[2] - t[2]) > 90)) pal.push(t);
  }
  return pal.map((p) => {
    const l = (v, tg) => Math.round(v + (tg - v) * 0.78);
    return "#" + [l(p[0], 250), l(p[1], 246), l(p[2], 238)].map((v) => v.toString(16).padStart(2, "0")).join("");
  });
}

export async function imgToB64(img, max = 1024) {
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8).split(",")[1];
}
