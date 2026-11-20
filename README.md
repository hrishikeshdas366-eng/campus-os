# Campus OS

An all-in-one, offline-first companion for college students — **attendance tracker**, timetable,
tasks, exams, GPA/CGPA, notes, budget and a focus timer, in one monochrome editorial interface.

Your data never leaves your device: there is no account and no server-side storage.

## Run it on your Mac (no internet needed)

- Double-click **`Start Campus OS.command`** (first time: right-click → Open → Open), or
- run `python3 server.py` (add `--no-browser` to skip opening the browser).

It opens at <http://127.0.0.1:8765> (or the next free port) and saves everything to
`data/store.json` next to the app, with a rolling daily backup in `data/backups/`.
Keep the Terminal window open while you use it; Ctrl+C stops it.

## Run it on the web

The `docs/` folder is a static site (GitHub Pages serves it). On the web, data is stored in the
browser's localStorage on that device. Use **Settings → Download backup** to move data between
devices or into the Mac app.

## What's inside

| Page | What it does |
| --- | --- |
| Home | Today's classes, deadlines and a one-glance semester summary |
| Attendance | Mark Present / Absent / Cancelled, % per subject, "safe to miss" counts, what-if planner, calendar & history |
| Timetable | Weekly grid with lectures, labs and rooms |
| Tasks | Assignments, projects and revision, grouped by urgency |
| Exams | Countdowns, syllabus, scores and averages |
| Grades | Semester GPA, CGPA (10- or 4-point) and a target-GPA planner |
| Notes | Searchable notes and saved links per subject |
| Budget | Expenses and income by month, categories, daily average |
| Focus | Pomodoro timer with streaks and a weekly chart |
| Settings | Profile, theme, backup / restore, CSV export, sample data |

Cancelled classes never count toward your attendance percentage.

## Tech

Plain HTML, CSS and ES modules — no build step, no dependencies. `server.py` is a ~180-line
Python standard-library server used only for saving to disk.
