"use strict";
// ================= FOOD: household planner =================
// The cook cooks for two: lunch is shared veg, most dinners are non-veg for me plus a veg
// plan for the partner. The week (Mon-Sat) is generated once, then edited meal by meal.
const H = () => P().household;
const DISH = (id) => P().dishes[id] || DISHES[id] || null;
const weekOf = (k) => { const dow = (parseKey(k).getDay() + 6) % 7; return addDays(k, -dow); }; // Monday
const isCookDay = (k) => parseKey(k).getDay() !== 0;
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function shuffle(arr, r) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const hasPaneer = (d) => d && d.ing.includes("paneer");

function entryFor(dishId, extra = {}) {
  const d = DISH(dishId), a = d.add || {};
  return { dish: dishId, b: a.b || "", n: a.n || 0, dal: a.dal || "", rice: a.rice || "", rq: a.rq || 2, salad: a.salad || "", pair: d.diet === "nonveg" ? d.pair || "dalchawal" : "", x: "", extras: [], note: "", off: false, missed: false, ...extra };
}

// Build Mon-Sat. Days before `fromK` are kept as they were.
function genWeek(wk, seed, fromK = wk) {
  const r = rng(seed), all = Object.entries(P().dishes);
  const W = (S.week[wk] ??= { seed, days: {}, got: {} });
  W.seed = seed;
  const days = Array.from({ length: 6 }, (_, i) => addDays(wk, i));
  const keep = days.filter((k) => k < fromK);
  const used = new Set(keep.flatMap((k) => [W.days[k]?.lunch?.dish, W.days[k]?.dinner?.dish]).filter(Boolean));
  const count = (f) => [...used].map(DISH).filter((d) => d && f(d)).length;

  // Auto-planned lunches are the sabzi / gravy / dal kind; one-dish meals are picked by hand.
  const lunchPool = shuffle(all.filter(([, d]) => d.meal.includes("lunch") && d.diet !== "nonveg" && d.kind !== "onedish").map(([id]) => id), r);
  const vegDinnerPool = shuffle(all.filter(([, d]) => d.meal.includes("dinner") && d.diet === "veg" && d.kind === "onedish").map(([id]) => id), r)
    .sort((a, b) => (DISH(b).left ? 1 : 0) - (DISH(a).left ? 1 : 0));
  const nonvegPool = shuffle(all.filter(([, d]) => d.meal.includes("dinner") && d.diet === "nonveg").map(([id]) => id), r);

  const nv = Math.max(0, Math.min(6, +H().nonveg || 5));
  const vegSlots = new Set(Array.from({ length: 6 - nv }, (_, i) => Math.floor(((i + 1) * 6) / (7 - nv)) - 1));

  const pick = (pool, ok) => { const id = pool.find((x) => !used.has(x) && ok(DISH(x))); if (id) used.add(id); return id || pool[0]; };
  days.forEach((k, i) => {
    if (k < fromK) return;
    const lunch = pick(lunchPool, (d) =>
      (!hasPaneer(d) || count(hasPaneer) < 2) && (d.kind !== "legume" || count((x) => x.kind === "legume") < 2) &&
      (d.diet !== "egg" || count((x) => x.diet === "egg") < 1));
    let dinner;
    if (vegSlots.has(i)) dinner = pick(vegDinnerPool, () => true);
    else dinner = pick(nonvegPool, (d) => !(d.ing.includes("prawns") && count((x) => x.ing.includes("prawns")) >= 1) && !(d.kind === "rice" && count((x) => x.kind === "rice" && x.diet === "nonveg") >= 1));
    W.days[k] = { lunch: entryFor(lunch), dinner: entryFor(dinner) };
  });
  // Pairing pass: after a leftover-heavy veg dinner, the partner eats the leftovers next night.
  days.forEach((k, i) => {
    const e = W.days[k]?.dinner; if (!e || k < fromK || DISH(e.dish).diet !== "nonveg") return;
    const prev = i > 0 ? W.days[days[i - 1]]?.dinner : null;
    if (prev && DISH(prev.dish).left && DISH(prev.dish).diet === "veg") { e.pair = "leftover"; e.x = DISH(prev.dish).name.toLowerCase(); }
    else if (e.pair === "split" && hasPaneer(DISH(W.days[k].lunch.dish))) e.pair = "splitveg";
  });
  save();
  return W;
}
function weekFor(k) {
  const wk = weekOf(k);
  if (!S.week[wk] && diffDays(wk, weekOf(todayKey())) >= 0 && diffDays(wk, weekOf(todayKey())) <= 7) genWeek(wk, Date.now() % 100000);
  return S.week[wk] || null;
}
function mealEntry(k, meal) { if (!isCookDay(k)) return null; return weekFor(k)?.days[k]?.[meal] || null; }

