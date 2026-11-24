/* Tests for MMM-GlassClock.js (minimal fake DOM, no browser). Run with: npm test */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const MODULE_PATH = path.join(__dirname, "MMM-GlassClock.js");

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this._classes = new Set();
    this.textContent = "";
    this.style = {};
    this.classList = {
      add: (c) => this._classes.add(c),
      remove: (c) => this._classes.delete(c),
      contains: (c) => this._classes.has(c)
    };
  }
  get className() {
    return [...this._classes].join(" ");
  }
  set className(v) {
    this._classes = new Set(`${v}`.split(/\s+/).filter(Boolean));
  }
  appendChild(c) {
    this.children.push(c);
    return c;
  }
}

function setup(overrides = {}, globalConfig = { language: "en-US", timeFormat: 24 }) {
  const timers = [];
  const sandbox = {
    Module: { register: (n, d) => (sandbox.def = d) },
    Log: { info() {}, log() {}, warn() {}, error() {} },
    config: globalConfig,
    window: undefined,
    navigator: undefined,
    Intl,
    Date,
    Math,
    console,
    document: { createElement: (t) => new FakeElement(t) },
    setTimeout: (fn, ms) => (timers.push({ fn, ms }), timers.length),
    clearTimeout() {}
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(MODULE_PATH, "utf8"), sandbox, { filename: MODULE_PATH });
  const m = Object.assign({}, sandbox.def, {
    name: "MMM-GlassClock",
    config: Object.assign({}, sandbox.def.defaults, { timeZone: "America/Chicago" }, overrides),
    file: (f) => f
  });
  m.start();
  return { m, timers };
}

function find(el, cls) {
  if (el._classes && el._classes.has(cls)) return el;
  for (const c of el.children) {
    const hit = find(c, cls);
    if (hit) return hit;
  }
  return null;
}

// 2026-11-23 19:54:07 in Chicago (UTC-6)
const SAMPLE = new Date("2026-11-24T01:54:07Z");

test("24-hour snapshot shows time, weekday and full date in the configured zone", () => {
  const { m } = setup();
  const s = m._snapshot(SAMPLE);
  assert.equal(s.hm, "19:54");
  assert.equal(s.sec, "07");
  assert.equal(s.ampm, "");
  assert.equal(s.weekday, "Monday");
  assert.equal(s.date, "November 23, 2026");
  assert.equal(s.monthShort, "Nov");
  assert.equal(s.day, "23");
  assert.equal(s.zone, "CST");
});

test("12-hour mode with AM/PM, no leading zero by default", () => {
  const { m } = setup({ timeFormat: 12 });
  const s = m._snapshot(new Date("2026-11-23T15:05:00Z")); // 09:05 Chicago
  assert.equal(s.hm, "9:05");
  assert.equal(s.ampm, "AM");
  const z = setup({ timeFormat: 12, leadingZero: true }).m._snapshot(new Date("2026-11-23T15:05:00Z"));
  assert.equal(z.hm, "09:05");
});

test("midnight is 00 in 24-hour and 12 AM in 12-hour mode", () => {
  const midnight = new Date("2026-11-24T06:00:00Z");
  assert.equal(setup().m._snapshot(midnight).hm, "00:00");
  const s = setup({ timeFormat: 12 }).m._snapshot(midnight);
  assert.equal(s.hm, "12:00");
  assert.equal(s.ampm, "AM");
});

test("global MagicMirror timeFormat is followed when the module leaves it unset", () => {
  const { m } = setup({}, { language: "en-US", timeFormat: 12 });
  assert.equal(m._snapshot(SAMPLE).hm, "7:54");
});

test("date formats and the year toggle", () => {
  assert.equal(setup({ dateFormat: "medium" }).m._snapshot(SAMPLE).date, "Nov 23, 2026");
  assert.equal(setup({ dateFormat: "short" }).m._snapshot(SAMPLE).date, "11/23/2026");
  assert.equal(setup({ showYear: false }).m._snapshot(SAMPLE).date, "November 23");
});

test("locale is honoured (German)", () => {
  const { m } = setup({ locale: "de" });
  const s = m._snapshot(SAMPLE);
  assert.equal(s.weekday, "Montag");
  assert.equal(s.date, "23. November 2026");
  assert.equal(s.day, "23");
});

test("day and minute progress", () => {
  const { m } = setup();
  const s = m._snapshot(new Date("2026-11-23T18:00:30Z")); // 12:00:30 Chicago
  assert.ok(Math.abs(s.dayProgress - (12 * 3600 + 30) / 86400) < 1e-9);
  assert.equal(s.minuteProgress, 0.5);
});

