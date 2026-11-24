# Changelog

## [0.2.1]

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