// My plate: main portion + my share of the add-ons.
const VEG_PLATE = { split: { kcal: 320, p: 18 }, splitveg: { kcal: 200, p: 5 }, dalchawal: { kcal: 380, p: 13 }, leftover: { kcal: 450, p: 12 }, tikka: { kcal: 300, p: 19 }, biryani: { kcal: 520, p: 15 }, patty: { kcal: 450, p: 14 }, built: { kcal: 330, p: 18 } };
const iAmVeg = () => H().iam === "veg";
function myPlate(e, meal) {
  const d = DISH(e.dish); if (!d) return { kcal: 0, p: 0 };
  const vp = iAmVeg() && d.diet === "nonveg" ? VEG_PLATE[e.pair] || VEG_PLATE.dalchawal : null;
  let kcal = vp ? vp.kcal : d.me.kcal, p = vp ? vp.p : d.me.p;
  const myB = Math.min(e.n, +H().myBread?.[meal] || 2);
  if (e.b && ADDONS.b[e.b]) { kcal += myB * ADDONS.b[e.b].kcal; p += myB * ADDONS.b[e.b].p; }
  if (e.dal && ADDONS.dal[e.dal]) { kcal += ADDONS.dal[e.dal].kcal; p += ADDONS.dal[e.dal].p; }
  if (e.rice && ADDONS.rice[e.rice] && (e.rq === 2 || d.diet === "nonveg")) { kcal += ADDONS.rice[e.rice].kcal; p += ADDONS.rice[e.rice].p; }
  if (e.salad && ADDONS.salad[e.salad]) { kcal += ADDONS.salad[e.salad].kcal; p += ADDONS.salad[e.salad].p; }
  return { kcal: Math.round(kcal), p: Math.round(p) };
}
function addonSummary(e) {
  const parts = [];
  if (e.b && e.n) parts.push(`${e.n} ${ADDONS.b[e.b].label.toLowerCase()}`);
  if (e.dal) parts.push(ADDONS.dal[e.dal].label.toLowerCase());
  if (e.rice) parts.push(`${ADDONS.rice[e.rice].label.toLowerCase()}${e.rq === 1 ? " (1)" : ""}`);
  if (e.salad) parts.push("salad");
  return parts.join(" · ");
}

