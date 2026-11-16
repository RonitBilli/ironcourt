"use strict";
// ================= food log =================
// Logging is built around what the logs showed people actually do: tap what they usually
// eat, or type it the way they'd say it. The meal plan is one suggestion among the chips.
const PARTY_DRINKS = [["Peg (30 ml)", "Whisky / rum, 30 ml", 70], ["Beer 330", "Beer, 330 ml", 140], ["Strong beer 650", "Strong beer, 650 ml", 390], ["Wine glass", "Wine, 150 ml", 125], ["Cocktail", "Cocktail", 220], ["Shot", "Vodka / gin shot, 30 ml", 65]];
const PARTY_FOOD = [["Pizza slice", 280, 12], ["Fries (portion)", 350, 4], ["Chicken starter (plate)", 450, 35], ["Paneer tikka (plate)", 380, 20], ["Burger", 500, 20], ["Nachos (plate)", 450, 8], ["Biryani (plate)", 700, 25], ["Momos (6)", 300, 12], ["Late-night maggi", 400, 8]];
// ---------- "what I actually ate": food bank search + a plain-language parser ----------
const NUMWORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5, quarter: 0.25, some: 1, few: 2, couple: 2, ek: 1, do: 2, teen: 3, char: 4, aadha: 0.5, adha: 0.5 };
const STOP = new Set(["of", "the", "some", "with", "plate", "plates", "bowl", "bowls", "katori", "katoris", "glass", "glasses", "cup", "cups", "piece", "pieces", "pcs", "pc", "slice", "slices", "small", "big", "large", "medium", "full", "serving", "servings", "x", "nos", "no", "ek", "do", "aur", "ka", "ki", "ke"]);
// Words that are a food on their own: if a bank name has one you didn't type, it's probably a different dish.
const STAPLE = new Set(["rice", "chawal", "roti", "dal", "paratha", "naan", "puri", "pav", "bread", "biryani", "pulao", "milk", "curd", "egg", "chicken", "paneer"].map((w) => w.replace(/(es|s)$/, "")));
const norm = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(es|s)$/, "");
const tokens = (t) => t.toLowerCase().split(/[^a-z0-9/.]+/).filter((w) => w && !STOP.has(w)).map(norm).filter(Boolean);
// Each bank name can have alternatives ("Curd / dahi"); words in brackets are optional.
const DB_INDEX = FOOD_DB.map(([name, serving, kcal, p, extra]) => ({ name, serving, kcal, p, toks: new Set(tokens(`${name} ${extra}`)),
  alts: name.replace(/\([^)]*\)/g, " ").split("/").map((x) => tokens(x)).filter((x) => x.length) }));
