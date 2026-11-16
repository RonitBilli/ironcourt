"use strict";
// ================= training: progression, workout flow, Train tab =================
let lock = null;
async function wakeLock(on) {
  try {
    if (on && "wakeLock" in navigator && !lock) { lock = await navigator.wakeLock.request("screen"); lock.addEventListener("release", () => (lock = null)); }
    if (!on && lock) { await lock.release(); lock = null; }
  } catch {}
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && (S.activeBy?.ronit || S.activeBy?.yashvi)) wakeLock(true); });

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
// ---------- progression ----------
// Double progression from the log alone: when every set reaches the top of the rep range,
// the next session's weight goes up one step and is typed in for you.
const BW = /plank|crunch|leg_raise|knee_raise|bug|pushup|walk|bike|wheel|bridge|hyper|back_ext|band/;
const stepFor = (ex, w) => (/squat|leg_press|rdl|hip_thrust|hack/.test(ex) ? 5 : w < 8 ? 1.25 : 2.5);
const isCardio = (id) => /^Cardio/.test(exInfo(id).muscle || "");
const fmtKg = (v) => String(Math.round(v * 100) / 100);
function suggestion(item, wid, who = ui.who) {
  const [last, prev] = logsFor(item.ex, wid, 2, who);
  const top = topRep(item.reps), low = lowRep(item.reps);
  const unit = /\d\s*s\b/.test(String(item.reps)) ? "seconds" : "reps";
  if (!last) return { short: `New for you: pick a weight where rep ${top || 10} is hard`, kind: "", next: 0, lastTxt: "" };
  const lastTxt = `Last time (${fmtDay(last.date)}): ` + last.sets.map((s) => (+s.w ? `${s.w} × ${s.r || "?"}` : `${s.r || "?"}`)).join(", ");
  const reps = last.sets.map((s) => +s.r || 0), best = Math.max(...reps);
  const w = +last.sets[last.sets.length - 1].w || 0, inc = stepFor(item.ex, w);
  const hit = top && reps.every((r) => r >= top), way = top && reps.every((r) => r >= top + 3);
  const missed = low && reps.some((r) => r < low);
  const out = (short, kind, next) => ({ short, kind, next, lastTxt });
  if (last.effort === "pain") return out("Hurt last time: go lighter or swap it", "warn", w ? roundTo(w * 0.8, 1.25) : 0);
  if (prev && w && missed && +prev.sets[prev.sets.length - 1].w === w && prev.sets.some((s) => +s.r < low))
    return out(`Stuck twice: drop to ${fmtKg(roundTo(w * 0.9, 1.25))} kg and rebuild`, "warn", roundTo(w * 0.9, 1.25));
  if (way && w) return out(`Too light last time: go to ${fmtKg(w + inc * 2)} kg`, "good", w + inc * 2);
  if (hit && w) return out(`You hit ${top} on every set: go up to ${fmtKg(w + inc)} kg`, "good", w + inc);
  if (hit) return out(`Every set hit ${top}: slow it down or hold a weight`, "good", 0);
  if (!w && !BW.test(item.ex)) return out(`Type the kg today · beat ${best} ${unit}`, "", 0);
  const goal = top ? Math.min(best + 1, top) : best + 1;
  return out(`${w ? fmtKg(w) + " kg · " : ""}get ${goal} ${unit} or more`, "", w);
}

