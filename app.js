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
  return { plan: clone(DEFAULT_PLAN), days: {}, workouts: [], active: null, rot: { cut: 0, term: 0 }, swaps: {}, week: {} };
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
  if (s.plan.version < 4) {
    for (const it of s.plan.schedule) { it.notify ??= true; if (/^wake/i.test(it.title)) it.alarm = true; }
    s.plan.version = 4;
  }
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
// A "day" runs 4am to 4am, so logging at 1am still counts for the evening before.
const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = () => keyOf(new Date(Date.now() - 4 * 3600e3));
const parseKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
const diffDays = (a, b) => Math.round((parseKey(a) - parseKey(b)) / 864e5);
const fmtDay = (k) => parseKey(k).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const mins = (t) => { const [h, m] = t.split(":").map(Number); let v = h * 60 + m; if (h < 4) v += 1440; return v; };
const nowMins = () => { const d = new Date(); let v = d.getHours() * 60 + d.getMinutes(); if (d.getHours() < 4) v += 1440; return v; };
const fmtTime = (t) => { const [h, m] = t.split(":").map(Number); const hh = ((h + 11) % 12) + 1; return `${hh}:${pad(m)}${h < 12 ? "a" : "p"}`; };

// ================= helpers =================
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const P = () => S.plan;
const exInfo = (id) => P().exercises[id] || { name: id, muscle: "", video: "", cues: [], alts: [] };
const ALCOHOL = /beer|whisky|rum|vodka|gin|wine|peg|alcohol|cocktail/i;

function day(k = todayKey()) {
  if (!S.days[k]) S.days[k] = { key: k, checks: {}, water: 0, eaten: {}, choice: {}, extra: [], partyChecks: {} };
  return S.days[k];
}
function isParty(k = todayKey()) {
  const d = S.days[k];
  if (d && d.party !== undefined) return d.party;
  return P().partyDates.includes(k);
}
// Lunch and dinner come from the cook plan when there is one; otherwise the slot's own options.
function mealOpt(slot, d, k = d.key) {
  if (slot.cook && k && k >= (H().since || "")) {
    const e = mealEntry(k, slot.id);
    if (e && !e.off) { const dd = DISH(e.dish), m = myPlate(e, slot.id); return { name: dd.name, detail: addonSummary(e), kcal: m.kcal, protein: m.p, veg: dd.diet !== "nonveg", fromCook: true }; }
  }
  const i = d.choice[slot.id] ?? 0;
  return { ...(slot.options[i] || slot.options[0]), veg: !!slot.veg };
}
function totals(d) {
  let kcal = 0, protein = 0;
  for (const slot of P().meals) if (d.eaten[slot.id]) { const o = mealOpt(slot, d); kcal += +o.kcal || 0; protein += +o.protein || 0; }
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

// ================= rotation + workouts =================
const rotation = () => P().rotations[P().mode] || [];
function currentSessionId() {
  const r = rotation();
  if (!r.length) return null;
  return r[(S.rot[P().mode] || 0) % r.length];
}
function advanceRotation() { S.rot[P().mode] = ((S.rot[P().mode] || 0) + 1) % Math.max(rotation().length, 1); }
const activeWorkout = () => S.workouts.find((w) => w.id === S.active) || null;
const workoutsOn = (k) => S.workouts.filter((w) => w.date === k && w.done);

function logsFor(ex, excludeId, n = 2) {
  const out = [];
  for (let i = S.workouts.length - 1; i >= 0 && out.length < n; i--) {
    const w = S.workouts[i];
    if (w.id === excludeId || !w.done) continue;
    const it = w.items.find((x) => x.ex === ex && x.sets.some((s) => s.done));
    if (it) out.push({ date: w.date, sets: it.sets.filter((s) => s.done), effort: it.effort || null });
  }
  return out;
}
const lastLog = (ex, excludeId) => logsFor(ex, excludeId, 1)[0] || null;
function topRep(reps) { const n = String(reps).match(/\d+/g); return n ? Math.max(...n.map(Number)) : null; }
function lowRep(reps) { const n = String(reps).match(/\d+/g); return n ? Math.min(...n.map(Number)) : null; }
const roundTo = (v, step) => Math.round(v / step) * step;

// Progression: reps logged + how it felt last time decide this session's target.
// kind: good (go up), warn (back off / swap), "" (hold and beat it)
const EFFORT = { easy: "Easy", right: "Just right", hard: "Very hard", pain: "Hurt" };
const FELT = { easy: "felt easy", right: "felt just right", hard: "felt very hard", pain: "hurt" };
function suggestion(item, wid) {
  const [last, prev] = logsFor(item.ex, wid, 2);
  if (!last) return { text: "First time logging this. Pick a weight you could lift for the top of the range with 2-3 reps to spare.", kind: "" };
  const str = last.sets.map((s) => (s.w ? `${s.w}×${s.r || "?"}` : `${s.r || "?"} reps`)).join(", ");
  const head = `Last (${fmtDay(last.date)}${last.effort ? ", " + FELT[last.effort] : ""}): ${str}.`;
  const top = topRep(item.reps), low = lowRep(item.reps);
  const hit = top && last.sets.every((s) => +s.r >= top);
  const missed = low && last.sets.some((s) => +s.r < low);
  const w = +last.sets[last.sets.length - 1].w || 0;
  const inc = /squat|leg_press|rdl|hip_thrust|hack|deadlift/.test(item.ex) ? 5 : 2.5;
  if (last.effort === "pain") return { text: `${head} It hurt last time. Tap ⇄ Swap for a different exercise, or go 20% lighter (${w ? roundTo(w * 0.8, 2.5) + " kg" : "easier version"}) and stop if it hurts again.`, kind: "warn" };
  if (prev && w && missed && +prev.sets[prev.sets.length - 1].w === w && prev.sets.some((s) => +s.r < low))
    return { text: `${head} Stuck below ${low} reps two sessions in a row. Drop to ${roundTo(w * 0.9, 2.5)} kg and build back up.`, kind: "warn" };
  if (hit && w && last.effort === "easy") return { text: `${head} Top of the range and it felt easy. Jump to ${w + inc * 2} kg.`, kind: "good" };
  if (hit && w) return { text: `${head} You hit the top of the range. Try ${w + inc} kg.`, kind: "good" };
  if (hit) return { text: `${head} Make it harder: slower lowering, a pause at the stretch, or add load.`, kind: "good" };
  if (last.effort === "easy" && w) return { text: `${head} Felt easy but you stopped short of ${top}. Same weight, push every set to ${top} reps.`, kind: "good" };
  if (last.effort === "hard" && missed) return { text: `${head} Very hard and under ${low} reps. Keep ${w || "the same"} ${w ? "kg" : "load"} and aim for ${low} on every set.`, kind: "" };
  return { text: `${head} Beat it: same weight, one more rep on any set.`, kind: "" };
}

function startWorkout(sid) {
  const se = P().sessions[sid];
  if (!se) return;
  const w = {
    id: uid(), date: todayKey(), session: sid, start: Date.now(), done: false,
    items: se.items.map((it) => {
      const ex = S.swaps[it.ex] || it.ex;
      const last = lastLog(ex);
      const lw = last ? last.sets[last.sets.length - 1].w : "";
      return { ex, orig: it.ex, reps: it.reps, rest: +it.rest || 90, note: "", sets: Array.from({ length: +it.sets || 3 }, () => ({ w: lw || "", r: "", done: false })) };
    }),
  };
  S.workouts.push(w);
  S.active = w.id;
  save();
  wakeLock(true);
  render();
  window.scrollTo(0, 0);
}
function finishWorkout() {
  const w = activeWorkout();
  if (!w) return;
  const logged = w.items.some((it) => it.sets.some((s) => s.done));
  if (!logged) { S.workouts = S.workouts.filter((x) => x.id !== w.id); S.active = null; save(); wakeLock(false); toast("Workout discarded (nothing logged)"); render(); return; }
  w.done = true; w.end = Date.now();
  if (w.session === currentSessionId()) advanceRotation();
  const d = day(w.date);
  const gym = P().schedule.find((x) => x.kind === "gym");
  if (gym) d.checks[gym.id] = true;
  S.active = null;
  save();
  wakeLock(false);
  stopRest();
  const sets = w.items.reduce((a, it) => a + it.sets.filter((s) => s.done).length, 0);
  toast(`Saved: ${P().sessions[w.session]?.name || "Workout"}, ${sets} sets`);
  render();
}

let lock = null;
async function wakeLock(on) {
  try {
    if (on && "wakeLock" in navigator && !lock) { lock = await navigator.wakeLock.request("screen"); lock.addEventListener("release", () => (lock = null)); }
    if (!on && lock) { await lock.release(); lock = null; }
  } catch {}
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.active) wakeLock(true); });

// ================= rest timer =================
let rest = null, audio = null;
function beep() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((t) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
      g.gain.setValueAtTime(0.25, audio.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + t + 0.18);
      o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.2);
    });
  } catch {}
  Native.haptic("done");
}
function startRest(sec) {
  try { audio ??= new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.(); } catch {}
  if (!sec) return;
  Native.restNotice(sec);
  rest = { end: Date.now() + sec * 1000, fired: false };
  tickRest();
}
function stopRest() { if (rest && !rest.fired) Native.restNotice(0); rest = null; const b = $("#restbar"); b.hidden = true; b.classList.remove("over"); }
function tickRest() {
  const b = $("#restbar");
  if (!rest) { b.hidden = true; return; }
  if (!b.firstChild) b.innerHTML = `<span class="small" id="restLbl">Rest</span><span class="clock" id="restClock"></span><button class="btn" data-a="rest-add">+15 s</button><button class="btn" data-a="rest-stop">Skip</button>`;
  const left = Math.ceil((rest.end - Date.now()) / 1000);
  if (left <= 0 && !rest.fired) { rest.fired = true; beep(); b.classList.add("over"); setTimeout(() => { if (rest?.fired) stopRest(); }, 6000); }
  const v = Math.max(left, 0);
  b.hidden = false;
  $("#restLbl").textContent = left > 0 ? "Rest" : "Go";
  $("#restClock").textContent = `${Math.floor(v / 60)}:${pad(v % 60)}`;
}
setInterval(() => { if (rest) tickRest(); }, 250);

// ================= header =================
function renderTop() {
  const k = todayKey(), p = P();
  const total = diffDays(p.cutEnd, p.cutStart) + 1, n = diffDays(k, p.cutStart) + 1;
  let phase;
  if (p.mode === "term") phase = "Term mode";
  else if (n < 1) phase = `Cut starts in ${1 - n} day${n === 0 ? "" : "s"}`;
  else if (n > total) phase = "Cut complete";
  else phase = `Cut · day ${n} of ${total}`;
  const titles = { today: fmtDay(k), train: "Train", food: "Food", progress: "Progress", plan: "Plan" };
  $("#top").innerHTML = `<div class="top-inner"><div class="grow"><div class="kicker">${esc(ui.tab === "today" ? phase : fmtDay(k))}</div><h1>${esc(titles[ui.tab])}</h1></div>${isParty(k) ? `<span class="chip warn">Party day</span>` : ""}</div>`;
}

