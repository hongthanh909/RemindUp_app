# RemindUp product decisions

Last updated: 2026-07-27

## Product model

- Single-user Personal Planner PWA.
- Local-first and offline-capable.
- Default language: Vietnamese.
- Default time zone: `Asia/Ho_Chi_Minh`.
- Cloud sync is optional and disabled by default.
- The public PWA is hosted on Vercel. Cloudflare Workers remains an optional
  deployment target and does not change the local-first data model.

## UI system

- The product palette is white/ivory with soft orange accents and a matching
  semantic Dark Mode.
- The Today dashboard prioritizes the weekly date strip, greeting and progress,
  task list, pinned notes, and focus clock in that order.
- Dashboard task rows use actual user records, one Lucide icon family, compact
  completion controls, and the same card/touch language in calendar views.
- Touch targets are at least 44px and fixed surfaces respect iPhone safe areas.

## Recurrence and time

- Supported recurrence: daily, selected weekdays, weekly, monthly, yearly, and
  custom every N days/weeks/months.
- A series may end never, on a date, or after N occurrences.
- A user can change one occurrence, this and future occurrences, or the entire
  series.
- Events keep their configured IANA time zone. Travel does not silently shift
  the event; the user must choose to adopt the device time zone.
- For DST zones, a nonexistent local time advances to the next valid instant.
  An ambiguous repeated local time fires once at its earlier occurrence.

## Security

- Quick lock: six-digit PIN.
- Auto-lock: five minutes or immediately after leaving the app when enabled.
- Five failed attempts trigger a 30-second delay; the delay escalates with
  further failures.
- A PIN is an interface lock. Strong encryption requires a long passphrase or a
  separate recovery key.
- Sensitive payloads and cloud backups use authenticated AES-256-GCM
  encryption.
- A 12-word recovery phrase protects cloud backup restoration.

## Images

- Input limit: 15 MB.
- Strip image metadata, including GPS.
- Resize the long edge to at most 1,920 px.
- Encode WebP near 78% quality, targeting 1.5 MB or less.
- Generate a 384 px thumbnail near 65% quality.
- Warn at 70% of available browser storage and stop new images near 90%.
- Do not keep the original image unless the user explicitly opts in.

## Sync and conflict handling

- Local IndexedDB remains authoritative while offline.
- Sync after a five-second debounce, on app launch, and when connectivity
  returns.
- Merge task and checklist changes at field/item level.
- Concurrent edits to the same field create a visible conflict copy; never
  silently overwrite.
- Keep deletion tombstones for 30 days.
- Keep edit history for 90 days.

## Backup retention

- Seven daily backups.
- Four weekly backups.
- Six monthly backups.
- Manual exports remain until the user removes them.
- Encrypt cloud backups on the device before upload.

## Notifications

- Foreground reminders may run locally.
- The local clock supports countdown, count-up stopwatch, and a daily alarm
  target. It uses wall-clock timestamps so it catches up after short background
  suspension instead of trusting interval ticks.
- The selected clock mode, configured duration or alarm time, active target,
  and paused value persist in local IndexedDB. Reloading or reopening the PWA
  restores the live state and recalculates elapsed or remaining time.
- If an active local alarm or countdown expires while the app is suspended,
  RemindUp presents the due alert immediately when the app becomes active again.
- The installed PWA respects iPhone safe areas. Mobile form controls use at
  least 16px text so focusing a time or duration field does not trigger Safari
  auto-zoom.
- When a timer or alarm finishes while RemindUp is still active, show both an
  in-app alert and a system notification when permission has been granted.
- Background delivery uses Web Push and is best-effort.
- On iOS/iPadOS, notification permission is requested only after the PWA has
  been added to the Home Screen and the user taps the notification action.
- Exact delivery after the app is fully closed requires a server-held Push API
  subscription and scheduled Web Push; local IndexedDB timers alone cannot
  wake a closed PWA.
- The service sends at the requested minute but cannot guarantee the exact
  device display time because the operating system, Focus Mode, connectivity,
  and battery policies control delivery.
- Critical reminders should also be placed in Calendar or Clock.

## Recovery

- A planned device change can use an encrypted export/import.
- A lost device can restore an encrypted cloud backup with the 12-word recovery
  phrase.
- Restore always previews the backup and offers merge or replace.
- Validate schema version and checksum before applying a backup.
- Losing the device, backup, and recovery phrase means the encrypted data cannot
  be recovered.