// ---------- workout flow ----------
function beginWorkout(sid, who, quick) {
  const se = P().sessions[sid];
  if (!se || activeWorkout(who)) return null;
  const w = { id: uid(), who, date: curKey(), session: sid, start: Date.now(), done: false, quick: !!quick,
    items: se.items.filter((it) => !(quick && it.full)).map((it) => {
      const ex = swapsFor(who)[it.ex] || it.ex;
      // The weight the app wants today is typed in already, so going up is the default.
      const next = suggestion({ ex, reps: it.reps }, null, who).next;
      const n = isCardio(ex) ? 1 : Math.max(1, quick ? Math.min(+it.sets || 3, 2) : +it.sets || 3);
      return { ex, orig: it.ex, reps: it.reps, ss: !!it.ss, rest: it.rest === 0 || it.rest === "0" ? 0 : +it.rest || 90, note: "", sets: Array.from({ length: n }, () => ({ w: next ? fmtKg(next) : "", r: "", done: false })) };
    }) };
  S.workouts.push(w);
  S.activeBy[who] = w.id;
  return w;
}
const e1rm = (s) => +s.w * (1 + +s.r / 30);
const bestOf = (it) => Math.max(0, ...it.sets.filter((s) => s.done && +s.w && +s.r).map(e1rm));
function prsIn(w) {
  const who = whoOf(w), out = [];
  for (const it of w.items) {
    const now = bestOf(it); if (!now) continue;
    let before = 0;
    for (const x of S.workouts) if (x.done && x.id !== w.id && whoOf(x) === who) for (const y of x.items) if (y.ex === it.ex) before = Math.max(before, bestOf(y));
    if (!before || now <= before * 1.001) continue;
    const top = it.sets.filter((s) => s.done && +s.w && +s.r).reduce((a, s) => (e1rm(s) > e1rm(a) ? s : a));
    out.push(`${exInfo(it.ex).name}: ${top.w} kg × ${top.r}`);
  }
  return out;
}
function finishWorkout(who = ui.who) {
  const w = activeWorkout(who);
  if (!w) return;
  const anyoneElse = () => !!(S.activeBy.ronit || S.activeBy.yashvi);
  if (!w.items.some((it) => it.sets.some((s) => s.done))) {
    S.workouts = S.workouts.filter((x) => x.id !== w.id); S.activeBy[who] = null;
    save(); stopRest(); if (!anyoneElse()) wakeLock(false);
    toast("Nothing was logged, so the workout was dropped"); return render();
  }
  const prs = prsIn(w);
  w.done = true; w.end = Date.now();
  if (w.session === currentSessionId(who)) advanceRotation(who);
  const gym = P().schedule.find((x) => x.kind === "gym");
  if (gym && who === "ronit") day(w.date).checks[gym.id] = true;
  S.activeBy[who] = null;
  save(); stopRest(); if (!anyoneElse()) wakeLock(false);
  render();
  const sets = w.items.reduce((a, it) => a + it.sets.filter((s) => s.done).length, 0), mins = Math.max(1, Math.round((w.end - w.start) / 60000));
  const wc = weekCount(who, w.date), nextSe = P().sessions[currentSessionId(who)], o = other(who);
  openSheet(`
    <div><span class="eyebrow">${esc(whoName(who))} · ${esc(fmtDay(w.date))}</span><h2>Workout done</h2></div>
    <div class="stats"><div class="stat"><b>${mins}</b><span>minutes</span></div><div class="stat"><b>${sets}</b><span>sets</span></div><div class="stat"><b>${wc}/${WEEK_GOAL}</b><span>this week</span></div></div>
    ${prs.length ? `<div class="hint good"><b>New bests</b><br>${prs.map(esc).join("<br>")}</div>` : ""}
    <p class="small muted">${wc >= WEEK_GOAL ? "That's the week's goal." : `${WEEK_GOAL - wc} more to go this week.`}${nextSe ? ` Next time: ${esc(nextSe.name)}.` : ""}</p>
    ${activeWorkout(o) ? `<button class="btn block" data-a="who" data-v="${o}">Open ${esc(whoName(o))}'s workout</button>` : ""}
    <button class="btn primary block" data-a="sheet-close">Done</button>`);
}

// ---------- blocks: a single exercise, or a pair done back to back ----------
function blocksOf(w) {
  const out = [];
  for (let i = 0; i < w.items.length; i++) { if (w.items[i].ss && w.items[i + 1]) { out.push([i, i + 1]); i++; } else out.push([i]); }
  return out;
}
const blockDone = (w, b) => b.every((i) => w.items[i].sets.every((s) => s.done));
function curBlock(w) {
  const bs = blocksOf(w), c = ui.cur?.[w.id];
  if (c != null && c < bs.length) return c;
  const n = bs.findIndex((b) => !blockDone(w, b));
  return n < 0 ? Math.max(bs.length - 1, 0) : n;
}
function wkStats(w) {
  return { done: w.items.reduce((a, it) => a + it.sets.filter((s) => s.done).length, 0), all: w.items.reduce((a, it) => a + it.sets.length, 0) };
}
const wkMins = (w) => Math.max(0, Math.round((Date.now() - w.start) / 60000));
const restTxt = (sec) => (sec >= 60 ? `${Math.floor(sec / 60)}:${pad(sec % 60)}` : `${sec} s`);
// Rough length of a session at an unhurried pace: a minute a set, plus the rests.
function estMin(items, quick) {
  let sec = 240;
  for (const it of items.filter((x) => !(quick && x.full))) {
    const m = String(it.reps).match(/(\d+)\s*min/);
    if (m) { sec += +m[1] * 60; continue; }
    const n = quick ? Math.min(+it.sets || 3, 2) : +it.sets || 3;
    sec += n * (60 + (+it.rest || 0)) + 45;
  }
  return Math.round(sec / 300) * 5;
}
function scrollToBlock(i) {
  requestAnimationFrame(() => document.getElementById("blk-" + i)?.scrollIntoView({ block: "start", behavior: "smooth" }));
}

// ---------- Train tab ----------
function setRow(w, i, j, tag) {
  const it = w.items[i], s = it.sets[j];
  if (!s) return "";
  const last = lastLog(it.ex, w.id), ph = last?.sets[j]?.r || last?.sets[last.sets.length - 1]?.r || topRep(it.reps) || "";
  return `<div class="set ${s.done ? "done" : ""}">
      <span class="k">${tag}</span>
      <input type="number" inputmode="decimal" step="0.25" id="w-${i}-${j}" aria-label="Weight" placeholder="${BW.test(it.ex) ? "bw" : "kg"}" value="${esc(s.w)}" data-bind="@w.items.${i}.sets.${j}.w" data-type="str">
      <span class="x">×</span>
      <input type="number" inputmode="numeric" id="r-${i}-${j}" aria-label="Reps" placeholder="${esc(ph)}" value="${esc(s.r)}" data-bind="@w.items.${i}.sets.${j}.r" data-type="str">
      <button class="check ${s.done ? "on" : ""}" data-a="set-done" data-i="${i}" data-j="${j}" aria-label="Set done"></button>
    </div>`;
}
function exHead(w, i, tag) {
  const it = w.items[i], info = exInfo(it.ex), key = `${w.id}.${i}`, open = ui.open[key] || {};
  const sug = isCardio(it.ex) ? { short: "Brisk: talking is hard but possible", kind: "", lastTxt: "" } : suggestion(it, w.id);
  return `<div class="exh">${tag ? `<span class="tag">${tag}</span>` : ""}<div class="grow"><h3>${esc(info.name)}</h3>
      <p class="tgt ${sug.kind}"><b>${isCardio(it.ex) ? esc(it.reps) : `${it.sets.length} × ${esc(it.reps)}`}</b> · ${esc(sug.short)}</p></div>
      <button class="icon-btn ${open.more ? "on" : ""}" data-a="toggle" data-k="${key}" data-f="more" aria-label="Demo, tips and swap">${ICON.play}</button></div>
    ${open.more ? `<div class="ex-more">${exVideo(info, key)}
      <ul class="cues">${(info.cues || []).map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
      ${sug.lastTxt ? `<p class="small muted num">${esc(sug.lastTxt)}</p>` : ""}
      <div class="row wrap"><button class="btn small" data-a="swap" data-i="${i}">Swap exercise</button>${isCardio(it.ex) ? "" : `<button class="btn small ghost" data-a="set-add" data-i="${i}">+ Set</button><button class="btn small ghost" data-a="set-del" data-i="${i}">− Set</button>`}</div>
      <input type="text" id="note-${i}" placeholder="Note to self: seat height, grip" value="${esc(it.note)}" data-bind="@w.items.${i}.note" data-type="str"></div>` : ""}`;
}
function blockCard(w, b, bi, cur) {
  const items = b.map((i) => w.items[i]), done = blockDone(w, b);
  const nDone = items.reduce((a, it) => a + it.sets.filter((s) => s.done).length, 0), nAll = items.reduce((a, it) => a + it.sets.length, 0);
  if (bi !== cur) return `<button class="blk ${done ? "done" : ""}" id="blk-${bi}" data-a="blk" data-i="${bi}"><span class="n">${done ? "" : bi + 1}</span>
      <span class="grow"><b>${items.map((it) => esc(exInfo(it.ex).name)).join(`<span class="plus"> + </span>`)}</b></span><span class="num small muted">${nDone}/${nAll}</span></button>`;
  const [i, j] = b, a = w.items[i];
  if (isCardio(a.ex)) {
    const s = a.sets[0] || {};
    return `<article class="wblock ${done ? "done" : ""}" id="blk-${bi}"><div class="bhead"><span class="n">${bi + 1}</span><span class="eyebrow">Cardio</span></div>${exHead(w, i, "")}
      <button class="btn block ${s.done ? "good" : "primary"}" data-a="set-done" data-i="${i}" data-j="0">${s.done ? "Done" : "Mark done"}</button></article>`;
  }
  if (b.length === 1) return `<article class="wblock ${done ? "done" : ""}" id="blk-${bi}"><div class="bhead"><span class="n">${bi + 1}</span><span class="eyebrow">${a.sets.length} sets · rest ${restTxt(a.rest)}</span></div>
      ${exHead(w, i, "")}<div class="sets">${a.sets.map((_, s) => setRow(w, i, s, s + 1)).join("")}</div></article>`;
  const c = w.items[j], rounds = Math.max(a.sets.length, c.sets.length);
  return `<article class="wblock ${done ? "done" : ""}" id="blk-${bi}"><div class="bhead"><span class="n">${bi + 1}</span><span class="eyebrow">Pair · A then B, then rest ${restTxt(c.rest || a.rest)}</span></div>
    ${exHead(w, i, "A")}${exHead(w, j, "B")}
    ${Array.from({ length: rounds }, (_, r) => `<div class="round"><span class="eyebrow">Round ${r + 1}</span><div class="sets">${setRow(w, i, r, "A")}${setRow(w, j, r, "B")}</div></div>`).join("")}</article>`;
}
function workoutHTML(w) {
  const bs = blocksOf(w), cur = curBlock(w);
  const phase = (title, sub, list) => `<details class="sec phase"><summary><span><b>${title}</b> <span class="small muted">${sub}</span></span></summary><div class="body"><ul class="cues">${list.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div></details>`;
  return `
    ${phase("Warm-up", "2 minutes", WARMUP)}
    ${bs.map((b, bi) => blockCard(w, b, bi, cur)).join("")}
    ${phase("Cool-down", "3 minutes, good for the gut", COOLDOWN)}
    <section class="card flat"><div class="row"><select id="addEx" class="grow" aria-label="Add an exercise"><option value="">Add an exercise…</option>${exOptions()}</select><button class="btn small" data-a="ex-add">Add</button></div></section>
    <button class="btn block primary" data-a="finish">Finish workout</button>
    <button class="btn block ghost" data-a="discard">${ui.confirm === "discard" ? "Tap again to discard" : "Discard workout"}</button>`;
}
function sessionPreview(se, who, quick) {
  const items = se.items.filter((it) => !(quick && it.full)), rows = [];
  const nm = (x) => esc(exInfo(swapsFor(who)[x.ex] || x.ex).name);
  const n = (x) => (isCardio(x.ex) ? esc(String(x.reps).split(",")[0]) : `${quick ? Math.min(+x.sets, 2) : x.sets} × ${esc(x.reps)}`);
  for (let i = 0; i < items.length; i++) {
    const it = items[i], nx = items[i + 1], pair = it.ss && nx;
    rows.push(`<div class="pv"><span class="n">${rows.length + 1}</span><span class="grow">${nm(it)}${pair ? `<br>${nm(nx)}` : ""}</span><span class="muted num small">${n(it)}${pair ? `<br>${n(nx)}` : ""}</span></div>`);
    if (pair) i++;
  }
  return `<div class="pvlist">${rows.join("")}</div>`;
}
function trainStartHTML() {
  const p = P(), who = ui.who, o = other(who), k = curKey();
  const sid = currentSessionId(), se = p.sessions[sid], quick = !!ui.quick, wc = weekCount(who);
  const oSid = currentSessionId(o);
  const canBoth = se && sid !== "REST" && !classLoad(k).heavy && !activeWorkout(o) && !workoutsOn(k, o).length && !workoutsOn(k, who).length && p.sessions[oSid];
  const others = Object.entries(p.sessions).filter(([id, x]) => id !== sid && !x.hidden && (id === "HOME" || (who === "yashvi") === Y_SESSIONS.includes(id)));
  const history = S.workouts.filter((x) => x.done && whoOf(x) === who).slice(-5).reverse();
  const walked = !!S.act?.[who]?.[k];
  let next;
  if (sid === "REST") next = `<h2>Rest day</h2><p class="muted small">No weights today. A 30-minute brisk walk still counts.</p><button class="btn primary block" data-a="rest-done">Mark rest done</button>`;
  else if (se) next = `<span class="eyebrow">Next${workoutsOn(k, who).length ? " · already trained today" : ""}</span><h2>${esc(se.name)}</h2><p class="small muted">${esc(se.focus)}</p>
      <div class="seg full"><button class="${quick ? "" : "on"}" data-a="quick" data-v="0">Full · ${estMin(se.items, false)} min</button><button class="${quick ? "on" : ""}" data-a="quick" data-v="1">Quick · ${estMin(se.items, true)} min</button></div>
      ${sessionPreview(se, who, quick)}
      <button class="btn primary block big" data-a="start" data-sid="${sid}">Start</button>
      ${canBoth ? `<button class="btn block" data-a="start-both">Start with ${esc(whoName(o))} too</button>` : ""}`;
  else next = `<p class="muted">No sessions in the rotation. Add them in Settings.</p>`;
  const load = classLoad(k), days = planDays(who, k), nextDay = days.find((x) => x > k);
  return `
    ${load.heavy ? `<section class="hint warn"><b>Class day: ${load.n} classes.</b> No gym or squash planned today.${nextDay ? ` Next gym day: ${esc(fmtDay(nextDay).split(",")[0])}.` : ""} You can still start a workout below if a class gets cancelled.</section>` : ""}
    <section class="card">${next}</section>
    <section class="card"><div class="spread"><span class="eyebrow">This week</span><span class="num small"><b>${wc}</b> of ${WEEK_GOAL}</span></div>
      ${weekStrip(who)}
      <p class="small muted">${wc >= WEEK_GOAL ? "Goal done. Anything more is a bonus." : `Three a week is what shows in the mirror. ${WEEK_GOAL - wc} to go.`}</p>
      <button class="btn small ${walked ? "good" : ""}" data-a="act">${walked ? "Walk logged today" : "No gym today? Log a 30-minute walk"}</button></section>
    ${others.length ? `<section class="card"><span class="eyebrow">Do a different one</span><div class="opts wrap">${others.map(([id, s]) => `<button class="opt" data-a="start" data-sid="${id}">${esc(s.name)}</button>`).join("")}</div>
      <button class="linkish small muted" data-a="skip">Skip ${esc(se?.name || "this one")} in the rotation</button></section>` : ""}
    ${history.length ? `<section class="card"><span class="eyebrow">Recent</span>${history.map((h) => `<div class="spread small"><span>${fmtDay(h.date)} · ${esc(p.sessions[h.session]?.name || h.session)}</span><span class="muted num">${h.items.reduce((a, it) => a + it.sets.filter((s) => s.done).length, 0)} sets${h.end ? ` · ${Math.min(999, Math.round((h.end - h.start) / 60000))} min` : ""}</span></div>`).join("")}</section>` : ""}`;
}
function renderTrain() {
  const w = activeWorkout();
  return whoSwitch() + (w ? workoutHTML(w) : trainStartHTML());
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
    if (se && se.items.some((it) => (swapsFor()[it.ex] || it.ex) === id)) return se.name;
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
Object.assign(actions, {
  who: (b) => { ui.who = b.dataset.v; try { localStorage.setItem(KEY + ".who", ui.who); } catch {} closeSheet(); render(); },
  quick: (b) => { ui.quick = b.dataset.v === "1"; render(); },
  start: (b) => {
    if (b.dataset.who) ui.who = b.dataset.who;
    ui.tab = "train";
    if (activeWorkout()) toast("Finish the current workout first");
    else { beginWorkout(b.dataset.sid, ui.who, ui.quick); wakeLock(true); }
    save(); render(); window.scrollTo(0, 0);
  },
  "start-both": () => {
    const k = curKey();
    for (const who of ["ronit", "yashvi"]) { const sid = currentSessionId(who); if (sid && sid !== "REST" && !activeWorkout(who) && !workoutsOn(k, who).length) beginWorkout(sid, who, ui.quick); }
    ui.tab = "train"; wakeLock(true); save(); render(); window.scrollTo(0, 0);
    toast("Both started. Tap a name to switch.");
  },
  finish: () => finishWorkout(),
  discard: () => {
    if (ui.confirm !== "discard") { ui.confirm = "discard"; return render(); }
    ui.confirm = null; S.workouts = S.workouts.filter((w) => w.id !== S.activeBy[ui.who]); S.activeBy[ui.who] = null;
    save(); stopRest(); if (!S.activeBy.ronit && !S.activeBy.yashvi) wakeLock(false); render();
  },
  blk: (b) => { const w = activeWorkout(); if (!w) return; (ui.cur ??= {})[w.id] = +b.dataset.i; render(); scrollToBlock(+b.dataset.i); },
  "set-done": (b) => {
    const w = activeWorkout(); if (!w) return;
    const i = +b.dataset.i, j = +b.dataset.j, it = w.items[i], s = it.sets[j];
    const rIn = document.getElementById(`r-${i}-${j}`), wIn = document.getElementById(`w-${i}-${j}`), was = s.w;
    if (rIn) s.r = rIn.value; if (wIn) s.w = wIn.value;
    s.done = !s.done;
    if (!s.done) { stopRest(); save(); return render(); }
    Native.haptic("tap");
    if (!s.r && !isCardio(it.ex)) s.r = String(rIn?.placeholder || topRep(it.reps) || "");
    // The weight just used becomes the default for the sets still to come.
    if (s.w) for (const x of it.sets.slice(j + 1)) if (!x.done && (x.w === "" || x.w === was)) x.w = s.w;
    const bs = blocksOf(w), bi = bs.findIndex((x) => x.includes(i)), blk = bs[bi];
    let restSec = isCardio(it.ex) ? 0 : it.rest, jump = -1;
    if (blk.length === 2) {
      const [a, c] = blk, partner = w.items[i === a ? c : a];
      if (i === a) restSec = partner.sets[j] && !partner.sets[j].done ? 0 : partner.rest || it.rest;
      else restSec = it.rest || partner.rest;
    }
    if (blockDone(w, blk)) {
      jump = bs.findIndex((x) => !blockDone(w, x));
      (ui.cur ??= {})[w.id] = jump < 0 ? bi : jump;
      if (jump < 0) { restSec = 0; toast("All sets done. Tap Finish."); }
    }
    startRest(restSec);
    save(); render();
    if (jump >= 0) scrollToBlock(jump);
  },
  act: (b) => {
    const who = b.dataset.who || ui.who, k = curKey(), m = ((S.act ??= {})[who] ??= {});
    if (m[k]) delete m[k]; else m[k] = "walk";
    save(); render();
  },
});
