# Campus OS

An all-in-one, offline-first companion for college students — **attendance tracker**, timetable,
tasks, exams, GPA/CGPA, notes, budget and a focus timer, in one monochrome editorial interface.

Local-first and private: it works with no account, and your data stays on your device unless you opt in to
**end-to-end-encrypted cloud sync** (Google sign-in) to use it on all your devices.

## Run it on your Mac (no internet needed)

- Double-click **`Start Campus OS.command`** (first time: right-click → Open → Open), or
- run `python3 server.py` (add `--no-browser` to skip opening the browser).

It opens at <http://localhost:8765> (or the next free port) and saves everything to
`data/store.json` next to the app, with a rolling daily backup in `data/backups/`.
Keep the Terminal window open while you use it; Ctrl+C stops it.

## Run it on the web

The `docs/` folder is a static site (GitHub Pages serves it). On the web, data is stored in the
browser's localStorage on that device. Use **Settings → Download backup** to move data between
devices or into the Mac app.

## Cloud sync (optional)

Sign in with Google under **Settings → Cloud sync**. Your data is gzip-compressed and encrypted on the
device (AES-256-GCM, key derived from a passphrase with PBKDF2) *before* upload, so the cloud only ever
holds ciphertext — the developer cannot read it, and a forgotten passphrase cannot be recovered. Storage is
Cloud Firestore (`users/{uid}/sync/*`), locked down by [`firestore.rules`](firestore.rules). Delete your cloud
data any time from Settings. See [`docs/privacy.html`](docs/privacy.html).

To run your own copy: create a Firebase project, enable Google sign-in and Firestore, publish
`firestore.rules`, add your site's domain under Authentication → Authorised domains, and put your web-app
config in `docs/js/firebase-config.js`.

## What's inside

| Page | What it does |
| --- | --- |
| Home | Today's classes, deadlines, a "Heads up" panel (streak, what's safe to skip, at-risk subjects) and a weekly recap |
| Attendance | Mark Present / Absent / Cancelled, % per subject, "safe to miss" counts, what-if planner, calendar & history |
| Timetable | Weekly grid with lectures, labs and rooms; import from a photo, screenshot or PDF (read on-device, reviewed before saving) |
| Tasks | Assignments, projects and revision, grouped by urgency |
| Exams | Countdowns, syllabus, scores and averages |
| Grades | Semester GPA, CGPA (10- or 4-point) and a target-GPA planner |
| Notes | Searchable notes and saved links per subject |
| Budget | Expenses and income by month, categories, daily average |
| Focus | Pomodoro timer with streaks and a weekly chart |
| Settings | Profile, theme, cloud sync, backup / restore, CSV export, sample data |

Cancelled classes never count toward your attendance percentage.

## Tech

Plain HTML, CSS and ES modules — no build step, no dependencies. `server.py` is a ~180-line
Python standard-library server used only for saving to disk. Cloud sync loads the Firebase SDK on demand,
only after you sign in.
