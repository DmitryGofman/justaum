import React, { useState, useEffect, useRef, useCallback } from "react";
import { composeItem, analyzeImage, contrastRatio, extractPalette, isHebrew } from "./engine.js";
import { store } from "./store.js";
import { PRESET_DEFAULTS, SCOUT_TERMS } from "./presets.js";
import { SEED_QUOTES } from "./data/seedQuotes.js";
import { CANON, weightedScore, verdictOf } from "./canon.js";
import { configureAI, aiCompose, aiFindQuotes, aiCritique, aiCaption, DEFAULT_MODEL } from "./ai.js";
import { scoutMet, scoutAIC } from "./scout.js";

/* ============ AUM STUDIO v2 — personal quote-art factory ============
   Engine renders · AI proposes · you decide.
   v2: the house Art Canon (what "good art" means here, incl. digital &
   Instagram-native), an AI curator that scores images against it, and
   AI quote finding — Claude reads the image and recalls real quotes
   from its own knowledge instead of only matching your library. */

const VERDICT_STYLE = {
  post:  { dot: "bg-emerald-400", text: "text-emerald-400", ring: "border-emerald-500" },
  maybe: { dot: "bg-amber-400",   text: "text-amber-400",   ring: "border-amber-500" },
  skip:  { dot: "bg-rose-400",    text: "text-rose-400",    ring: "border-rose-500" },
};
const stC = { verified: "text-emerald-400", disputed: "text-rose-400", modern: "text-amber-400", original: "text-sky-400" };

