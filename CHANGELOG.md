# Changelog

## [0.3.1]

- The time now measures itself and shrinks to fit when the mirror's font is wider than expected
  (DejaVu Sans in the MagicMirror Docker image), so AM/PM no longer runs into the card's right edge
  at 10:00-12:59. It refits when the card's width changes or web fonts finish loading.

## [0.3.0]

- Removed the progress bar and its `progressBar` option.
- Standard layout: the weekday and date text are gone (the tile already shows them) and the time
  is much larger, with seconds and AM/PM stacked beside it. The compact layout still shows the
  weekday and date under the time.

## [0.2.1]

- Feathered the glass shimmer so it no longer leaves a diagonal line across the card (most visible
  on a Raspberry Pi, where the shimmer is frozen); same fix as MMM-GlassTempest.
- `dayMode` now defaults to `"auto"`, so the card is dark text on light glass during the day
  without extra configuration (it stayed dark unless `dayMode` was set).

## [0.2.0]

- Full day (light glass) look: card, date tile, text and progress bar.
- `dayMode`: `"auto"` switches at sunrise and sunset taken from MMM-GlassTempest's weather broadcast
  (`sunNotification`), falling back to `dayStart`/`dayEnd`; `"day"` and `"night"` fix the look.
- The light look also follows `body.mm-day` from a theme or MMM-GlassMonthlyCalendar.

## [0.1.0]

- First release: liquid-glass clock card styled to match MMM-GlassTempest.
- Time (12/24 h, optional seconds and AM/PM), weekday, month, day and year with a calendar tile.
- Locale and time-zone support through Intl, day/minute progress bar, compact layout.
- Pi profile and reduced motion turn off the shimmer animations; the card pauses while hidden.
