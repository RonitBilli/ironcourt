"use strict";
// ================= TODAY =================
// One screen that answers "what now?": the workout for both people, the week so far,
// the next meal to log, anything the cook is waiting for, then the day's timeline.
function personRow(who, k) {
  const p = P(), aw = activeWorkout(who), done = workoutsOn(k, who), sid = currentSessionId(who), se = p.sessions[sid];
  let name = "", sub = "", right = "";
  if (aw) { name = p.sessions[aw.session]?.name || "Workout"; sub = "In progress"; right = `<button class="btn small primary" data-a="go" data-tab="train" data-who="${who}">Continue</button>`; }
  else if (done.length) { name = done.map((w) => p.sessions[w.session]?.name || "Workout").join(", "); sub = "Done today"; right = `<span class="chip good">Done</span>`; }
  else if (sid === "REST") { name = "Rest day"; sub = "A walk still counts"; }
  else if (who === "ronit" && classLoad(k).heavy) { name = "Class day"; sub = `${classLoad(k).n} classes · no gym or squash today`; right = `<span class="chip">Rest</span>`; }
  else if (se) { name = se.name; sub = `About ${estMin(se.items, false)} min · ${se.focus}`; right = `<button class="btn small" data-a="start" data-sid="${sid}" data-who="${who}">Start</button>`; }
  else { name = "No session set"; sub = "Add one in Settings"; }
  return `<div class="prow">${avatar(who)}<div class="grow"><b>${esc(name)}</b><span class="small">${esc(sub)}</span></div>${right}</div>`;
}
// The meal to log now: the latest one that's due and not logged, else the next one coming.
function dueSlot(d, k) {
  const open = P().meals.filter((m) => !d.eaten[m.id]);
  if (!open.length) return null;
  if (k !== todayKey()) return open[0];
  const now = nowMins(), due = open.filter((m) => mins(m.time) <= now + 45);
  return due.length ? due[due.length - 1] : open[0];
}
function renderToday() {
  const k = curKey(), d = day(k), p = P(), t = totals(d), isToday = k === todayKey();
  const classes = classItems(k), plan = dayPlan(k), busy = busyOf(plan.load.ev);
  const cook = cookReminders(k).map((it) => { const t = fitAround(mins(it.time), 5, busy); return t === mins(it.time) ? it : { ...it, time: toHM(t) }; });
  const sched = [...plan.items.map((it) => ({ ...it, clash: it.kind === "squash" ? clashWith(it, classes) : "" })), ...cook, ...classes].sort((a, b) => mins(a.time) - mins(b.time));
  const now = nowMins();
  let nowIdx = -1;
  if (isToday) sched.forEach((it, i) => { if (mins(it.time) <= now) nowIdx = i; });
  const doneW = workoutsOn(k).length > 0, aw = activeWorkout("ronit");
  const sent = (it) => !!S.week[weekOf(it.go.k)]?.sent?.[`${it.go.k}.${it.go.meal}`];
  const checked = (it) => (it.kind === "meal" ? !!d.eaten[it.ref] : it.kind === "gym" ? !!d.checks[it.id] || doneW : it.go && it.go.meal ? sent(it) : !!d.checks[it.id]);
  const both = !plan.off && ["ronit", "yashvi"].every((w) => !activeWorkout(w) && !workoutsOn(k, w).length && p.sessions[currentSessionId(w)]);
  const nudges = isToday ? cook.filter((x) => x.go?.meal && !sent(x) && mins(x.time) <= now) : [];
  const gymLine = plan.off ? `Class day · ${plan.load.n} classes, ${Math.round(plan.load.hours)} hours` : plan.noSlot ? "Gym · no free hour between classes today" : plan.gymTime ? `Gym · ${fmtTime(plan.gymTime)}${plan.gymMoved ? " · moved around your class" : ""}` : "Gym";
  const nextGym = plan.off ? planDays("ronit", k).find((x) => x > k) : null;
  const slot = dueSlot(d, k), party = isParty(k);
  const pp = Math.min(100, (t.protein / p.targets.protein) * 100);
  const sid = currentSessionId("ronit");

  return `
    ${recoveryHint(k)}
    <section class="card hero"><span class="eyebrow">${esc(gymLine)}</span>
      ${personRow("ronit", k)}${personRow("yashvi", k)}
      ${both ? `<button class="btn primary block" data-a="start-both">Start together</button>` : ""}
      ${plan.off ? `<p class="small">Classes run ${fmtTime(hhmm(plan.load.ev[0].s))} to ${fmtTime(hhmm(plan.load.ev[plan.load.ev.length - 1].e))}.${nextGym ? ` Next gym day: ${esc(fmtDay(nextGym).split(",")[0])}.` : ""}</p>` : ""}</section>
    ${nudges.map((x) => `<button class="nudge" data-a="tl-go" data-id="${x.id}"><span class="grow"><b>${esc(x.title)}</b><span class="small">${esc(x.sub || "")}</span></span><span class="go">›</span></button>`).join("")}

    <section class="card"><div class="spread"><span class="eyebrow">This week</span><span class="small muted">goal: ${WEEK_GOAL} each</span></div>
      ${["ronit", "yashvi"].map((w) => `<div class="wkrow">${avatar(w)}${weekStrip(w, k)}<b class="num">${weekCount(w, k)}/${WEEK_GOAL}</b></div>`).join("")}
      <div class="legend small muted"><i class="plan"></i>suggested gym day<i class="off"></i>class day, no gym</div>
      <div class="row">${["ronit", "yashvi"].map((w) => `<button class="btn small grow ${S.act?.[w]?.[k] ? "good" : ""}" data-a="act" data-who="${w}">${esc(whoName(w))} ${S.act?.[w]?.[k] ? "walked" : "walked 30 min?"}</button>`).join("")}</div></section>

    <section class="card"><div class="spread"><span class="eyebrow">Food · ${esc(whoName("ronit"))}</span><button class="linkish small" data-a="go" data-tab="food">All meals ›</button></div>
      <div class="spread"><div class="bignum num">${t.protein}<small> / ${p.targets.protein} g protein</small></div><span class="small muted num">${t.kcal} kcal</span></div>
      <div class="bar ${pp >= 100 ? "good" : ""}"><i style="width:${pp}%"></i></div>
      ${slot ? mealCard(slot, d, k) : `<p class="small muted">Every meal is logged.</p>`}</section>

    ${party ? partyCardHTML(k, d) : ""}

    <section class="card"><div class="spread"><h2>Schedule</h2>${classes.length ? `<span class="chip">${classes.length} class${classes.length > 1 ? "es" : ""}</span>` : ""}</div><div class="timeline">
      ${sched.map((it, i) => {
        const on = checked(it);
        let sub = "";
        if (it.kind === "meal") { const sl = p.meals.find((m) => m.id === it.ref); if (sl) { const o = mealShown(sl, d, k); sub = `${o.veg ? '<i class="veg"></i>' : ""}${esc(o.name)} · ${o.protein} g`; } }
        if (it.sub) sub = esc(it.sub);
        if (it.kind === "gym") sub = aw ? "In progress" : doneW ? "Logged" : sid === "REST" ? "Rest day" : esc(p.sessions[sid]?.name || "");
        if (it.moved && !it.cls) sub = `Moved for class${sub ? " · " + sub : ""}`;
        if (it.clash) sub = `<b class="warn-text">Clashes with ${esc(it.clash)}</b>${sub ? " · " + sub : ""}`;
        return `<div class="tl ${i === nowIdx ? "now" : ""} ${on ? "done" : ""} ${it.cls ? "cls" : ""}">
          <span class="t">${fmtTime(it.time)}</span><span class="dot k-${it.kind}"></span>
          <div class="what" ${it.go ? `data-a="tl-go" data-id="${it.id}" role="button" tabindex="0"` : ""}><b>${esc(it.title)}${it.go ? " ›" : ""}</b>${sub ? `<span>${sub}</span>` : ""}</div>
          ${it.cls ? `<span class="chip">Class</span>` : `<button class="check ${on ? "on" : ""}" data-a="${it.dyn ? "dcheck" : "tcheck"}" data-id="${it.id}" aria-label="Mark ${esc(it.title)} done"></button>`}</div>`;
      }).join("")}
    </div></section>

    <div class="row wrap foot">${party ? "" : `<button class="btn small ghost" data-a="party-toggle">Party tonight?</button>`}
      <button class="btn small ghost" data-a="reset-day" data-w="0">${ui.confirm === "reset-day-0" ? "Tap again to reset" : "Reset this day"}</button></div>`;
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
// Squash on a lighter class day keeps its time; if it overlaps a class, that is flagged.
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
    for (const it of [...dayPlan(k).items, ...cookReminders(k)]) {
      if (it.notify === false) continue;
      if (i === 0 && d && (d.checks?.[it.id] || (it.kind === "meal" && d.eaten?.[it.ref]))) continue;
      const [h, m] = it.time.split(":").map(Number);
      const at = parseKey(k); if (h < 4) at.setDate(at.getDate() + 1); at.setHours(h, m, 0, 0);
      let body = it.sub || "";
      if (it.kind === "meal") { const slot = P().meals.find((x) => x.id === it.ref); if (slot) body = mealOpt(slot, d || { choice: {}, key: k }, k).name; }
      if (it.kind === "gym") { const sid = currentSessionId("ronit"); body = sid === "REST" ? "Rest day in the rotation" : P().sessions[sid]?.name || ""; }
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
  const sessions = S.workouts.filter((w) => w.done && ks.includes(w.date) && whoOf(w) === "ronit").length;
  const protDays = ks.filter((k) => S.days[k] && totals(S.days[k]).protein >= p.targets.protein).length;
  const drinks = ks.reduce((a, k) => a + drinksOf(S.days[k]), 0);
  const dryDays = ks.filter((k) => S.days[k] && drinksOf(S.days[k]) === 0).length;
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const sleep = avg(ds.filter((d) => d.sleep).map((d) => +d.sleep));
  const steps = avg(ds.filter((d) => d.steps).map((d) => +d.steps));
  const prot = avg(ds.map((d) => totals(d).protein).filter((v) => v > 0));
  return { sessions, protDays, drinks, dryDays, sleep, steps, prot };
}
const MEAS = {
  ronit: [["weight", "Weight", "kg"], ["waist", "Waist at navel", "cm"], ["arm", "Arm, flexed", "cm"]],
  yashvi: [["weight", "Weight", "kg"], ["waist", "Waist at navel", "cm"], ["lowbelly", "Lower belly (widest)", "cm"], ["hips", "Hips (widest)", "cm"], ["thigh", "Thigh (widest)", "cm"]],
};
function measCard() {
  const list = ((S.meas ??= { ronit: [], yashvi: [] })[ui.who] ??= []), fields = MEAS[ui.who];
  const last = list[list.length - 1], first = list[0];
  const due = !last || diffDays(curKey(), last.date) >= 7;
  const change = (f) => { if (!first || first === last || first[f] == null || last[f] == null) return ""; const d = +(last[f] - first[f]).toFixed(1); return ` <span class="${d < 0 || (f === "arm" && d > 0) ? "goodtxt" : "muted"}">(${d > 0 ? "+" : ""}${d})</span>`; };
  const summary = last ? fields.filter(([f]) => last[f] != null).map(([f, l, u]) => `<div class="spread small"><span>${l}</span><span class="num"><b>${last[f]} ${u}</b>${change(f)}</span></div>`).join("") : "";
  const form = `<div class="grid2">${fields.map(([f, l, u]) => `<div class="field"><label for="m-${f}">${l} (${u})</label><input id="m-${f}" type="number" inputmode="decimal" step="0.1" placeholder="${last?.[f] ?? ""}"></div>`).join("")}</div>
    <p class="small muted">Sunday morning, before food, tape snug not tight.</p>
    <button class="btn primary block" data-a="meas-save">Save check-in</button>`;
  return `<details class="sec" ${due ? "open" : ""}><summary><span><b>Weekly check-in</b><br><span class="small muted">${last ? `Last: ${fmtDay(last.date)}${first !== last ? ` · change since ${fmtDay(first.date)}` : ""}` : "Measure once now, then every Sunday"}</span></span></summary><div class="body">${summary}${due || ui.open.measForm ? form : `<button class="btn small ghost" data-a="meas-again">Add one now</button>`}</div></details>`;
}
// Eight weeks, one row each. Lime = gym, soft = walk or squash.
function heatHTML(who, weeks = 8) {
  const t = todayKey(), mon0 = addDays(weekOf(t), -7 * (weeks - 1));
  let rows = "";
  for (let r = 0; r < weeks; r++) {
    const mon = addDays(mon0, r * 7), md = parseKey(mon);
    let n = 0, cells = "";
    for (let i = 0; i < 7; i++) {
      const k = addDays(mon, i), g = workoutsOn(k, who).length > 0, a = !g && activeOn(k, who);
      if (g) n++;
      cells += `<i class="${g ? "gym" : a ? "act" : ""}${k === t ? " today" : ""}${k > t ? " future" : ""}"></i>`;
    }
    rows += `<div class="hrow"><span class="small muted num">${md.getDate()} ${md.toLocaleDateString("en-IN", { month: "short" })}</span>${cells}<b class="num ${n >= WEEK_GOAL ? "goodtxt" : "muted"}">${n}</b></div>`;
  }
  return `<div class="heat"><div class="hrow head"><span></span>${"MTWTFSS".split("").map((c) => `<span>${c}</span>`).join("")}<span></span></div>${rows}</div>
    <div class="legend small muted"><i class="gym"></i>gym<i class="act"></i>walk or squash</div>`;
}
function liftsHTML(who) {
  const by = {};
  for (const w of S.workouts.filter((x) => x.done && whoOf(x) === who)) for (const it of w.items) {
    const done = it.sets.filter((s) => s.done && +s.w && +s.r); if (!done.length) continue;
    const top = done.reduce((a, s) => (e1rm(s) > e1rm(a) ? s : a));
    (by[it.ex] ??= []).push({ v: e1rm(top), txt: `${top.w} × ${top.r}` });
  }
  const rows = Object.entries(by).filter(([, a]) => a.length >= 2).sort((a, b) => b[1].length - a[1].length).slice(0, 8);
  if (!rows.length) return `<p class="small muted">Do the same exercise in two workouts and it shows up here.</p>`;
  return rows.map(([ex, arr]) => {
    const a = arr[0], b = arr[arr.length - 1], ch = ((b.v - a.v) / a.v) * 100;
    return `<div class="lift"><div class="grow"><b>${esc(exInfo(ex).name)}</b><span class="small muted num">${esc(a.txt)} → ${esc(b.txt)} · ${arr.length} sessions</span></div><b class="num ${ch > 0.5 ? "goodtxt" : ch < -0.5 ? "warn-text" : "muted"}">${ch > 0 ? "+" : ""}${ch.toFixed(0)}%</b></div>`;
  }).join("");
}

// Progress photos live in the browser's own database on this phone, never in the backup.
const Photos = (() => {
  let dbp;
  const db = () => (dbp ??= new Promise((res, rej) => { const r = indexedDB.open("infinity-photos", 1); r.onupgradeneeded = () => r.result.createObjectStore("p", { keyPath: "id" }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction("p", mode), rq = fn(t.objectStore("p")); t.oncomplete = () => res(rq.result); t.onerror = () => rej(t.error); }); };
  return { put: (rec) => tx("readwrite", (s) => s.put(rec)), all: () => tx("readonly", (s) => s.getAll()), del: (id) => tx("readwrite", (s) => s.delete(id)) };
})();
async function loadPhotos() {
  try {
    const all = await Photos.all();
    (ui.photos || []).forEach((x) => URL.revokeObjectURL(x.url));
    ui.photos = all.map((x) => ({ id: x.id, who: x.who, date: x.date, url: URL.createObjectURL(x.blob) }));
  } catch { ui.photos = []; }
}
async function addPhoto(file) {
  if (!file) return;
  try {
    const bmp = await createImageBitmap(file), sc = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.82));
    await Photos.put({ id: `${ui.who}.${todayKey()}`, who: ui.who, date: todayKey(), blob });
    await loadPhotos(); toast("Photo saved on this phone"); render();
  } catch { toast("Couldn't read that photo"); }
}
document.addEventListener("change", (e) => { if (e.target.id === "photoFile") addPhoto(e.target.files[0]); });
function photosHTML(who) {
  const list = (ui.photos || []).filter((x) => x.who === who).sort((a, b) => (a.date < b.date ? -1 : 1));
  const first = list[0], last = list.length > 1 ? list[list.length - 1] : null;
  const fig = (x, l) => `<figure><img src="${x.url}" alt="${l} photo"><figcaption>${l} · ${esc(fmtDay(x.date))}</figcaption></figure>`;
  return `<section class="card"><div class="spread"><h2>Photos</h2><label class="btn small" for="photoFile">+ Add photo</label><input type="file" id="photoFile" accept="image/*" hidden></div>
    ${first ? `<div class="photos">${fig(first, "First")}${last ? fig(last, "Latest") : `<figure class="empty"><span class="small muted">Add another next week to compare</span></figure>`}</div>` : `<p class="small muted">Same spot, same light, once a week. The first and the latest photo sit side by side here, which shows change the scale hides.</p>`}
    <div class="spread"><span class="small muted">Stays on this phone only, not in the backup.</span>${list.length ? `<button class="linkish small muted" data-a="photo-del">${ui.confirm === "photo-del" ? "Tap again to delete" : "Delete latest"}</button>` : ""}</div></section>`;
}
function renderProgress() {
  const who = ui.who, k = todayKey(), wc = weekCount(who);
  const last28 = new Set(S.workouts.filter((x) => x.done && whoOf(x) === who && diffDays(k, x.date) >= 0 && diffDays(k, x.date) < 28).map((x) => x.date)).size;
  let food = "";
  if (who === "ronit") {
    const ws = weightSeries(), st = weekStats(k);
    const lastDrink = Object.keys(S.days).filter((x) => drinksOf(S.days[x]) > 0).sort().pop();
    const f1 = (v, n = 1) => (v == null ? "–" : v.toFixed(n));
    food = `<section class="card"><h2>Food, last 7 days</h2><div class="stats">
        <div class="stat"><b>${st.protDays}/7</b><span>protein days</span></div>
        <div class="stat"><b>${f1(st.prot, 0)}</b><span>avg protein g</span></div>
        <div class="stat"><b>${st.drinks}</b><span>drinks</span></div></div>
      <p class="small muted">${lastDrink ? `Last drink logged ${diffDays(k, lastDrink)} days ago.` : "No drinks logged."}</p>
      ${ws.length >= 2 ? chart(ws) : ""}
      <button class="btn small" data-a="week-copy">Copy week summary</button></section>`;
  }
  return `${whoSwitch()}
    <section class="card"><div class="spread"><h2>Consistency</h2><span class="chip ${wc >= WEEK_GOAL ? "good" : ""}">${wc} of ${WEEK_GOAL} this week</span></div>
      ${heatHTML(who)}
      <p class="small muted">${last28} workout${last28 === 1 ? "" : "s"} in the last 4 weeks, about ${(last28 / 4).toFixed(1)} a week. Three a week is the number that changes how you look.</p></section>
    <section class="card"><h2>Strength</h2>${liftsHTML(who)}<p class="small muted">Best set each session (kg × reps), first against latest.</p></section>
    ${measCard()}
    ${photosHTML(who)}
    ${food}`;
}
function weekSummary() {
  const k = todayKey(), st = weekStats(k), ws = weightSeries(), p = P();
  const lines = [`Infinity week ending ${fmtDay(k)} (${p.mode} mode)`];
  const last = ws[ws.length - 1], ago = ws.filter((s) => diffDays(k, s.k) >= 7).pop();
  if (last) lines.push(`Weight 7-day avg: ${last.avg.toFixed(1)} kg${ago ? ` (week ago ${ago.avg.toFixed(1)})` : ""}`);
  lines.push(`Workouts: ${st.sessions}. Protein target hit: ${st.protDays}/7 days (avg ${st.prot ? st.prot.toFixed(0) : "–"} g). Drinks: ${st.drinks}. Avg sleep: ${st.sleep ? st.sleep.toFixed(1) : "–"} h. Avg steps: ${st.steps ? Math.round(st.steps) : "–"}.`);
  for (let i = 6; i >= 0; i--) {
    const dk = addDays(k, -i), d = S.days[dk];
    const ws2 = S.workouts.filter((w) => w.done && w.date === dk && whoOf(w) === "ronit");
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
  const sessIds = Object.keys(p.sessions).filter((id) => !p.sessions[id].hidden);
  ui.editSession ??= sessIds[0];
  const es = p.sessions[ui.editSession];

  const mode = `<div class="seg wrap"><button class="${p.mode === "cut" ? "on" : ""}" data-a="mode" data-v="cut">Cut (4-5 days)</button><button class="${p.mode === "term" ? "on" : ""}" data-a="mode" data-v="term">Term (3 days)</button></div>
    <p class="small muted">Cut and Term are the upper/lower and full-body programs. The second person's glutes & legs program lives on the Train tab's second switch.</p>
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
  const rotHead = `<div class="spread"><span class="small muted">Editing</span>${whoSwitch()}</div>`;
  const rotEd = `<div class="stack">${rot.map((x, i) => `<div class="row"><span class="grow">${i + 1}. ${x === "REST" ? "Rest day" : esc(p.sessions[x]?.name || x)}</span>
      <button class="icon-btn" data-a="rot-move" data-i="${i}" data-v="-1" aria-label="Up">↑</button><button class="icon-btn" data-a="rot-move" data-i="${i}" data-v="1" aria-label="Down">↓</button><button class="icon-btn" data-a="rot-del" data-i="${i}" aria-label="Remove">✕</button></div>`).join("")}</div>
    <div class="row"><select id="rotAdd" class="grow" aria-label="Add to rotation"><option value="REST">Rest day</option>${sessIds.map((id) => `<option value="${id}">${esc(p.sessions[id].name)}</option>`).join("")}</select><button class="btn small" data-a="rot-add">Add</button></div>`;

  const sessEd = `<div class="row"><select id="sessPick" class="grow" data-a-change="sess-pick">${sessIds.map((id) => `<option value="${id}" ${id === ui.editSession ? "selected" : ""}>${esc(p.sessions[id].name)}</option>`).join("")}</select><button class="btn small" data-a="sess-new">+ New</button></div>
    ${es ? `<div class="grid2"><div class="field"><label>Name</label>${inp(`plan.sessions.${ui.editSession}.name`, es.name)}</div><div class="field"><label>Focus</label>${inp(`plan.sessions.${ui.editSession}.focus`, es.focus)}</div></div>
    ${es.items.map((it, i) => `<div class="edit-row">
      <div class="row"><select id="f-sx-${i}" class="grow" data-bind="plan.sessions.${ui.editSession}.items.${i}.ex" data-type="str">${exOptions(it.ex)}</select></div>
      <div class="row"><div class="field grow"><label>Sets</label>${inp(`plan.sessions.${ui.editSession}.items.${i}.sets`, it.sets, "num")}</div><div class="field grow"><label>Reps</label>${inp(`plan.sessions.${ui.editSession}.items.${i}.reps`, it.reps)}</div><div class="field grow"><label>Rest s</label>${inp(`plan.sessions.${ui.editSession}.items.${i}.rest`, it.rest, "num")}</div></div>
      <div class="row small wrap"><label class="row"><input type="checkbox" id="f-ss-${i}" style="width:auto" ${it.ss ? "checked" : ""} data-bind="plan.sessions.${ui.editSession}.items.${i}.ss" data-type="bool"> Pair with the next one</label>
        <label class="row"><input type="checkbox" id="f-fu-${i}" style="width:auto" ${it.full ? "checked" : ""} data-bind="plan.sessions.${ui.editSession}.items.${i}.full" data-type="bool"> Skip in the quick version</label></div>
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
  const diet = `<div class="grid2"><div class="field"><label>Non-veg person</label>${inp("plan.household.me", h.me)}</div><div class="field"><label>Veg person</label>${inp("plan.household.partner", h.partner)}</div></div>
    <div class="field"><label>Whose phone is this?</label><div class="seg"><button class="${h.iam !== "veg" ? "on" : ""}" data-a="iam" data-v="nonveg">${esc(h.me || "Non-veg person")}</button><button class="${h.iam === "veg" ? "on" : ""}" data-a="iam" data-v="veg">${esc(h.partner || "Veg person")}</button></div>
      <p class="small muted">Decides whose plate counts toward calories and protein on non-veg nights.</p></div>
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
  const classes = `<p class="small muted">Your day is fitted around your Outlook classes: the gym moves to a free hour, meals shift out of lectures, wake-up and bedtime follow the first class, and a day with 4 or more classes (or 6 hours of them) has no gym or squash. Uses your calendar's published link. On the home-screen app, GitHub fetches it every 3 hours into your private backup repo (needs the GitHub backup set up below).</p>
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
    <div class="field"><label for="ghFolder">Backup folder</label><input id="ghFolder" type="text" value="${esc(gh.folder || "data")}" data-a-change="gh" data-f="folder" autocomplete="off">
      <span class="small muted">Leave as <code>data</code> on the first phone. On a second person's phone use their name (e.g. <code>partner</code>), so the two never overwrite each other.</span></div>
    <div class="field"><label for="ghRepo">Private repo (owner/name)</label><input id="ghRepo" type="text" value="${esc(gh.repo || "")}" data-a-change="gh" data-f="repo" placeholder="your-username/ironcourt-data" autocomplete="off"></div>
    <div class="field"><label for="ghTok">Access token</label><input id="ghTok" type="password" value="${gh.token ? "••••••••" : ""}" data-a-change="gh" data-f="token" placeholder="github_pat_…" autocomplete="off"></div>
    <p class="small ${meta.err ? "" : "muted"}">${meta.err ? `<b>Last attempt failed:</b> ${esc(meta.err)}` : meta.last ? `Last backup: ${new Date(meta.last).toLocaleString("en-IN")}` : "No backup yet."}</p>
    <div class="row wrap"><button class="btn primary" data-a="gh-backup">Back up now</button><button class="btn" data-a="gh-restore">${ui.confirm === "gh-restore" ? "Tap again: replace this phone's data" : "Restore from GitHub"}</button></div>
    <span class="eyebrow">File backup</span>
    <p class="small muted">Your data lives on this phone. Export a backup every week or two, and before deleting the app.</p>
    <div class="row wrap"><button class="btn primary" data-a="export">Export backup</button><label class="btn" for="importFile">Import backup</label><input type="file" id="importFile" accept="application/json,.json" hidden></div>
    <button class="btn ghost" data-a="reset">${ui.confirm === "reset" ? "Tap again: erase everything" : "Reset app"}</button>`;

  return `
    ${sec("targets", "Daily targets", targets, `${p.targets.kcal} kcal · ${p.targets.protein} g protein`)}
    ${sec("schedule", "Daily schedule", schedule, `${p.schedule.length} items`)}
    ${sec("rotation", "Workout rotation", rotHead + rotEd, `${esc(whoName(ui.who))} · ${rot.length} sessions`)}
    ${sec("sessions", "Workouts", sessEd, `${sessIds.length} sessions`)}
    ${sec("exercises", "Exercises, videos, swaps", exEd, `${Object.keys(p.exercises).length} exercises`)}
    ${sec("meals", "Meals", meals, "Options you can switch between each day")}
    ${sec("diet", "Household and cook", diet, `${esc(h.me || "You")} + ${esc(h.partner || "partner")} · ${h.nonveg} non-veg dinners a week`)}
    ${sec("party", "Party days", party, `${p.partyDates.length} dates`)}
    ${sec("phone", "Phone: reminders, alarms, Health", phone, Native.on ? "iPhone app" : "Website")}
    ${sec("classes", "Classes (Outlook)", classes, cs.url ? `${cs.n} events` : "Not connected")}
    ${sec("backup", "Backup", backup)}
    <p class="small muted" style="text-align:center">Infinity · your data stays on this phone, plus your own GitHub backup if you set one up</p>`;
}
Object.assign(actions, {
  "photo-del": async () => {
    if (ui.confirm !== "photo-del") { ui.confirm = "photo-del"; return render(); }
    ui.confirm = null;
    const mine = (ui.photos || []).filter((x) => x.who === ui.who).sort((a, b) => (a.date < b.date ? -1 : 1)).pop();
    if (mine) { await Photos.del(mine.id); await loadPhotos(); }
    render();
  },
});
