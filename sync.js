"use strict";
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
  if (ui.confirm && !["discard", "reset", "sess-del", "reset-day", "week-shuffle", "gh-restore", "photo-del"].includes(b.dataset.a)) ui.confirm = null;
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
// Each person's phone backs up into its own folder of the same private repo.
const ghFolder = () => (ghConf().folder || "data").replace(/[^\w-]/g, "") || "data";
const icsPath = () => (ghFolder() === "data" ? "config/ics-url.txt" : `config/ics-url-${ghFolder()}.txt`);
const classesPath = () => `${ghFolder()}/classes.json`;
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
      await ghPut(`${ghFolder()}/days/${k}.json`, text, meta);
      meta.days[k] = h;
      ghSaveMeta(meta);
    }
    await ghPut(`${ghFolder()}/state.json`, JSON.stringify(S), meta);
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
    const f = await ghApi("GET", `${ghFolder()}/state.json`);
    if (!f) return toast("No backup found in that repo");
    const data = JSON.parse(unb64(f.content));
    if (!data.plan || !data.days) throw new Error("backup file looks wrong");
    S = migrate(data); Store.save(S);
    const meta = ghMeta(); meta.sha[`${ghFolder()}/state.json`] = f.sha; ghSaveMeta(meta);
    toast("Restored from GitHub"); render();
  } catch (e) { toast(`Restore failed: ${e.message}`); }
}

Cal.useRemote(
  async () => { const f = await ghApi("GET", classesPath()); return f ? JSON.parse(unb64(f.content)) : null; },
  async (u) => { const c = ghConf(); if (!c.repo || !c.token) return; const meta = ghMeta(); await ghPut(icsPath(), u, meta); ghSaveMeta(meta); },
);
// ================= boot =================
if (S.activeBy?.ronit || S.activeBy?.yashvi) wakeLock(true);
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
// Photos load after first paint; the workout clock in the header ticks without a full redraw.
loadPhotos().then(() => { if (ui.tab === "progress") render(); });
setInterval(() => { const w = ui.tab === "train" && activeWorkout(), el = w && $("#wkClock"); if (el) el.textContent = wkMins(w); }, 20000);
