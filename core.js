"use strict";

// ================= storage =================
// Single storage adapter so a native build (Capacitor) or a synced backend can
// replace localStorage later without touching the screens.
const KEY = "ironcourt.v1";
const Store = {
  load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
  save(data) { const json = JSON.stringify(data); Native.mirror(json); try { localStorage.setItem(KEY, json); return true; } catch { return false; } },
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(36).slice(2, 9);
function freshState() {
  return { plan: clone(DEFAULT_PLAN), days: {}, workouts: [], activeBy: { ronit: null, yashvi: null }, rot: { cut: 0, term: 0, glute: 0 }, swaps: {}, swapsY: {}, week: {}, meas: { ronit: [], yashvi: [] }, act: { ronit: {}, yashvi: {} } };
}

function migrate(s) {
  const base = freshState();
  if (!s || typeof s !== "object") s = base;
  for (const k of Object.keys(base)) if (s[k] === undefined) s[k] = base[k];
  for (const k of Object.keys(DEFAULT_PLAN)) if (s.plan[k] === undefined) s.plan[k] = clone(DEFAULT_PLAN[k]);
  // New library exercises arrive with app updates; user edits to existing ones are kept.
  for (const [id, ex] of Object.entries(EXERCISES)) if (!s.plan.exercises[id]) s.plan.exercises[id] = clone(ex);
  for (const [id, se] of Object.entries(SESSIONS)) if (!s.plan.sessions[id]) s.plan.sessions[id] = clone(se);
  // v2: demo clips, no-repeat week, second coffee. Installed copies were one day old, so
  // default sessions are replaced outright; custom sessions and all logs are kept.
  if ((s.plan.version || 1) < 2) {
    for (const [id, se] of Object.entries(SESSIONS)) s.plan.sessions[id] = clone(se);
    for (const [id, ex] of Object.entries(EXERCISES)) if (s.plan.exercises[id] && !s.plan.exercises[id].demo) s.plan.exercises[id].demo = ex.demo;
    const sc = s.plan.schedule;
    const c1 = sc.find((x) => x.title === "Black coffee");
    if (c1) c1.title = "Black coffee #1";
    if (!sc.some((x) => /coffee #2/i.test(x.title))) sc.push({ time: "17:30", title: "Black coffee #2", kind: "habit" });
    if (!s.plan.foods.some((f) => f[0] === "Chai, no sugar")) s.plan.foods.push(["Chai, no sugar", 45, 3]);
    s.plan.version = 2;
  }
  // v3: household cook planner (both people), party log, undo. Lunch and dinner on my
  // meal list now come from the cook plan.
  if (s.plan.version < 3) {
    s.plan.household = { me: "", partner: "", cook: "Bhaiya", nonveg: 5, chickenG: 250, myBread: { lunch: 2, dinner: 1 }, since: new Date(Date.now() - 4 * 3600e3).toLocaleDateString("en-CA") };
    s.plan.dishes = clone(DISHES);
    s.plan.pantryLow = {};
    for (const m of s.plan.meals) if (m.id === "lunch" || m.id === "dinner") m.cook = true;
    s.plan.version = 3;
  }
  // v5: glutes program, per-person phones, schedule clean-up (alarm switches were on for
  // breakfast and coffee by mistake; only wake-up should be a real alarm).
  if (s.plan.version >= 4 && s.plan.version < 5) {
    for (const it of s.plan.schedule) if (it.alarm && !/^wake/i.test(it.title)) it.alarm = false;
  }
  if (s.plan.version < 4) {
    for (const it of s.plan.schedule) { it.notify ??= true; if (/^wake/i.test(it.title)) it.alarm = true; }
    s.plan.version = 4;
  }
  if (s.plan.version < 5) {
    s.plan.rotations.glute ??= clone(DEFAULT_PLAN.rotations.glute);
    for (const id of ["GA", "UA", "GB", "UB", "GOPT"]) s.plan.sessions[id] ??= clone(SESSIONS[id]);
    s.plan.household.iam ??= "nonveg";
    s.rot.glute ??= 0;
    s.plan.version = 5;
  }
  if (s.plan.version < 6) {
    // Workouts are now tagged by person; the partner's program is the beginner glutes plan.
    s.activeBy = { ronit: s.active || null, yashvi: null };
    delete s.active;
    s.swapsY ??= {};
    for (const id of ["GA", "UA", "GB", "UB", "GOPT"]) s.plan.sessions[id] = clone(SESSIONS[id]);
    s.plan.rotations.glute = clone(DEFAULT_PLAN.rotations.glute);
    if (s.plan.mode === "glute") s.plan.mode = "cut";
    s.plan.version = 6;
  }
  if (s.plan.version < 7) {
    // Ronit: push / pull / legs once / upper / arms, abs 5x, no deadlifts. Old sessions stay
    // (hidden) so past workouts keep their names.
    for (const id of ["U1", "L1", "U2", "L2", "OPT"]) if (s.plan.sessions[id]) s.plan.sessions[id].hidden = true;
    for (const id of ["PUSH", "PULL", "LEGS", "UPPER", "ARMS", "FBA", "FBB", "FBC", "HOME", "GA", "UA", "GB", "UB", "GOPT"]) s.plan.sessions[id] = clone(SESSIONS[id]);
    s.plan.rotations.cut = clone(DEFAULT_PLAN.rotations.cut);
    s.plan.rotations.term = clone(DEFAULT_PLAN.rotations.term);
    s.rot.cut = 0; s.rot.term = 0;
    if (s.plan.targets.steps === 9000) s.plan.targets.steps = 10000;
    s.plan.version = 7;
  }
  if (s.plan.version < 8) {
    // Nov 2026 rebuild. Ronit: 4 upper days, lower abs + side delts every session, 1 leg
    // exercise on two days, no leg day. Yashvi: fat loss first, supersets + cardio finisher.
    // No rest days in the rotation: it moves on when a workout is finished.
    for (const id of ["PUSH", "PULL", "LEGS", "UPPER", "ARMS", "GA", "UA", "GB", "UB", "GOPT"]) if (s.plan.sessions[id]) s.plan.sessions[id].hidden = true;
    for (const id of ["R1", "R2", "R3", "R4", "Y1", "Y2", "Y3", "Y4"]) s.plan.sessions[id] = clone(SESSIONS[id]);
    s.plan.rotations.cut = clone(DEFAULT_PLAN.rotations.cut);
    s.plan.rotations.glute = clone(DEFAULT_PLAN.rotations.glute);
    s.rot.cut = 0; s.rot.glute = 0;
    s.plan.version = 8;
  }
  if (s.plan.version < 9) {
    // Nov 2026, second rebuild. The logs showed two workouts a week and the last exercises
    // of every session skipped, so: three sessions each, about 45 minutes, priority work
    // first, everything in back-to-back pairs. Older sessions stay (hidden) for history.
    for (const id of ["R1", "R2", "R3", "R4", "Y1", "Y2", "Y3", "Y4", "FBA", "FBB", "FBC"]) if (s.plan.sessions[id]) s.plan.sessions[id].hidden = true;
    for (const id of ["RA", "RB", "RC", "YA", "YB", "YC"]) s.plan.sessions[id] = clone(SESSIONS[id]);
    for (const m of ["cut", "term", "glute"]) s.plan.rotations[m] = clone(DEFAULT_PLAN.rotations[m]);
    s.rot.cut = 0; s.rot.term = 0; s.rot.glute = 0;
    s.plan.version = 9;
  }
  s.meas ??= { ronit: [], yashvi: [] };
  s.act ??= { ronit: {}, yashvi: {} };
  s.activeBy ??= { ronit: null, yashvi: null };
  for (const [id, d] of Object.entries(DISHES)) if (!s.plan.dishes[id]) s.plan.dishes[id] = clone(d);
  s.week ??= {};
  for (const [k, d] of Object.entries(s.days)) d.key = k;
  s.plan.schedule.forEach((it) => { if (!it.id) it.id = uid(); });
  return s;
}
let S = migrate(Store.load());
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { if (!Store.save(S)) toast("Couldn't save. Storage may be full or blocked."); }, 150);
  if (Native.on) { clearTimeout(save.sync); save.sync = setTimeout(() => syncNative(), 4000); }
}
window.addEventListener("pagehide", () => Store.save(S));
document.addEventListener("visibilitychange", () => { if (document.hidden) Store.save(S); });

// ================= dates =================
// A day runs midnight to midnight. Late items (sleep at 1:30) still sort to the end of the list.
const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = () => keyOf(new Date());
const parseKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
const diffDays = (a, b) => Math.round((parseKey(a) - parseKey(b)) / 864e5);
const fmtDay = (k) => parseKey(k).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const mins = (t) => { const [h, m] = t.split(":").map(Number); let v = h * 60 + m; if (h < 4) v += 1440; return v; };
const nowMins = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const fmtTime = (t) => { const [h, m] = t.split(":").map(Number); const hh = ((h + 11) % 12) + 1; return `${hh}:${pad(m)}${h < 12 ? "a" : "p"}`; };

// ================= helpers =================
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const P = () => S.plan;
const exInfo = (id) => P().exercises[id] || { name: id, muscle: "", video: "", cues: [], alts: [] };
const ALCOHOL = /beer|whisky|rum|vodka|gin|wine|peg|alcohol|cocktail/i;

// The day being viewed and logged. Today unless picked on the Today tab.
const curKey = () => (ui.viewDay && ui.viewDay !== todayKey() ? ui.viewDay : todayKey());
function day(k = curKey()) {
  if (!S.days[k]) S.days[k] = { key: k, checks: {}, water: 0, eaten: {}, choice: {}, extra: [], partyChecks: {} };
  return S.days[k];
}
function isParty(k = curKey()) {
  const d = S.days[k];
  if (d && d.party !== undefined) return d.party;
  return P().partyDates.includes(k);
}
// Lunch and dinner come from the cook plan when there is one; otherwise the slot's own options.
function mealOpt(slot, d, k = d.key) {
  if (slot.cook && k && k >= (H().since || "")) {
    const e = mealEntry(k, slot.id);
    if (e && !e.off) {
      const dd = DISH(e.dish), m = myPlate(e, slot.id), vegNight = iAmVeg() && dd.diet === "nonveg";
      const name = vegNight ? (PAIRS[e.pair]?.label || "Dal chawal") + (e.pair === "leftover" && e.x ? `: ${e.x}` : "") : dd.name;
      return { name, detail: addonSummary(e), kcal: m.kcal, protein: m.p, veg: vegNight || dd.diet !== "nonveg", fromCook: true };
    }
  }
  const i = d.choice[slot.id] ?? 0;
  return { ...(slot.options[i] || slot.options[0]), veg: !!slot.veg };
}
// Wrapper used everywhere: a meal you changed wins over the plan.
const mealOptPlanned = mealOpt;
function mealShown(slot, d, k = d.key) {
  const sw = d.swap?.[slot.id];
  if (sw && sw.length) {
    const kcal = sw.reduce((a, x) => a + x.kcal * x.qty, 0), protein = sw.reduce((a, x) => a + x.p * x.qty, 0);
    return { name: sw.map((x) => `${x.qty !== 1 ? x.qty + " × " : ""}${x.name}`).join(" + "), detail: "Changed from the plan", kcal: Math.round(kcal), protein: Math.round(protein), veg: false, swapped: true };
  }
  return mealOptPlanned(slot, d, k);
}
function totals(d) {
  let kcal = 0, protein = 0;
  for (const slot of P().meals) if (d.eaten[slot.id]) { const o = mealShown(slot, d); kcal += +o.kcal || 0; protein += +o.protein || 0; }
  for (const x of d.extra) { kcal += (+x.kcal || 0) * (x.qty || 1); protein += (+x.protein || 0) * (x.qty || 1); }
  return { kcal: Math.round(kcal), protein: Math.round(protein) };
}
const drinksOf = (d) => (d?.extra || []).filter((x) => x.alcohol).reduce((a, x) => a + (x.qty || 1), 0);

function getPath(obj, path) { return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj); }
function setPath(obj, path, val) {
  const ks = path.split(".");
  const last = ks.pop();
  const tgt = ks.reduce((o, k) => (o[k] ??= {}), obj);
  tgt[last] = val;
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.h);
  toast.h = setTimeout(() => (t.hidden = true), 2200);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("Copied"); }
  catch { toast("Couldn't copy. Long-press the text to select it."); }
}
async function shareText(text, title) {
  if (navigator.share) { try { await navigator.share({ title, text }); return; } catch (e) { if (e.name === "AbortError") return; } }
  copyText(text);
}

