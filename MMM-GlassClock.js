/* MMM-GlassClock.js
 * Liquid-glass clock card for MagicMirror², designed to sit next to MMM-GlassTempest.
 * Shows the time, weekday, month, day and year. No npm dependencies (uses Intl).
 *
 * The DOM is built once; a timer aligned to the wall clock updates only the text nodes that
 * changed, so MagicMirror never re-renders (and never cross-fades) the card every second.
 */
/* global config */

Module.register("MMM-GlassClock", {
  defaults: {
    title: "", // card title; "" hides it (GlassTempest-style header when set)
    layout: "standard", // "standard" (date tile + time) | "compact" (centered time over date)

    // Time
    timeFormat: null, // 12 | 24; null follows MagicMirror's global timeFormat
    showSeconds: true,
    showAmPm: true, // 12-hour only
    leadingZero: false, // pad the hour in 12-hour mode (09:05 vs 9:05)
    blinkColon: false, // gentle colon pulse (disabled under reduced motion)

    // Date
    showDateTile: true, // calendar tile (month / day / weekday) on the left, standard layout
    showWeekday: true,
    showDate: true,
    showYear: true,
    dateFormat: "long", // "long" (November 23, 2026) | "medium" (Nov 23, 2026) | "short" (11/23/2026)

    // Locale and zone
    locale: null, // null follows MagicMirror's global language, e.g. "en-US", "de"
    timeZone: null, // IANA zone such as "America/Chicago"; null uses the system zone
    showTimeZone: false, // show the zone abbreviation under the date

    // Liquid progress bar along the bottom of the card
    progressBar: "day", // "day" (fills over 24 h) | "minute" (fills each minute) | "none"

    // Sizing and performance (same meaning as in MMM-GlassTempest)
    minWidth: 260,
    maxWidth: 380,
    performanceProfile: "auto", // auto | pi | full
    reduceMotion: false
  },

  getStyles() {
    return [this.file("MMM-GlassClock.css")];
  },

  start() {
    Log.info(`[${this.name}] Starting module`);
    this.refs = null;
    this.timer = null;
    this.suspended = false;
    this.last = {}; // last text written to each ref, so unchanged nodes are not touched
    this.performanceProfile = this._resolvePerformanceProfile();
    this.reduceMotion =
      this.config.reduceMotion === true ||
      this.performanceProfile === "pi" ||
      (typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    this._buildFormatters();
    this._schedule();
  },

  suspend() {
    // MMM-pages (or any hide) - no reason to tick while invisible.
    this.suspended = true;
    this._clearTimer();
  },

  resume() {
    this.suspended = false;
    this._tick();
  },

  /* ---------- settings ---------- */

  _use24h() {
    const tf = this.config.timeFormat ?? (typeof config !== "undefined" ? config.timeFormat : null);
    return Number(tf) !== 12;
  },

  _locale() {
    const raw = this.config.locale || (typeof config !== "undefined" && config.locale) ||
      (typeof config !== "undefined" && config.language) || undefined;
    try {
      return raw ? Intl.getCanonicalLocales(raw)[0] : undefined;
    } catch (e) {
      Log.warn(`[${this.name}] Unknown locale "${raw}", using the system locale`);
      return undefined;
    }
  },

  _timeZone() {
    const tz = this.config.timeZone;
    if (!tz) return undefined;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return tz;
    } catch (e) {
      Log.warn(`[${this.name}] Unknown timeZone "${tz}", using the system zone`);
      return undefined;
    }
  },

  _resolvePerformanceProfile() {
    const requested = (this.config.performanceProfile || "auto").toLowerCase();
    if (requested === "pi" || requested === "full") return requested;
    const ua =
      typeof navigator !== "undefined" && navigator.userAgent ? navigator.userAgent.toLowerCase() : "";
    const isPi =
      ua.includes("raspberry") ||
      ua.includes("armv7") ||
      ua.includes("aarch64") ||
      ua.includes("linux arm");
    return isPi ? "pi" : "full";
  },

  _buildFormatters() {
    const locale = this._locale();
    const timeZone = this._timeZone();
    const h24 = this._use24h();
    const fmt = (opts) => new Intl.DateTimeFormat(locale, Object.assign({ timeZone }, opts));
    const month = { long: "long", medium: "short", short: "2-digit" }[this.config.dateFormat] || "long";
    const dateOpts = month === "2-digit"
      ? { month: "2-digit", day: "2-digit" }
      : { month, day: "numeric" };
    if (this.config.showYear) dateOpts.year = "numeric";

    this.fmt = {
      // hourCycle h23 never prints "24"; h12 gives 12:xx for noon/midnight.
      time: fmt({ hour: h24 || this.config.leadingZero ? "2-digit" : "numeric", minute: "2-digit", second: "2-digit", hourCycle: h24 ? "h23" : "h12" }),
      // 24-hour clock of the target zone, for the day progress bar.
      clock24: fmt({ hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }),
      date: fmt(dateOpts),
      weekday: fmt({ weekday: "long" }),
      weekdayShort: fmt({ weekday: "short" }),
      monthShort: fmt({ month: "short" }),
      dayNum: fmt({ day: "numeric" }),
      zone: fmt({ timeZoneName: "short" })
    };
    this.h24 = h24;
  },

  /* ---------- pure formatting (tested) ---------- */

  _parts(formatter, date) {
    const out = {};
    for (const p of formatter.formatToParts(date)) {
      if (p.type !== "literal" && out[p.type] === undefined) out[p.type] = p.value;
    }
    return out;
  },

  // Everything the card shows for a given instant.
  _snapshot(date) {
    const t = this._parts(this.fmt.time, date);
    const c = this._parts(this.fmt.clock24, date);
    const secOfDay = Number(c.hour) * 3600 + Number(c.minute) * 60 + Number(c.second);
    const zone = this._parts(this.fmt.zone, date).timeZoneName || "";
    return {
      hm: `${t.hour}:${t.minute}`,
      sec: t.second,
      ampm: this.h24 ? "" : (t.dayPeriod || ""),
      weekday: this.fmt.weekday.format(date),
      weekdayShort: this.fmt.weekdayShort.format(date),
      monthShort: this.fmt.monthShort.format(date).replace(/\.$/, ""),
      day: this.fmt.dayNum.format(date).replace(/\.$/, ""),
      date: this.fmt.date.format(date),
      zone,
      dayProgress: secOfDay / 86400,
      minuteProgress: Number(c.second) / 60
    };
  },

  /* ---------- timing ---------- */

  // Tick each second when seconds or the minute bar are visible, otherwise once a minute.
  _needsSeconds() {
    return this.config.showSeconds || this.config.progressBar === "minute";
  },

  _schedule() {
    this._clearTimer();
    if (this.suspended) return;
    const now = Date.now();
    const step = this._needsSeconds() ? 1000 : 60000;
    // +15 ms lands safely after the boundary so the new second/minute is already current.
    const delay = step - (now % step) + 15;
    this.timer = setTimeout(() => this._tick(), delay);
  },

  _clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  },

  _tick() {
    this._render(new Date());
    this._schedule();
  },

  /* ---------- DOM ---------- */

  _set(key, value) {
    if (!this.refs || !this.refs[key] || this.last[key] === value) return;
    this.refs[key].textContent = value;
    this.last[key] = value;
  },

  _render(date) {
    if (!this.refs) return;
    const s = this._snapshot(date);
    this._set("hm", s.hm);
    this._set("sec", s.sec);
    this._set("ampm", s.ampm);
    this._set("weekday", s.weekday);
    this._set("date", s.date);
    this._set("zone", s.zone);
    this._set("tileMonth", s.monthShort);
    this._set("tileDay", s.day);
    this._set("tileWeekday", s.weekdayShort);
    if (this.refs.bar) {
      const p = this.config.progressBar === "minute" ? s.minuteProgress : s.dayProgress;
      const val = `scaleX(${Math.max(0.002, p).toFixed(4)})`;
      if (this.last.bar !== val) {
        this.refs.bar.style.transform = val;
        this.last.bar = val;
      }
    }
  },

  _el(tag, className, parent) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (parent) parent.appendChild(el);
    return el;
  },

  getDom() {
    const c = this.config;
    const compact = c.layout === "compact" || !c.showDateTile;
    const wrapper = this._el("div", "MMM-GlassClock glass-card raised-edge");
    wrapper.classList.add(compact ? "gc-compact" : "gc-standard");
    if (this.reduceMotion) wrapper.classList.add("gc-reduced");
    if (c.blinkColon && !this.reduceMotion) wrapper.classList.add("gc-blink");
    wrapper.style.minWidth = `${Number(c.minWidth) || 260}px`;
    if (Number(c.maxWidth) > 0) wrapper.style.maxWidth = `${Number(c.maxWidth)}px`;

    const refs = {};
    if (c.title) {
      this._el("div", "gc-title", wrapper).textContent = c.title;
    }

    const main = this._el("div", "gc-main", wrapper);

    if (!compact) {
      const tile = this._el("div", "gc-tile", main);
      refs.tileMonth = this._el("div", "gc-tile-month", tile);
      refs.tileDay = this._el("div", "gc-tile-day", tile);
      if (c.showWeekday) refs.tileWeekday = this._el("div", "gc-tile-weekday", tile);
    }

    const right = this._el("div", "gc-right", main);
    const time = this._el("div", "gc-time", right);
    refs.hm = this._el("span", "gc-hm", time);
    if (c.showSeconds) refs.sec = this._el("span", "gc-sec", time);
    if (!this.h24 && c.showAmPm) refs.ampm = this._el("span", "gc-ampm", time);

    // In the standard layout the tile already shows the short weekday; the full one still
    // reads better next to the date, so keep it in both layouts.
    if (c.showWeekday) refs.weekday = this._el("div", "gc-weekday", right);
    if (c.showDate) refs.date = this._el("div", "gc-date", right);
    if (c.showTimeZone) refs.zone = this._el("div", "gc-zone", right);

    if (c.progressBar === "day" || c.progressBar === "minute") {
      const track = this._el("div", `gc-progress gc-progress-${c.progressBar}`, wrapper);
      refs.bar = this._el("div", "gc-progress-fill", track);
    }

    this.refs = refs;
    this.last = {};
    this._render(new Date());
    return wrapper;
  }
});