// ---------- cook messages: message 1 = what to cook, message 2 = add-ons + how ----------
function cookMsgs(k, meal) {
  const e = mealEntry(k, meal), h = H(), cook = h.cook || "Bhaiya";
  const when = k === todayKey() ? "aaj" : k === addDays(todayKey(), 1) ? "kal" : fmtDay(k);
  const mealHi = meal === "lunch" ? "lunch" : "dinner";
  if (!e) return null;
  if (e.off) return e.missed ? ["", ""] : [`${cook} ${when} ${mealHi} nahi banana hai, hum bahar khaayenge. Aap ${mealHi} ke liye mat aana.`, ""];
  const d = DISH(e.dish), me = h.me ? `${h.me} ke liye` : iAmVeg() ? "Non-veg wale ke liye" : "Mere liye", pn = h.partner || "veg wale";
  const add = [], care = [];
  if (e.b && e.n) add.push(ADDONS.b[e.b].hi(e.n));
  if (e.dal) add.push(ADDONS.dal[e.dal].hi);
  if (e.rice) add.push(`${ADDONS.rice[e.rice].hi[0].toUpperCase() + ADDONS.rice[e.rice].hi.slice(1)} (${e.rq === 1 ? "ek jan" : "2 log"} ke liye)`);
  if (e.salad) add.push(ADDONS.salad[e.salad].hi);
  for (const x of e.extras || []) add.push(`${x} bhi`);
  care.push(...(d.tips || []));
  const indian = ["sabzi", "gravy", "legume", "dry", "rice"].includes(d.kind);
  if (indian) care.push(...TASTE.base);
  if (d.kind === "gravy") care.push(TASTE.gravy);
  if (e.dal || d.kind === "legume") care.push(TASTE.dal);
  if (d.diet !== "nonveg" && ["sabzi", "gravy", "legume"].includes(d.kind)) care.push(TASTE.two);
  if (d.diet === "nonveg" && !d.ing.includes("prawns")) care.push(`Chicken ${h.chickenG || 250} g, sirf ek jan ke liye`);
  if (e.note) care.push(e.note);

  let m1;
  if (d.diet === "nonveg") {
    const pr = PAIRS[e.pair];
    const pline = pr && pr.hi ? pr.hi.replaceAll("{p}", pn).replace("{x}", e.x || "kal ka khaana") : "";
    m1 = `${cook} ${when} ${mealHi} mai:\n1. *${me}: ${d.hi}*` + (pline ? `\n2. *${pline}*` : "");
  } else {
    m1 = `${cook} ${when} ${mealHi} mai:\n*${d.hi}*`;
  }
  if (d.link) m1 += `\n\nRecipe: ${d.link}`;
  const m2 = (add.length ? `Saath mai yeh bhi banana hai:\n${add.map((x, i) => `${i + 1}. ${x}`).join("\n")}` : "") +
    (care.length ? `${add.length ? "\n\n" : ""}Dhyaan dena:\n${care.map((x) => `• ${x}`).join("\n")}` : "");
  if (m2) m1 += `\n\n👇 Agle message mai ${add.length ? "saath ki cheezein" : "zaroori baatein"} hai, woh bhi padh lena`;
  return [m1, m2];
}

// Which message is due now: morning = today's lunch, afternoon = today's dinner, night = tomorrow's lunch.
function dueMeal() {
  const h = new Date().getHours(), t = todayKey();
  if (h >= 4 && h < 11) return { k: t, meal: "lunch" };
  if (h >= 11 && h < 19) return { k: t, meal: "dinner" };
  return { k: addDays(t, 1), meal: "lunch" };
}

