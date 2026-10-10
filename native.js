"use strict";
// Native layer for the iPhone build (Capacitor). Every function is a no-op in the
// browser, so the same files run on GitHub Pages and inside the app.
const Native = (() => {
  const C = window.Capacitor;
  const on = !!(C && typeof C.isNativePlatform === "function" && C.isNativePlatform());
  const plug = (name) => (on && typeof C.registerPlugin === "function" ? C.registerPlugin(name) : null);
  const LN = plug("LocalNotifications"), Pref = plug("Preferences"), Hap = plug("Haptics"), AppP = plug("App"), Alarm = plug("CapgoAlarm");
  const ALARM_KEY = "infinity.alarms";
  const REST_ID = 990001;

  // ---- storage mirror: a second copy of the data in iOS app storage ----
  let mirrorTimer = null;
  function mirror(json) {
    if (!Pref) return;
    clearTimeout(mirrorTimer);
    mirrorTimer = setTimeout(() => Pref.set({ key: "state", value: json }).catch(() => {}), 800);
  }
  async function loadMirror() {
    if (!Pref) return null;
    try { const r = await Pref.get({ key: "state" }); return r && r.value ? JSON.parse(r.value) : null; } catch { return null; }
  }

  // ---- haptics ----
  function haptic(kind = "tap") {
    if (!Hap) { try { navigator.vibrate?.(kind === "done" ? [200, 100, 200] : 30); } catch {} return; }
    if (kind === "done") Hap.notification({ type: "SUCCESS" }).catch(() => {});
    else Hap.impact({ style: kind === "heavy" ? "HEAVY" : "MEDIUM" }).catch(() => {});
  }

  // ---- reminders (local notifications) ----
  const nid = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (Math.abs(h) % 900000) + 1000; };
  let permAsked = false;
  async function syncReminders(items) {
    // items: [{ key, at: Date, title, body }]
    if (!LN) return { ok: false, why: "web" };
    try {
      if (!permAsked) { permAsked = true; const p = await LN.checkPermissions(); if (p.display !== "granted") await LN.requestPermissions(); }
      const pending = await LN.getPending();
      const ours = (pending.notifications || []).filter((n) => n.id !== REST_ID);
      if (ours.length) await LN.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
      const now = Date.now();
      const list = items.filter((x) => x.at.getTime() > now + 15e3).slice(0, 60)
        .map((x) => ({ id: nid(x.key), title: x.title, body: x.body || "", schedule: { at: x.at, allowWhileIdle: true }, sound: "default" }));
      if (list.length) await LN.schedule({ notifications: list });
      return { ok: true, count: list.length };
    } catch (e) { return { ok: false, why: e.message || String(e) }; }
  }
  async function restNotice(seconds) {
    if (!LN) return;
    try {
      await LN.cancel({ notifications: [{ id: REST_ID }] });
      if (seconds > 0) await LN.schedule({ notifications: [{ id: REST_ID, title: "Rest over", body: "Next set", schedule: { at: new Date(Date.now() + seconds * 1000), allowWhileIdle: true }, sound: "default" }] });
    } catch {}
  }

  // ---- real alarms (AlarmKit via @capgo/capacitor-alarm, iOS 26+) ----
  // The plugin sets one-off alarms for the next time a clock time comes round, so each
  // app open re-arms anything that has fired or changed.
  const readAlarms = () => { try { return JSON.parse(localStorage.getItem(ALARM_KEY)) || {}; } catch { return {}; } };
  const writeAlarms = (m) => { try { localStorage.setItem(ALARM_KEY, JSON.stringify(m)); } catch {} };
  async function syncAlarms(wanted) {
    // wanted: [{ key, hour, minute, label }]
    if (!Alarm) return { ok: false, why: "web" };
    try {
      const info = await Alarm.getOSInfo();
      if (!info.supportsNativeAlarms) return { ok: false, why: "needs iOS 26" };
      const perm = await Alarm.checkPermissions();
      if (!perm.granted) { const r = await Alarm.requestPermissions(); if (!r.granted) return { ok: false, why: "alarm permission denied" }; }
      const live = new Set(((await Alarm.getAlarms()).alarms || []).map((a) => a.id));
      const mine = readAlarms(), next = {};
      for (const w of wanted) {
        const have = mine[w.key];
        if (have && live.has(have.id) && have.hour === w.hour && have.minute === w.minute) { next[w.key] = have; continue; }
        if (have && live.has(have.id)) await Alarm.cancelAlarm({ id: have.id }).catch(() => {});
        const r = await Alarm.createAlarm({ hour: w.hour, minute: w.minute, label: w.label });
        if (r.success && r.id) next[w.key] = { id: r.id, hour: w.hour, minute: w.minute };
      }
      for (const [k, v] of Object.entries(mine)) if (!next[k] && live.has(v.id)) await Alarm.cancelAlarm({ id: v.id }).catch(() => {});
      writeAlarms(next);
      return { ok: true, count: Object.keys(next).length };
    } catch (e) { return { ok: false, why: e.message || String(e) }; }
  }

  // ---- app events: deep links (infinity://health?steps=..&sleep=..) and resume ----
  function listen({ onUrl, onResume }) {
    if (!AppP) return;
    AppP.addListener("appUrlOpen", (e) => { try { onUrl(new URL(e.url)); } catch {} });
    AppP.addListener("resume", () => onResume && onResume());
    AppP.getLaunchUrl?.().then((r) => { if (r && r.url) { try { onUrl(new URL(r.url)); } catch {} } }).catch(() => {});
  }

  return { on, mirror, loadMirror, haptic, syncReminders, restNotice, syncAlarms, listen };
})();