function bestMatch(text) {
  const q = tokens(text).filter((w) => !/^\d/.test(w));
  if (!q.length) return null;
  let best = null, bestScore = -1;
  for (const it of DB_INDEX) {
    const hit = q.filter((w) => it.toks.has(w) || [...it.toks].some((t) => t.length > 3 && w.length > 3 && (t.startsWith(w) || w.startsWith(t)))).length;
    const cover = hit / q.length;
    if (cover < 0.6) continue;
    let pen = Infinity;
    for (const alt of it.alts) {
      const miss = alt.filter((w) => !q.includes(w));
      pen = Math.min(pen, miss.length * 0.25 + miss.filter((w) => STAPLE.has(w)).length * 0.5);
    }
    const score = cover * 2 - pen;
    if (score > bestScore) { bestScore = score; best = it; }
  }
  return bestScore >= 1 ? best : null;
}
function parseFood(text) {
  const out = [];
  // Split on commas / "and" / "with" / "aur", and also before a number ("bhindi 2 roti").
  const chunks = text.split(/,|\+|&|\n|\band\b|\bwith\b|\baur\b/i).flatMap((c) => c.split(/\s+(?=\d+(?:\.\d+)?\s*[a-z])/i));
  for (let chunk of chunks) {
    chunk = chunk.trim(); if (!chunk) continue;
    let qty = 1, counted = false;
    const m = chunk.match(/^(\d+(?:\.\d+)?|\d+\/\d+)\s*(?:x\s*)?/i);
    if (m) { qty = m[1].includes("/") ? m[1].split("/").reduce((a, b) => a / b) : +m[1]; chunk = chunk.slice(m[0].length); counted = true; }
    else { const w = chunk.split(/\s+/)[0].toLowerCase(); if (NUMWORDS[w] != null) { qty = NUMWORDS[w]; chunk = chunk.split(/\s+/).slice(1).join(" "); counted = qty >= 2; } }
    const tail = chunk.match(/\s*x\s*(\d+)$/i); if (tail) { qty *= +tail[1]; chunk = chunk.slice(0, tail.index); }
    if (/^half\b/i.test(chunk)) { qty *= 0.5; chunk = chunk.replace(/^half\s*/i, ""); }
    const hit = bestMatch(chunk);
    if (hit) {
      // "10 almonds" when a serving is "10": count items, not servings.
      const per = +(hit.serving.match(/^(\d+)(?:\s*(?:pieces?|halves|slices?))?$/) || [])[1];
      if (counted && per > 1) qty = Math.round((qty / per) * 100) / 100;
      out.push({ name: hit.name, serving: hit.serving, kcal: hit.kcal, p: hit.p, qty, src: "bank" }); continue;
    }
    const g = FOOD_GUESS.find(([re]) => re.test(chunk.toLowerCase()));
    const name = chunk.replace(/^\w/, (c) => c.toUpperCase());
    out.push(g ? { name, serving: g[2], kcal: g[3], p: g[4], qty, src: "guess", kind: g[1] } : { name, serving: "1 serving", kcal: 250, p: 8, qty, src: "guess", kind: "Unknown dish" });
  }
  return out;
}
const shortFood = (n) => String(n).replace(/\s*\([^)]*\)/g, "").split(" / ")[0].trim();
const comboLabel = (items, n = 34) => clip(items.map((x) => `${x.qty !== 1 ? x.qty + " × " : ""}${shortFood(x.name)}`).join(" + "), n);
const servingTxt = (sv) => (/^\d+$/.test(String(sv)) ? "each" : String(sv));
const sigOf = (items) => items.map((x) => `${x.qty}×${x.name}`).sort().join("+");
const sumOf = (items, f) => Math.round(items.reduce((a, x) => a + x[f] * x.qty, 0));
// What this person has logged for a meal before, most frequent first.
function usuals(slotId, k) {
  const m = new Map();
  for (const [dk, d] of Object.entries(S.days)) {
    const sw = d.swap?.[slotId];
    if (dk === k || !sw?.length) continue;
    const sig = sigOf(sw), e = m.get(sig) || { n: 0, last: "", items: sw };
    e.n++; if (dk > e.last) { e.last = dk; e.items = sw; }
    m.set(sig, e);
  }
  return [...m.values()].sort((a, b) => b.n - a.n || (a.last < b.last ? 1 : -1)).slice(0, 3);
}
// Single foods logged most often, for the add sheet.
function frequentFoods() {
  const c = new Map();
  for (const d of Object.values(S.days)) for (const sw of Object.values(d.swap || {})) for (const x of sw) if (x.src === "bank") c.set(x.name, (c.get(x.name) || 0) + 1);
  const mine = [...c.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  const base = ["Egg (whole, boiled)", "Roti / chapati", "Dal tadka", "Plain rice", "Curd / dahi", "Banana", "Whey protein (1 scoop)", "Chai (with sugar)"];
  return [...new Set([...mine, ...base])].filter((n) => FOOD_DB.some((f) => f[0] === n)).slice(0, 10);
}
// Where typed food goes: the main meal closest to now (shake and nuts slots are skipped).
// A meal already ticked "as planned" isn't overwritten; the food goes to snacks instead.
function nearestSlot() {
  if (curKey() !== todayKey()) return "_extra";
  const d = day(), now = nowMins();
  const c = P().meals.filter((m) => /breakfast|lunch|dinner|snack/i.test(m.id + m.name)).map((m) => [Math.abs(mins(m.time) - now), m.id]).sort((a, b) => a[0] - b[0])[0];
  if (!c || c[0] > 150) return "_extra";
  return d.eaten[c[1]] && !d.swap?.[c[1]]?.length ? "_extra" : c[1];
}
// Add to a meal that already has food logged, instead of replacing it.
function mergeFood(slot, items) {
  const d = day(), cur = d.swap?.[slot];
  if (slot === "_extra" || !cur?.length) return saveFood(slot, items);
  for (const x of items) { const e = cur.find((y) => y.name === x.name); if (e) e.qty = Math.round((e.qty + x.qty) * 100) / 100; else cur.push(x); }
  return true;
}
const slotName = (id) => (id === "_extra" ? "snacks" : P().meals.find((m) => m.id === id)?.name.toLowerCase() || "meal");

function mealCard(slot, d, k) {
  const on = !!d.eaten[slot.id], o = mealShown(slot, d, k), sw = d.swap?.[slot.id];
  const head = `<span class="eyebrow">${esc(slot.name)} · ${fmtTime(slot.time)}</span>`;
  if (on) return `<div class="meal on"><div class="spread"><div class="grow">${head}<h3>${o.veg ? '<i class="veg"></i>' : ""}${esc(sw?.length ? comboLabel(sw, 70) : o.name)}</h3></div><span class="num small right"><b>${o.protein} g</b><br><span class="muted">${o.kcal} kcal</span></span></div>
      ${sw?.length ? sw.map((x, i) => `<div class="qrow"><span class="grow small">${esc(shortFood(x.name))} <span class="muted">· ${esc(servingTxt(x.serving))}</span></span><div class="stepper"><button data-a="sw-q" data-id="${slot.id}" data-i="${i}" data-v="-1" aria-label="Less">−</button><b class="num">${x.qty}</b><button data-a="sw-q" data-id="${slot.id}" data-i="${i}" data-v="1" aria-label="More">+</button></div></div>`).join("") : o.detail ? `<p class="small muted">${esc(o.detail)}</p>` : ""}
      <div class="row"><button class="linkish small" data-a="swap-open" data-id="${slot.id}">Change</button><button class="linkish small muted" data-a="meal-clear" data-id="${slot.id}">Remove</button></div></div>`;
  const plan = mealOpt(slot, d, k);
  return `<div class="meal">${head}<div class="opts wrap">
      <button class="opt" data-a="eat" data-id="${slot.id}">${plan.veg ? '<i class="veg"></i>' : ""}${plan.fromCook ? "Cook: " : ""}${esc(clip(plan.name, 28))} <span class="muted num">${plan.protein} g</span></button>
      ${usuals(slot.id, k).map((u, i) => `<button class="opt" data-a="log-usual" data-id="${slot.id}" data-i="${i}">${esc(comboLabel(u.items, 28))} <span class="muted num">${sumOf(u.items, "p")} g</span></button>`).join("")}
      <button class="opt add" data-a="swap-open" data-id="${slot.id}">+ Something else</button></div></div>`;
}
// Late in the day and short on protein: the cheapest fixes, one tap each.
function topups(t) {
  const gap = Math.round(P().targets.protein - t.protein);
  if (gap < 15 || (curKey() === todayKey() && new Date().getHours() < 16)) return "";
  const fixes = [["Whey, 1 scoop", 120, 24], ["Hung curd / Greek yogurt, 150 g", 150, 15], ["Egg, whole", 72, 6], ["Roasted chana, 40 g", 150, 8]];
  return `<div class="hint"><b>${gap} g</b> of protein to go. One tap adds it:<div class="opts wrap">${fixes.map(([n, kc, pr]) => `<button class="opt" data-a="food-add" data-n="${esc(n)}" data-k="${kc}" data-p="${pr}">+ ${esc(n.split(",")[0])} <span class="muted num">${pr} g</span></button>`).join("")}</div></div>`;
}
function totalsCard(t) {
  const p = P(), pp = Math.min(100, (t.protein / p.targets.protein) * 100), kp = Math.min(100, (t.kcal / p.targets.kcal) * 100);
  return `<div class="duo">
      <div><span class="eyebrow">Protein</span><div class="bignum num">${t.protein}<small> / ${p.targets.protein} g</small></div><div class="bar ${pp >= 100 ? "good" : ""}"><i style="width:${pp}%"></i></div></div>
      <div><span class="eyebrow">Calories</span><div class="bignum num">${t.kcal}<small> / ${p.targets.kcal}</small></div><div class="bar ${t.kcal > p.targets.kcal * 1.05 ? "over" : ""}"><i style="width:${kp}%"></i></div></div></div>`;
}
function quickExtras() {
  const c = new Map();
  for (const d of Object.values(S.days)) for (const x of d.extra || []) if (!x.alcohol && !x.party) c.set(x.name, { n: (c.get(x.name)?.n || 0) + 1, kcal: x.kcal, p: x.protein || 0 });
  const mine = [...c.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 3).map(([n, v]) => [n, v.kcal, v.p]);
  const base = [["Chai, no sugar", 45, 3], ["Black coffee", 5, 0], ["Banana", 105, 1], ["Whey, 1 scoop", 120, 24]];
  const seen = new Set();
  return [...mine, ...base].filter(([n]) => !seen.has(n) && seen.add(n)).slice(0, 5);
}
function renderFood() {
  const k = curKey(), d = day(k), t = totals(d);
  return `
    <section class="card">${totalsCard(t)}
      <div class="quick"><input id="quickFood" type="text" enterkeyhint="done" placeholder="Type it: 2 roti, dal, curd" autocomplete="off" aria-label="What did you eat"><button class="btn primary" data-a="quick-add">Add</button></div>
      ${topups(t)}</section>
    <section class="card"><h2>Meals</h2>${P().meals.map((slot) => mealCard(slot, d, k)).join("")}</section>
    <section class="card"><div class="spread"><h2>Snacks and drinks</h2><button class="btn small" data-a="swap-open" data-id="_extra">+ Add</button></div>
      ${d.extra.map((x, i) => `<div class="qrow"><span class="grow small">${esc(x.name)}${x.t ? ` <span class="muted">${x.t}</span>` : ""}<br><span class="muted num">${Math.round(x.kcal * (x.qty || 1))} kcal · ${Math.round((x.protein || 0) * (x.qty || 1))} g</span></span>
        <div class="stepper"><button data-a="extra-q" data-i="${i}" data-v="-1" aria-label="Less">−</button><b class="num">${x.qty || 1}</b><button data-a="extra-q" data-i="${i}" data-v="1" aria-label="More">+</button></div></div>`).join("")}
      <div class="opts wrap">${quickExtras().map(([n, kc, pr]) => `<button class="opt" data-a="food-add" data-n="${esc(n)}" data-k="${kc}" data-p="${pr}">+ ${esc(n.split(",")[0])}</button>`).join("")}</div>
      <span class="eyebrow">Had a drink?</span>
      <div class="opts wrap">${PARTY_DRINKS.map(([l, n, kc]) => `<button class="opt" data-a="drink" data-n="${esc(n)}" data-k="${kc}">+ ${esc(l)}</button>`).join("")}</div>
      ${drinksOf(d) ? `<p class="small muted">${drinksOf(d)} drinks today, about ${d.extra.filter((x) => x.alcohol).reduce((a, x) => a + x.kcal * (x.qty || 1), 0)} kcal.</p>` : ""}
    </section>`;
}

// ---------- add sheet ----------
function swapPreviewHTML(items, kcal, prot) {
  if (!items.length) return `<p class="small muted">Quantities like "2", "half" or "x3" work. Hindi numbers too.</p>`;
  return `<div class="stack">${items.map((x) => `<div class="swaprow">
      <div class="grow"><b>${x.qty !== 1 ? x.qty + " × " : ""}${esc(x.name)}</b><br><span class="small muted">${esc(x.serving)} each${x.src === "bank" ? "" : " · rough estimate"}</span></div>
      ${x.pick ? `<div class="stepper"><button data-a="pick-q" data-n="${esc(x.name)}" data-v="-1" aria-label="Less">−</button><b class="num">${x.qty}</b><button data-a="pick-q" data-n="${esc(x.name)}" data-v="1" aria-label="More">+</button></div>` : `<span class="small num muted">${Math.round(x.kcal * x.qty)} kcal · ${Math.round(x.p * x.qty)} g</span>`}</div>`).join("")}
    <div class="spread"><b>Total</b><b class="num">${kcal} kcal · ${prot} g protein</b></div></div>`;
}
function bankListHTML(q) {
  const qq = q.trim().toLowerCase();
  if (!qq) return "";
  return FOOD_DB.filter(([n, , , , e]) => `${n} ${e}`.toLowerCase().includes(qq)).slice(0, 40).map(([n, sv, kc, pr]) => `<button class="fooditem" data-a="bank-pick" data-n="${esc(n)}"><span class="grow">${esc(n)}<br><span class="small muted">${esc(sv)}</span></span><span class="small muted num">${kc} kcal · ${pr} g</span></button>`).join("") || `<p class="small muted">Not in the list. Type it in the box above and it gets estimated.</p>`;
}
function foodSheet() {
  const dr = ui.swapDraft; if (!dr) return;
  const items = [...parseFood(dr.text || ""), ...dr.picked];
  dr.items = items;
  const slots = [...P().meals.map((m) => [m.id, m.name]), ["_extra", "Snack"]];
  openSheet(`
    <div class="spread"><div><span class="eyebrow">Log food</span><h2>What did you have?</h2></div><button class="icon-btn" data-a="sheet-close" aria-label="Close">${ICON.close}</button></div>
    <div class="opts wrap">${slots.map(([id, n]) => `<button class="opt ${dr.slot === id ? "on" : ""}" data-a="fs-slot" data-id="${id}">${esc(n)}</button>`).join("")}</div>
    <textarea id="swapText" rows="2" placeholder="2 aloo paratha and a bowl of curd, 1 chai">${esc(dr.text || "")}</textarea>
    <div id="swapPreview">${swapPreviewHTML(items, sumOf(items, "kcal"), sumOf(items, "p"))}</div>
    <span class="eyebrow">Tap to add</span>
    <div class="opts wrap">${frequentFoods().map((n) => `<button class="opt" data-a="bank-pick" data-n="${esc(n)}">+ ${esc(shortFood(n))}</button>`).join("")}</div>
    <input type="search" id="bankQ" placeholder="Search ${FOOD_DB.length} foods" autocomplete="off" value="${esc(dr.q || "")}">
    <div class="foodlist" id="bankList">${bankListHTML(dr.q || "")}</div>
    <button class="btn primary block" data-a="swap-save">Save to ${esc(slotName(dr.slot))}</button>`);
}
function saveFood(slot, items) {
  const d = day(), clean = items.filter((x) => x.qty > 0).map(({ pick, ...x }) => x);
  if (!clean.length) return false;
  if (slot === "_extra") for (const x of clean) addExtra(`${x.name}${x.serving ? ` (${x.serving})` : ""}`, x.kcal * x.qty, x.p * x.qty);
  else { d.swap ??= {}; d.swap[slot] = clean; d.eaten[slot] = true; }
  return true;
}
document.addEventListener("input", (e) => { if (e.target.id === "bankQ" && ui.swapDraft) ui.swapDraft.q = e.target.value; });
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "quickFood") { e.preventDefault(); document.querySelector('[data-a="quick-add"]')?.click(); } });