function ring(pct, size = 120, sw = 11) {
  const r = (size - sw) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(pct, 100)) / 100);
  return `<svg class="ring ${pct >= 100 ? "full" : ""}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${sw}" class="ring-bg"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${sw}" class="ring-fg" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}

// ================= TODAY =================
function renderToday() {
  const k = todayKey(), d = day(k), p = P(), t = totals(d);
  const classes = classItems(k);
  const items = p.schedule.map((it) => ({ ...it, time: d.moved?.[it.id] || it.time, moved: !!d.moved?.[it.id] }));
  const sched = [...items.map((it) => ({ ...it, clash: clashWith(it, classes) })), ...cookReminders(k), ...classes].sort((a, b) => mins(a.time) - mins(b.time));
  const gymItem = items.find((x) => x.kind === "gym");
  const gymClash = gymItem && !gymItem.moved && clashWith(gymItem, classes);
  const gymSlot = gymClash ? freeSlot(classes, 75, gymItem.time) : null;
  const tasks = sched.filter((x) => !x.cls);
  const now = nowMins();
  let nowIdx = -1;
  sched.forEach((it, i) => { if (mins(it.time) <= now) nowIdx = i; });
  const doneW = workoutsOn(k).length > 0;
  const checked = (it) => it.kind === "meal" ? !!d.eaten[it.ref] : it.kind === "gym" ? !!d.checks[it.id] || doneW : it.go && it.go.meal ? !!S.week[weekOf(it.go.k)]?.sent?.[`${it.go.k}.${it.go.meal}`] : !!d.checks[it.id];
  const nChecked = tasks.filter(checked).length;
  const goals = [t.protein >= p.targets.protein, d.water >= p.targets.water];
  const score = Math.round(((nChecked + goals.filter(Boolean).length) / (tasks.length + goals.length)) * 100);

  const meter = (label, val, unit, target, pct, extra = "") => `
    <div class="meter"><div class="meter-top"><span class="eyebrow">${label}</span>${ring(pct, 34, 5)}</div>
      <div class="val">${val}<small> ${unit}</small></div>
      <span class="small muted">${target}</span>${extra}</div>`;

  const sid = currentSessionId(), se = p.sessions[sid];
  const aw = activeWorkout();
  let next;
  if (aw) next = `<div class="spread"><div><span class="eyebrow">Workout in progress</span><h2>${esc(p.sessions[aw.session]?.name)}</h2></div><button class="btn primary" data-a="go" data-tab="train">Continue</button></div>`;
  else if (doneW) next = `<div class="spread"><div><span class="eyebrow">Gym</span><h2>Done today</h2></div><span class="chip good">${esc(workoutsOn(k).map((w) => p.sessions[w.session]?.name).join(", "))}</span></div>`;
  else if (sid === "REST") next = `<div class="spread"><div><span class="eyebrow">Next in rotation</span><h2>Rest day</h2><p class="small muted">Squash only. Walk, stretch, sleep.</p></div><button class="btn" data-a="rest-done">Mark rest done</button></div>`;
  else if (se) next = `<div class="spread"><div><span class="eyebrow">Next in rotation</span><h2>${esc(se.name)}</h2><p class="small muted">${esc(se.focus)} · ${se.items.length} exercises</p></div><button class="btn primary" data-a="start" data-sid="${sid}">Start</button></div>`;
  else next = `<p class="muted">No rotation set. Add sessions in Plan.</p>`;

  const party = isParty(k);
  const partyCard = party ? partyCardHTML(k, d) : "";
  const recovery = recoveryCardHTML(k, d);

  const isSunday = parseKey(k).getDay() === 0;

  return `
    <section class="hero">
      <div class="hero-ring">${ring(score, 116, 10)}<div class="ring-txt"><b>${score}</b><span>%</span></div></div>
      <div class="hero-side">
        <span class="eyebrow">Today's score</span>
        <p class="hero-line"><b>${nChecked}</b> of ${tasks.length} done</p>
        <div class="pills"><span class="pill ${goals[0] ? "on" : ""}">Protein</span><span class="pill ${goals[1] ? "on" : ""}">Water</span><span class="pill ${doneW ? "on" : ""}">Gym</span></div>
      </div>
    </section>

    ${recovery}
    ${gymClash ? `<section class="card week1"><b>Gym clashes with ${esc(gymClash)}</b>
      <p class="small">${gymSlot ? `Next free 75 minutes: <b>${fmtTime(gymSlot)}</b>.` : "No free 75-minute gap before squash today."}</p>
      <div class="row wrap">${gymSlot ? `<button class="btn small primary" data-a="move-gym" data-t="${gymSlot}">Move gym to ${fmtTime(gymSlot)}</button>` : ""}<button class="btn small" data-a="move-gym" data-t="">Keep ${fmtTime(gymItem.time)}</button></div></section>` : ""}
    <section class="card next">${next}</section>
    ${partyCard}

    <div class="meters">
      ${meter("Protein", t.protein, "g", `of ${p.targets.protein} g · ${t.kcal} kcal`, (t.protein / p.targets.protein) * 100)}
      ${meter("Water", String(+(d.water / 1000).toFixed(2)), "L", `of ${p.targets.water / 1000} L`, (d.water / p.targets.water) * 100,
        `<div class="row"><button class="btn small grow" data-a="water" data-v="-250">−</button><button class="btn small grow primary" data-a="water" data-v="250">+250 ml</button></div>`)}
      <div class="meter"><span class="eyebrow">Steps</span><input id="steps" type="number" inputmode="numeric" placeholder="0" value="${d.steps ?? ""}" data-bind="days.${k}.steps" data-type="num"><span class="small muted">target ${p.targets.steps.toLocaleString("en-IN")}</span></div>
      <div class="meter"><span class="eyebrow">Sleep last night</span><input id="sleep" type="number" inputmode="decimal" step="0.5" placeholder="h" value="${d.sleep ?? ""}" data-bind="days.${k}.sleep" data-type="num"><span class="small muted">target ${p.targets.sleep} h</span></div>
    </div>

    <section class="card"><h2>Schedule</h2><div class="timeline">
      ${sched.map((it, i) => {
        const on = checked(it);
        let sub = "";
        if (it.kind === "meal") { const slot = p.meals.find((m) => m.id === it.ref); if (slot) { const o = mealOpt(slot, d, k); sub = `${o.veg ? '<i class="veg"></i>' : ""}${esc(o.name)} · ${o.protein} g protein`; } }
        if (it.sub) sub = esc(it.sub);
        if (it.kind === "gym") sub = (it.moved ? "Moved today · " : "") + (aw ? "In progress" : doneW ? "Logged" : sid === "REST" ? "Rest day in rotation" : esc(se?.name || ""));
        if (it.clash) sub = `<b class="warn-text">Clashes with ${esc(it.clash)}</b>${sub ? " · " + sub : ""}`;
        return `<div class="tl ${i === nowIdx ? "now" : ""} ${on ? "done" : ""} ${it.cls ? "cls" : ""}">
          <span class="t">${fmtTime(it.time)}</span><span class="dot k-${it.kind}"></span>
          <div class="what" ${it.go ? `data-a="tl-go" data-id="${it.id}" role="button" tabindex="0"` : ""}><b>${esc(it.title)}${it.go ? " ›" : ""}</b>${sub ? `<span>${sub}</span>` : ""}</div>
          ${it.cls ? `<span class="chip">Outlook</span>` : `<button class="check ${on ? "on" : ""}" data-a="${it.dyn ? "dcheck" : "tcheck"}" data-id="${it.id}" aria-label="Mark ${esc(it.title)} done"></button>`}</div>`;
      }).join("")}
    </div></section>

    <section class="card"><h2>Body</h2>
      <div class="grid2">
        <div class="field"><label for="wt">Morning weight (kg)</label><input id="wt" type="number" inputmode="decimal" step="0.1" placeholder="e.g. 73.6" value="${d.weight ?? ""}" data-bind="days.${k}.weight" data-type="num" data-rerender="1"></div>
        <div class="field"><label for="waist">Waist at navel (cm)${isSunday ? " · today" : ""}</label><input id="waist" type="number" inputmode="decimal" step="0.5" placeholder="${isSunday ? "Measure today" : "Sundays"}" value="${d.waist ?? ""}" data-bind="days.${k}.waist" data-type="num"></div>
      </div>
      <p class="small muted">Weigh after the toilet, before food. Only the weekly average matters.</p>
      <div class="field"><label for="note">Note for today</label><input id="note" type="text" placeholder="Energy, sleep, anything off" value="${esc(d.note ?? "")}" data-bind="days.${k}.note" data-type="str"></div>
    </section>

    ${party ? `<section class="card flat"><div class="spread"><div><b>Party over?</b><p class="small muted">Turning it off keeps everything you logged.</p></div>
      <button class="btn small" data-a="party-toggle">Turn off</button></div></section>` : `<section class="card flat"><div class="spread"><div><b>Unplanned party?</b><p class="small muted">Opens the drink and party-food log for today.</p></div>
      <button class="btn small primary" data-a="party-toggle">Party now</button></div></section>`}

    <section class="card flat"><div><b>Start over today?</b><p class="small muted">Clears today's ticks, food, water, steps, weight and party log. You can undo it.</p></div>
      <div class="row wrap"><button class="btn small" data-a="reset-day" data-w="0">${ui.confirm === "reset-day-0" ? "Tap again to reset" : "Reset today"}</button>
      ${doneW ? `<button class="btn small ghost" data-a="reset-day" data-w="1">${ui.confirm === "reset-day-1" ? "Tap again: reset + delete workout" : "Reset + delete today's workout"}</button>` : ""}</div></section>`;
}

// Reminders that come from the cook plan: send messages, soak pulses, order groceries.
function cookReminders(k) {
  const out = [];
  if (isCookDay(k)) {
    const e = mealEntry(k, "dinner");
    if (e && !e.off) out.push({ id: "dyn-dinner", dyn: true, time: "15:30", title: "Send dinner message to cook", kind: "cook", sub: DISH(e.dish).name, go: { k, meal: "dinner" } });
  }
  const tm = addDays(k, 1);
  if (isCookDay(tm)) {
    const e = mealEntry(tm, "lunch");
    if (e && !e.off) {
      if (DISH(e.dish).soak) out.push({ id: "dyn-soak", dyn: true, time: "22:00", title: `Soak ${DISH(e.dish).soak} for tomorrow`, kind: "habit", sub: "In water overnight" });
      out.push({ id: "dyn-lunch", dyn: true, time: "23:00", title: "Send tomorrow's lunch message", kind: "cook", sub: DISH(e.dish).name, go: { k: tm, meal: "lunch" } });
    }
  }
  const dow = parseKey(k).getDay();
  if (dow === 0) out.push({ id: "dyn-groc", dyn: true, time: "11:00", title: "Order groceries for the week", kind: "cook", go: { groc: true } });
  if (dow === 3 && groceries(weekOf(k)).mid.length) out.push({ id: "dyn-chk", dyn: true, time: "18:00", title: "Order chicken for Thu-Sat", kind: "cook", go: { groc: true } });
  return out;
}


// ---------- Outlook classes on the timeline ----------
const hhmm = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function classItems(k) {
  return Cal.eventsOn(k).map((e) => ({ id: "cls" + e.s, cls: true, dyn: true, kind: "class", time: hhmm(e.s), title: e.t, sub: `till ${fmtTime(hhmm(e.e))}${e.w ? " · " + e.w : ""}`, s: e.s, e: e.e }));
}
// Gym is about 75 minutes, squash about 60. Anything in the schedule that overlaps a class is flagged.
function clashWith(it, classes) {
  if (!classes.length || !["gym", "squash"].includes(it.kind)) return "";
  const len = it.kind === "gym" ? 75 : 60;
  const base = classes[0] ? new Date(classes[0].s) : new Date();
  const [h, m] = it.time.split(":").map(Number);
  const a = new Date(base); a.setHours(h, m, 0, 0);
  const b = a.getTime() + len * 60e3;
  const hit = classes.find((c) => c.s < b && c.e > a.getTime());
  return hit ? `${hit.title} (${fmtTime(hhmm(hit.s))})` : "";
}

// First gap of `len` minutes between 10:30 and squash that misses every class (15 min buffer).
function freeSlot(classes, len, prefer) {
  const squash = P().schedule.find((x) => x.kind === "squash");
  const latest = squash ? mins(squash.time) - len - 30 : 17 * 60;
  const busy = classes.map((c) => { const a = new Date(c.s), b = new Date(c.e); return [a.getHours() * 60 + a.getMinutes() - 15, b.getHours() * 60 + b.getMinutes() + 15]; });
  const start = Math.max(10 * 60 + 30, Math.min(mins(prefer), 10 * 60 + 30));
  for (let t = start; t <= latest; t += 15) if (!busy.some(([a, b]) => t < b && t + len > a)) return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
  return null;
}

// Next 7 days of Outlook events, grouped by day (Plan → Classes).
function upcomingHTML() {
  const days = Array.from({ length: 7 }, (_, i) => addDays(todayKey(), i)).map((k) => [k, Cal.eventsOn(k)]).filter(([, ev]) => ev.length);
  if (!days.length) return Cal.status().url ? `<p class="small muted">No Outlook events in the next 7 days.</p>` : "";
  return `<span class="eyebrow">Next 7 days</span><div class="stack">${days.map(([k, ev]) => `<div><b class="small">${esc(fmtDay(k))}</b>${ev.map((e) => `<div class="spread small"><span>${esc(e.t)}${e.w ? ` <span class="muted">· ${esc(e.w)}</span>` : ""}</span><span class="muted num">${fmtTime(hhmm(e.s))}-${fmtTime(hhmm(e.e))}</span></div>`).join("")}</div>`).join("")}</div>`;
}

// ---------- phone sync: reminders + alarms ----------
function reminderPlan() {
  const out = [], t = todayKey();
  for (let i = 0; i < 3; i++) {
    const k = addDays(t, i), d = S.days[k];
    for (const it of [...P().schedule, ...cookReminders(k)]) {
      if (it.notify === false) continue;
      if (i === 0 && d && (d.checks?.[it.id] || (it.kind === "meal" && d.eaten?.[it.ref]))) continue;
      const [h, m] = it.time.split(":").map(Number);
      const at = parseKey(k); if (h < 4) at.setDate(at.getDate() + 1); at.setHours(h, m, 0, 0);
      let body = it.sub || "";
      if (it.kind === "meal") { const slot = P().meals.find((x) => x.id === it.ref); if (slot) body = mealOpt(slot, d || { choice: {}, key: k }, k).name; }
      if (it.kind === "gym") { const sid = currentSessionId(); body = sid === "REST" ? "Rest day in the rotation" : P().sessions[sid]?.name || ""; }
      out.push({ key: `${k}|${it.id}`, at, title: it.title, body });
    }
  }
  return out;
}
async function syncNative(manual = false) {
  if (!Native.on) { if (manual) toast("Reminders and alarms work in the iPhone app"); return; }
  const r = await Native.syncReminders(reminderPlan());
  const alarms = P().schedule.filter((x) => x.alarm).map((x) => { const [h, m] = x.time.split(":").map(Number); return { key: x.id, hour: h, minute: m, label: x.title }; });
  const a = await Native.syncAlarms(alarms);
  ui.phone = { at: Date.now(), r, a };
  if (manual) toast(r.ok ? `${r.count} reminders set${a.ok ? `, ${a.count} alarms` : ""}` : `Couldn't set reminders: ${r.why}`);
  if (ui.tab === "plan") render();
}