// ---------- groceries ----------
function groceryWeek() {
  const t = todayKey();
  return parseKey(t).getDay() === 0 ? addDays(t, 1) : weekOf(t);
}
function groceries(wk) {
  const W = S.week[wk] || genWeek(wk, Date.now() % 100000);
  const t = todayKey(), from = wk > t ? wk : t;
  const days = Array.from({ length: 6 }, (_, i) => addDays(wk, i)).filter((k) => k >= from);
  const items = {}, chicken = { early: 0, late: 0, kheema: 0, drum: 0, prawns: 0 }, extras = new Set();
  let paneer = 0;
  const note = (name, why) => { (items[name] ??= new Set()).add(why); };
  for (const k of days) for (const meal of ["lunch", "dinner"]) {
    const e = W.days[k]?.[meal]; if (!e || e.off) continue;
    const d = DISH(e.dish); if (!d) continue;
    const late = parseKey(k).getDay() >= 4; // Thu-Sat chicken comes in the mid-week order
    const ings = [...d.ing, ...((d.diet === "nonveg" && PAIRS[e.pair]?.ing) || [])];
    for (const g of ings) {
      if (g === "paneer") { paneer++; continue; }
      if (g === "chicken") { chicken[late ? "late" : "early"] += +H().chickenG || 250; continue; }
      if (g === "chicken kheema") { chicken.kheema += +H().chickenG || 250; continue; }
      if (g === "chicken drumsticks") { chicken.drum += 4; continue; }
      if (g === "prawns") { chicken.prawns += 250; continue; }
      note(g, d.name);
    }
    if (e.salad === "kakdi" || e.salad === "beet") { note("kakdi", "salad"); note("gajar", "salad"); }
    if (e.salad === "beet") note("beetroot", "salad");
    if (e.salad === "lachha") { note("kanda", "lachha pyaaz"); note("nimbu", "lachha pyaaz"); }
    for (const x of e.extras || []) extras.add(x);
  }
  for (const [g, why] of WEEKLY_BASICS) note(g, why);
  if (paneer) note("paneer", `${paneer} × 200 g packs`);
  const cats = {};
  for (const [name, whys] of Object.entries(items)) {
    const cat = Object.keys(GROCERY).find((c) => GROCERY[c].includes(name)) || "Other";
    if (cat.startsWith("Pantry") && !P().pantryLow?.[name]) {
      // Only list pantry items a planned dish needs if they're unusual (not kitchen staples).
      if (!["besan", "maida", "breadcrumbs", "coconut milk", "pav bhaji masala", "rajma", "chhole", "kala chana", "tandoori masala"].includes(name)) continue;
    }
    (cats[cat] ??= []).push([name, [...whys].slice(0, 3).join(", ")]);
  }
  const low = Object.keys(P().pantryLow || {}).filter((x) => P().pantryLow[x]);
  if (low.length) cats["Restock (running low)"] = low.map((x) => [x, "marked low"]);
  const sun = [], mid = [];
  if (chicken.early) sun.push(["chicken (boneless / curry cut)", `${chicken.early} g for Mon-Wed; freeze Wednesday's`]);
  if (chicken.kheema) sun.push(["chicken kheema", `${chicken.kheema} g`]);
  if (chicken.drum) sun.push(["chicken drumsticks", `${chicken.drum} pieces`]);
  if (chicken.prawns) sun.push(["prawns", `${chicken.prawns} g`]);
  if (chicken.late) mid.push(["chicken (boneless / curry cut)", `${chicken.late} g for Thu-Sat`]);
  if (sun.length) cats["Chicken & fish"] = sun;
  return { wk, days, cats, mid, extras: [...extras], got: W.got || (W.got = {}) };
}
function groceryText(g) {
  const lines = [`Groceries for ${fmtDay(g.days[0] || g.wk)} - ${fmtDay(addDays(g.wk, 5))}`];
  for (const [cat, list] of Object.entries(g.cats)) {
    const open = list.filter(([n]) => !g.got[n]); if (!open.length) continue;
    lines.push(`\n${cat}:`, ...open.map(([n, w]) => `- ${n}${w ? ` (${w})` : ""}`));
  }
  if (g.extras.length) lines.push("\nExtras:", ...g.extras.map((x) => `- ${x}`));
  if (g.mid.length) lines.push("\nOrder on Wednesday:", ...g.mid.map(([n, w]) => `- ${n} (${w})`));
  return lines.join("\n");
}
// ---------- Kitchen tab ----------
function renderKitchen() {
  const h = H();
  ui.cookSel ??= dueMeal();
  const setup = !h.partner ? `<section class="card week1"><b>Who's eating?</b><p class="small">Names go into the cook messages ("[name] ke liye…"). They stay on this phone.</p>
    <div class="grid2"><div class="field"><label for="hMe">Non-veg person</label><input id="hMe" type="text" value="${esc(h.me)}" data-bind="plan.household.me" data-type="str" placeholder="Your name"></div>
    <div class="field"><label for="hP">Veg person</label><input id="hP" type="text" value="${esc(h.partner)}" data-bind="plan.household.partner" data-type="str" data-rerender="1" placeholder="Partner's name"></div></div></section>` : "";
  return `${setup}${cookCard()}${weekCard()}${groceryCard()}${parseKey(todayKey()).getDay() === 0 ? sundayCard() : ""}`;
}

