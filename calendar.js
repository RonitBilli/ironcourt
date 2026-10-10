"use strict";
// Outlook classes via the calendar's published ICS link. The link and the parsed events
// stay on this phone (they are not part of the GitHub backup).
const Cal = (() => {
  const URL_KEY = "infinity.icsUrl", CACHE_KEY = "infinity.icsCache";
  const get = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const url = () => (localStorage.getItem(URL_KEY) || "").trim();
  // On the website the browser can't read Outlook directly, so the link is saved to the private
  // GitHub repo, a GitHub job fetches the calendar every 3 hours, and the app reads its result.
  let remote = null, saveRemote = null;
  function useRemote(read, save) { remote = read; saveRemote = save; }
  async function setUrl(u) {
    const clean = u.trim().replace(/^webcal:/i, "https:");
    try { localStorage.setItem(URL_KEY, clean); localStorage.removeItem(CACHE_KEY); } catch {}
    if (!Native.on && saveRemote) await saveRemote(clean);
  }

  // ---- ICS parsing ----
  function unfold(text) { return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/); }
  function parseDate(val, params) {
    // 20261012T093000Z | 20261012T093000 (local / TZID) | 20261012 (all-day)
    const m = val.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
    if (!m) return null;
    const [, y, mo, d, h = "00", mi = "00", s = "00", z] = m;
    if (!m[4]) return { date: new Date(+y, +mo - 1, +d), allDay: true };
    if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)) };
    return { date: new Date(+y, +mo - 1, +d, +h, +mi, +s) }; // TZID times taken as phone-local (IST)
  }
  const DOW = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  function expand(ev, from, to) {
    // Supports DAILY / WEEKLY (BYDAY, INTERVAL, UNTIL, COUNT) and EXDATE. Enough for timetables.
    const out = [], dur = ev.end - ev.start;
    if (!ev.rrule) { if (ev.end >= from && ev.start <= to) out.push({ s: ev.start, e: ev.end }); return out; }
    const r = Object.fromEntries(ev.rrule.split(";").map((p) => p.split("=")));
    const until = r.UNTIL ? parseDate(r.UNTIL, {})?.date : null, count = r.COUNT ? +r.COUNT : Infinity, every = +(r.INTERVAL || 1);
    const days = r.BYDAY ? r.BYDAY.split(",").map((x) => DOW[x.slice(-2)]) : [ev.start.getDay()];
    let n = 0;
    const cur = new Date(ev.start);
    for (let i = 0; i < 800 && n < count; i++) {
      if (until && cur > until) break;
      if (cur > to) break;
      const weeks = Math.floor((cur - ev.start) / (7 * 864e5));
      const ok = r.FREQ === "DAILY" ? Math.round((cur - ev.start) / 864e5) % every === 0
        : r.FREQ === "WEEKLY" ? days.includes(cur.getDay()) && weeks % every === 0 : i === 0;
      if (ok) {
        n++;
        const s = new Date(cur), e = new Date(s.getTime() + dur);
        if (!ev.ex.some((x) => Math.abs(x - s) < 60e3) && e >= from) out.push({ s, e });
      }
      cur.setDate(cur.getDate() + 1);
      if (r.FREQ !== "DAILY" && r.FREQ !== "WEEKLY") break;
    }
    return out;
  }
  function parse(text, from, to) {
    const lines = unfold(text), evs = [];
    let ev = null;
    for (const line of lines) {
      if (line === "BEGIN:VEVENT") { ev = { ex: [] }; continue; }
      if (line === "END:VEVENT") { if (ev.start && !ev.cancelled && !ev.allDay) { ev.end ??= new Date(ev.start.getTime() + 3600e3); evs.push(ev); } ev = null; continue; }
      if (!ev) continue;
      const i = line.indexOf(":"); if (i < 0) continue;
      const [name, ...ps] = line.slice(0, i).split(";"), val = line.slice(i + 1);
      const params = Object.fromEntries(ps.map((p) => p.split("=")));
      if (name === "DTSTART") { const d = parseDate(val, params); if (d) { ev.start = d.date; ev.allDay = !!d.allDay; } }
      else if (name === "DTEND") { const d = parseDate(val, params); if (d) ev.end = d.date; }
      else if (name === "SUMMARY") ev.title = val.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/g, " ");
      else if (name === "LOCATION") ev.where = val.replace(/\\,/g, ",");
      else if (name === "RRULE") ev.rrule = val;
      else if (name === "EXDATE") val.split(",").forEach((v) => { const d = parseDate(v, params); if (d) ev.ex.push(d.date); });
      else if (name === "RECURRENCE-ID") ev.override = true;
      else if (name === "STATUS" && val === "CANCELLED") ev.cancelled = true;
    }
    const occ = [];
    for (const e of evs) for (const o of expand(e, from, to)) occ.push({ s: o.s.getTime(), e: o.e.getTime(), t: e.title || "Busy", w: e.where || "" });
    // Drop exact duplicates (overrides of recurring events can repeat the base occurrence).
    const seen = new Set();
    return occ.filter((o) => { const k = o.s + "|" + o.t; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.s - b.s);
  }

  async function refresh(force = false) {
    const u = url(); if (!u) return { ok: false, why: "no link" };
    const c = get(CACHE_KEY);
    if (!Native.on) {
      if (!remote) return { ok: false, why: "set up the GitHub backup first" };
      if (!force && c && Date.now() - (c.checked || 0) < 3600e3) return { ok: true, cached: true };
      try {
        const r = await remote();
        if (!r) { put(CACHE_KEY, { ...(c || { events: [] }), checked: Date.now(), err: "waiting for GitHub to fetch your calendar (about a minute after saving the link)" }); return { ok: false, why: "not fetched yet, try again in a minute" }; }
        put(CACHE_KEY, { at: r.at, events: r.events || [], err: r.err || "", checked: Date.now() });
        return r.err ? { ok: false, why: r.err } : { ok: true };
      } catch (e) { return { ok: false, why: e.message }; }
    }
    if (!force && c && Date.now() - c.at < 6 * 3600e3) return { ok: true, cached: true };
    try {
      const res = await fetch(u, { cache: "no-store" });
      if (!res.ok) throw new Error(`calendar link said ${res.status}`);
      const text = await res.text();
      if (!text.includes("BEGIN:VCALENDAR")) throw new Error("that link isn't a calendar (.ics) link");
      const from = new Date(); from.setDate(from.getDate() - 1); from.setHours(0, 0, 0, 0);
      const to = new Date(from); to.setDate(to.getDate() + 16);
      put(CACHE_KEY, { at: Date.now(), events: parse(text, from, to) });
      return { ok: true };
    } catch (e) {
      const why = e.message;
      put(CACHE_KEY, { ...(c || { events: [] }), at: c?.at || 0, err: why });
      return { ok: false, why };
    }
  }
  // Events on a 4am-to-4am app day.
  function eventsOn(dayKey) {
    const c = get(CACHE_KEY); if (!c) return [];
    const [y, m, d] = dayKey.split("-").map(Number);
    const a = new Date(y, m - 1, d, 4).getTime(), b = a + 864e5;
    return (c.events || []).filter((e) => e.s < b && e.e > a);
  }
  const status = () => { const c = get(CACHE_KEY); return { url: url(), at: c?.at || 0, err: c?.err || "", n: (c?.events || []).length }; };
  return { url, setUrl, refresh, eventsOn, status, parse, useRemote };
})();