// ---------- party ----------
const PARTY_DRINKS = [["Peg (30 ml)", "Whisky / rum, 30 ml", 70], ["Beer 330", "Beer, 330 ml", 140], ["Strong beer 650", "Strong beer, 650 ml", 390], ["Wine glass", "Wine, 150 ml", 125], ["Cocktail", "Cocktail", 220], ["Shot", "Vodka / gin shot, 30 ml", 65]];
const PARTY_FOOD = [["Pizza slice", 280, 12], ["Fries (portion)", 350, 4], ["Chicken starter (plate)", 450, 35], ["Paneer tikka (plate)", 380, 20], ["Burger", 500, 20], ["Nachos (plate)", 450, 8], ["Biryani (plate)", 700, 25], ["Momos (6)", 300, 12], ["Late-night maggi", 400, 8]];
function partyCardHTML(k, d) {
  const p = P(), drinks = d.extra.filter((x) => x.alcohol);
  const kcal = drinks.reduce((a, x) => a + x.kcal * (x.qty || 1), 0);
  const logged = d.extra.filter((x) => x.party || x.alcohol);
  return `<section class="card party">
    <div class="spread"><h2>Party mode</h2><span class="chip warn">${drinksOf(d)} drinks · ${kcal} kcal</span></div>
    <div class="stack">${p.partyRules.map((r, i) => `
      <div class="row"><button class="check ${d.partyChecks[i] ? "on" : ""}" data-a="pcheck" data-i="${i}" aria-label="Done"></button><span class="grow">${esc(r)}</span></div>`).join("")}</div>
    <span class="eyebrow">Log a drink</span>
    <div class="opts wrap">${PARTY_DRINKS.map(([l, n, kc]) => `<button class="opt" data-a="drink" data-n="${esc(n)}" data-k="${kc}">+ ${esc(l)}</button>`).join("")}</div>
    <span class="eyebrow">Party food</span>
    <div class="opts wrap">${PARTY_FOOD.map(([n, kc, pr]) => `<button class="opt" data-a="pfood" data-n="${esc(n)}" data-k="${kc}" data-p="${pr}">+ ${esc(n)}</button>`).join("")}</div>
    ${logged.length ? `<div class="stack small">${logged.map((x) => `<div class="spread"><span>${x.t ? `<span class="muted num">${x.t}</span> ` : ""}${x.qty > 1 ? x.qty + "× " : ""}${esc(x.name)}</span><span class="muted num">${Math.round(x.kcal * (x.qty || 1))} kcal</span></div>`).join("")}</div>` : ""}
    <div class="field"><label for="pnote">Where / with whom (optional)</label><input id="pnote" type="text" value="${esc(d.partyNote || "")}" data-bind="days.${k}.partyNote" data-type="str" placeholder="e.g. C-block, batch party"></div>
  </section>`;
}
const RECOVERY = ["500 ml water with ORS or electrolytes now", "Eggs or a protein breakfast, not greasy food", "Train today; lighter is fine, skipping isn't", "3.5 L water through the day", "Back on the plan, no 'cheat day' follow-up"];
function recoveryCardHTML(k, d) {
  const y = S.days[addDays(k, -1)];
  if (!y || !drinksOf(y)) return "";
  const kcal = y.extra.filter((x) => x.alcohol).reduce((a, x) => a + x.kcal * (x.qty || 1), 0);
  const r = d.recovery || {};
  if (RECOVERY.every((_, i) => r[i])) return "";
  return `<section class="card week1"><div class="spread"><h2>Morning after</h2><span class="chip warn">${drinksOf(y)} drinks · ${kcal} kcal</span></div>
    <div class="stack">${RECOVERY.map((t, i) => `<div class="row"><button class="check ${r[i] ? "on" : ""}" data-a="rcheck" data-i="${i}" aria-label="Done"></button><span class="grow">${esc(t)}</span></div>`).join("")}</div></section>`;
}