function cookCard() {
  const sel = ui.cookSel, t = todayKey(), tm = addDays(t, 1);
  const choices = [[t, "lunch", "Today lunch"], [t, "dinner", "Today dinner"], [tm, "lunch", "Tomorrow lunch"], [tm, "dinner", "Tomorrow dinner"]];
  const e = mealEntry(sel.k, sel.meal);
  const chips = `<div class="opts">${choices.map(([k, m, l]) => `<button class="opt ${sel.k === k && sel.meal === m ? "on" : ""}" data-a="cook-sel" data-k="${k}" data-m="${m}">${l}</button>`).join("")}</div>`;
  if (!e) return `<section class="card"><div class="spread"><h2>Cook</h2></div>${chips}<p class="muted">No cooking on Sundays. See the order-in guide below.</p></section>`;
  const d = DISH(e.dish), [m1, m2] = cookMsgs(sel.k, sel.meal), mine = myPlate(e, sel.meal);
  const sent = S.week[weekOf(sel.k)]?.sent?.[`${sel.k}.${sel.meal}`];
  return `<section class="card">
    <div class="spread"><h2>Cook</h2>${sent ? `<span class="chip good">Sent</span>` : `<span class="chip accent">To send</span>`}</div>
    ${chips}
    <div class="spread"><div class="grow"><h3>${d.diet === "nonveg" ? "" : '<i class="veg"></i>'}${esc(e.off ? "No cooking" : d.name)}</h3>
      <p class="small muted">${esc(e.off ? "Eating out" : addonSummary(e) || "No add-ons")}${!e.off ? ` · my plate ~${mine.kcal} kcal, ${mine.p} g protein` : ""}</p></div>
      <button class="btn small" data-a="meal-edit" data-k="${sel.k}" data-m="${sel.meal}">Edit</button></div>
    ${!m1 ? `<p class="hint">Cook didn't come. This dish moved to the next day.</p>` : `<span class="eyebrow">Message 1 · what to cook</span><pre class="msg">${esc(m1)}</pre>
    <div class="row"><button class="btn grow primary" data-a="msg-copy" data-n="0">Copy message 1</button><button class="btn" data-a="msg-share" data-n="0" aria-label="Share message 1">Share</button></div>`}
    ${m2 ? `<span class="eyebrow">Message 2 · add-ons and how</span><pre class="msg">${esc(m2)}</pre>
    <div class="row"><button class="btn grow primary" data-a="msg-copy" data-n="1">Copy message 2</button><button class="btn" data-a="msg-share" data-n="1" aria-label="Share message 2">Share</button></div>` : ""}
    <div class="row wrap"><button class="btn small ghost" data-a="msg-sent">${sent ? "Mark not sent" : "Mark as sent"}</button><button class="btn small ghost" data-a="cook-missed">${e.missed ? "Cook came after all" : "Cook didn't come"}</button></div>
    ${e.missed ? `<div class="hint warn">Move ${esc(d.name)} to the next ${sel.meal}? The rest of the week's ${sel.meal}s shift by one day.<div class="row" style="margin-top:8px"><button class="btn small primary" data-a="cook-shift">Move it</button></div></div>` : ""}
  </section>`;
}

function weekCard() {
  const wk = weekOf(todayKey()), W = weekFor(todayKey()); if (!W) return "";
  const days = Array.from({ length: 6 }, (_, i) => addDays(wk, i));
  const nv = days.filter((k) => DISH(W.days[k]?.dinner?.dish)?.diet === "nonveg").length;
  const row = (k, meal) => { const e = W.days[k]?.[meal]; if (!e) return ""; const d = DISH(e.dish);
    return `<button class="fooditem ${k < todayKey() ? "past" : ""}" data-a="meal-edit" data-k="${k}" data-m="${meal}"><span class="grow"><span class="eyebrow">${meal}</span><br>${d.diet === "nonveg" ? "🍗 " : ""}${esc(e.off ? "No cooking" : d.name)}${d.soak ? ` <span class="chip">soak</span>` : ""}</span></button>`; };
  return `<section class="card"><div class="spread"><h2>This week</h2><span class="chip">${nv} non-veg dinners</span></div>
    ${days.map((k) => `<div class="weekday ${k === todayKey() ? "today" : ""}"><div class="wd">${esc(fmtDay(k).split(",")[0])}<span>${parseKey(k).getDate()}</span></div><div class="stack grow">${row(k, "lunch")}${row(k, "dinner")}</div></div>`).join("")}
    <div class="row wrap"><button class="btn small" data-a="week-shuffle">${ui.confirm === "shuffle" ? "Tap again to reshuffle" : "Reshuffle rest of week"}</button>
      <label class="small muted row">Non-veg dinners <select id="nvN" data-bind="plan.household.nonveg" data-type="num" data-rerender="1" style="width:auto">${[3, 4, 5, 6].map((n) => `<option ${+H().nonveg === n ? "selected" : ""}>${n}</option>`).join("")}</select></label></div>
    <p class="small muted">Reshuffling keeps past days and anything you've already sent. Tap any meal to change it.</p></section>`;
}