export default function AumStudio() {
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState([]);
  const [sel, setSel] = useState(-1);
  const [presets, setPresets] = useState(PRESET_DEFAULTS);
  const [styleKey, setStyleKey] = useState("classic");
  const [library, setLibrary] = useState([]);
  const [settings, setSettings] = useState({ handle: "@just.aum", exportSize: "1080x1350", apiKey: "", model: DEFAULT_MODEL });
  const [tab, setTab] = useState("deck");
  const [mode, setMode] = useState("compose");
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [contrast, setContrast] = useState(null);
  const [qsearch, setQsearch] = useState("");
  const [qcat, setQcat] = useState("");
  const [found, setFound] = useState([]);          // AI-found quotes for the current image/theme
  const [findTopic, setFindTopic] = useState("");
  const [findOriginal, setFindOriginal] = useState(false);
  const [scoutItems, setScoutItems] = useState([]);
  const [scoutMode, setScoutMode] = useState("");
  const [proposal, setProposal] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newQ, setNewQ] = useState({ text: "", attr: "" });
  const cvRef = useRef(null), feedRefs = useRef([]), fileRef = useRef(null), libFileRef = useRef(null);
  const dragRef = useRef({ on: false, ox: 0, oy: 0 });

  const item = sel >= 0 ? items[sel] : null;
  const preset = presets.find((p) => p.id === ((item && item.styleId) || styleKey)) || presets[0];

  /* boot: font + storage */
  useEffect(() => { (async () => {
    try { await document.fonts.load('16px "TrajanEmbed"'); } catch (e) {}
    const lib = await store.get("aum:library", null);
    if (lib && lib.length) setLibrary(lib);
    else {
      const seeded = SEED_QUOTES.map((q, i) => ({ ...q, id: "q" + i, usedAt: [], lang: isHebrew(q.text) ? "he" : "en" }));
      setLibrary(seeded); store.set("aum:library", seeded);
    }
    const st = await store.get("aum:settings", null);
    if (st) { setSettings((s) => ({ ...s, ...st })); configureAI({ apiKey: st.apiKey || "", model: st.model || DEFAULT_MODEL }); }
    const pr = await store.get("aum:presets", null);
    if (pr) setPresets(pr);
    setReady(true);
  })(); }, []);

  const saveLib = useCallback((l) => { setLibrary(l); store.set("aum:library", l); }, []);
  const savePresets = useCallback((p) => { setPresets(p); store.set("aum:presets", p); }, []);
  const saveSettings = useCallback((s) => { setSettings(s); store.set("aum:settings", s); configureAI({ apiKey: s.apiKey || "", model: s.model || DEFAULT_MODEL }); }, []);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2800); };
  const patchSel = (patch) => setItems((prev) => prev.map((it, i) => (i === sel ? { ...it, ...(typeof patch === "function" ? patch(it) : patch) } : it)));

  /* image intake */
  const addImage = useCallback((img, name) => {
    const a = analyzeImage(img);
    setItems((prev) => {
      const it = { id: Date.now() + Math.random(), name: name || "image", img, quote: null,
        pos: { ...(a.zones[0] ? { x: a.zones[0].x, y: a.zones[0].y } : { x: 0.5, y: 0.8 }) },
        ...a, overrides: null, styleId: null, caption: null, mood: null, critique: null, palette: extractPalette(img) };
      const next = [...prev, it]; setSel(next.length - 1); return next;
    });
  }, []);
  const loadFile = useCallback((f) => {
    const u = URL.createObjectURL(f); const im = new Image();
    im.onload = () => { addImage(im, f.name); URL.revokeObjectURL(u); }; im.src = u;
  }, [addImage]);
  useEffect(() => {
    const paste = (e) => { for (const it of e.clipboardData?.items || []) if (it.type.startsWith("image")) loadFile(it.getAsFile()); };
    const drop = (e) => { e.preventDefault(); [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image")).forEach(loadFile); };
    const over = (e) => e.preventDefault();
    window.addEventListener("paste", paste); window.addEventListener("drop", drop); window.addEventListener("dragover", over);
    return () => { window.removeEventListener("paste", paste); window.removeEventListener("drop", drop); window.removeEventListener("dragover", over); };
  }, [loadFile]);

  /* main canvas render */
  useEffect(() => {
    if (!item || !cvRef.current || mode !== "compose") return;
    const cv = cvRef.current, maxW = 1120, s = Math.min(1, maxW / item.img.width);
    cv.width = Math.round(item.img.width * s); cv.height = Math.round(item.img.height * s);
    const box = composeItem(cv.getContext("2d"), cv.width, cv.height, item, preset);
    if (box && item.quote) {
      const sc = { ...preset.scrim, ...((item.overrides || {}).scrim || {}) };
      const boxN = { topY: (box.topY / cv.height) * 1350, blockH: (box.blockH / cv.height) * 1350, widest: (box.widest / cv.width) * 1080 };
      setContrast(contrastRatio(item, boxN, sc, (item.overrides && item.overrides.color) || preset.color));
    } else setContrast(null);
  }, [items, sel, presets, styleKey, mode]);

  /* feed grid render */
  useEffect(() => {
    if (mode !== "feed") return;
    items.slice(0, 9).forEach((it, i) => {
      const c = feedRefs.current[i]; if (!c) return;
      c.width = 360; c.height = 450;
      composeItem(c.getContext("2d"), 360, 450, it, presets.find((p) => p.id === (it.styleId || styleKey)) || presets[0]);
    });
  }, [mode, items, presets, styleKey]);

  /* drag */
  const evPos = (e) => { const r = cvRef.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * cvRef.current.width) / r.width, y: ((e.clientY - r.top) * cvRef.current.height) / r.height }; };
  const pDown = (e) => { if (!item) return; dragRef.current.on = true; const p = evPos(e);
    dragRef.current.ox = p.x - item.pos.x * cvRef.current.width; dragRef.current.oy = p.y - item.pos.y * cvRef.current.height;
    e.target.setPointerCapture(e.pointerId); };
  const pMove = (e) => { if (!dragRef.current.on || !item) return; const p = evPos(e);
    const x = Math.min(0.97, Math.max(0.03, (p.x - dragRef.current.ox) / cvRef.current.width));
    const y = Math.min(0.97, Math.max(0.03, (p.y - dragRef.current.oy) / cvRef.current.height));
    patchSel({ pos: { x, y } }); };
  const pUp = () => { dragRef.current.on = false; };

  /* AI actions */
  const runCompose = async () => {
    if (!item) return flash("Add an image first");
    setBusy("compose");
    try {
      const p = await aiCompose(item, presets, library);
      setProposal(p);
      patchSel((it) => ({
        pos: p.anchor && p.anchor.x != null ? { x: p.anchor.x, y: p.anchor.y } : it.pos,
        styleId: presets.some((x) => x.id === p.styleId) ? p.styleId : it.styleId,
        overrides: p.overrides || null, mood: p.mood || it.mood,
        palette: p.palette && p.palette.length ? p.palette : it.palette,
      }));
      setTab("deck");
      if (p.lowConfidence) flash("Low confidence — try Find quotes with a theme");
    } catch (e) {
      flash("AI unavailable — deterministic auto-place applied");
      if (item.zones[0]) patchSel((it) => ({ pos: { x: it.zones[0].x, y: it.zones[0].y } }));
    }
    setBusy("");
  };
  const runFind = async (fromTheme) => {
    if (!item && !findTopic.trim() && !fromTheme) return flash("Add an image or type a theme");
    setBusy("find");
    try {
      const qs = await aiFindQuotes(fromTheme ? null : item, { topic: findTopic.trim(), original: findOriginal });
      setFound(qs); setTab("deck");
      if (!qs.length) flash("Nothing surfaced — try a theme word");
    } catch (e) { flash("Find failed: " + e.message); }
    setBusy("");
  };
  const runCritique = async () => {
    if (!item) return flash("Add an image first");
    setBusy("critique");
    try {
      const c = await aiCritique(item);
      patchSel({ critique: c }); setTab("canon");
    } catch (e) { flash("Critique failed: " + e.message); }
    setBusy("");
  };
  const runCaption = async () => {
    if (!item || !item.quote) return flash("Choose a quote first");
    setBusy("caption");
    try { const c = await aiCaption(item.quote, item.mood, settings.handle); patchSel({ caption: c }); setTab("words"); }
    catch (e) { flash("Caption call failed"); }
    setBusy("");
  };
  const runScout = async () => {
    setBusy("scout"); setScoutMode(""); setScoutItems([]);
    const term = SCOUT_TERMS[new Date().getDate() % SCOUT_TERMS.length];
    try {
      const [met, aic] = await Promise.allSettled([scoutMet(term), scoutAIC(term)]);
      const all = [...(met.value || []), ...(aic.value || [])].sort(() => Math.random() - 0.5).slice(0, 8);
      if (!all.length) throw new Error("empty");
      setScoutItems(all); setScoutMode("images");
    } catch (e) {
      setScoutMode("links");
      setScoutItems([
        { title: `The Met search: "${term}"`, url: `https://www.metmuseum.org/search-results?q=${encodeURIComponent(term)}&searchFacet=Art%20with%20image&showOnly=openAccess`, source: "The Met · CC0" },
        { title: `Art Institute Chicago: "${term}"`, url: `https://www.artic.edu/collection?q=${encodeURIComponent(term)}&is_public_domain=1`, source: "AIC · CC0" },
        { title: `Wikimedia Commons: "${term}"`, url: `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(term)}`, source: "Commons" },
      ]);
    }
    setBusy("");
  };
  const scoutAdd = async (s) => {
    setBusy("scoutadd");
    try {
      const blob = await fetch(s.full || s.src).then((r) => r.blob());
      const bmp = await createImageBitmap(blob);
      addImage(bmp, s.title);
      flash("Added — art: " + (s.artist || ""));
    } catch (e) { flash("Image blocked — open link & upload manually"); }
    setBusy("");
  };

  /* quote apply + library */
  const applyQuote = (q, id) => {
    if (sel < 0) return flash("Select an image first");
    patchSel({ quote: { text: q.text, attr: (q.attr || "").split("(")[0].trim() }, quoteId: id || q.id || null });
  };
  const keepFound = (q, idx) => {
    const nq = { ...q, id: "f" + Date.now() + idx, usedAt: [], lang: isHebrew(q.text) ? "he" : "en", cat: q.cat || "custom" };
    saveLib([nq, ...library]); flash("Kept in library");
    return nq;
  };
  const stampUsed = (ids) => {
    const today = new Date().toISOString().slice(0, 10);
    saveLib(library.map((q) => (ids.includes(q.id) ? { ...q, usedAt: [...(q.usedAt || []), today] } : q)));
  };

  /* export */
  const exportOne = async (it, W, H) => {
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    composeItem(c.getContext("2d"), W, H, it, presets.find((p) => p.id === (it.styleId || styleKey)) || presets[0]);
    await new Promise((res) => c.toBlob((b) => {
      const a = document.createElement("a"); a.href = URL.createObjectURL(b);
      a.download = `aum-${new Date().toISOString().slice(0, 10)}-${it.name.replace(/\.[^.]+$/, "").slice(0, 24)}.png`; a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); res(); }, 350);
    }, "image/png"));
  };
  const doExport = async (all) => {
    const [W, H] = settings.exportSize === "original" && item ? [item.img.width, item.img.height] : settings.exportSize.split("x").map(Number);
    const targets = all ? items.filter((i) => i.quote) : item && item.quote ? [item] : [];
    if (!targets.length) return flash("Nothing composed yet");
    for (const t of targets) await exportOne(t, W, H);
    stampUsed(targets.map((t) => t.quoteId).filter(Boolean));
    flash(`Exported ${targets.length} — quotes marked used`);
  };

  /* scrim + preset edit (persisted per preset) */
  const editScrim = (patch) => savePresets(presets.map((p) => (p.id === preset.id ? { ...p, scrim: { ...p.scrim, ...patch } } : p)));
  const editPreset = (patch) => savePresets(presets.map((p) => (p.id === preset.id ? { ...p, ...patch } : p)));
  const lightPlate = () => { editScrim({ shape: "box", color: "#f4f1e8", opacity: 0.82, softness: 0.2 }); editPreset({ color: "#242018", shadow: 2 }); };

  const cats = [...new Set(library.map((q) => q.cat))];
  const visibleQs = library.filter((q) =>
    (!qsearch || q.text.toLowerCase().includes(qsearch.toLowerCase()) || (q.attr || "").toLowerCase().includes(qsearch.toLowerCase())) &&
    (!qcat || q.cat === qcat));
  const candidateIds = (proposal && proposal.quoteCandidates) || [];
  const freshQuotes = (proposal && proposal.freshQuotes) || [];

  if (!ready) return <div className="h-screen flex items-center justify-center bg-zinc-950 text-amber-100 font-serif tracking-widest">ॐ &nbsp;loading…</div>;

  return (
  <div className="h-screen flex flex-col bg-zinc-950 text-zinc-200" style={{ fontFamily: "system-ui,sans-serif" }}>
    {/* header */}
    <header className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 shrink-0">
      <h1 className="text-amber-200 tracking-[.25em] text-base" style={{ fontFamily: "TrajanEmbed,Cinzel,serif" }}>AUM STUDIO</h1>
      <span className="text-zinc-500 text-xs hidden sm:block">engine renders · AI proposes · you decide</span>
      <div className="ml-auto flex rounded-lg overflow-hidden border border-zinc-700 text-xs">
        <button onClick={() => setMode("compose")} className={`px-3 py-1.5 ${mode === "compose" ? "bg-amber-300 text-zinc-900 font-semibold" : "hover:text-amber-200"}`}>Compose</button>
        <button onClick={() => setMode("feed")} className={`px-3 py-1.5 ${mode === "feed" ? "bg-amber-300 text-zinc-900 font-semibold" : "hover:text-amber-200"}`}>Feed 3×3</button>
      </div>
      <select value={settings.exportSize} onChange={(e) => saveSettings({ ...settings, exportSize: e.target.value })}
        className="bg-zinc-900 border border-zinc-700 rounded-lg text-xs px-2 py-1.5">
        <option value="1080x1350">1080×1350</option><option value="1080x1080">1080×1080</option><option value="1080x1920">Story 1080×1920</option>
      </select>
      <button onClick={() => doExport(true)} className="bg-amber-300 text-zinc-900 text-xs font-semibold rounded-lg px-3 py-1.5">Export all</button>
      <button onClick={() => setSettingsOpen((o) => !o)} title="Settings" className="border border-zinc-700 rounded-lg px-2 py-1.5 text-xs hover:border-amber-300">⚙</button>
    </header>

    {settingsOpen && (
      <div className="border-b border-zinc-800 bg-zinc-900/60 px-4 py-3 flex flex-wrap items-center gap-3 text-xs shrink-0">
        <label className="flex items-center gap-2">Handle
          <input value={settings.handle} onChange={(e) => saveSettings({ ...settings, handle: e.target.value })}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 w-36" />
        </label>
        <label className="flex items-center gap-2">API key
          <input type="password" value={settings.apiKey} placeholder="only needed outside claude.ai"
            onChange={(e) => saveSettings({ ...settings, apiKey: e.target.value })}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 w-64" />
        </label>
        <label className="flex items-center gap-2">Model
          <input value={settings.model} onChange={(e) => saveSettings({ ...settings, model: e.target.value })}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 w-44" />
        </label>
        <span className="text-zinc-500">Inside a claude.ai artifact no key is needed; standalone, paste an Anthropic API key (stored only in this browser).</span>
      </div>
    )}

    <div className="flex flex-1 overflow-hidden">
      {/* queue rail */}
      <div className="w-20 sm:w-24 border-r border-zinc-800 overflow-y-auto p-2 flex flex-col gap-2 shrink-0">
        <button onClick={() => fileRef.current.click()} className="aspect-square border border-dashed border-zinc-700 rounded-lg text-zinc-500 text-xl hover:border-amber-300 hover:text-amber-300">＋</button>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => [...e.target.files].forEach(loadFile)} />
        {items.map((it, i) => {
          const v = it.critique && verdictOf(weightedScore(it.critique.scores));
          return (
          <div key={it.id} onClick={() => { setSel(i); setMode("compose"); }}
            className={`relative rounded-lg overflow-hidden cursor-pointer border-2 ${i === sel ? "border-amber-300" : "border-transparent"}`}>
            <MiniThumb img={it.img} />
            {v && <span title={`curator: ${v}`} className={`absolute top-1 left-1 w-2.5 h-2.5 rounded-full ${VERDICT_STYLE[v].dot} ring-1 ring-black/60`} />}
            {it.quote && <div className="absolute bottom-0 inset-x-0 bg-black/70 text-amber-200 text-[8px] px-1 truncate">{it.quote.text}</div>}
            <button onClick={(e) => { e.stopPropagation(); setItems((p) => p.filter((_, j) => j !== i)); setSel((s) => (s >= items.length - 1 ? items.length - 2 : s)); }}
              className="absolute top-0.5 right-0.5 bg-black/60 rounded-full w-4 h-4 text-[9px] leading-none">✕</button>
          </div>);
        })}
      </div>

      {/* center */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center gap-3">
        {mode === "compose" ? (
          !item ? (
            <div className="text-center text-zinc-500 mt-[16vh] leading-8">
              <div className="text-4xl text-amber-200/60 mb-3">ॐ</div>
              Add images with ＋, paste, or drop anywhere.<br />
              Or open <button onClick={() => { setTab("scout"); runScout(); }} className="text-amber-300 underline underline-offset-4">Scout</button> for today's museum finds.<br />
              <span className="text-xs">New here? Read the <button onClick={() => setTab("canon")} className="text-amber-300 underline underline-offset-4">Canon</button> — the house definition of good art.</span>
            </div>
          ) : (<>
            <div className="w-full max-w-xl">
              <canvas ref={cvRef} className="w-full rounded-lg cursor-grab touch-none"
                onPointerDown={pDown} onPointerMove={pMove} onPointerUp={pUp} />
            </div>
            <div className="w-full max-w-xl flex flex-wrap items-center gap-2">
              <button onClick={runCompose} disabled={!!busy}
                className="bg-gradient-to-r from-amber-300 to-amber-200 text-zinc-900 font-semibold text-sm rounded-lg px-4 py-2 disabled:opacity-50">
                {busy === "compose" ? "Contemplating…" : "✨ Compose"}</button>
              <button onClick={() => runFind(false)} disabled={!!busy}
                className="border border-amber-300/60 text-amber-200 rounded-lg px-3 py-2 text-sm disabled:opacity-50">
                {busy === "find" ? "Searching memory…" : "✦ Find quotes"}</button>
              <button onClick={runCritique} disabled={!!busy}
                className="border border-zinc-700 rounded-lg px-3 py-2 text-sm hover:border-amber-300 disabled:opacity-50">
                {busy === "critique" ? "Judging…" : "⚖ Critique"}</button>
              <button onClick={() => { if (item.zones[0]) patchSel((it) => ({ pos: { x: it.zones[0].x, y: it.zones[0].y } })); }}
                className="border border-zinc-700 rounded-lg px-3 py-2 text-sm hover:border-amber-300">Auto-place</button>
              <button onClick={runCaption} disabled={!!busy} className="border border-zinc-700 rounded-lg px-3 py-2 text-sm hover:border-amber-300 disabled:opacity-50">
                {busy === "caption" ? "Writing…" : "Caption"}</button>
              <button onClick={() => doExport(false)} className="border border-amber-300/60 text-amber-200 rounded-lg px-3 py-2 text-sm">Export</button>
              {contrast && <span className={`ml-auto text-xs px-2.5 py-1 rounded-full border ${contrast >= 4.5 ? "border-emerald-500 text-emerald-400" : contrast >= 3 ? "border-amber-500 text-amber-400" : "border-rose-500 text-rose-400"}`}>
                contrast {contrast.toFixed(1)}:1</span>}
            </div>
            {item.mood && <div className="w-full max-w-xl text-xs text-zinc-500">mood: {item.mood.join(" · ")}</div>}
            {item.critique && <CritiqueCard critique={item.critique} />}
          </>)
        ) : (
          <div className="w-full max-w-xl">
            <div className="grid grid-cols-3 gap-0.5">
              {Array.from({ length: 9 }).map((_, i) => (
                items[i] ? (
                  <div key={i} className="relative">
                    <canvas ref={(el) => (feedRefs.current[i] = el)} className="w-full aspect-[4/5] bg-black" />
                    {items[i].critique && (() => { const v = verdictOf(weightedScore(items[i].critique.scores));
                      return <span className={`absolute top-1 left-1 w-2.5 h-2.5 rounded-full ${VERDICT_STYLE[v].dot} ring-1 ring-black/60`} />; })()}
                  </div>
                ) : <div key={i} className="w-full aspect-[4/5] bg-zinc-900" />))}
            </div>
            <p className="text-xs text-zinc-500 mt-3">The grid is the brand. If one tile shouts, recompose it. Dots are the curator's verdicts.</p>
          </div>
        )}
      </div>

      {/* right panel */}
      <div className="w-72 sm:w-80 border-l border-zinc-800 flex flex-col shrink-0 overflow-hidden">
        <div className="flex border-b border-zinc-800 text-xs shrink-0">
          {["deck", "style", "canon", "words", "scout"].map((t) => (
            <button key={t} onClick={() => { setTab(t); if (t === "scout" && !scoutItems.length) runScout(); }}
              className={`flex-1 py-2.5 uppercase tracking-widest ${tab === t ? "text-amber-300 border-b-2 border-amber-300" : "text-zinc-500 hover:text-zinc-300"}`}>{t}</button>))}
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">

          {tab === "deck" && <>
            {(candidateIds.length > 0 || freshQuotes.length > 0) && (
              <div className="border border-amber-300/40 rounded-lg p-2 space-y-2">
                <div className="text-[10px] tracking-widest text-amber-300 uppercase">AI picked for this image</div>
                {candidateIds.map((id) => { const q = library.find((x) => x.id === id); return q ? (
                  <div key={id} onClick={() => applyQuote(q)} className="cursor-pointer bg-zinc-900 rounded-lg p-2.5 hover:ring-1 ring-amber-300">
                    <div className="text-sm" style={{ fontFamily: "Cormorant Garamond,Georgia,serif" }}>"{q.text}"</div>
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-1">{q.attr} · <span className="normal-case tracking-normal">library</span></div>
                  </div>) : null; })}
                {freshQuotes.map((q, i) => (
                  <div key={"fq" + i} className="bg-zinc-900 rounded-lg p-2.5 border border-sky-800/40">
                    <div onClick={() => applyQuote(q)} className="cursor-pointer hover:text-amber-100">
                      <div className="text-sm" style={{ fontFamily: "Cormorant Garamond,Georgia,serif" }}>"{q.text}"</div>
                      <div className="text-[10px] text-zinc-500 mt-1">{q.attr || "—"} · <span className={stC[q.status] || ""}>{q.status}</span> · <span className="text-sky-400">found by AI</span></div>
                      {q.why && <div className="text-[10px] text-zinc-600 italic mt-0.5">{q.why}</div>}
                    </div>
                    <button onClick={() => keepFound(q, i)} className="mt-1.5 text-[10px] border border-zinc-700 rounded px-2 py-0.5 hover:border-amber-300">＋ keep in library</button>
                  </div>))}
              </div>
            )}

            {/* Find quotes with AI — the model's own knowledge, not a list */}
            <div className="border border-zinc-800 rounded-lg p-2 space-y-2">
              <div className="text-[10px] tracking-widest text-amber-300 uppercase">✦ Find quotes with AI</div>
              <p className="text-[10px] text-zinc-600">Claude reads the selected image (or your theme) and recalls real quotes from scripture, philosophy and poetry — with honest attribution flags. Or ask for original lines.</p>
              <div className="flex gap-2">
                <input value={findTopic} onChange={(e) => setFindTopic(e.target.value)} placeholder={item ? "optional theme…" : "theme, e.g. stillness"}
                  className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm" />
                <button onClick={() => runFind(!item)} disabled={busy === "find"}
                  className="bg-amber-300 text-zinc-900 rounded-lg px-3 text-sm font-semibold disabled:opacity-50">{busy === "find" ? "…" : "Go"}</button>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-zinc-400 cursor-pointer">
                <input type="checkbox" checked={findOriginal} onChange={(e) => setFindOriginal(e.target.checked)} className="accent-amber-300" />
                write original lines instead (no attribution)
              </label>
              {found.map((q, i) => (
                <div key={i} className="rounded-lg p-2.5 bg-zinc-900 border border-zinc-800">
                  <div className="text-sm" style={{ fontFamily: "Cormorant Garamond,Georgia,serif" }}>"{q.text}"</div>
                  <div className="text-[10px] text-zinc-500 mt-1">{q.attr || "original"} · <span className={stC[q.status] || ""}>{q.status}</span></div>
                  {q.why && <div className="text-[10px] text-zinc-600 italic mt-0.5">{q.why}</div>}
                  <div className="flex gap-2 mt-1.5">
                    <button onClick={() => applyQuote(q)} className="flex-1 text-xs bg-amber-300 text-zinc-900 font-semibold rounded py-1">Use</button>
                    <button onClick={() => { const nq = keepFound(q, i); applyQuote(nq, nq.id); setFound((h) => h.filter((_, j) => j !== i)); }}
                      className="flex-1 text-xs bg-emerald-600/80 rounded py-1">Use + keep</button>
                    <button onClick={() => setFound((h) => h.filter((_, j) => j !== i))} className="flex-1 text-xs bg-zinc-700 rounded py-1">Skip</button>
                  </div>
                </div>))}
            </div>

            <input value={qsearch} onChange={(e) => setQsearch(e.target.value)} placeholder={`Search ${library.length} quotes…`}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm" />
            <div className="flex flex-wrap gap-1.5">
              <Chip on={!qcat} onClick={() => setQcat("")}>all</Chip>
              {cats.map((c) => <Chip key={c} on={qcat === c} onClick={() => setQcat(c)}>{c}</Chip>)}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { const pool = visibleQs.filter((q) => !(q.usedAt || []).length); const q = pool[Math.floor(Math.random() * pool.length)]; if (q) applyQuote(q); }}
                className="flex-1 border border-zinc-700 rounded-lg py-2 text-sm hover:border-amber-300">☽ Draw a card</button>
              <button onClick={() => setAddOpen((o) => !o)} className="border border-zinc-700 rounded-lg px-3 text-sm hover:border-amber-300">＋</button>
            </div>
            {addOpen && <div className="space-y-2 border border-zinc-800 rounded-lg p-2">
              <textarea value={newQ.text} onChange={(e) => setNewQ({ ...newQ, text: e.target.value })} placeholder="Your words…" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-sm min-h-14" />
              <input value={newQ.attr} onChange={(e) => setNewQ({ ...newQ, attr: e.target.value })} placeholder="Attribution (blank = original)" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-sm" />
              <button onClick={() => { if (!newQ.text.trim()) return;
                saveLib([{ id: "c" + Date.now(), text: newQ.text.trim(), attr: newQ.attr.trim(), cat: "custom", status: newQ.attr ? "modern" : "original", usedAt: [], lang: isHebrew(newQ.text) ? "he" : "en" }, ...library]);
                setNewQ({ text: "", attr: "" }); setAddOpen(false); }}
                className="w-full bg-amber-300 text-zinc-900 rounded-lg py-1.5 text-sm font-semibold">Save to library</button>
            </div>}
            <div className="space-y-2">
              {visibleQs.slice(0, 60).map((q) => { const used = (q.usedAt || []).length; return (
                <div key={q.id} onClick={() => applyQuote(q)}
                  className={`cursor-pointer rounded-lg p-2.5 border border-zinc-800 hover:border-amber-300/70 ${used ? "opacity-45" : ""}`}>
                  <div className="text-sm leading-snug" style={{ fontFamily: "Cormorant Garamond,Georgia,serif" }}>"{q.text}"</div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{q.attr || "—"}</span>
                    <span className={`text-[9px] ${stC[q.status] || "text-zinc-500"}`}>● {q.status}{used ? ` · used ${q.usedAt[q.usedAt.length - 1]}` : ""}</span>
                  </div>
                </div>); })}
            </div>
            <div className="border-t border-zinc-800 pt-3 flex gap-2">
              <button onClick={() => libFileRef.current.click()} className="flex-1 border border-zinc-700 rounded-lg py-1.5 text-xs">Import JSON</button>
              <button onClick={() => { const b = new Blob([JSON.stringify({ quotes: library }, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "quotes.json"; a.click(); }}
                className="flex-1 border border-zinc-700 rounded-lg py-1.5 text-xs">Export JSON</button>
              <input ref={libFileRef} type="file" accept=".json" className="hidden" onChange={(e) => {
                const f = e.target.files[0]; if (!f) return; const r = new FileReader();
                r.onload = () => { try { const j = JSON.parse(r.result);
                  const qs = (j.quotes || j).map((q, i) => ({ ...q, id: q.id || "i" + Date.now() + i, usedAt: q.usedAt || [], lang: q.lang || (isHebrew(q.text) ? "he" : "en") }));
                  saveLib([...qs, ...library.filter((l) => !qs.some((n) => n.text === l.text))]); flash(`Imported ${qs.length} quotes`); } catch (err) { flash("Invalid JSON"); } };
                r.readAsText(f); }} />
            </div>
          </>}

          {tab === "style" && <>
            <div className="space-y-2">
              {presets.map((p) => (
                <div key={p.id} onClick={() => { setStyleKey(p.id); if (item) patchSel({ styleId: p.id, overrides: null }); }}
                  className={`cursor-pointer rounded-lg p-3 border ${(item && item.styleId ? item.styleId : styleKey) === p.id ? "border-amber-300" : "border-zinc-800"}`}>
                  <div className="text-sm" style={{ fontFamily: p.fontStack, letterSpacing: p.caps ? ".12em" : "0", fontStyle: p.italic ? "italic" : "normal", color: p.color, textTransform: p.caps ? "uppercase" : "none" }}>{p.name}</div>
                </div>))}
            </div>
            <div className="border-t border-zinc-800 pt-3 space-y-3">
              <div className="text-[10px] tracking-widest text-amber-300 uppercase">Scrim — {preset.name}</div>
              <div className="flex flex-wrap gap-1.5">
                {["band", "box", "vignette", "none"].map((s) => <Chip key={s} on={preset.scrim.shape === s} onClick={() => editScrim({ shape: s })}>{s}</Chip>)}
              </div>
              <Slider label="Opacity" v={preset.scrim.opacity} min={0} max={1} step={0.02} onC={(v) => editScrim({ opacity: v })} />
              <Slider label="Cloudiness" v={preset.scrim.softness} min={0} max={1} step={0.05} onC={(v) => editScrim({ softness: v })} />
              <Slider label="Padding" v={preset.scrim.padding} min={0.2} max={2} step={0.1} onC={(v) => editScrim({ padding: v })} />
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                Scrim color <input type="color" value={preset.scrim.color} onChange={(e) => editScrim({ color: e.target.value })} className="w-8 h-7 bg-transparent border border-zinc-700 rounded" />
                <button onClick={lightPlate} className="ml-auto border border-zinc-600 rounded-lg px-2 py-1 hover:border-amber-300">☀ Light plate</button>
              </div>
            </div>
            <div className="border-t border-zinc-800 pt-3 space-y-3">
              <div className="text-[10px] tracking-widest text-amber-300 uppercase">Type</div>
              <Slider label="Size" v={preset.size} min={26} max={96} step={1} onC={(v) => editPreset({ size: v })} />
              <Slider label="Tracking" v={preset.ls} min={0} max={14} step={0.5} onC={(v) => editPreset({ ls: v })} />
              <Slider label="Line width" v={preset.maxWidthPct} min={0.35} max={0.92} step={0.01} onC={(v) => editPreset({ maxWidthPct: v })} />
              <Slider label="Shadow" v={preset.shadow} min={0} max={30} step={1} onC={(v) => editPreset({ shadow: v })} />
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                Text color <input type="color" value={preset.color} onChange={(e) => editPreset({ color: e.target.value })} className="w-8 h-7 bg-transparent border border-zinc-700 rounded" />
                {item && item.palette && <span className="ml-2 flex gap-1">{item.palette.slice(0, 6).map((c, i) =>
                  <button key={i} onClick={() => editPreset({ color: c })} className="w-5 h-5 rounded-full border border-zinc-600" style={{ background: c }} />)}</span>}
              </div>
              <p className="text-[10px] text-zinc-600">Trajan ships with the app — Aum Classic always renders true.</p>
            </div>
          </>}

          {tab === "canon" && <CanonPanel item={item} onCritique={runCritique} busy={busy} />}

          {tab === "words" && <>
            {!item || !item.caption ? (
              <div className="text-zinc-500 text-sm">Choose a quote, then hit <b className="text-amber-300">Caption</b> under the canvas. The AI writes the hook + body + tags in the just.aum formula.</div>
            ) : (<>
              <textarea readOnly value={buildCaption(item.caption, settings.handle, item.quote)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-xs min-h-64" />
              <button onClick={async () => { try { await navigator.clipboard.writeText(buildCaption(item.caption, settings.handle, item.quote)); flash("Caption copied"); } catch (e) { flash("Select & copy manually"); } }}
                className="w-full bg-amber-300 text-zinc-900 rounded-lg py-2 text-sm font-semibold">Copy caption</button>
              <button onClick={runCaption} className="w-full border border-zinc-700 rounded-lg py-1.5 text-xs">↻ Rewrite</button>
            </>)}
          </>}

          {tab === "scout" && <>
            <div className="flex items-center gap-2">
              <div className="text-[10px] tracking-widest text-amber-300 uppercase flex-1">Today's hunt</div>
              <button onClick={runScout} disabled={busy === "scout"} className="border border-zinc-700 rounded-lg px-2.5 py-1 text-xs hover:border-amber-300 disabled:opacity-50">{busy === "scout" ? "Hunting…" : "↻ New hunt"}</button>
            </div>
            {scoutMode === "images" && scoutItems.map((s, i) => (
              <div key={i} className="rounded-lg overflow-hidden border border-zinc-800">
                <img src={s.src} alt={s.title} className="w-full max-h-44 object-cover" loading="lazy" />
                <div className="p-2">
                  <div className="text-xs truncate">{s.title}</div>
                  <div className="text-[10px] text-zinc-500">{s.artist} · {s.source}</div>
                  <div className="flex gap-2 mt-1.5">
                    <button onClick={() => scoutAdd(s)} disabled={!!busy} className="flex-1 bg-amber-300 text-zinc-900 rounded py-1 text-xs font-semibold disabled:opacity-50">Add to queue</button>
                    <a href={s.url} target="_blank" rel="noreferrer" className="flex-1 text-center border border-zinc-700 rounded py-1 text-xs">View source</a>
                  </div>
                </div>
              </div>))}
            {scoutMode === "links" && <>
              <p className="text-xs text-zinc-500">Direct image loading is blocked here — Scout switches to link mode. Open, download what calls to you, drop it back here.</p>
              {scoutItems.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-zinc-800 p-2.5 hover:border-amber-300">
                  <div className="text-xs">{s.title}</div><div className="text-[10px] text-zinc-500">{s.source}</div>
                </a>))}
            </>}
            <p className="text-[10px] text-zinc-600 border-t border-zinc-800 pt-2">All sources are open-access / CC0 — safe to publish. For digital / ArtStation / Instagram artists: clear rights with the artist first, then upload here and run ⚖ Critique like any other image.</p>
          </>}
        </div>
      </div>
    </div>

    {toast && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-zinc-800 border border-amber-300/50 text-amber-100 text-sm rounded-lg px-4 py-2 shadow-xl">{toast}</div>}
  </div>);
}

/* ---------------- Canon panel: the manifesto + the current critique ---------------- */
function CanonPanel({ item, onCritique, busy }) {
  const [open, setOpen] = useState("essence");
  const Sec = ({ id, title, children }) => (
    <div className="border border-zinc-800 rounded-lg">
      <button onClick={() => setOpen(open === id ? "" : id)}
        className="w-full text-left px-3 py-2 text-[10px] tracking-widest uppercase text-amber-300 flex justify-between">
        {title}<span className="text-zinc-600">{open === id ? "–" : "+"}</span>
      </button>
      {open === id && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  );
  return (<>
    {item && (
      <button onClick={onCritique} disabled={!!busy}
        className="w-full bg-amber-300 text-zinc-900 rounded-lg py-2 text-sm font-semibold disabled:opacity-50">
        {busy === "critique" ? "Judging…" : "⚖ Critique this image against the canon"}
      </button>
    )}
    {item && item.critique && <CritiqueCard critique={item.critique} />}
    <p className="text-xs text-zinc-500 leading-relaxed">{CANON.essence}</p>
    <Sec id="principles" title="What makes art good — anywhere">
      {CANON.principles.map((p) => (
        <div key={p.id}><div className="text-xs text-zinc-200 font-semibold">{p.title}</div>
          <p className="text-[11px] text-zinc-500 leading-relaxed">{p.body}</p></div>))}
    </Sec>
    <Sec id="mediums" title="By medium — classical · digital · AI · photo">
      {CANON.mediums.map((m) => (
        <div key={m.id}><div className="text-xs text-zinc-200 font-semibold">{m.title}</div>
          <p className="text-[11px] text-zinc-500 leading-relaxed">{m.body}</p>
          <p className="text-[11px] text-emerald-500/80 leading-relaxed">✓ {m.good}</p>
          <p className="text-[11px] text-rose-500/80 leading-relaxed">✕ {m.avoid}</p></div>))}
    </Sec>
    <Sec id="instagram" title="Instagram-native criteria">
      {CANON.instagram.map((p) => (
        <div key={p.id}><div className="text-xs text-zinc-200 font-semibold">{p.title}</div>
          <p className="text-[11px] text-zinc-500 leading-relaxed">{p.body}</p></div>))}
    </Sec>
    <p className="text-[10px] text-zinc-600">The ⚖ Critique button scores every image against exactly this text — edit <code>src/canon.js</code> and the curator's taste changes with it.</p>
  </>);
}

/* ---------------- Critique result card ---------------- */
function CritiqueCard({ critique }) {
  const total = weightedScore(critique.scores);
  const v = critique.verdict && VERDICT_STYLE[critique.verdict] ? critique.verdict : verdictOf(total);
  const vs = VERDICT_STYLE[v];
  return (
    <div className={`w-full max-w-xl border rounded-lg p-3 space-y-2 ${vs.ring} bg-zinc-900/60`}>
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${vs.dot}`} />
        <span className={`text-sm font-semibold uppercase tracking-widest ${vs.text}`}>{v}</span>
        <span className="text-xs text-zinc-500">curator score {total.toFixed(1)} / 10 · {critique.medium || "?"}{critique.cropSafe === false ? " · ⚠ fails 4:5 crop" : ""}</span>
      </div>
      {critique.summary && <p className="text-xs text-zinc-400 italic">{critique.summary}</p>}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {CANON.dimensions.map((d) => {
          const s = critique.scores?.[d.key] ?? 0;
          return (
            <div key={d.key} className="flex items-center gap-2 text-[10px] text-zinc-500">
              <span className="w-24 shrink-0">{d.label}</span>
              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className={`h-full ${s >= 7.5 ? "bg-emerald-400" : s >= 5.5 ? "bg-amber-400" : "bg-rose-400"}`} style={{ width: `${s * 10}%` }} />
              </div>
              <span className="w-6 text-right">{s}</span>
            </div>);
        })}
      </div>
      {!!(critique.strengths || []).length && <p className="text-[11px] text-emerald-500/80">✓ {critique.strengths.join(" · ")}</p>}
      {!!(critique.risks || []).length && <p className="text-[11px] text-rose-400/80">✕ {critique.risks.join(" · ")}</p>}
    </div>
  );
}

/* ---------------- bits ---------------- */
function MiniThumb({ img }) {
  const r = useRef(null);
  useEffect(() => { const c = r.current; if (!c) return; c.width = 96; c.height = 120;
    const x = c.getContext("2d"); const s = Math.max(96 / img.width, 120 / img.height);
    x.drawImage(img, (96 - img.width * s) / 2, (120 - img.height * s) / 2, img.width * s, img.height * s); }, [img]);
  return <canvas ref={r} className="w-full block" />;
}
function Chip({ on, onClick, children }) {
  return <button onClick={onClick} className={`px-2.5 py-1 rounded-full text-[11px] border ${on ? "bg-amber-300 text-zinc-900 border-amber-300 font-semibold" : "border-zinc-700 text-zinc-400 hover:border-amber-300"}`}>{children}</button>;
}
function Slider({ label, v, min, max, step, onC }) {
  return <label className="flex items-center gap-2 text-xs text-zinc-400">
    <span className="w-20 shrink-0">{label}</span>
    <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => onC(parseFloat(e.target.value))} className="flex-1 accent-amber-300" />
    <span className="w-9 text-right text-zinc-500">{typeof v === "number" ? (max <= 2 ? Math.round(v * 100) + "%" : v) : v}</span>
  </label>;
}
function buildCaption(c, handle, quote) {
  const tags = (c.hashtags || []).join(" ");
  return `${c.hook} 🙏\n•\n${c.body}\n•\n🌱 For more inspirational insight visit ${handle} 🌿\n🕉️ Follow ${handle} and turn on post notifications 🙏\n\n••••••••••••••••••••••••\n${quote && quote.attr ? `✒️ Quote by ${quote.attr}\n` : ""}••••••••••••••••••••••••\n\n${tags}`;
}