// ---------- party ----------
function partyCardHTML(k, d) {
  const kcal = d.extra.filter((x) => x.alcohol).reduce((a, x) => a + x.kcal * (x.qty || 1), 0);
  const logged = d.extra.filter((x) => x.party || x.alcohol);
  return `<section class="card party">
    <div class="spread"><h2>Party mode</h2><span class="chip warn">${drinksOf(d)} drinks · ${kcal} kcal</span></div>
    <div class="opts wrap">${PARTY_DRINKS.map(([l, n, kc]) => `<button class="opt" data-a="drink" data-n="${esc(n)}" data-k="${kc}">+ ${esc(l)}</button>`).join("")}</div>
    <span class="eyebrow">Party food</span>
    <div class="opts wrap">${PARTY_FOOD.map(([n, kc, pr]) => `<button class="opt" data-a="pfood" data-n="${esc(n)}" data-k="${kc}" data-p="${pr}">+ ${esc(n)}</button>`).join("")}</div>
    ${logged.length ? `<div class="stack small">${logged.map((x) => `<div class="spread"><span>${x.t ? `<span class="muted num">${x.t}</span> ` : ""}${x.qty > 1 ? x.qty + "× " : ""}${esc(x.name)}</span><span class="muted num">${Math.round(x.kcal * (x.qty || 1))} kcal</span></div>`).join("")}</div>` : ""}
    <ul class="plain small">${P().partyRules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
    <button class="btn small" data-a="party-toggle">Party over</button>
  </section>`;
}
function recoveryHint(k) {
  const y = S.days[addDays(k, -1)], n = drinksOf(y);
  if (!n) return "";
  return `<section class="hint warn"><b>Morning after ${n} drink${n > 1 ? "s" : ""}.</b> Water with electrolytes, eggs or another protein breakfast, and still train today, even if it's the quick version.</section>`;
}