function ytId(input) {
  const s = String(input || "").trim();
  const m = s.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/);
  if (m) return m[1];
  return /^[\w-]{11}$/.test(s) ? s : "";
}
// Demo = a 10-20 s clip of just the movement, muted and looping like a GIF.
// Tutorial = the longer coached video, with sound and controls.
function videoHTML(id, demo = false) {
  if (!id) return `<p class="muted small">No video set. Add one in Plan → Exercises.</p>`;
  const q = demo
    ? `autoplay=1&mute=1&loop=1&playlist=${esc(id)}&controls=0&disablekb=1&iv_load_policy=3&playsinline=1&rel=0&modestbranding=1`
    : `playsinline=1&rel=0&modestbranding=1&iv_load_policy=3`;
  const src = Native.on ? `https://ronitbilli.github.io/ironcourt/yt.html?v=${esc(id)}&demo=${demo ? 1 : 0}` : `https://www.youtube.com/embed/${esc(id)}?${q}`;
  return `<div class="video ${demo ? "demo" : ""}"><iframe src="${src}" title="Exercise video" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
}
function exVideo(info, key) {
  const full = ui.open[key]?.full;
  const id = full || !info.demo ? info.video : info.demo;
  const toggle = info.demo && info.video ? `<button class="linkish small" data-a="vid-mode" data-k="${key}">${full ? "Show the short demo" : "Watch the full tutorial (with coaching)"}</button>` : "";
  return `${videoHTML(id, !full && !!info.demo)}${toggle}`;
}
// ================= ui state =================
const ui = { tab: "today", open: {}, foodQ: "", editSession: null, editEx: null, exQ: "", lang: "en", confirm: null, lastTab: {} };
try { ui.tab = localStorage.getItem(KEY + ".tab") || "today"; } catch {}
if (!["today", "train", "food", "kitchen", "progress"].includes(ui.tab)) ui.tab = "today";
ui.who = "ronit";
try { ui.who = localStorage.getItem(KEY + ".who") === "yashvi" ? "yashvi" : "ronit"; } catch {}

// ================= rotation + workouts =================
const rotation = (who = ui.who) => P().rotations[rotKey(who)] || [];
// Two people train from this phone. "ronit" follows the cut/term plan, "yashvi" the glutes plan.
const whoOf = (w) => w.who || "ronit";
const Y_SESSIONS = ["YA", "YB", "YC", "Y1", "Y2", "Y3", "Y4", "GA", "UA", "GB", "UB", "GOPT"];
const whoName = (who) => (who === "yashvi" ? H().partner || "Yashvi" : H().me || "Ronit");
const rotKey = (who = ui.who) => (who === "yashvi" ? "glute" : P().mode === "term" ? "term" : "cut");
const swapsFor = (who = ui.who) => (who === "yashvi" ? (S.swapsY ??= {}) : S.swaps);
function currentSessionId(who = ui.who) {
  const r = rotation(who);
  if (!r.length) return null;
  return r[(S.rot[rotKey(who)] || 0) % r.length];
}
function advanceRotation(who = ui.who) { const k = rotKey(who); S.rot[k] = ((S.rot[k] || 0) + 1) % Math.max(rotation(who).length, 1); }
const activeWorkout = (who = ui.who) => S.workouts.find((w) => w.id === S.activeBy?.[who]) || null;
const workoutsOn = (k, who = "ronit") => S.workouts.filter((w) => w.date === k && w.done && whoOf(w) === who);

function logsFor(ex, excludeId, n = 2, who = ui.who) {
  const out = [];
  for (let i = S.workouts.length - 1; i >= 0 && out.length < n; i--) {
    const w = S.workouts[i];
    if (w.id === excludeId || !w.done || whoOf(w) !== who) continue;
    const it = w.items.find((x) => x.ex === ex && x.sets.some((s) => s.done));
    if (it) out.push({ date: w.date, sets: it.sets.filter((s) => s.done), effort: it.effort || null });
  }
  return out;
}
const lastLog = (ex, excludeId) => logsFor(ex, excludeId, 1)[0] || null;
function topRep(reps) { const n = String(reps).match(/\d+/g); return n ? Math.max(...n.map(Number)) : null; }
function lowRep(reps) { const n = String(reps).match(/\d+/g); return n ? Math.min(...n.map(Number)) : null; }
const roundTo = (v, step) => Math.round(v / step) * step;
// ================= shared pieces =================
const ICON = {
  play: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M19 7h1M4 12h3M13 12h7M4 17h10M20 17h0"/><circle cx="16" cy="7" r="2.4"/><circle cx="10" cy="12" r="2.4"/><circle cx="17" cy="17" r="2.4"/></svg>`,
  cal: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>`,
  close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
};
const fmtLong = (k) => parseKey(k).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1).trimEnd() + "…" : String(s));
const other = (who) => (who === "ronit" ? "yashvi" : "ronit");

// Three workouts a week each is the goal the whole app is built around.
const WEEK_GOAL = 3;
function weekCount(who = ui.who, k = todayKey()) {
  const mon = weekOf(k), sun = addDays(mon, 6);
  return new Set(S.workouts.filter((x) => x.done && whoOf(x) === who && x.date >= mon && x.date <= sun).map((x) => x.date)).size;
}
// A walk (either person) or squash (ticked on the schedule) counts as an active day.
function activeOn(k, who) {
  if (S.act?.[who]?.[k]) return true;
  if (who !== "ronit") return false;
  const sq = P().schedule.find((x) => x.kind === "squash");
  return !!(sq && S.days[k]?.checks?.[sq.id]);
}
// ---------- the day, fitted around classes ----------
// A day with four or more classes (or six hours of them) has no gym and no squash. On lighter
// class days the gym moves to the free hour nearest its usual time, and anything that would
// land inside a lecture shifts to just before or just after it.
const HEAVY = { n: 4, hours: 6 };
const toHM = (m) => { const v = (((Math.round(m / 5) * 5) % 1440) + 1440) % 1440; return `${pad(Math.floor(v / 60))}:${pad(v % 60)}`; };
function classLoad(k) {
  const ev = Cal.eventsOn(k), hours = ev.reduce((a, e) => a + (e.e - e.s) / 36e5, 0);
  return { ev, n: ev.length, hours, heavy: ev.length >= HEAVY.n || hours >= HEAVY.hours };
}
const busyOf = (ev) => ev.map((e) => { const a = new Date(e.s), b = new Date(e.e); return [a.getHours() * 60 + a.getMinutes(), b.getHours() * 60 + b.getMinutes()]; }).sort((x, y) => x[0] - y[0]);
const itemLen = (it) => (it.kind === "meal" ? 30 : it.kind === "gym" || it.kind === "squash" ? 60 : 10);
const isFree = (t, len, busy, pad2 = 0) => !busy.some(([s, e]) => t < e + pad2 && t + len > s - pad2);
// Nearest free spot just before or just after any class. Morning things would rather move
// earlier than later (breakfast before the first lecture, not after the second).
function fitAround(t, len, busy) {
  if (isFree(t, len, busy)) return t;
  const cost = (x) => Math.abs(x - t) * (x > t && t < 720 ? 1.5 : 1);
  const opts = busy.flatMap(([s, e]) => [s - len - 5, e + 10]).filter((x) => x >= 0 && isFree(x, len, busy)).sort((a, b) => cost(a) - cost(b));
  return opts.length ? opts[0] : t;
}
// Up an hour before the first class, if that is earlier than the usual wake-up.
function wakeFor(k) {
  const it = P().schedule.find((x) => /^wake/i.test(x.title)); if (!it) return null;
  const busy = busyOf(Cal.eventsOn(k)), base = mins(it.time);
  return busy.length && busy[0][0] - 60 < base ? busy[0][0] - 60 : base;
}
function dayPlan(k) {
  const d = S.days[k] || {}, load = classLoad(k), busy = busyOf(load.ev), p = P();
  const plan = { load, off: load.heavy, gymTime: null, gymMoved: false, noSlot: false, items: [] };
  const wake = wakeFor(k);
  for (const src of p.schedule) {
    if (load.heavy && (src.kind === "gym" || src.kind === "squash" || (src.kind === "meal" && src.ref === "postgym"))) continue;
    const it = { ...src }, base = mins(src.time);
    let t = base;
    if (d.moved?.[src.id]) t = mins(d.moved[src.id]);
    else if (/^wake/i.test(src.title)) t = wake ?? base;
    else if (/^sleep/i.test(src.title)) { const w = wakeFor(addDays(k, 1)); if (w != null) t = Math.min(base, w + 1440 - (+p.targets.sleep || 8) * 60); }
    else if (src.kind === "gym") {
      if (busy.length && !isFree(base, 60, busy, 10)) {
        const sq = p.schedule.find((x) => x.kind === "squash"), last = sq ? mins(sq.time) - 75 : 20 * 60, c = [];
        for (let x = (wake ?? 9 * 60) + 45; x <= last; x += 15) if (isFree(x, 60, busy, 15)) c.push(x);
        if (c.length) t = c.sort((a, b) => Math.abs(a - base) - Math.abs(b - base) || b - a)[0]; else plan.noSlot = true;
      }
    } else if (src.kind !== "squash" && busy.length) t = fitAround(base, itemLen(src), busy);
    if (t !== base) { it.time = toHM(t); it.moved = true; }
    if (src.kind === "gym") { plan.gymTime = it.time; plan.gymMoved = t !== base; }
    plan.items.push(it);
  }
  // The post-gym shake follows the gym wherever it went.
  const shake = plan.items.find((x) => x.kind === "meal" && x.ref === "postgym");
  if (shake && plan.gymMoved && !d.moved?.[shake.id]) { shake.time = toHM(fitAround(mins(plan.gymTime) + 65, 30, busy)); shake.moved = true; }
  return plan;
}
// Which days to train this week: skip heavy class days, spread the sessions out, prefer
// lighter days and sooner over later. The two train together, so one plan serves both.
function planDays(who, k = todayKey()) {
  const mon = weekOf(k), t = todayKey(), days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const done = days.filter((x) => workoutsOn(x, who).length), need = Math.max(0, WEEK_GOAL - done.length);
  const cands = days.filter((x) => x >= t && !done.includes(x) && !classLoad(x).heavy);
  const n = Math.min(need, cands.length);
  if (!n) return [];
  let best = null;
  const pick = (start, chosen) => {
    if (chosen.length === n) {
      const all = [...done, ...chosen].sort(), gaps = all.slice(1).map((x, i) => diffDays(x, all[i]));
      const score = (gaps.length ? Math.min(...gaps) : 7) * 100 - chosen.reduce((a, x) => a + classLoad(x).hours * 10 + diffDays(x, t) * 0.1, 0);
      if (!best || score > best.score) best = { score, chosen };
      return;
    }
    for (let i = start; i < cands.length; i++) pick(i + 1, [...chosen, cands[i]]);
  };
  pick(0, []);
  return best ? best.chosen : [];
}
function weekStrip(who, k = todayKey()) {
  const mon = weekOf(k), t = todayKey(), plan = planDays(who, k);
  return `<div class="wk">${Array.from({ length: 7 }, (_, i) => {
    const dk = addDays(mon, i), g = workoutsOn(dk, who).length > 0, a = !g && activeOn(dk, who);
    const cls = g ? "gym" : a ? "act" : classLoad(dk).heavy ? "off" : plan.includes(dk) ? "plan" : "";
    return `<div class="wkd ${cls} ${dk === t ? "today" : ""}"><span>${"MTWTFSS"[i]}</span><i></i></div>`;
  }).join("")}</div>`;
}
function whoSwitch() {
  const tab = (who) => `<button class="${ui.who === who ? "on" : ""} who-${who}" data-a="who" data-v="${who}"><i></i>${esc(whoName(who))}${activeWorkout(who) ? `<span class="live">live</span>` : ""}</button>`;
  return `<div class="seg whoseg">${tab("ronit")}${tab("yashvi")}</div>`;
}
const avatar = (who) => `<span class="av who-${who}">${esc(whoName(who)[0] || "?")}</span>`;

// ================= header =================
function renderTop() {
  const k = curKey(), past = k !== todayKey(), tab = ui.tab;
  const w = tab === "train" ? activeWorkout() : null;
  document.body.dataset.who = ui.who;
  let kicker = esc(fmtLong(todayKey())), title = { today: "Today", train: "Train", food: "Food", kitchen: "Kitchen", progress: "Progress", plan: "Settings" }[tab] || "Today", right = "", below = "";
  if (tab === "today" || tab === "food") {
    right = `<div class="daynav"><button class="icon-btn" data-a="day-step" data-v="-1" aria-label="Previous day">‹</button><label class="daypick icon-btn">${ICON.cal}<input type="date" id="dayPick" value="${k}" max="${todayKey()}" data-a-change="day-pick" aria-label="Pick a day"></label><button class="icon-btn" data-a="day-step" data-v="1" aria-label="Next day" ${past ? "" : "disabled"}>›</button></div>`;
    if (past) { kicker = "Logging a past day"; title = fmtDay(k); below = `<div class="top-inner pastbar"><span class="small">Everything you log goes to <b>${esc(fmtDay(k))}</b></span><button class="btn small primary" data-a="day-today">Back to today</button></div>`; }
  }
  if (w) {
    const st = wkStats(w), bs = blocksOf(w), cur = curBlock(w);
    kicker = `<span id="wkClock">${wkMins(w)}</span> min · ${st.done} of ${st.all} sets${w.quick ? " · quick" : ""}`;
    title = P().sessions[w.session]?.name || "Workout";
    right = `<button class="btn primary small" data-a="finish">Finish</button>`;
    below = `<div class="top-inner"><div class="segbar">${bs.map((b, i) => `<i class="${blockDone(w, b) ? "on" : i === cur ? "cur" : ""}"></i>`).join("")}</div></div>`;
  }
  const gear = tab === "plan" ? `<button class="icon-btn" data-a="go" data-tab="today" aria-label="Close settings">${ICON.close}</button>` : w ? "" : `<button class="icon-btn" data-a="go" data-tab="plan" aria-label="Settings">${ICON.gear}</button>`;
  $("#top").innerHTML = `<div class="top-inner"><div class="grow"><div class="kicker">${kicker}</div><h1>${esc(title)}</h1></div>${isParty(k) && tab === "today" ? `<span class="chip warn">Party</span>` : ""}${right}${gear}</div>${below}`;
}

// ================= render =================
function render() {
  renderTop();
  const views = { today: renderToday, train: renderTrain, food: renderFood, kitchen: renderKitchen, progress: renderProgress, plan: renderPlan };
  $("#main").innerHTML = (views[ui.tab] || renderToday)();
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === ui.tab));
}

// ================= events =================
function resolveBind(path) {
  if (path.startsWith("@w.")) { const w = activeWorkout(); return w ? { obj: w, path: path.slice(3) } : null; }
  if (path.startsWith("@m.")) { const m = ui.editMeal, e = m && mealEntry(m.k, m.meal); return e ? { obj: e, path: path.slice(3) } : null; }
  return { obj: S, path };
}
function readValue(el) {
  const t = el.dataset.type;
  if (t === "num") return el.value === "" ? null : +el.value;
  if (t === "bool") return el.checked;
  if (t === "lines") return el.value.split("\n").map((s) => s.trim()).filter(Boolean);
  return el.value;
}
document.addEventListener("change", (e) => {
  const before = JSON.stringify(S);
  onChange(e);
  afterMutation(before);
});
function onChange(e) {
  const el = e.target;
  if (el.id === "importFile") return importBackup(el.files[0]);
  if (el.dataset.aChange === "got") { const g = groceries(groceryWeek()); g.got[el.dataset.n] = el.checked; save(); return render(); }
  if (el.dataset.aChange === "meal-dish") {
    const m = ui.editMeal, W = S.week[weekOf(m.k)], old = W.days[m.k][m.meal];
    W.days[m.k][m.meal] = entryFor(el.value, { note: old.note });
    save(); render(); return openMealSheet();
  }
  if (el.dataset.aChange === "meal-extra") {
    const e2 = mealEntry(ui.editMeal.k, ui.editMeal.meal), n = el.dataset.n;
    e2.extras = el.checked ? [...new Set([...(e2.extras || []), n])] : (e2.extras || []).filter((x) => x !== n);
    save(); render(); return openMealSheet();
  }
  if (el.dataset.aChange === "gh") { ghSet(el.dataset.f, el.value.trim()); return render(); }
  if (el.dataset.aChange === "day-pick") { const v = el.value; ui.viewDay = v && v < todayKey() ? v : null; return render(); }
  if (el.dataset.aChange === "ics") {
    Cal.setUrl(el.value).then(() => {
      if (Native.on) return Cal.refresh(true).then((r) => { toast(r.ok ? "Classes loaded" : `Couldn't load: ${r.why}`); render(); });
      toast("Link saved. GitHub fetches your classes in about a minute; tap Refresh then.");
      render();
    }).catch((e) => toast(`Couldn't save the link: ${e.message}`));
    return;
  }
  if (el.dataset.aChange === "sess-pick") { ui.editSession = el.value; ui.confirm = null; return render(); }
  if (el.dataset.aChange === "ex-video") { const id = ytId(el.value); if (!id && el.value.trim()) { toast("That doesn't look like a YouTube link"); return; } P().exercises[ui.editEx][el.dataset.f || "video"] = id; save(); return render(); }
  const path = el.dataset.bind;
  if (!path) return;
  if (path.startsWith("days.")) day(path.split(".")[1]);
  const r = resolveBind(path);
  if (!r) return;
  setPath(r.obj, r.path, readValue(el));
  const m = r.path.match(/^plan\.schedule\.(\d+)\.kind$/);
  if (m && el.value === "meal") { const it = P().schedule[+m[1]]; if (!it.ref) it.ref = P().meals[0]?.id; }
  save();
  if (el.dataset.rerender) { render(); if (path.startsWith("@m.") && !$("#sheet").hidden) openMealSheet(); }
}
document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.id === "swapText" && ui.swapDraft) {
    ui.swapDraft.text = el.value;
    const items = [...parseFood(el.value), ...ui.swapDraft.picked];
    ui.swapDraft.items = items;
    $("#swapPreview").innerHTML = swapPreviewHTML(items, Math.round(items.reduce((a, x) => a + x.kcal * x.qty, 0)), Math.round(items.reduce((a, x) => a + x.p * x.qty, 0)));
  }
  if (el.id === "bankQ") $("#bankList").innerHTML = bankListHTML(el.value);
  if (el.id === "exQ") { ui.exQ = el.value; $("#exList").innerHTML = exListHTML(); }
});
document.addEventListener("toggle", (e) => {
  const d = e.target;
  if (d.matches?.("details.sec[data-sec]")) ui.open["sec." + d.dataset.sec] = d.open;
}, true);
const actions = {
  go: (b) => { if (b.dataset.who) ui.who = b.dataset.who; ui.tab = b.dataset.tab; render(); window.scrollTo(0, 0); },
  "rest-done": () => { advanceRotation(); save(); toast("Rest day logged. Rotation moved on."); render(); },
  skip: () => { advanceRotation(); save(); render(); },
  toggle: (b) => { const o = (ui.open[b.dataset.k] ??= {}); o[b.dataset.f] = !o[b.dataset.f]; render(); },
  "meas-save": () => {
    const e = { date: curKey() };
    for (const [f] of MEAS[ui.who]) { const v = parseFloat($(`#m-${f}`)?.value); if (v > 0) e[f] = v; }
    if (Object.keys(e).length < 2) return toast("Type at least one number");
    const list = S.meas[ui.who], i = list.findIndex((x) => x.date === e.date);
    if (i >= 0) list[i] = { ...list[i], ...e }; else list.push(e);
    // Ronit's weight and waist also feed the Progress charts.
    if (ui.who === "ronit") { const d = day(curKey()); if (e.weight) d.weight = e.weight; if (e.waist) d.waist = e.waist; }
    ui.open.measForm = false; save(); toast("Check-in saved"); render();
  },
  "meas-again": () => { ui.open.measForm = true; render(); },
  "set-add": (b) => { const it = activeWorkout().items[+b.dataset.i], l = it.sets[it.sets.length - 1]; it.sets.push({ w: l?.w || "", r: "", done: false }); save(); render(); },
  "set-del": (b) => { const it = activeWorkout().items[+b.dataset.i]; if (it.sets.length > 1) it.sets.pop(); save(); render(); },
  "ex-add": () => {
    const id = $("#addEx").value; if (!id) return;
    const last = lastLog(id);
    activeWorkout().items.push({ ex: id, orig: id, reps: "8-12", rest: 90, note: "", sets: Array.from({ length: 3 }, () => ({ w: last ? last.sets[last.sets.length - 1].w : "", r: "", done: false })) });
    save(); render();
  },
  swap: (b) => openSwap(+b.dataset.i),
  "alt-video": (b) => { ui.open[`alt.${b.dataset.id}`] = !ui.open[`alt.${b.dataset.id}`]; openSwap(+b.dataset.i); },
  "swap-to": (b) => {
    const w = activeWorkout(), it = w.items[+b.dataset.i], id = b.dataset.id;
    it.ex = id;
    const last = lastLog(id);
    it.sets.forEach((s) => { if (!s.done) s.w = last ? last.sets[last.sets.length - 1].w : ""; });
    if (b.dataset.always === "1") { const sw = swapsFor(); if (id === it.orig) delete sw[it.orig]; else sw[it.orig] = id; }
    save(); closeSheet(); toast(`Swapped to ${exInfo(id).name}${b.dataset.always === "1" ? " (always)" : " (today)"}`); render();
  },
  "sheet-close": () => closeSheet(),
  "vid-mode": (b) => { const o = (ui.open[b.dataset.k] ??= {}); o.full = !o.full; render(); },
  "rest-add": () => { if (rest) { rest.end += 15000; rest.fired = false; $("#restbar").classList.remove("over"); tickRest(); } },
  "rest-stop": () => stopRest(),
  tcheck: (b) => {
    const d = day(), it = P().schedule.find((x) => x.id === b.dataset.id);
    if (!it) return;
    if (it.kind === "meal") d.eaten[it.ref] = !d.eaten[it.ref]; else d.checks[it.id] = !d.checks[it.id];
    save(); render();
  },
  drink: (b) => { addExtra(b.dataset.n, +b.dataset.k, 0, { party: true }); toast("Drink logged"); },
  pfood: (b) => { addExtra(b.dataset.n, +b.dataset.k, +b.dataset.p, { party: true }); toast("Logged"); },
  dcheck: (b) => {
    const it = cookReminders(curKey()).find((x) => x.id === b.dataset.id); if (!it) return;
    if (it.go?.meal) { const W = S.week[weekOf(it.go.k)]; W.sent ??= {}; const key = `${it.go.k}.${it.go.meal}`; W.sent[key] = !W.sent[key]; }
    else { const d = day(); d.checks[it.id] = !d.checks[it.id]; }
    save(); render();
  },
  "reset-day": (b) => {
    const key = "reset-day-" + b.dataset.w;
    if (ui.confirm !== key) { ui.confirm = key; return render(); }
    ui.confirm = null;
    const k = curKey();
    S.days[k] = { key: k, checks: {}, water: 0, eaten: {}, choice: {}, extra: [], partyChecks: {} };
    if (b.dataset.w === "1") { S.workouts = S.workouts.filter((w) => w.date !== k || !w.done); }
    save(); toast("Today reset. Tap Undo to bring it back."); render();
  },
  "cook-sel": (b) => { ui.cookSel = { k: b.dataset.k, meal: b.dataset.m }; render(); },
  "meal-edit": (b) => { ui.editMeal = { k: b.dataset.k, meal: b.dataset.m }; openMealSheet(); },
  "msg-copy": (b) => { const m = cookMsgs(ui.cookSel.k, ui.cookSel.meal); copyText(m[+b.dataset.n]); },
  "msg-share": (b) => { const m = cookMsgs(ui.cookSel.k, ui.cookSel.meal); shareText(m[+b.dataset.n], "For the cook"); },
  "msg-sent": () => { const { k, meal } = ui.cookSel, W = S.week[weekOf(k)]; W.sent ??= {}; W.sent[`${k}.${meal}`] = !W.sent[`${k}.${meal}`]; save(); render(); },
  "cook-missed": () => { const e = mealEntry(ui.cookSel.k, ui.cookSel.meal); e.missed = !e.missed; save(); render(); },
  "cook-shift": () => { shiftMeal(ui.cookSel.k, ui.cookSel.meal); save(); toast("Moved to the next day"); render(); },
  "week-shuffle": () => {
    if (ui.confirm !== "shuffle") { ui.confirm = "shuffle"; return render(); }
    ui.confirm = null;
    const t = todayKey(), wk = weekOf(t), W = S.week[wk];
    const firstFree = Array.from({ length: 6 }, (_, i) => addDays(wk, i)).find((k) => k >= t && !W?.sent?.[`${k}.lunch`] && !W?.sent?.[`${k}.dinner`]) || addDays(wk, 6);
    genWeek(wk, Date.now() % 100000, firstFree); render(); toast("New plan for the rest of the week");
  },
  pantry: (b) => { const pl = (P().pantryLow ??= {}); pl[b.dataset.n] = !pl[b.dataset.n]; save(); render(); },
  "groc-copy": () => copyText(groceryText(groceries(groceryWeek()))),
  "groc-share": () => shareText(groceryText(groceries(groceryWeek())), "Groceries"),
  "gh-backup": () => ghBackup(true),
  "gh-restore": () => {
    if (ui.confirm !== "gh-restore") { ui.confirm = "gh-restore"; return render(); }
    ui.confirm = null; ghRestore();
  },
  undo: () => doUndo(),
  "phone-sync": () => syncNative(true),
  "day-step": (b) => { const k = addDays(curKey(), +b.dataset.v); ui.viewDay = k >= todayKey() ? null : k; render(); },
  "day-today": () => { ui.viewDay = null; render(); window.scrollTo(0, 0); },
  iam: (b) => { H().iam = b.dataset.v; save(); render(); },
  "ics-refresh": async () => { toast("Loading classes…"); const r = await Cal.refresh(true); toast(r.ok ? "Classes updated" : `Couldn't load: ${r.why}`); render(); },
  "party-toggle": () => { const d = day(); d.party = !isParty(); save(); render(); },
  eat: (b) => { const d = day(); d.eaten[b.dataset.id] = !d.eaten[b.dataset.id]; save(); render(); },
  "food-add": (b) => { addExtra(b.dataset.n, +b.dataset.k, +b.dataset.p); toast(`Added ${b.dataset.n}`); },
  "extra-q": (b) => { const d = day(), x = d.extra[+b.dataset.i]; x.qty = (x.qty || 1) + +b.dataset.v; if (x.qty <= 0) d.extra.splice(+b.dataset.i, 1); save(); render(); },
  "week-copy": () => copyText(weekSummary()),
  "sched-add": () => { P().schedule.push({ id: uid(), time: "12:00", title: "New item", kind: "habit" }); save(); render(); },
  "sched-del": (b) => { P().schedule.splice(+b.dataset.i, 1); save(); render(); },
  "rot-move": (b) => { const r = rotation(), i = +b.dataset.i, j = i + +b.dataset.v; if (j < 0 || j >= r.length) return; [r[i], r[j]] = [r[j], r[i]]; save(); render(); },
  "rot-del": (b) => { rotation().splice(+b.dataset.i, 1); save(); render(); },
  "rot-add": () => { rotation().push($("#rotAdd").value); save(); render(); },
  "sess-new": () => { const id = "S" + uid(); P().sessions[id] = { name: "New session", focus: "", items: [] }; ui.editSession = id; save(); render(); },
  "sess-del": () => {
    if (ui.confirm !== "sess-del") { ui.confirm = "sess-del"; return render(); }
    ui.confirm = null;
    const id = ui.editSession, p = P();
    delete p.sessions[id];
    for (const m of Object.keys(p.rotations)) p.rotations[m] = p.rotations[m].filter((x) => x !== id);
    ui.editSession = Object.keys(p.sessions)[0]; save(); render();
  },
  "si-add": () => { P().sessions[ui.editSession].items.push({ ex: "db_lateral", sets: 3, reps: "10-12", rest: 90 }); save(); render(); },
  "si-del": (b) => { P().sessions[ui.editSession].items.splice(+b.dataset.i, 1); save(); render(); },
  "si-move": (b) => { const a = P().sessions[ui.editSession].items, i = +b.dataset.i, j = i + +b.dataset.v; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; save(); render(); },
  "ex-edit": (b) => { ui.editEx = b.dataset.id; render(); },
  "ex-close": () => { ui.editEx = null; render(); },
  "ex-new": () => { const id = "x" + uid(); P().exercises[id] = { name: "New exercise", muscle: "", video: "", cues: [], alts: [] }; ui.editEx = id; save(); render(); },
  "alt-add": () => { const e = P().exercises[ui.editEx]; (e.alts ??= []).push([$("#altPick").value, $("#altWhy").value.trim() || "Alternative"]); save(); render(); },
  "alt-del": (b) => { P().exercises[ui.editEx].alts.splice(+b.dataset.i, 1); save(); render(); },
  "opt-add": (b) => { P().meals[+b.dataset.m].options.push({ name: "New option", detail: "", kcal: 0, protein: 0 }); save(); render(); },
  "opt-del": (b) => { const m = P().meals[+b.dataset.m]; if (m.options.length > 1) m.options.splice(+b.dataset.o, 1); else toast("A meal needs at least one option"); save(); render(); },
  "pd-add": () => { const v = $("#pdNew").value; if (!v) return; if (!P().partyDates.includes(v)) P().partyDates.push(v); save(); render(); },
  "pd-del": (b) => { P().partyDates = P().partyDates.filter((k) => k !== b.dataset.k); save(); render(); },
  export: () => exportBackup(),
  reset: () => {
    if (ui.confirm !== "reset") { ui.confirm = "reset"; return render(); }
    ui.confirm = null; S = migrate(freshState()); save(); toast("Reset done"); render();
  },
};