// ================= TRAIN =================
function exCard(item, idx, w) {
  const info = exInfo(item.ex);
  const allDone = item.sets.length && item.sets.every((s) => s.done);
  const sug = suggestion(item, w.id);
  const open = ui.open[`${w.id}.${idx}`] || {};
  const swapped = item.ex !== item.orig;
  return `<article class="ex ${allDone ? "complete" : ""}" id="ex-${idx}">
    <div class="ex-title"><span class="n">${idx + 1}</span><div class="grow"><h3>${esc(info.name)}</h3>
      <div class="ex-meta"><span class="chip">${item.sets.length} × ${esc(item.reps)}</span><span class="chip">rest ${item.rest >= 60 ? `${Math.floor(item.rest / 60)}:${pad(item.rest % 60)}` : `${item.rest}s`}</span><span class="chip">${esc(info.muscle)}</span>${swapped ? `<span class="chip accent">swapped</span>` : ""}</div></div></div>
    <div class="hint ${sug.kind}">${esc(sug.text)}</div>
    <div class="ex-actions">
      <button class="btn small ${open.video ? "primary" : ""}" data-a="toggle" data-k="${w.id}.${idx}" data-f="video">▶ Demo</button>
      <button class="btn small" data-a="swap" data-i="${idx}">⇄ Swap</button>
      <button class="btn small ${open.cues ? "primary" : ""}" data-a="toggle" data-k="${w.id}.${idx}" data-f="cues">How to</button>
    </div>
    ${open.video ? exVideo(info, `${w.id}.${idx}`) : ""}
    ${open.cues ? `<ul class="cues">${(info.cues || []).map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
    <div class="labels"><span>Set</span><span>kg</span><span></span><span>reps</span><span></span></div>
    <div class="sets">${item.sets.map((s, j) => `
      <div class="set ${s.done ? "done" : ""}">
        <span class="k">${j + 1}</span>
        <input type="number" inputmode="decimal" step="0.5" id="w-${idx}-${j}" aria-label="Weight set ${j + 1}" placeholder="kg" value="${esc(s.w)}" data-bind="@w.items.${idx}.sets.${j}.w" data-type="str">
        <span class="x">×</span>
        <input type="number" inputmode="numeric" id="r-${idx}-${j}" aria-label="Reps set ${j + 1}" placeholder="${esc(topRep(item.reps) ?? "")}" value="${esc(s.r)}" data-bind="@w.items.${idx}.sets.${j}.r" data-type="str">
        <button class="check ${s.done ? "on" : ""}" data-a="set-done" data-i="${idx}" data-j="${j}" aria-label="Set ${j + 1} done"></button>
      </div>`).join("")}
    </div>
    ${item.sets.some((s) => s.done) ? `<div class="effort"><span class="eyebrow">How did it feel?</span><div class="opts">${Object.entries(EFFORT).map(([k, l]) => `<button class="opt e-${k} ${item.effort === k ? "on" : ""}" data-a="effort" data-i="${idx}" data-v="${k}">${l}</button>`).join("")}</div><span class="small muted">Sets next session's target weight.</span></div>` : ""}
    <div class="row"><button class="btn small ghost" data-a="set-add" data-i="${idx}">+ Set</button><button class="btn small ghost" data-a="set-del" data-i="${idx}">− Set</button>
      <input class="grow" type="text" id="note-${idx}" placeholder="Note to self: seat height, grip…" value="${esc(item.note)}" data-bind="@w.items.${idx}.note" data-type="str"></div>
  </article>`;
}

function renderTrain() {
  const p = P(), w = activeWorkout();
  if (w) {
    const se = p.sessions[w.session];
    const week1 = p.mode === "cut" && diffDays(w.date, p.cutStart) < 7 && diffDays(w.date, p.cutStart) >= 0;
    const doneSets = w.items.reduce((a, it) => a + it.sets.filter((s) => s.done).length, 0);
    const allSets = w.items.reduce((a, it) => a + it.sets.length, 0);
    return `
      <section class="card"><div class="spread"><div class="session-head"><span class="eyebrow">In progress · ${doneSets}/${allSets} sets</span><h2>${esc(se?.name || "Workout")}</h2></div>
        <button class="btn primary" data-a="finish">Finish</button></div>
        <div class="bar ${doneSets === allSets ? "good" : ""}"><i style="width:${allSets ? (doneSets / allSets) * 100 : 0}%"></i></div></section>
      ${week1 ? `<section class="card week1"><b>Week 1</b><p class="small">Use about 70% of your old weights and stop 2-3 reps short of failure. Tendons need a week to catch up with muscle memory.</p></section>` : ""}
      <section class="card flat"><p class="small">Isolation exercises: push to 0-1 reps short of failure. Big lifts: 1-2 short. When every set hits the top of the range, add weight next time.</p></section>
      ${w.items.map((it, i) => exCard(it, i, w)).join("")}
      <section class="card flat"><div class="row wrap">
        <select id="addEx" class="grow" aria-label="Add an exercise"><option value="">Add an exercise…</option>${exOptions()}</select>
        <button class="btn small" data-a="ex-add">Add</button></div></section>
      <div class="row"><button class="btn block primary" data-a="finish">Finish workout</button></div>
      <button class="btn block ghost" data-a="discard">${ui.confirm === "discard" ? "Tap again to discard" : "Discard workout"}</button>`;
  }

  const sid = currentSessionId(), r = rotation(), ri = (S.rot[p.mode] || 0) % Math.max(r.length, 1);
  const se = p.sessions[sid];
  const strip = `<div class="rot">${r.map((x, i) => `<span class="${i === ri ? "cur" : ""}">${x === "REST" ? "Rest" : esc(p.sessions[x]?.name || x)}</span>`).join("")}</div>`;
  const preview = se ? `<div class="stack">${se.items.map((it, i) => { const ex = S.swaps[it.ex] || it.ex; return `<div class="spread small"><span>${i + 1}. ${esc(exInfo(ex).name)}</span><span class="muted num">${it.sets} × ${esc(it.reps)}</span></div>`; }).join("")}</div>` : "";
  const history = S.workouts.filter((x) => x.done).slice(-5).reverse();
  return `
    <section class="card"><span class="eyebrow">${p.mode === "cut" ? "Cut rotation" : "Term rotation"} · moves on when you finish, never by weekday</span>${strip}</section>
    <section class="card">
      ${sid === "REST" ? `<h2>Rest day</h2><p class="muted">Squash only today. Walk, stretch, sleep 8 hours.</p>
        <div class="row"><button class="btn primary grow" data-a="rest-done">Mark rest done</button></div>`
      : se ? `<span class="eyebrow">Next</span><h2>${esc(se.name)}</h2><p class="small muted">${esc(se.focus)}</p>${preview}
        <button class="btn primary block" data-a="start" data-sid="${sid}">Start ${esc(se.name)}</button>` : `<p class="muted">No sessions in the rotation. Add them in Plan.</p>`}
      <button class="btn block ghost" data-a="skip">Skip to next in rotation</button>
    </section>
    <section class="card"><h3>Do a different session</h3><p class="small muted">Gym closed or packed? The hostel session needs no equipment. Doing a different session doesn't move the rotation.</p>
      <div class="row wrap">${Object.entries(p.sessions).filter(([id]) => id !== sid).map(([id, s]) => `<button class="btn small" data-a="start" data-sid="${id}">${esc(s.name)}</button>`).join("")}</div></section>
    ${history.length ? `<section class="card"><h3>Recent</h3>${history.map((h) => `<div class="spread small"><span>${fmtDay(h.date)} · ${esc(p.sessions[h.session]?.name || h.session)}</span><span class="muted num">${h.items.reduce((a, it) => a + it.sets.filter((s) => s.done).length, 0)} sets</span></div>`).join("")}</section>` : ""}`;
}

function exOptions(sel = "") {
  return Object.entries(P().exercises).sort((a, b) => a[1].name.localeCompare(b[1].name))
    .map(([id, e]) => `<option value="${id}" ${id === sel ? "selected" : ""}>${esc(e.name)}</option>`).join("");
}

function openSwap(idx) {
  const w = activeWorkout(); if (!w) return;
  const item = w.items[idx], cur = exInfo(item.ex), orig = exInfo(item.orig);
  const alts = [...(orig.alts || [])];
  if (item.ex !== item.orig) alts.unshift([item.orig, "Back to the original"]);
  const seen = new Set();
  const list = alts.filter(([id]) => id !== item.ex && P().exercises[id] && !seen.has(id + "") && seen.add(id + ""));
  const group = (cur.muscle || "").split(/[ (+]/)[0];
  const same = Object.entries(P().exercises).filter(([id, e]) => id !== item.ex && !seen.has(id) && group && e.muscle.startsWith(group));
  openSheet(`
    <div class="spread"><div><span class="eyebrow">Swap</span><h2>${esc(cur.name)}</h2></div><button class="icon-btn" data-a="sheet-close" aria-label="Close">✕</button></div>
    <p class="small muted">Pick a replacement. "Today" swaps it for this workout only. "Always" changes your plan until you swap back.</p>
    ${list.map(([id, why]) => altCard(id, why, idx)).join("")}
    ${same.length ? `<details class="sec"><summary><b>More ${esc(group.toLowerCase())} exercises</b></summary><div class="body">${same.map(([id]) => altCard(id, exInfo(id).muscle, idx)).join("")}</div></details>` : ""}`);
}
// Which other session in this week's rotation already uses an exercise (after permanent swaps).
function usedElsewhere(id, exceptSession) {
  for (const sid of new Set(rotation())) {
    if (sid === exceptSession) continue;
    const se = P().sessions[sid];
    if (se && se.items.some((it) => (S.swaps[it.ex] || it.ex) === id)) return se.name;
  }
  return null;
}
function altCard(id, why, idx) {
  const e = exInfo(id);
  const open = ui.open[`alt.${id}`];
  const used = usedElsewhere(id, activeWorkout()?.session);
  return `<div class="alt"><div class="spread"><div class="grow"><b>${esc(e.name)}</b><p class="small muted">${esc(why)}</p>${used ? `<span class="chip warn">Already in ${esc(used)} this week</span>` : ""}</div>
    <button class="btn small ${open ? "primary" : ""}" data-a="alt-video" data-id="${id}" data-i="${idx}" aria-label="Show demo">▶</button></div>
    ${open ? videoHTML(e.demo || e.video, !!e.demo) : ""}
    <div class="row"><button class="btn small grow" data-a="swap-to" data-id="${id}" data-i="${idx}" data-always="0">Today</button><button class="btn small grow primary" data-a="swap-to" data-id="${id}" data-i="${idx}" data-always="1">Always</button></div></div>`;
}

function openSheet(html) {
  $("#sheet").innerHTML = `<div class="inner">${html}</div>`;
  $("#sheet").hidden = false; $("#sheetBackdrop").hidden = false;
}
function closeSheet() { $("#sheet").hidden = true; $("#sheetBackdrop").hidden = true; $("#sheet").innerHTML = ""; }

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
function myPlate(e, meal) {
  const d = DISH(e.dish); if (!d) return { kcal: 0, p: 0 };
  let kcal = d.me.kcal, p = d.me.p;
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
  const d = DISH(e.dish), me = h.me ? `${h.me} ke liye` : "Mere liye", pn = h.partner || "partner";
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

// ---------- Food tab ----------
function renderFood() {
  const k = todayKey(), d = day(k), p = P(), t = totals(d), h = H();
  ui.cookSel ??= dueMeal();
  const isSunday = parseKey(k).getDay() === 0;
  const setup = !h.partner ? `<section class="card week1"><b>Who's eating?</b><p class="small">Names go into the cook messages ("[name] ke liye…"). They stay on this phone.</p>
    <div class="grid2"><div class="field"><label for="hMe">You (non-veg)</label><input id="hMe" type="text" value="${esc(h.me)}" data-bind="plan.household.me" data-type="str" placeholder="Your name"></div>
    <div class="field"><label for="hP">Partner (veg)</label><input id="hP" type="text" value="${esc(h.partner)}" data-bind="plan.household.partner" data-type="str" data-rerender="1" placeholder="Partner's name"></div></div></section>` : "";
  return `
    <div class="meters">
      <div class="meter"><div class="meter-top"><span class="eyebrow">Protein</span>${ring((t.protein / p.targets.protein) * 100, 34, 5)}</div><div class="val">${t.protein}<small> / ${p.targets.protein} g</small></div></div>
      <div class="meter"><div class="meter-top"><span class="eyebrow">Calories</span>${ring((t.kcal / p.targets.kcal) * 100, 34, 5)}</div><div class="val">${t.kcal}<small> / ${p.targets.kcal}</small></div></div>
    </div>
    ${setup}
    ${cookCard()}
    <section class="card"><h2>My meals today</h2>
      ${p.meals.map((slot) => {
        const ci = d.choice[slot.id] ?? 0, o = mealOpt(slot, d, k), on = !!d.eaten[slot.id];
        return `<div class="meal"><div class="spread"><div class="grow"><span class="eyebrow">${fmtTime(slot.time)} · ${esc(slot.name)}</span>
          <h3>${o.veg ? '<i class="veg" title="Vegetarian"></i>' : ""}${esc(o.name)}</h3></div>
          <button class="check ${on ? "on" : ""}" data-a="eat" data-id="${slot.id}" aria-label="Ate ${esc(slot.name)}"></button></div>
          <p class="small muted">${esc(o.detail)}</p><p class="small num"><b>${o.protein} g</b> protein · ${o.kcal} kcal${o.fromCook ? " · my plate" : ""}</p>
          ${!o.fromCook && slot.options.length > 1 ? `<div class="opts">${slot.options.map((x, i) => `<button class="opt ${i === ci ? "on" : ""}" data-a="choose" data-id="${slot.id}" data-i="${i}">${esc(x.name)}</button>`).join("")}</div>` : ""}
        </div>`;
      }).join("")}
    </section>
    <section class="card"><h2>Ate something else?</h2>
      <input type="search" id="foodQ" placeholder="Search: roti, paneer, biryani, beer…" value="${esc(ui.foodQ)}" autocomplete="off">
      <div class="foodlist" id="foodList">${foodListHTML()}</div>
      <details class="sec"><summary><b>Custom item</b></summary><div class="body">
        <input id="cName" type="text" placeholder="What was it?">
        <div class="grid2"><input id="cK" type="number" inputmode="numeric" placeholder="kcal"><input id="cP" type="number" inputmode="numeric" placeholder="protein g"></div>
        <button class="btn" data-a="food-custom">Add</button></div></details>
      ${d.extra.length ? `<div>${d.extra.map((x, i) => `<div class="extra"><span class="grow">${x.qty > 1 ? `${x.qty}× ` : ""}${esc(x.name)}${x.t ? ` <span class="muted small">${x.t}</span>` : ""}<br><span class="small muted num">${Math.round(x.kcal * (x.qty || 1))} kcal · ${Math.round(x.protein * (x.qty || 1))} g</span></span>
        <div class="row"><button class="icon-btn" data-a="extra-q" data-i="${i}" data-v="-1" aria-label="Less">−</button><button class="icon-btn" data-a="extra-q" data-i="${i}" data-v="1" aria-label="More">+</button></div></div>`).join("")}</div>` : ""}
    </section>
    ${weekCard()}
    ${groceryCard()}
    ${isSunday ? sundayCard() : ""}`;
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

function foodListHTML() {
  const q = ui.foodQ.trim().toLowerCase();
  const foods = P().foods.filter((f) => !q || f[0].toLowerCase().includes(q));
  return foods.map((f) => `<button class="fooditem" data-a="food-add" data-n="${esc(f[0])}" data-k="${f[1]}" data-p="${f[2]}"><span class="grow">${esc(f[0])}</span><span class="small muted num">${f[1]} kcal · ${f[2]} g</span></button>`).join("") || `<p class="small muted">No match. Add it below.</p>`;
}
function sundayCard() {
  const g = P().sundayGuide;
  return `<section class="card"><h2>Sunday order-in</h2>
    <div class="guide"><div><span class="eyebrow">Order</span><ul>${g.order.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
    <div><span class="eyebrow">Skip</span><ul>${g.avoid.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div></div></section>`;
}

// ================= PROGRESS =================
function weightSeries() {
  const ks = Object.keys(S.days).filter((k) => S.days[k].weight).sort();
  return ks.map((k) => {
    const win = ks.filter((x) => diffDays(k, x) >= 0 && diffDays(k, x) < 7).map((x) => +S.days[x].weight);
    return { k, w: +S.days[k].weight, avg: win.reduce((a, b) => a + b, 0) / win.length };
  });
}
function chart(series) {
  if (series.length < 2) return `<p class="small muted">Log your morning weight on the Today tab. The chart appears after two entries.</p>`;
  const W = 340, H = 170, L = 34, R = 10, T = 12, B = 22;
  const first = series[0].k, span = Math.max(diffDays(series[series.length - 1].k, first), 1);
  const vals = series.flatMap((s) => [s.w, s.avg]);
  let lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5);
  if (hi - lo < 2) hi = lo + 2;
  const x = (k) => L + (diffDays(k, first) / span) * (W - L - R);
  const y = (v) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const step = Math.max(1, Math.round((hi - lo) / 4));
  let grid = "";
  for (let v = lo; v <= hi; v += step) grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${v}</text>`;
  const avgPath = series.map((s, i) => `${i ? "L" : "M"}${x(s.k).toFixed(1)},${y(s.avg).toFixed(1)}`).join(" ");
  const area = `${avgPath} L${x(series[series.length - 1].k).toFixed(1)},${H - B} L${x(first).toFixed(1)},${H - B} Z`;
  const dots = series.map((s) => `<circle cx="${x(s.k).toFixed(1)}" cy="${y(s.w).toFixed(1)}" r="2.5" fill="var(--muted)" opacity=".6"/>`).join("");
  const lastS = series[series.length - 1];
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight trend">
    ${grid}<path d="${area}" fill="var(--accent)" opacity=".08"/>${dots}
    <path d="${avgPath}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(lastS.k).toFixed(1)}" cy="${y(lastS.avg).toFixed(1)}" r="4.5" fill="var(--accent)"/>
    <text x="${L}" y="${H - 6}">${fmtDay(first)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end">${fmtDay(lastS.k)}</text>
  </svg></div>`;
}
function weekStats(endK) {
  const p = P(), ks = Array.from({ length: 7 }, (_, i) => addDays(endK, -i));
  const ds = ks.map((k) => S.days[k]).filter(Boolean);
  const sessions = S.workouts.filter((w) => w.done && ks.includes(w.date)).length;
  const protDays = ks.filter((k) => S.days[k] && totals(S.days[k]).protein >= p.targets.protein).length;
  const drinks = ks.reduce((a, k) => a + drinksOf(S.days[k]), 0);
  const dryDays = ks.filter((k) => S.days[k] && drinksOf(S.days[k]) === 0).length;
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const sleep = avg(ds.filter((d) => d.sleep).map((d) => +d.sleep));
  const steps = avg(ds.filter((d) => d.steps).map((d) => +d.steps));
  const prot = avg(ds.map((d) => totals(d).protein).filter((v) => v > 0));
  return { sessions, protDays, drinks, dryDays, sleep, steps, prot };
}
function liftsTable() {
  const by = {};
  for (const w of S.workouts.filter((x) => x.done)) for (const it of w.items) {
    const best = Math.max(0, ...it.sets.filter((s) => s.done && +s.w && +s.r).map((s) => +s.w * (1 + +s.r / 30)));
    if (best) (by[it.ex] ??= []).push({ k: w.date, v: best });
  }
  const rows = Object.entries(by).sort((a, b) => b[1].length - a[1].length).slice(0, 10);
  if (!rows.length) return `<p class="small muted">Finish a workout to start tracking strength.</p>`;
  return `<table class="lifts"><thead><tr><th>Exercise</th><th class="r">First</th><th class="r">Latest</th><th class="r">Change</th></tr></thead><tbody>
    ${rows.map(([ex, arr]) => { const a = arr[0].v, b = arr[arr.length - 1].v, ch = ((b - a) / a) * 100;
      return `<tr><td>${esc(exInfo(ex).name)}</td><td class="r">${a.toFixed(0)}</td><td class="r">${b.toFixed(0)}</td><td class="r" style="color:${ch > 0 ? "var(--good)" : ch < 0 ? "var(--accent)" : "var(--muted)"}">${ch > 0 ? "+" : ""}${ch.toFixed(0)}%</td></tr>`; }).join("")}
  </tbody></table><p class="small muted">Estimated one-rep max (Epley) from your best set each session.</p>`;
}
function renderProgress() {
  const k = todayKey(), ws = weightSeries(), st = weekStats(k), p = P();
  const last = ws[ws.length - 1];
  const weekAgo = ws.filter((s) => diffDays(k, s.k) >= 7).pop();
  const delta = last && weekAgo ? last.avg - weekAgo.avg : null;
  const waists = Object.keys(S.days).filter((x) => S.days[x].waist).sort().map((x) => ({ k: x, v: +S.days[x].waist }));
  const lastDrink = Object.keys(S.days).filter((x) => drinksOf(S.days[x]) > 0).sort().pop();
  const sinceDrink = lastDrink ? diffDays(k, lastDrink) : null;
  const f1 = (v, d = 1) => (v == null ? "–" : v.toFixed(d));
  return `
    <section class="card"><div class="spread"><h2>Weight</h2><span class="chip ${delta != null && delta < 0 ? "good" : ""}">${last ? `7-day avg ${f1(last.avg)} kg` : "No data yet"}</span></div>
      ${chart(ws)}
      ${delta != null ? `<p class="small">${delta <= 0 ? "Down" : "Up"} <b>${f1(Math.abs(delta), 2)} kg</b> on the 7-day average vs a week ago. Target: 0.4-0.7 kg a week.</p>` : ""}</section>
    <section class="card"><h2>Last 7 days</h2><div class="stats">
      <div class="stat"><b>${st.sessions}</b><span>workouts</span></div>
      <div class="stat"><b>${st.protDays}/7</b><span>protein days</span></div>
      <div class="stat"><b>${f1(st.prot, 0)}</b><span>avg protein g</span></div>
      <div class="stat"><b>${st.drinks}</b><span>drinks</span></div>
      <div class="stat"><b>${sinceDrink == null ? "–" : sinceDrink}</b><span>days since a drink</span></div>
      <div class="stat"><b>${f1(st.sleep)}</b><span>avg sleep h</span></div>
    </div>
    <button class="btn" data-a="week-copy">Copy week summary for Claude</button></section>
    <section class="card"><h2>Waist</h2>${waists.length ? `<div class="stack">${waists.map((w, i) => `<div class="spread small"><span>${fmtDay(w.k)}</span><span class="num"><b>${w.v} cm</b>${i ? ` <span class="muted">(${w.v - waists[i - 1].v > 0 ? "+" : ""}${(w.v - waists[i - 1].v).toFixed(1)})</span>` : ""}</span></div>`).join("")}</div>` : `<p class="small muted">Measure at the navel every Sunday morning and log it on the Today tab.</p>`}</section>
    <section class="card"><h2>Strength</h2>${liftsTable()}</section>`;
}
function weekSummary() {
  const k = todayKey(), st = weekStats(k), ws = weightSeries(), p = P();
  const lines = [`Infinity week ending ${fmtDay(k)} (${p.mode} mode)`];
  const last = ws[ws.length - 1], ago = ws.filter((s) => diffDays(k, s.k) >= 7).pop();
  if (last) lines.push(`Weight 7-day avg: ${last.avg.toFixed(1)} kg${ago ? ` (week ago ${ago.avg.toFixed(1)})` : ""}`);
  lines.push(`Workouts: ${st.sessions}. Protein target hit: ${st.protDays}/7 days (avg ${st.prot ? st.prot.toFixed(0) : "–"} g). Drinks: ${st.drinks}. Avg sleep: ${st.sleep ? st.sleep.toFixed(1) : "–"} h. Avg steps: ${st.steps ? Math.round(st.steps) : "–"}.`);
  for (let i = 6; i >= 0; i--) {
    const dk = addDays(k, -i), d = S.days[dk];
    const ws2 = S.workouts.filter((w) => w.done && w.date === dk);
    const parts = [];
    if (d?.weight) parts.push(`${d.weight} kg`);
    if (d) { const t = totals(d); if (t.kcal) parts.push(`${t.kcal} kcal / ${t.protein} g P`); }
    if (drinksOf(d)) parts.push(`${drinksOf(d)} drinks`);
    for (const w of ws2) parts.push(`${p.sessions[w.session]?.name}: ` + w.items.filter((it) => it.sets.some((s) => s.done)).map((it) => `${exInfo(it.ex).name} ${it.sets.filter((s) => s.done).map((s) => `${s.w || "bw"}x${s.r}`).join(",")}`).join("; "));
    if (d?.note) parts.push(`note: ${d.note}`);
    lines.push(`${fmtDay(dk)}: ${parts.join(" | ") || "nothing logged"}`);
  }
  return lines.join("\n");
}

// ================= PLAN (editor) =================
function sec(id, title, body, sub = "") {
  return `<details class="sec" data-sec="${id}" ${ui.open["sec." + id] ? "open" : ""}><summary><span><b>${title}</b>${sub ? `<br><span class="small muted">${sub}</span>` : ""}</span></summary><div class="body">${body}</div></details>`;
}
function inp(path, val, type = "str", attrs = "") {
  const t = type === "num" ? `type="number" inputmode="decimal"` : type === "time" ? `type="time"` : type === "date" ? `type="date"` : `type="text"`;
  return `<input ${t} id="f-${path.replace(/\W/g, "_")}" value="${esc(val ?? "")}" data-bind="${path}" data-type="${type === "time" || type === "date" ? "str" : type}" ${attrs}>`;
}
function lines(path, arr) {
  return `<textarea id="f-${path.replace(/\W/g, "_")}" data-bind="${path}" data-type="lines">${esc((arr || []).join("\n"))}</textarea>`;
}
function exListHTML() {
  const q = ui.exQ.trim().toLowerCase();
  return Object.entries(P().exercises).filter(([, e]) => !q || (e.name + e.muscle).toLowerCase().includes(q)).sort((a, b) => a[1].name.localeCompare(b[1].name))
    .map(([id, e]) => `<button class="fooditem" data-a="ex-edit" data-id="${id}"><span class="grow">${esc(e.name)}</span><span class="small muted">${esc(e.muscle)}</span></button>`).join("") || `<p class="small muted">No match.</p>`;
}
function renderPlan() {
  const p = P();
  const sessIds = Object.keys(p.sessions);
  ui.editSession ??= sessIds[0];
  const es = p.sessions[ui.editSession];

  const mode = `<div class="seg"><button class="${p.mode === "cut" ? "on" : ""}" data-a="mode" data-v="cut">Cut (4-5 days)</button><button class="${p.mode === "term" ? "on" : ""}" data-a="mode" data-v="term">Term (3 days)</button></div>
    <p class="small muted">Term mode switches the rotation to 3 full-body sessions for when classes start.</p>
    <div class="grid2"><div class="field"><label>Cut starts</label>${inp("plan.cutStart", p.cutStart, "date", 'data-rerender="1"')}</div><div class="field"><label>Cut ends</label>${inp("plan.cutEnd", p.cutEnd, "date", 'data-rerender="1"')}</div></div>`;

  const targets = `<div class="grid2">
    <div class="field"><label>Calories</label>${inp("plan.targets.kcal", p.targets.kcal, "num")}</div>
    <div class="field"><label>Protein g</label>${inp("plan.targets.protein", p.targets.protein, "num")}</div>
    <div class="field"><label>Water ml</label>${inp("plan.targets.water", p.targets.water, "num")}</div>
    <div class="field"><label>Steps</label>${inp("plan.targets.steps", p.targets.steps, "num")}</div>
    <div class="field"><label>Sleep h</label>${inp("plan.targets.sleep", p.targets.sleep, "num")}</div></div>`;

  const schedule = [...p.schedule].map((it) => ({ it, i: p.schedule.indexOf(it) })).sort((a, b) => mins(a.it.time) - mins(b.it.time)).map(({ it, i }) => `
    <div class="edit-row"><div class="row">${inp(`plan.schedule.${i}.time`, it.time, "time", 'style="max-width:120px" data-rerender="1"')}${inp(`plan.schedule.${i}.title`, it.title)}<button class="icon-btn" data-a="sched-del" data-i="${i}" aria-label="Delete">✕</button></div>
      <div class="row"><select id="f-kind-${i}" data-bind="plan.schedule.${i}.kind" data-type="str" data-rerender="1">${["habit", "meal", "gym", "squash"].map((k) => `<option ${k === it.kind ? "selected" : ""}>${k}</option>`).join("")}</select>
      ${it.kind === "meal" ? `<select id="f-ref-${i}" data-bind="plan.schedule.${i}.ref" data-type="str">${p.meals.map((m) => `<option value="${m.id}" ${m.id === it.ref ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select>` : ""}</div>
      <div class="row small"><label class="row"><input type="checkbox" id="f-nt-${i}" style="width:auto" ${it.notify !== false ? "checked" : ""} data-bind="plan.schedule.${i}.notify" data-type="bool"> Reminder</label>
        <label class="row"><input type="checkbox" id="f-al-${i}" style="width:auto" ${it.alarm ? "checked" : ""} data-bind="plan.schedule.${i}.alarm" data-type="bool"> Real alarm</label></div></div>`).join("")
    + `<button class="btn" data-a="sched-add">+ Add item</button>`;

  const rot = rotation();
  const rotEd = `<div class="stack">${rot.map((x, i) => `<div class="row"><span class="grow">${i + 1}. ${x === "REST" ? "Rest day" : esc(p.sessions[x]?.name || x)}</span>
      <button class="icon-btn" data-a="rot-move" data-i="${i}" data-v="-1" aria-label="Up">↑</button><button class="icon-btn" data-a="rot-move" data-i="${i}" data-v="1" aria-label="Down">↓</button><button class="icon-btn" data-a="rot-del" data-i="${i}" aria-label="Remove">✕</button></div>`).join("")}</div>
    <div class="row"><select id="rotAdd" class="grow" aria-label="Add to rotation"><option value="REST">Rest day</option>${sessIds.map((id) => `<option value="${id}">${esc(p.sessions[id].name)}</option>`).join("")}</select><button class="btn small" data-a="rot-add">Add</button></div>`;

  const sessEd = `<div class="row"><select id="sessPick" class="grow" data-a-change="sess-pick">${sessIds.map((id) => `<option value="${id}" ${id === ui.editSession ? "selected" : ""}>${esc(p.sessions[id].name)}</option>`).join("")}</select><button class="btn small" data-a="sess-new">+ New</button></div>
    ${es ? `<div class="grid2"><div class="field"><label>Name</label>${inp(`plan.sessions.${ui.editSession}.name`, es.name)}</div><div class="field"><label>Focus</label>${inp(`plan.sessions.${ui.editSession}.focus`, es.focus)}</div></div>
    ${es.items.map((it, i) => `<div class="edit-row">
      <div class="row"><select id="f-sx-${i}" class="grow" data-bind="plan.sessions.${ui.editSession}.items.${i}.ex" data-type="str">${exOptions(it.ex)}</select></div>
      <div class="row"><div class="field grow"><label>Sets</label>${inp(`plan.sessions.${ui.editSession}.items.${i}.sets`, it.sets, "num")}</div><div class="field grow"><label>Reps</label>${inp(`plan.sessions.${ui.editSession}.items.${i}.reps`, it.reps)}</div><div class="field grow"><label>Rest s</label>${inp(`plan.sessions.${ui.editSession}.items.${i}.rest`, it.rest, "num")}</div></div>
      <div class="row"><button class="btn small" data-a="si-move" data-i="${i}" data-v="-1">↑</button><button class="btn small" data-a="si-move" data-i="${i}" data-v="1">↓</button><button class="btn small" data-a="si-del" data-i="${i}">Remove</button></div></div>`).join("")}
    <button class="btn" data-a="si-add">+ Add exercise</button>
    <button class="btn ghost" data-a="sess-del">${ui.confirm === "sess-del" ? "Tap again to delete this session" : "Delete session"}</button>` : ""}`;

  const ee = ui.editEx && p.exercises[ui.editEx];
  const exEd = ee ? `<div class="edit-row">
      <div class="spread"><b>Editing</b><button class="btn small" data-a="ex-close">Done</button></div>
      <div class="field"><label>Name</label>${inp(`plan.exercises.${ui.editEx}.name`, ee.name)}</div>
      <div class="field"><label>Muscle</label>${inp(`plan.exercises.${ui.editEx}.muscle`, ee.muscle)}</div>
      <div class="field"><label>Short demo clip (YouTube link or id, loops silently)</label><input type="text" id="f-demo" value="${esc(ee.demo || "")}" data-a-change="ex-video" data-f="demo" placeholder="https://youtube.com/shorts/…"></div>
      ${ee.demo ? videoHTML(ee.demo, true) : ""}
      <div class="field"><label>Full tutorial (YouTube link or id)</label><input type="text" id="f-video" value="${esc(ee.video)}" data-a-change="ex-video" data-f="video" placeholder="https://youtu.be/…"></div>
      <div class="field"><label>Form cues, one per line</label>${lines(`plan.exercises.${ui.editEx}.cues`, ee.cues)}</div>
      <div class="field"><label>Alternatives</label>${(ee.alts || []).map(([id, why], i) => `<div class="row"><span class="grow small">${esc(exInfo(id).name)} <span class="muted">· ${esc(why)}</span></span><button class="icon-btn" data-a="alt-del" data-i="${i}" aria-label="Remove">✕</button></div>`).join("")}
        <div class="row"><select id="altPick" class="grow" aria-label="Alternative exercise">${exOptions()}</select></div>
        <div class="row"><input id="altWhy" type="text" class="grow" placeholder="When to use it (e.g. Machine taken)"><button class="btn small" data-a="alt-add">Add</button></div></div>
    </div>` : `<input type="search" id="exQ" placeholder="Search exercises" value="${esc(ui.exQ)}" autocomplete="off">
    <div class="foodlist" id="exList">${exListHTML()}</div>
    <button class="btn" data-a="ex-new">+ New exercise</button>`;

  const meals = p.meals.map((m, mi) => `<div class="edit-row">
      <div class="row">${inp(`plan.meals.${mi}.time`, m.time, "time", 'style="max-width:120px"')}${inp(`plan.meals.${mi}.name`, m.name)}</div>
      <label class="row small"><input type="checkbox" id="f-veg-${mi}" style="width:auto" ${m.veg ? "checked" : ""} data-bind="plan.meals.${mi}.veg" data-type="bool"> Vegetarian meal</label>
      ${m.options.map((o, oi) => `<div class="stack" style="border-top:1px solid var(--line);padding-top:8px">
        <div class="row">${inp(`plan.meals.${mi}.options.${oi}.name`, o.name)}<button class="icon-btn" data-a="opt-del" data-m="${mi}" data-o="${oi}" aria-label="Delete option">✕</button></div>
        ${inp(`plan.meals.${mi}.options.${oi}.detail`, o.detail)}
        <div class="grid2"><div class="field"><label>kcal</label>${inp(`plan.meals.${mi}.options.${oi}.kcal`, o.kcal, "num")}</div><div class="field"><label>Protein g</label>${inp(`plan.meals.${mi}.options.${oi}.protein`, o.protein, "num")}</div></div></div>`).join("")}
      <button class="btn small" data-a="opt-add" data-m="${mi}">+ Option</button></div>`).join("");

  const party = `<div class="stack">${p.partyDates.slice().sort().map((k) => `<div class="row"><span class="grow">${fmtDay(k)}</span><button class="icon-btn" data-a="pd-del" data-k="${k}" aria-label="Remove">✕</button></div>`).join("")}</div>
    <div class="row"><input type="date" id="pdNew" class="grow"><button class="btn small" data-a="pd-add">Add date</button></div>
    <div class="field"><label>Party rules, one per line</label>${lines("plan.partyRules", p.partyRules)}</div>`;

  const h = p.household;
  const diet = `<div class="grid2"><div class="field"><label>Your name (non-veg)</label>${inp("plan.household.me", h.me)}</div><div class="field"><label>Partner (veg)</label>${inp("plan.household.partner", h.partner)}</div></div>
    <div class="grid2"><div class="field"><label>How you address the cook</label>${inp("plan.household.cook", h.cook)}</div><div class="field"><label>Chicken per meal (g)</label>${inp("plan.household.chickenG", h.chickenG, "num")}</div></div>
    <div class="grid2"><div class="field"><label>My rotis at lunch</label>${inp("plan.household.myBread.lunch", h.myBread.lunch, "num")}</div><div class="field"><label>My rotis / parathas at dinner</label>${inp("plan.household.myBread.dinner", h.myBread.dinner, "num")}</div></div>
    <div class="field"><label>Sunday: order</label>${lines("plan.sundayGuide.order", p.sundayGuide.order)}</div>
    <div class="field"><label>Sunday: skip</label>${lines("plan.sundayGuide.avoid", p.sundayGuide.avoid)}</div>`;

  const ph = ui.phone, cs = Cal.status();
  const phone = `<p class="small">${Native.on ? "<b>Running as the iPhone app.</b>" : "<b>You're on the website.</b> Reminders, alarms and full offline work in the iPhone app."}</p>
    <span class="eyebrow">Reminders</span>
    <p class="small muted">Every schedule item rings at its time, plus cook messages, soaking pulses and grocery orders. Turn single items off in Daily schedule. They're set 3 days ahead and refresh whenever you open the app.</p>
    <span class="eyebrow">Real alarms (iOS 26)</span>
    <p class="small muted">Items ticked "Real alarm" in Daily schedule ring like the Clock app, even on silent. Each alarm is set for its next time and re-armed when you open Infinity, so open it at least once a day.</p>
    ${ph ? `<p class="small">Last sync: ${ph.r.ok ? `${ph.r.count} reminders` : "reminders failed (" + esc(ph.r.why) + ")"} · ${ph.a.ok ? `${ph.a.count} alarms` : "alarms: " + esc(ph.a.why)}</p>` : ""}
    <button class="btn" data-a="phone-sync">Set reminders and alarms now</button>
    <span class="eyebrow">Steps and sleep from Apple Health</span>
    <p class="small muted">A free Apple ID can't give apps Health access, so an iPhone Shortcut passes the numbers in. Make one automation (steps below) and it fills Steps and Sleep every night.</p>
    <ol class="small steps">
      <li>Shortcuts app → Automation → New → Time of Day → 11:30 pm, Daily, Run Immediately.</li>
      <li>Add action <b>Find Health Samples</b>: Steps, Start Date is Today. Add <b>Calculate Statistics</b>: Sum.</li>
      <li>Add <b>Find Health Samples</b>: Sleep Analysis, Start Date in the last 1 day. Add <b>Calculate Statistics</b>: Sum (it gives hours or minutes; set the unit to Hours).</li>
      <li>Add <b>Open URLs</b> with: <code>infinity://health?steps=</code>[Steps sum]<code>&amp;sleep=</code>[Sleep sum]</li>
    </ol>`;
  const classes = `<p class="small muted">Shows your Outlook classes on Today, warns when gym or squash clashes, and offers to move gym to the next free slot. Uses your calendar's published link. On the home-screen app, GitHub fetches it every 3 hours into your private backup repo (needs the GitHub backup set up below).</p>
    <ol class="small steps">
      <li>On a laptop, open Outlook on the web (outlook.office.com) → Settings → Calendar → Shared calendars.</li>
      <li>Under <b>Publish a calendar</b>, pick your calendar, choose <b>Can view all details</b>, tap Publish.</li>
      <li>Copy the <b>ICS</b> link and paste it below. If ISB has publishing switched off, tell Claude and we'll use the iPhone Calendar route instead.</li>
    </ol>
    <div class="field"><label for="icsUrl">Calendar ICS link</label><input id="icsUrl" type="url" value="${esc(cs.url)}" data-a-change="ics" placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics" autocomplete="off"></div>
    <p class="small ${cs.err ? "" : "muted"}">${cs.err ? `<b>Couldn't load:</b> ${esc(cs.err)}` : cs.at ? `${cs.n} events loaded ${new Date(cs.at).toLocaleString("en-IN")}` : "Not loaded yet."}</p>
    <button class="btn" data-a="ics-refresh">Refresh classes</button>
    ${upcomingHTML()}`;
  const gh = ghConf(), meta = ghMeta();
  const backup = `<span class="eyebrow">GitHub backup (automatic)</span>
    <p class="small muted">Saves one small file per day to a <b>private</b> GitHub repo, plus a full copy for restoring. Runs when the app opens or closes, at most every 15 minutes. The token stays on this phone and never goes into the backup.</p>
    <div class="field"><label for="ghRepo">Private repo (owner/name)</label><input id="ghRepo" type="text" value="${esc(gh.repo || "")}" data-a-change="gh" data-f="repo" placeholder="your-username/ironcourt-data" autocomplete="off"></div>
    <div class="field"><label for="ghTok">Access token</label><input id="ghTok" type="password" value="${gh.token ? "••••••••" : ""}" data-a-change="gh" data-f="token" placeholder="github_pat_…" autocomplete="off"></div>
    <p class="small ${meta.err ? "" : "muted"}">${meta.err ? `<b>Last attempt failed:</b> ${esc(meta.err)}` : meta.last ? `Last backup: ${new Date(meta.last).toLocaleString("en-IN")}` : "No backup yet."}</p>
    <div class="row wrap"><button class="btn primary" data-a="gh-backup">Back up now</button><button class="btn" data-a="gh-restore">${ui.confirm === "gh-restore" ? "Tap again: replace this phone's data" : "Restore from GitHub"}</button></div>
    <span class="eyebrow">File backup</span>
    <p class="small muted">Your data lives on this phone. Export a backup every week or two, and before deleting the app.</p>
    <div class="row wrap"><button class="btn primary" data-a="export">Export backup</button><label class="btn" for="importFile">Import backup</label><input type="file" id="importFile" accept="application/json,.json" hidden></div>
    <button class="btn ghost" data-a="reset">${ui.confirm === "reset" ? "Tap again: erase everything" : "Reset app"}</button>`;

  return `
    ${sec("mode", "Mode and dates", mode, p.mode === "cut" ? "Cut" : "Term")}
    ${sec("targets", "Daily targets", targets, `${p.targets.kcal} kcal · ${p.targets.protein} g protein`)}
    ${sec("schedule", "Daily schedule", schedule, `${p.schedule.length} items`)}
    ${sec("rotation", "Workout rotation", rotEd, `${p.mode} mode · ${rot.length} slots`)}
    ${sec("sessions", "Workouts", sessEd, `${sessIds.length} sessions`)}
    ${sec("exercises", "Exercises, videos, swaps", exEd, `${Object.keys(p.exercises).length} exercises`)}
    ${sec("meals", "Meals", meals, "Options you can switch between each day")}
    ${sec("diet", "Household and cook", diet, `${esc(h.me || "You")} + ${esc(h.partner || "partner")} · ${h.nonveg} non-veg dinners a week`)}
    ${sec("party", "Party days", party, `${p.partyDates.length} dates`)}
    ${sec("phone", "Phone: reminders, alarms, Health", phone, Native.on ? "iPhone app" : "Website")}
    ${sec("classes", "Classes (Outlook)", classes, cs.url ? `${cs.n} events` : "Not connected")}
    ${sec("backup", "Backup", backup)}
    <p class="small muted" style="text-align:center">Infinity · data stays on this phone, plus your own GitHub backup if you set one up</p>`;
}

// ================= render =================
function render() {
  renderTop();
  const views = { today: renderToday, train: renderTrain, food: renderFood, progress: renderProgress, plan: renderPlan };
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
  if (el.id === "foodQ") { ui.foodQ = el.value; $("#foodList").innerHTML = foodListHTML(); }
  if (el.id === "exQ") { ui.exQ = el.value; $("#exList").innerHTML = exListHTML(); }
});
document.addEventListener("toggle", (e) => {
  const d = e.target;
  if (d.matches?.("details.sec[data-sec]")) ui.open["sec." + d.dataset.sec] = d.open;
}, true);

const actions = {
  go: (b) => { ui.tab = b.dataset.tab; render(); window.scrollTo(0, 0); },
  start: (b) => { if (activeWorkout()) { toast("Finish the current workout first"); ui.tab = "train"; return render(); } ui.tab = "train"; startWorkout(b.dataset.sid); },
  "rest-done": () => { advanceRotation(); save(); toast("Rest day logged. Rotation moved on."); render(); },
  skip: () => { advanceRotation(); save(); render(); },
  finish: () => finishWorkout(),
  discard: () => {
    if (ui.confirm !== "discard") { ui.confirm = "discard"; return render(); }
    ui.confirm = null; S.workouts = S.workouts.filter((w) => w.id !== S.active); S.active = null; save(); wakeLock(false); stopRest(); render();
  },
  toggle: (b) => { const o = (ui.open[b.dataset.k] ??= {}); o[b.dataset.f] = !o[b.dataset.f]; render(); },
  "set-done": (b) => {
    const w = activeWorkout(), it = w.items[+b.dataset.i], s = it.sets[+b.dataset.j];
    const rIn = document.getElementById(`r-${b.dataset.i}-${b.dataset.j}`), wIn = document.getElementById(`w-${b.dataset.i}-${b.dataset.j}`);
    if (rIn) s.r = rIn.value; if (wIn) s.w = wIn.value;
    s.done = !s.done;
    if (s.done) Native.haptic("tap");
    if (s.done && !s.r) s.r = String(topRep(it.reps) ?? "");
    if (s.done) { const nxt = it.sets[+b.dataset.j + 1]; if (nxt && !nxt.w && s.w) nxt.w = s.w; startRest(it.rest); }
    save(); render();
  },
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
    if (b.dataset.always === "1") { if (id === it.orig) delete S.swaps[it.orig]; else S.swaps[it.orig] = id; }
    save(); closeSheet(); toast(`Swapped to ${exInfo(id).name}${b.dataset.always === "1" ? " (always)" : " (today)"}`); render();
  },
  "sheet-close": () => closeSheet(),
  "vid-mode": (b) => { const o = (ui.open[b.dataset.k] ??= {}); o.full = !o.full; render(); },
  effort: (b) => { const it = activeWorkout().items[+b.dataset.i]; it.effort = it.effort === b.dataset.v ? null : b.dataset.v; save(); render(); },
  "rest-add": () => { if (rest) { rest.end += 15000; rest.fired = false; $("#restbar").classList.remove("over"); tickRest(); } },
  "rest-stop": () => stopRest(),
  water: (b) => { const d = day(); d.water = Math.max(0, (d.water || 0) + +b.dataset.v); save(); render(); },
  tcheck: (b) => {
    const d = day(), it = P().schedule.find((x) => x.id === b.dataset.id);
    if (!it) return;
    if (it.kind === "meal") d.eaten[it.ref] = !d.eaten[it.ref]; else d.checks[it.id] = !d.checks[it.id];
    save(); render();
  },
  pcheck: (b) => { const d = day(); d.partyChecks[b.dataset.i] = !d.partyChecks[b.dataset.i]; save(); render(); },
  drink: (b) => { addExtra(b.dataset.n, +b.dataset.k, 0, { party: true }); toast("Drink logged"); },
  pfood: (b) => { addExtra(b.dataset.n, +b.dataset.k, +b.dataset.p, { party: true }); toast("Logged"); },
  rcheck: (b) => { const d = day(); d.recovery ??= {}; d.recovery[b.dataset.i] = !d.recovery[b.dataset.i]; save(); render(); },
  dcheck: (b) => {
    const it = cookReminders(todayKey()).find((x) => x.id === b.dataset.id); if (!it) return;
    if (it.go?.meal) { const W = S.week[weekOf(it.go.k)]; W.sent ??= {}; const key = `${it.go.k}.${it.go.meal}`; W.sent[key] = !W.sent[key]; }
    else { const d = day(); d.checks[it.id] = !d.checks[it.id]; }
    save(); render();
  },
  "tl-go": (b) => {
    const it = cookReminders(todayKey()).find((x) => x.id === b.dataset.id); if (!it?.go) return;
    ui.tab = "food"; if (it.go.meal) ui.cookSel = { k: it.go.k, meal: it.go.meal };
    render(); window.scrollTo(0, 0);
    if (it.go.groc) setTimeout(() => document.querySelector("[data-a='groc-copy']")?.scrollIntoView({ block: "center" }), 50);
  },
  "reset-day": (b) => {
    const key = "reset-day-" + b.dataset.w;
    if (ui.confirm !== key) { ui.confirm = key; return render(); }
    ui.confirm = null;
    const k = todayKey();
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
  "move-gym": (b) => {
    const d = day(), gym = P().schedule.find((x) => x.kind === "gym"); if (!gym) return;
    d.moved ??= {};
    d.moved[gym.id] = b.dataset.t || gym.time;
    save(); render(); toast(b.dataset.t ? `Gym moved to ${fmtTime(b.dataset.t)} today` : "Keeping gym where it is");
  },
  "ics-refresh": async () => { toast("Loading classes…"); const r = await Cal.refresh(true); toast(r.ok ? "Classes updated" : `Couldn't load: ${r.why}`); render(); },
  "party-toggle": () => { const d = day(); d.party = !isParty(); save(); render(); },
  eat: (b) => { const d = day(); d.eaten[b.dataset.id] = !d.eaten[b.dataset.id]; save(); render(); },
  choose: (b) => { const d = day(); d.choice[b.dataset.id] = +b.dataset.i; save(); render(); },
  "food-add": (b) => { addExtra(b.dataset.n, +b.dataset.k, +b.dataset.p); toast(`Added ${b.dataset.n}`); },
  "food-custom": () => {
    const n = $("#cName").value.trim(); if (!n) return toast("Give it a name");
    addExtra(n, +$("#cK").value || 0, +$("#cP").value || 0);
  },
  "extra-q": (b) => { const d = day(), x = d.extra[+b.dataset.i]; x.qty = (x.qty || 1) + +b.dataset.v; if (x.qty <= 0) d.extra.splice(+b.dataset.i, 1); save(); render(); },
  "week-copy": () => copyText(weekSummary()),
  mode: (b) => { P().mode = b.dataset.v; save(); render(); },
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
    ui.confirm = null; S = freshState(); save(); toast("Reset done"); render();
  },
};

function addExtra(name, kcal, protein, flags = {}) {
  const d = day(), now = new Date(), t = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const same = !flags.party && d.extra.find((x) => x.name === name && x.kcal === kcal);
  if (same) same.qty = (same.qty || 1) + 1;
  else d.extra.push({ name, kcal, protein, qty: 1, alcohol: ALCOHOL.test(name), t, ...flags });
  save(); render();
}

// ================= undo =================
// Every tap or edit that changes saved data can be undone for a few seconds.
const undoStack = [];
function afterMutation(before) {
  if (JSON.stringify(S) === before) return;
  undoStack.push(before);
  if (undoStack.length > 30) undoStack.shift();
  const u = $("#undo");
  u.hidden = false;
  clearTimeout(afterMutation.h);
  afterMutation.h = setTimeout(() => (u.hidden = true), 6000);
}
function doUndo() {
  const prev = undoStack.pop(); if (!prev) return;
  S = migrate(JSON.parse(prev)); Store.save(S); render();
  if (!$("#sheet").hidden) closeSheet();
  $("#undo").hidden = !undoStack.length;
  toast("Undone");
}

document.addEventListener("click", (e) => {
  const tab = e.target.closest(".tabs button");
  if (tab) { ui.tab = tab.dataset.tab; ui.confirm = null; try { localStorage.setItem(KEY + ".tab", ui.tab); } catch {} render(); window.scrollTo(0, 0); return; }
  if (e.target.id === "sheetBackdrop") return closeSheet();
  const b = e.target.closest("[data-a]");
  if (!b) return;
  const fn = actions[b.dataset.a];
  if (!fn) return;
  if (ui.confirm && !["discard", "reset", "sess-del", "reset-day", "week-shuffle", "gh-restore"].includes(b.dataset.a)) ui.confirm = null;
  if (b.dataset.a === "undo") return fn(b);
  const before = JSON.stringify(S);
  fn(b);
  afterMutation(before);
});

// ================= backup =================
async function exportBackup() {
  Store.save(S);
  const json = JSON.stringify(S, null, 1);
  const name = `infinity-backup-${todayKey()}.json`;
  const file = new File([json], name, { type: "application/json" });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === "AbortError") return; } }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function importBackup(f) {
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try { const data = JSON.parse(r.result); if (!data.plan || !data.days) throw 0; S = migrate(data); save(); toast("Backup restored"); render(); }
    catch { toast("That file isn't an Infinity backup"); }
  };
  r.readAsText(f);
}


// ================= GitHub backup =================
// Writes data/days/YYYY-MM-DD.json (one per day: that day's log + workouts) and data/state.json
// (everything, for restore) into a private repo through the GitHub contents API.
const GH = KEY + ".gh", GHM = KEY + ".ghmeta";
const ghConf = () => { try { return JSON.parse(localStorage.getItem(GH)) || {}; } catch { return {}; } };
const ghMeta = () => { try { return JSON.parse(localStorage.getItem(GHM)) || { days: {}, sha: {} }; } catch { return { days: {}, sha: {} }; } };
const ghSaveMeta = (m) => { try { localStorage.setItem(GHM, JSON.stringify(m)); } catch {} };
function ghSet(f, v) {
  const c = ghConf();
  if (f === "token" && v.startsWith("•")) return;
  c[f] = v; try { localStorage.setItem(GH, JSON.stringify(c)); } catch {}
  toast(f === "token" ? "Token saved on this phone" : "Repo saved");
}
const b64 = (str) => btoa(unescape(encodeURIComponent(str)));
const unb64 = (str) => decodeURIComponent(escape(atob(str.replace(/\n/g, ""))));
function hash(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return h; }
async function ghApi(method, path, body) {
  const c = ghConf();
  const res = await fetch(`https://api.github.com/repos/${c.repo}/contents/${path}`, {
    method, headers: { Authorization: `Bearer ${c.token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && !(method === "GET" && res.status === 404)) throw new Error(res.status === 401 ? "token rejected (check it hasn't expired)" : res.status === 404 ? "repo not found (check owner/name and token access)" : `GitHub said ${res.status}`);
  return res.status === 404 ? null : res.json();
}
async function ghPut(path, text, meta) {
  const msg = `Backup ${path}`;
  try {
    const r = await ghApi("PUT", path, { message: msg, content: b64(text), sha: meta.sha[path] });
    meta.sha[path] = r.content.sha;
  } catch (e) {
    // Stale or missing sha: fetch the current one and try once more.
    const cur = await ghApi("GET", path);
    const r = await ghApi("PUT", path, { message: msg, content: b64(text), sha: cur?.sha });
    meta.sha[path] = r.content.sha;
  }
}
let ghBusy = false;
async function ghBackup(manual = false) {
  const c = ghConf();
  if (!c.repo || !c.token) { if (manual) toast("Add the repo and token first"); return; }
  if (ghBusy || !navigator.onLine) { if (manual) toast(navigator.onLine ? "Backup already running" : "You're offline"); return; }
  const meta = ghMeta();
  if (!manual && meta.last && Date.now() - meta.last < 15 * 60e3) return;
  ghBusy = true;
  if (manual) toast("Backing up…");
  try {
    for (const k of Object.keys(S.days).sort()) {
      const text = JSON.stringify({ date: k, day: S.days[k], workouts: S.workouts.filter((w) => w.date === k) });
      const h = hash(text);
      if (meta.days[k] === h) continue;
      await ghPut(`data/days/${k}.json`, text, meta);
      meta.days[k] = h;
      ghSaveMeta(meta);
    }
    await ghPut("data/state.json", JSON.stringify(S), meta);
    meta.last = Date.now(); delete meta.err;
    ghSaveMeta(meta);
    if (manual) toast("Backed up to GitHub");
  } catch (e) {
    meta.err = e.message; ghSaveMeta(meta);
    if (manual) toast(`Backup failed: ${e.message}`);
  } finally { ghBusy = false; if (ui.tab === "plan") render(); }
}
async function ghRestore() {
  const c = ghConf();
  if (!c.repo || !c.token) return toast("Add the repo and token first");
  try {
    toast("Restoring…");
    const f = await ghApi("GET", "data/state.json");
    if (!f) return toast("No backup found in that repo");
    const data = JSON.parse(unb64(f.content));
    if (!data.plan || !data.days) throw new Error("backup file looks wrong");
    S = migrate(data); Store.save(S);
    const meta = ghMeta(); meta.sha["data/state.json"] = f.sha; ghSaveMeta(meta);
    toast("Restored from GitHub"); render();
  } catch (e) { toast(`Restore failed: ${e.message}`); }
}

Cal.useRemote(
  async () => { const f = await ghApi("GET", "data/classes.json"); return f ? JSON.parse(unb64(f.content)) : null; },
  async (u) => { const c = ghConf(); if (!c.repo || !c.token) return; const meta = ghMeta(); await ghPut("config/ics-url.txt", u, meta); ghSaveMeta(meta); },
);

// ================= boot =================
if (S.active && activeWorkout()) wakeLock(true);
render();
(async () => {
  if (Native.on && !Store.load()) {
    const m = await Native.loadMirror();
    if (m && m.plan) { S = migrate(m); Store.save(S); render(); toast("Data restored from the phone's copy"); }
  }
  Native.listen({
    onUrl: (u) => {
      if (u.host === "health" || u.pathname.includes("health")) {
        const d = day(), st = parseFloat(u.searchParams.get("steps")), sl = parseFloat(u.searchParams.get("sleep"));
        if (!isNaN(st)) d.steps = Math.round(st);
        if (!isNaN(sl)) d.sleep = Math.round((sl > 24 ? sl / 60 : sl) * 10) / 10;
        save(); render(); toast("Steps and sleep updated from Health");
      }
    },
    onResume: () => { Cal.refresh(); syncNative(); render(); },
  });
  await Cal.refresh();
  render();
  syncNative();
})();
try { navigator.storage?.persist?.(); } catch {}
setTimeout(() => ghBackup(false), 4000);
document.addEventListener("visibilitychange", () => { if (document.hidden) ghBackup(false); else if (!Native.on) Cal.refresh().then(() => ui.tab === "today" && render()); });
// Re-render on the hour boundary so "now" in the schedule moves and the 4am day rollover happens.
let lastKey = todayKey();
setInterval(() => {
  const k = todayKey();
  const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if (k !== lastKey || (!typing && ui.tab === "today" && new Date().getSeconds() < 5)) { lastKey = k; if (!typing) render(); }
}, 5000);

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