Object.assign(actions, {
  "swap-open": (b) => {
    const cur = day().swap?.[b.dataset.id];
    ui.swapDraft = { slot: b.dataset.id, text: "", q: "", picked: cur ? clone(cur).map((x) => ({ ...x, pick: true })) : [] };
    foodSheet();
  },
  "fs-slot": (b) => { if (ui.swapDraft) { ui.swapDraft.slot = b.dataset.id; foodSheet(); } },
  "bank-pick": (b) => {
    const it = FOOD_DB.find((x) => x[0] === b.dataset.n), dr = ui.swapDraft; if (!it || !dr) return;
    const ex = dr.picked.find((x) => x.name === it[0]);
    if (ex) ex.qty += 1; else dr.picked.push({ name: it[0], serving: it[1], kcal: it[2], p: it[3], qty: 1, src: "bank", pick: true });
    foodSheet();
  },
  "pick-q": (b) => {
    const dr = ui.swapDraft; if (!dr) return;
    const i = dr.picked.findIndex((x) => x.name === b.dataset.n); if (i < 0) return;
    dr.picked[i].qty += +b.dataset.v;
    if (dr.picked[i].qty <= 0) dr.picked.splice(i, 1);
    foodSheet();
  },
  "swap-save": () => {
    const dr = ui.swapDraft; if (!dr) return;
    if (!saveFood(dr.slot, dr.items || [])) return toast("Type or tap something first");
    ui.swapDraft = null; closeSheet(); save(); render(); toast("Saved");
  },
  // Typed in the box on the Food tab: if every item is a known food it saves straight away
  // (Undo is right there); anything it had to guess opens the sheet so you can check it.
  "quick-add": () => {
    const text = ($("#quickFood")?.value || "").trim(), slot = nearestSlot();
    const items = parseFood(text);
    if (text && items.length && items.every((x) => x.src === "bank") && curKey() === todayKey()) {
      mergeFood(slot, items); save(); render();
      return toast(`Added to ${slotName(slot)}: ${comboLabel(items, 40)}`);
    }
    ui.swapDraft = { slot, text, q: "", picked: [] };
    foodSheet();
    if (!text) setTimeout(() => $("#swapText")?.focus(), 60);
  },
  "log-usual": (b) => {
    const u = usuals(b.dataset.id, curKey())[+b.dataset.i]; if (!u) return;
    saveFood(b.dataset.id, clone(u.items)); save(); render();
  },
  "meal-clear": (b) => { const d = day(); if (d.swap) delete d.swap[b.dataset.id]; d.eaten[b.dataset.id] = false; save(); render(); },
  "sw-q": (b) => {
    const d = day(), sw = d.swap?.[b.dataset.id]; if (!sw) return;
    const x = sw[+b.dataset.i]; x.qty = Math.round((x.qty + +b.dataset.v) * 100) / 100;
    if (x.qty <= 0) sw.splice(+b.dataset.i, 1);
    if (!sw.length) { delete d.swap[b.dataset.id]; d.eaten[b.dataset.id] = false; }
    save(); render();
  },
});