function groceryCard() {
  const g = groceries(groceryWeek());
  const item = ([n, w]) => `<label class="gitem ${g.got[n] ? "got" : ""}"><input type="checkbox" ${g.got[n] ? "checked" : ""} data-a-change="got" data-n="${esc(n)}"><span class="grow">${esc(n)}${w ? `<span class="small muted"> · ${esc(w)}</span>` : ""}</span></label>`;
  return `<section class="card"><div class="spread"><h2>Groceries</h2><span class="chip">${esc(fmtDay(g.wk))} week</span></div>
    <p class="small muted">One order on Sunday for the week. Chicken for Thursday onwards comes in a second small order on Wednesday, so it's fresh. Tick what you already have or have ordered.</p>
    ${Object.entries(g.cats).map(([cat, list]) => `<div class="stack"><span class="eyebrow">${esc(cat)}</span>${list.map(item).join("")}</div>`).join("")}
    ${g.extras.length ? `<div class="stack"><span class="eyebrow">Extras you said yes to</span>${g.extras.map((x) => item([x, ""])).join("")}</div>` : ""}
    ${g.mid.length ? `<div class="stack"><span class="eyebrow">Wednesday order</span>${g.mid.map(item).join("")}</div>` : ""}
    <div class="row"><button class="btn grow primary" data-a="groc-copy">Copy list</button><button class="btn" data-a="groc-share">Share</button></div>
    <details class="sec"><summary><span><b>Running low?</b><br><span class="small muted">Rice, dal, atta, oil, spices: tap what's running out. It joins the next order.</span></span></summary><div class="body">
      ${Object.entries(PANTRY).map(([cat, list]) => `<span class="eyebrow">${cat}</span><div class="opts wrap">${list.map((x) => `<button class="opt ${P().pantryLow?.[x] ? "on" : ""}" data-a="pantry" data-n="${esc(x)}">${esc(x)}</button>`).join("")}</div>`).join("")}
    </div></details></section>`;
}