test("bad time zone and locale fall back instead of throwing", () => {
  const { m } = setup({ timeZone: "Mars/Olympus", locale: "not a locale!!" });
  assert.ok(m._snapshot(SAMPLE).hm.match(/^\d{2}:\d{2}$/));
});

test("getDom builds the standard card with tile, time, date and progress bar", () => {
  const { m } = setup({ title: "Clock" });
  const dom = m.getDom();
  assert.ok(dom.classList.contains("glass-card"));
  assert.ok(dom.classList.contains("gc-standard"));
  assert.equal(find(dom, "gc-title").textContent, "Clock");
  assert.ok(find(dom, "gc-tile-day").textContent.match(/^\d{1,2}$/));
  assert.ok(find(dom, "gc-hm").textContent.match(/^\d{2}:\d{2}$/));
  assert.ok(find(dom, "gc-progress-fill").style.transform.startsWith("scaleX("));
});

test("compact layout and hidden parts", () => {
  const { m } = setup({ layout: "compact", showSeconds: false, progressBar: "none", showWeekday: false });
  const dom = m.getDom();
  assert.ok(dom.classList.contains("gc-compact"));
  assert.equal(find(dom, "gc-tile"), null);
  assert.equal(find(dom, "gc-sec"), null);
  assert.equal(find(dom, "gc-progress"), null);
  assert.equal(find(dom, "gc-weekday"), null);
});

test("render only rewrites nodes whose text changed", () => {
  const { m } = setup();
  const dom = m.getDom();
  m._render(SAMPLE);
  const dateEl = find(dom, "gc-date");
  dateEl.textContent = "sentinel"; // if render rewrote it, the sentinel would disappear
  m._render(new Date(SAMPLE.getTime() + 1000));
  assert.equal(dateEl.textContent, "sentinel");
  assert.equal(find(dom, "gc-sec").textContent, "08");
});

test("ticks every second with seconds shown, every minute without, none while suspended", () => {
  const a = setup();
  assert.ok(a.timers[0].ms <= 1015);
  const b = setup({ showSeconds: false, progressBar: "day" });
  assert.ok(b.timers[0].ms > 0 && b.timers[0].ms <= 60015);
  b.m.suspend();
  const before = b.timers.length;
  b.m._schedule();
  assert.equal(b.timers.length, before);
});

test("pi profile enables reduced motion", () => {
  const { m } = setup({ performanceProfile: "pi" });
  assert.ok(m.getDom().classList.contains("gc-reduced"));
});

test("dayMode defaults to auto (light by day without extra config)", () => {
  assert.equal(setup().m.config.dayMode, "auto");
  const { m } = setup();
  const card = m.getDom();
  m._render(new Date(2026, 10, 23, 12, 0));
  assert.ok(card.classList.contains("gc-light"));
});

test("dayMode: day and night are fixed; none leaves it to the theme", () => {
  assert.ok(setup({ dayMode: "day" }).m.getDom().classList.contains("gc-light"));
  assert.ok(!setup({ dayMode: "night" }).m.getDom().classList.contains("gc-light"));
  const { m } = setup({ dayMode: "none" });
  assert.equal(m.isDay, null);
  assert.ok(!m.getDom().classList.contains("gc-light"));
});

test("dayMode auto: fixed hours until GlassTempest sends sunrise and sunset", () => {
  const { m } = setup({ dayMode: "auto" });
  const card = m.getDom();
  const local = (h, mi = 0) => new Date(2026, 10, 23, h, mi);
  m._render(local(6, 59));
  assert.ok(!card.classList.contains("gc-light"));
  m._render(local(7, 0));
  assert.ok(card.classList.contains("gc-light"));
  m._render(local(19, 0));
  assert.ok(!card.classList.contains("gc-light"));

  // Sun times from MMM-GlassTempest's weather broadcast take over
  m.notificationReceived("AMBIENT_WEATHER_DATA", {
    temperature: 47,
    sunrise: local(6, 51).toISOString(),
    sunset: local(16, 24).toISOString()
  });
  m._render(local(6, 55));
  assert.ok(card.classList.contains("gc-light"));
  m._render(local(16, 30));
  assert.ok(!card.classList.contains("gc-light"));
  // Next morning, before a fresh broadcast: yesterday's times are carried over
  m._render(new Date(2026, 10, 24, 6, 55));
  assert.ok(card.classList.contains("gc-light"));
  // Broadcasts without sun times are ignored
  m.notificationReceived("AMBIENT_WEATHER_DATA", { temperature: 50 });
  assert.equal(m.weatherSun.rise.getHours(), 6);
});
