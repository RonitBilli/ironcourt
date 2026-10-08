"use strict";

// ================= storage =================
// Single storage adapter so a native build (Capacitor) or a synced backend can
// replace localStorage later without touching the screens.
const KEY = "ironcourt.v1";
const Store = {
  load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
  save(data) { try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch { return false; } },
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(36).slice(2, 9);

function freshState() {
  return { plan: clone(DEFAULT_PLAN), days: {}, workouts: [], active: null, rot: { cut: 0, term: 0 }, swaps: {} };
}

function migrate(s) {
  const base = freshState();
  if (!s || typeof s !== "object") return base;
  for (const k of Object.keys(base)) if (s[k] === undefined) s[k] = base[k];
  for (const k of Object.keys(DEFAULT_PLAN)) if (s.plan[k] === undefined) s.plan[k] = clone(DEFAULT_PLAN[k]);
  // New library exercises arrive with app updates; user edits to existing ones are kept.
  for (const [id, ex] of Object.entries(EXERCISES)) if (!s.plan.exercises[id]) s.plan.exercises[id] = clone(ex);
  for (const [id, se] of Object.entries(SESSIONS)) if (!s.plan.sessions[id]) s.plan.sessions[id] = clone(se);
  s.plan.schedule.forEach((it) => { if (!it.id) it.id = uid(); });
  return s;
}

let S = migrate(Store.load());
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { if (!Store.save(S)) toast("Couldn't save. Storage may be full or blocked."); }, 150);
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
  if (!S.days[k]) S.days[k] = { checks: {}, water: 0, eaten: {}, choice: {}, extra: [], partyChecks: {} };
  return S.days[k];
}
function isParty(k = todayKey()) {
  const d = S.days[k];
  if (d && d.party !== undefined) return d.party;
  return P().partyDates.includes(k);
}
function mealOpt(slot, d) {
  const i = d.choice[slot.id] ?? 0;
  return slot.options[i] || slot.options[0];
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
function videoHTML(id) {
  if (!id) return `<p class="muted small">No video set. Add one in Plan → Exercises.</p>`;
  return `<div class="video"><iframe src="https://www.youtube.com/embed/${esc(id)}?playsinline=1&rel=0&modestbranding=1" title="Exercise video" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
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

function lastLog(ex, excludeId) {
  for (let i = S.workouts.length - 1; i >= 0; i--) {
    const w = S.workouts[i];
    if (w.id === excludeId || !w.done) continue;
    const it = w.items.find((x) => x.ex === ex && x.sets.some((s) => s.done));
    if (it) return { date: w.date, sets: it.sets.filter((s) => s.done) };
  }
  return null;
}
function topRep(reps) { const n = String(reps).match(/\d+/g); return n ? Math.max(...n.map(Number)) : null; }
function suggestion(item, wid) {
  const last = lastLog(item.ex, wid);
  if (!last) return { text: "First time logging this. Pick a weight you could lift for the top of the range with 2-3 reps to spare.", good: false };
  const str = last.sets.map((s) => (s.w ? `${s.w}×${s.r || "?"}` : `${s.r || "?"} reps`)).join(", ");
  const top = topRep(item.reps);
  const hit = top && last.sets.every((s) => +s.r >= top);
  const w = +last.sets[last.sets.length - 1].w || 0;
  if (hit && w) {
    const inc = /squat|leg_press|rdl|hip_thrust|hack/.test(item.ex) ? 5 : 2.5;
    return { text: `Last (${fmtDay(last.date)}): ${str}. You hit the top of the range. Try ${w + inc} kg.`, good: true };
  }
  if (hit) return { text: `Last (${fmtDay(last.date)}): ${str}. Make it harder: slower reps, a pause, or add load.`, good: true };
  return { text: `Last (${fmtDay(last.date)}): ${str}. Beat it: same weight, one more rep on any set.`, good: false };
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
  try { navigator.vibrate?.([200, 100, 200]); } catch {}
}
function startRest(sec) {
  try { audio ??= new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.(); } catch {}
  if (!sec) return;
  rest = { end: Date.now() + sec * 1000, fired: false };
  tickRest();
}
function stopRest() { rest = null; const b = $("#restbar"); b.hidden = true; b.classList.remove("over"); }
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
  let chip;
  if (p.mode === "term") chip = `<span class="chip">Term mode</span>`;
  else if (n < 1) chip = `<span class="chip">Cut starts in ${1 - n}d</span>`;
  else if (n > total) chip = `<span class="chip good">Cut done</span>`;
  else chip = `<span class="chip">Day ${n} of ${total}</span>`;
  const titles = { today: fmtDay(k), train: "Train", food: "Food", progress: "Progress", plan: "Plan" };
  $("#top").innerHTML = `<div class="top-inner"><h1>${esc(titles[ui.tab])}</h1>${isParty(k) ? `<span class="chip warn">Party day</span>` : ""}${chip}</div>`;
}

// ================= TODAY =================
function renderToday() {
  const k = todayKey(), d = day(k), p = P(), t = totals(d);
  const sched = [...p.schedule].sort((a, b) => mins(a.time) - mins(b.time));
  const now = nowMins();
  let nowIdx = -1;
  sched.forEach((it, i) => { if (mins(it.time) <= now) nowIdx = i; });
  const doneW = workoutsOn(k).length > 0;
  const checked = (it) => it.kind === "meal" ? !!d.eaten[it.ref] : it.kind === "gym" ? !!d.checks[it.id] || doneW : !!d.checks[it.id];
  const nChecked = sched.filter(checked).length;
  const goals = [t.protein >= p.targets.protein, d.water >= p.targets.water];
  const score = Math.round(((nChecked + goals.filter(Boolean).length) / (sched.length + goals.length)) * 100);

  const meter = (label, val, unit, target, pct, extra = "") => `
    <div class="meter"><span class="eyebrow">${label}</span>
      <div class="val">${val}<small> ${unit}</small></div>
      <div class="bar ${pct >= 100 ? "good" : ""}"><i style="width:${Math.min(pct, 100)}%"></i></div>
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
  const partyCard = party ? `
    <section class="card party">
      <div class="spread"><h2>Party mode</h2><span class="chip warn">${drinksOf(d)} drinks</span></div>
      <div class="stack">${p.partyRules.map((r, i) => `
        <div class="row"><button class="check ${d.partyChecks[i] ? "on" : ""}" data-a="pcheck" data-i="${i}" aria-label="Done"></button><span class="grow">${esc(r)}</span></div>`).join("")}</div>
      <div class="row wrap">
        <button class="btn small" data-a="drink" data-n="Whisky / rum, 30 ml" data-k="70">+ Peg (70)</button>
        <button class="btn small" data-a="drink" data-n="Beer, 330 ml" data-k="140">+ Beer 330 (140)</button>
        <button class="btn small" data-a="drink" data-n="Strong beer, 650 ml" data-k="390">+ Strong 650 (390)</button>
      </div>
    </section>` : "";

  const isSunday = parseKey(k).getDay() === 0;

  return `
    <section class="card"><div class="score"><div class="big">${score}%</div>
      <div class="grow stack"><div class="bar ${score >= 100 ? "good" : ""}"><i style="width:${score}%"></i></div>
      <span class="small muted">${nChecked} of ${sched.length} done · protein ${goals[0] ? "hit" : "not yet"} · water ${goals[1] ? "hit" : "not yet"}</span></div></div></section>

    <section class="card">${next}</section>
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
        if (it.kind === "meal") { const slot = p.meals.find((m) => m.id === it.ref); if (slot) { const o = mealOpt(slot, d); sub = `${slot.veg ? '<i class="veg"></i>' : ""}${esc(o.name)} · ${o.protein} g protein`; } }
        if (it.kind === "gym") sub = aw ? "In progress" : doneW ? "Logged" : sid === "REST" ? "Rest day in rotation" : esc(se?.name || "");
        return `<div class="tl ${i === nowIdx ? "now" : ""} ${on ? "done" : ""}">
          <span class="t">${fmtTime(it.time)}</span>
          <div class="what"><b>${esc(it.title)}</b>${sub ? `<span>${sub}</span>` : ""}</div>
          <button class="check ${on ? "on" : ""}" data-a="tcheck" data-id="${it.id}" aria-label="Mark ${esc(it.title)} done"></button></div>`;
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

    <section class="card flat"><div class="spread"><div><b>Party day?</b><p class="small muted">Switches on the damage-control checklist and drink log.</p></div>
      <button class="btn small" data-a="party-toggle">${party ? "Turn off" : "Turn on"}</button></div></section>`;
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
    <div class="hint ${sug.good ? "good" : ""}">${esc(sug.text)}</div>
    <div class="ex-actions">
      <button class="btn small ${open.video ? "primary" : ""}" data-a="toggle" data-k="${w.id}.${idx}" data-f="video">▶ Video</button>
      <button class="btn small" data-a="swap" data-i="${idx}">⇄ Swap</button>
      <button class="btn small ${open.cues ? "primary" : ""}" data-a="toggle" data-k="${w.id}.${idx}" data-f="cues">How to</button>
    </div>
    ${open.video ? videoHTML(info.video) : ""}
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
    <div class="row"><button class="btn small ghost" data-a="set-add" data-i="${idx}">+ Set</button><button class="btn small ghost" data-a="set-del" data-i="${idx}">− Set</button>
      <input class="grow" type="text" id="note-${idx}" placeholder="Note (seat 4, felt easy…)" value="${esc(item.note)}" data-bind="@w.items.${idx}.note" data-type="str"></div>
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
function altCard(id, why, idx) {
  const e = exInfo(id);
  const open = ui.open[`alt.${id}`];
  return `<div class="alt"><div class="spread"><div class="grow"><b>${esc(e.name)}</b><p class="small muted">${esc(why)}</p></div>
    <button class="btn small ${open ? "primary" : ""}" data-a="alt-video" data-id="${id}" data-i="${idx}">▶</button></div>
    ${open ? videoHTML(e.video) : ""}
    <div class="row"><button class="btn small grow" data-a="swap-to" data-id="${id}" data-i="${idx}" data-always="0">Today</button><button class="btn small grow primary" data-a="swap-to" data-id="${id}" data-i="${idx}" data-always="1">Always</button></div></div>`;
}

function openSheet(html) {
  $("#sheet").innerHTML = `<div class="inner">${html}</div>`;
  $("#sheet").hidden = false; $("#sheetBackdrop").hidden = false;
}
function closeSheet() { $("#sheet").hidden = true; $("#sheetBackdrop").hidden = true; $("#sheet").innerHTML = ""; }

// ================= FOOD =================
function renderFood() {
  const k = todayKey(), d = day(k), p = P(), t = totals(d);
  const isSunday = parseKey(k).getDay() === 0;
  return `
    <div class="meters">
      <div class="meter"><span class="eyebrow">Protein</span><div class="val">${t.protein}<small> / ${p.targets.protein} g</small></div><div class="bar ${t.protein >= p.targets.protein ? "good" : ""}"><i style="width:${Math.min((t.protein / p.targets.protein) * 100, 100)}%"></i></div></div>
      <div class="meter"><span class="eyebrow">Calories</span><div class="val">${t.kcal}<small> / ${p.targets.kcal}</small></div><div class="bar"><i style="width:${Math.min((t.kcal / p.targets.kcal) * 100, 100)}%"></i></div></div>
    </div>
    ${isSunday ? sundayCard() : ""}
    <section class="card"><h2>Today's meals</h2>
      ${p.meals.map((slot) => {
        const ci = d.choice[slot.id] ?? 0, o = mealOpt(slot, d), on = !!d.eaten[slot.id];
        return `<div class="meal"><div class="spread"><div class="grow"><span class="eyebrow">${fmtTime(slot.time)} · ${esc(slot.name)}</span>
          <h3>${slot.veg ? '<i class="veg" title="Vegetarian"></i>' : ""}${esc(o.name)}</h3></div>
          <button class="check ${on ? "on" : ""}" data-a="eat" data-id="${slot.id}" aria-label="Ate ${esc(slot.name)}"></button></div>
          <p class="small muted">${esc(o.detail)}</p><p class="small num"><b>${o.protein} g</b> protein · ${o.kcal} kcal</p>
          ${slot.options.length > 1 ? `<div class="opts">${slot.options.map((x, i) => `<button class="opt ${i === ci ? "on" : ""}" data-a="choose" data-id="${slot.id}" data-i="${i}">${esc(x.name)}</button>`).join("")}</div>` : ""}
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
      ${d.extra.length ? `<div>${d.extra.map((x, i) => `<div class="extra"><span class="grow">${x.qty > 1 ? `${x.qty}× ` : ""}${esc(x.name)}<br><span class="small muted num">${Math.round(x.kcal * (x.qty || 1))} kcal · ${Math.round(x.protein * (x.qty || 1))} g</span></span>
        <div class="row"><button class="icon-btn" data-a="extra-q" data-i="${i}" data-v="-1" aria-label="Less">−</button><button class="icon-btn" data-a="extra-q" data-i="${i}" data-v="1" aria-label="More">+</button></div></div>`).join("")}</div>` : ""}
    </section>
    ${!isSunday ? sundayCard() : ""}
    ${cookCard()}`;
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
function cookMessage(lang) {
  const p = P();
  if (lang === "hi") return `Bhaiya, is hafte ka plan:\n\n${p.cookRulesHi.map((r) => "• " + r).join("\n")}\n\nSaaman ki list:\n${p.grocery.map((g) => "• " + g).join("\n")}\n\nShukriya!`;
  return `Hi, here's the plan for this week:\n\n${p.cookRules.map((r) => "• " + r).join("\n")}\n\nGrocery list:\n${p.grocery.map((g) => "• " + g).join("\n")}\n\nThank you!`;
}
function cookCard() {
  return `<section class="card"><div class="spread"><h2>Message for the cook</h2>
    <div class="seg"><button class="${ui.lang === "en" ? "on" : ""}" data-a="lang" data-v="en">English</button><button class="${ui.lang === "hi" ? "on" : ""}" data-a="lang" data-v="hi">Hinglish</button></div></div>
    <pre class="msg" id="cookMsg">${esc(cookMessage(ui.lang))}</pre>
    <div class="row"><button class="btn grow" data-a="cook-copy">Copy</button><button class="btn primary grow" data-a="cook-share">Share to WhatsApp</button></div>
    <p class="small muted">Edit the grocery list and rules in Plan → Diet.</p></section>`;
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
  const lines = [`Ironcourt week ending ${fmtDay(k)} (${p.mode} mode)`];
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
      ${it.kind === "meal" ? `<select id="f-ref-${i}" data-bind="plan.schedule.${i}.ref" data-type="str">${p.meals.map((m) => `<option value="${m.id}" ${m.id === it.ref ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select>` : ""}</div></div>`).join("")
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
      <div class="field"><label>YouTube link or video id</label><input type="text" id="f-video" value="${esc(ee.video)}" data-a-change="ex-video" placeholder="https://youtu.be/…"></div>
      ${videoHTML(ee.video)}
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

  const diet = `<div class="field"><label>Grocery list, one per line</label>${lines("plan.grocery", p.grocery)}</div>
    <div class="field"><label>Cook rules (English)</label>${lines("plan.cookRules", p.cookRules)}</div>
    <div class="field"><label>Cook rules (Hinglish)</label>${lines("plan.cookRulesHi", p.cookRulesHi)}</div>
    <div class="field"><label>Sunday: order</label>${lines("plan.sundayGuide.order", p.sundayGuide.order)}</div>
    <div class="field"><label>Sunday: skip</label>${lines("plan.sundayGuide.avoid", p.sundayGuide.avoid)}</div>`;

  const backup = `<p class="small muted">Your data lives on this phone. Export a backup every week or two, and before deleting the app.</p>
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
    ${sec("diet", "Diet: groceries, cook, Sunday", diet)}
    ${sec("party", "Party days", party, `${p.partyDates.length} dates`)}
    ${sec("backup", "Backup", backup)}
    <p class="small muted" style="text-align:center">Ironcourt · your data never leaves this device unless you export it</p>`;
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
  const el = e.target;
  if (el.id === "importFile") return importBackup(el.files[0]);
  if (el.dataset.aChange === "sess-pick") { ui.editSession = el.value; ui.confirm = null; return render(); }
  if (el.dataset.aChange === "ex-video") { const id = ytId(el.value); if (!id && el.value.trim()) { toast("That doesn't look like a YouTube link"); return; } P().exercises[ui.editEx].video = id; save(); return render(); }
  const path = el.dataset.bind;
  if (!path) return;
  if (path.startsWith("days.")) day(path.split(".")[1]);
  const r = resolveBind(path);
  if (!r) return;
  setPath(r.obj, r.path, readValue(el));
  const m = r.path.match(/^plan\.schedule\.(\d+)\.kind$/);
  if (m && el.value === "meal") { const it = P().schedule[+m[1]]; if (!it.ref) it.ref = P().meals[0]?.id; }
  save();
  if (el.dataset.rerender) render();
});
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
  drink: (b) => { addExtra(b.dataset.n, +b.dataset.k, 0); toast("Drink logged"); },
  "party-toggle": () => { const d = day(); d.party = !isParty(); save(); render(); },
  eat: (b) => { const d = day(); d.eaten[b.dataset.id] = !d.eaten[b.dataset.id]; save(); render(); },
  choose: (b) => { const d = day(); d.choice[b.dataset.id] = +b.dataset.i; save(); render(); },
  "food-add": (b) => { addExtra(b.dataset.n, +b.dataset.k, +b.dataset.p); toast(`Added ${b.dataset.n}`); },
  "food-custom": () => {
    const n = $("#cName").value.trim(); if (!n) return toast("Give it a name");
    addExtra(n, +$("#cK").value || 0, +$("#cP").value || 0);
  },
  "extra-q": (b) => { const d = day(), x = d.extra[+b.dataset.i]; x.qty = (x.qty || 1) + +b.dataset.v; if (x.qty <= 0) d.extra.splice(+b.dataset.i, 1); save(); render(); },
  lang: (b) => { ui.lang = b.dataset.v; render(); },
  "cook-copy": () => copyText(cookMessage(ui.lang)),
  "cook-share": () => shareText(cookMessage(ui.lang), "For the cook"),
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

function addExtra(name, kcal, protein) {
  const d = day();
  const same = d.extra.find((x) => x.name === name && x.kcal === kcal);
  if (same) same.qty = (same.qty || 1) + 1;
  else d.extra.push({ name, kcal, protein, qty: 1, alcohol: ALCOHOL.test(name) });
  save(); render();
}

document.addEventListener("click", (e) => {
  const tab = e.target.closest(".tabs button");
  if (tab) { ui.tab = tab.dataset.tab; ui.confirm = null; try { localStorage.setItem(KEY + ".tab", ui.tab); } catch {} render(); window.scrollTo(0, 0); return; }
  if (e.target.id === "sheetBackdrop") return closeSheet();
  const b = e.target.closest("[data-a]");
  if (!b) return;
  const fn = actions[b.dataset.a];
  if (fn) { if (ui.confirm && !["discard", "reset", "sess-del"].includes(b.dataset.a)) ui.confirm = null; fn(b); }
});

// ================= backup =================
async function exportBackup() {
  Store.save(S);
  const json = JSON.stringify(S, null, 1);
  const name = `ironcourt-backup-${todayKey()}.json`;
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
    catch { toast("That file isn't an Ironcourt backup"); }
  };
  r.readAsText(f);
}

// ================= boot =================
if (S.active && activeWorkout()) wakeLock(true);
render();
// Re-render on the hour boundary so "now" in the schedule moves and the 4am day rollover happens.
let lastKey = todayKey();
setInterval(() => {
  const k = todayKey();
  const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if (k !== lastKey || (!typing && ui.tab === "today" && new Date().getSeconds() < 5)) { lastKey = k; if (!typing) render(); }
}, 5000);

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