function openMealSheet() {
  const { k, meal } = ui.editMeal, e = mealEntry(k, meal); if (!e) return;
  const d = DISH(e.dish);
  const groups = [["Veg lunches", (x) => x.diet === "veg" && ["sabzi", "gravy", "legume"].includes(x.kind) && !x.ing.includes("paneer")], ["Paneer", (x) => x.diet === "veg" && x.ing.includes("paneer") && x.kind !== "onedish"], ["Eggs", (x) => x.diet === "egg"], ["One-dish meals", (x) => x.diet === "veg" && x.kind === "onedish"], ["Non-veg (for me)", (x) => x.diet === "nonveg"]];
  const opts = groups.map(([g, f]) => `<optgroup label="${g}">${Object.entries(P().dishes).filter(([, x]) => f(x)).map(([id, x]) => `<option value="${id}" ${id === e.dish ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</optgroup>`).join("");
  const sel = (field, map, none = "None") => `<select id="m-${field}" data-bind="@m.${field}" data-type="str" data-rerender="1"><option value="">${none}</option>${Object.entries(map).map(([id, a]) => `<option value="${id}" ${e[field] === id ? "selected" : ""}>${esc(a.label)}</option>`).join("")}</select>`;
  openSheet(`
    <div class="spread"><div><span class="eyebrow">${esc(fmtDay(k))} · ${meal}</span><h2>Edit meal</h2></div><button class="icon-btn" data-a="sheet-close" aria-label="Close">✕</button></div>
    <label class="row small"><input type="checkbox" id="m-off" style="width:auto" ${e.off ? "checked" : ""} data-bind="@m.off" data-type="bool" data-rerender="1"> No cooking (eating out, party, travel)</label>
    ${e.off ? "" : `
    <div class="field"><label for="m-dish">Dish</label><select id="m-dish" data-a-change="meal-dish">${opts}</select></div>
    ${d.link ? `<p class="small">Recipe: <a href="${esc(d.link)}" target="_blank" rel="noopener">${esc(d.link)}</a></p>` : ""}
    ${d.diet === "nonveg" ? `<div class="field"><label for="m-pair">For ${esc(H().partner || "partner")}</label>${sel("pair", PAIRS, "Nothing")}</div>
      ${e.pair === "leftover" ? `<div class="field"><label for="m-x">Which leftover?</label><input id="m-x" type="text" value="${esc(e.x)}" data-bind="@m.x" data-type="str" placeholder="e.g. pav bhaji"></div>` : ""}` : ""}
    <div class="grid2"><div class="field"><label for="m-b">Bread</label>${sel("b", ADDONS.b)}</div>
      <div class="field"><label for="m-n">How many</label><input id="m-n" type="number" inputmode="numeric" value="${e.n}" data-bind="@m.n" data-type="num" data-rerender="1"></div></div>
    <div class="grid2"><div class="field"><label for="m-dal">Dal</label>${sel("dal", ADDONS.dal)}</div>
      <div class="field"><label for="m-salad">Salad</label>${sel("salad", ADDONS.salad)}</div></div>
    <div class="grid2"><div class="field"><label for="m-rice">Rice</label>${sel("rice", ADDONS.rice)}</div>
      <div class="field"><label for="m-rq">Rice for</label><select id="m-rq" data-bind="@m.rq" data-type="num" data-rerender="1"><option value="2" ${e.rq === 2 ? "selected" : ""}>2 people</option><option value="1" ${e.rq === 1 ? "selected" : ""}>1 person</option></select></div></div>
    ${(d.extras || []).length ? `<div class="field"><label>Add to the plan?</label>${d.extras.map((x) => `<label class="row small"><input type="checkbox" style="width:auto" ${e.extras.includes(x) ? "checked" : ""} data-a-change="meal-extra" data-n="${esc(x)}"> ${esc(x)} (goes on the grocery list and in the message)</label>`).join("")}</div>` : ""}
    <div class="field"><label for="m-note">Extra instruction for the cook</label><input id="m-note" type="text" value="${esc(e.note)}" data-bind="@m.note" data-type="str" data-rerender="1" placeholder="e.g. fridge wala kata hua kanda use karna"></div>`}
    <button class="btn primary block" data-a="sheet-close">Done</button>`);
}

function shiftMeal(k, meal) {
  // Cook didn't come: this dish moves to the next cook day's same meal, the rest slide by one.
  const wk = weekOf(k), W = S.week[wk]; if (!W) return;
  const days = Array.from({ length: 6 }, (_, i) => addDays(wk, i)).filter((x) => x >= k);
  const moved = days.map((x) => W.days[x]?.[meal]).filter(Boolean);
  const first = clone(moved[0]); first.missed = false;
  W.days[k][meal] = { ...moved[0], off: true, missed: true };
  for (let i = 1; i < days.length; i++) W.days[days[i]][meal] = i === 1 ? first : clone(moved[i - 1]);
}
function sundayCard() {
  const g = P().sundayGuide;
  return `<section class="card"><h2>Sunday order-in</h2>
    <div class="guide"><div><span class="eyebrow">Order</span><ul>${g.order.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
    <div><span class="eyebrow">Skip</span><ul>${g.avoid.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div></div></section>`;
}
Object.assign(actions, {
  "tl-go": (b) => {
    const it = cookReminders(curKey()).find((x) => x.id === b.dataset.id); if (!it?.go) return;
    ui.tab = "kitchen"; if (it.go.meal) ui.cookSel = { k: it.go.k, meal: it.go.meal };
    render(); window.scrollTo(0, 0);
    if (it.go.groc) setTimeout(() => document.querySelector("[data-a='groc-copy']")?.scrollIntoView({ block: "center" }), 50);
  },
});
