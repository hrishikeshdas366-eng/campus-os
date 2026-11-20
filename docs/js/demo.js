// Sample data so you can explore the app straight away.
import { emptyData, uid } from "./store.js";
import { iso, addDays, today, weekday } from "./ui.js";

export function demoData() {
  const d = emptyData();
  d.profile = { name: "Alex", college: "State University", course: "B.Tech Computer Science", semester: "4", target: 75, gradeScale: "10" };
  const mk = (name, code, faculty, color, credits) => ({ id: uid(), name, code, faculty, color, target: null, credits, archived: false });
  const S = [
    mk("Data Structures", "CS201", "Dr. Rao", "#8ab4ff", 4),
    mk("Database Systems", "CS203", "Prof. Mehta", "#9ee6b4", 4),
    mk("Operating Systems", "CS205", "Dr. Iyer", "#f3c86a", 3),
    mk("Discrete Maths", "MA201", "Dr. Kulkarni", "#c6a4ff", 3),
    mk("Digital Logic", "EC201", "Prof. Das", "#ff8a80", 3),
    mk("Communication Skills", "HS101", "Ms. Sharma", "#7fd7e1", 2),
  ];
  d.subjects = S;
  const slots = [
    [0, 0, "09:00", "10:00", "Lecture", "B-204"], [0, 1, "10:00", "11:00", "Lecture", "B-204"], [0, 4, "11:15", "12:15", "Lecture", "A-110"], [0, 2, "14:00", "16:00", "Lab", "Lab 3"],
    [1, 3, "09:00", "10:00", "Lecture", "B-101"], [1, 0, "10:00", "11:00", "Lecture", "B-204"], [1, 5, "11:15", "12:15", "Seminar", "C-001"], [1, 1, "14:00", "16:00", "Lab", "Lab 2"],
    [2, 2, "09:00", "10:00", "Lecture", "B-204"], [2, 4, "10:00", "11:00", "Lecture", "A-110"], [2, 3, "11:15", "12:15", "Tutorial", "B-101"],
    [3, 1, "09:00", "10:00", "Lecture", "B-204"], [3, 0, "10:00", "11:00", "Tutorial", "B-204"], [3, 2, "11:15", "12:15", "Lecture", "B-204"], [3, 4, "14:00", "16:00", "Lab", "Lab 1"],
    [4, 3, "09:00", "10:00", "Lecture", "B-101"], [4, 5, "10:00", "11:00", "Lecture", "C-001"], [4, 0, "11:15", "12:15", "Lecture", "B-204"],
  ];
  d.timetable = slots.map(s => ({ id: uid(), subjectId: S[s[1]].id, day: s[0], start: s[2], end: s[3], kind: s[4], room: s[5] }));

  // deterministic pseudo-random attendance for the last ~6 weeks
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const t = today();
  for (let i = 42; i >= 1; i--) {
    const ds = addDays(t, -i);
    d.timetable.filter(e => e.day === weekday(ds)).forEach(e => {
      const r = rnd();
      const subjIdx = S.findIndex(s => s.id === e.subjectId);
      const missChance = subjIdx === 4 ? 0.34 : subjIdx === 2 ? 0.22 : 0.12;
      const status = r < 0.04 ? "cancelled" : r < 0.04 + missChance ? "absent" : "present";
      d.attendance.push({ id: uid(), subjectId: e.subjectId, date: ds, status, note: "", slotId: e.id });
    });
  }
  d.tasks = [
    { id: uid(), title: "DBMS assignment 3 — normalisation", subjectId: S[1].id, kind: "Assignment", due: addDays(t, 2), priority: "High", done: false, notes: "Questions 1-6" },
    { id: uid(), title: "OS lab record — scheduling", subjectId: S[2].id, kind: "Lab record", due: addDays(t, 5), priority: "Medium", done: false, notes: "" },
    { id: uid(), title: "Revise trees & graphs", subjectId: S[0].id, kind: "Revision", due: addDays(t, 9), priority: "Medium", done: false, notes: "" },
    { id: uid(), title: "Communication seminar slides", subjectId: S[5].id, kind: "Project", due: addDays(t, -1), priority: "High", done: false, notes: "" },
    { id: uid(), title: "Discrete maths problem set 2", subjectId: S[3].id, kind: "Assignment", due: addDays(t, -4), priority: "Low", done: true, doneAt: addDays(t, -5), notes: "" },
  ];
  d.exams = [
    { id: uid(), subjectId: S[0].id, title: "Mid-semester", kind: "Mid-sem", date: addDays(t, 12), time: "10:00", room: "Hall A", syllabus: "Units 1–3: arrays, linked lists, stacks, trees", score: null, maxScore: null },
    { id: uid(), subjectId: S[3].id, title: "Quiz 2", kind: "Quiz", date: addDays(t, 6), time: "09:00", room: "B-101", syllabus: "Logic and proofs", score: null, maxScore: null },
    { id: uid(), subjectId: S[1].id, title: "Quiz 1", kind: "Quiz", date: addDays(t, -14), time: "09:00", room: "B-204", syllabus: "", score: 17, maxScore: 20 },
  ];
  d.semesters = [{
    id: uid(), name: "Semester 3", courses: [
      { id: uid(), name: "Algorithms", credits: 4, grade: "A" }, { id: uid(), name: "Computer Organisation", credits: 4, grade: "A+" },
      { id: uid(), name: "Probability & Statistics", credits: 3, grade: "B+" }, { id: uid(), name: "Object-Oriented Programming", credits: 3, grade: "O" },
    ],
  }];
  d.notes = [
    { id: uid(), title: "BCNF vs 3NF", body: "3NF allows some dependencies that BCNF forbids.\nRule of thumb: decompose to BCNF unless it loses a dependency.", subjectId: S[1].id, pinned: true, updated: new Date().toISOString() },
    { id: uid(), title: "Scheduling cheat-sheet", body: "FCFS — simple, convoy effect\nSJF — optimal avg wait, starvation\nRR — fair, tune the quantum", subjectId: S[2].id, pinned: false, updated: new Date().toISOString() },
  ];
  d.links = [{ id: uid(), title: "VisuAlgo — data structure animations", url: "https://visualgo.net", subjectId: S[0].id }];
  d.settings.monthlyBudget = 6000;
  d.settings.onboarded = true;
  [["Food", 140, "Canteen lunch"], ["Transport", 60, "Metro card"], ["Books & supplies", 480, "Lab record"], ["Food", 90, "Coffee & snacks"], ["Fun", 350, "Movie"], ["Mobile & internet", 299, "Recharge"]]
    .forEach((m, i) => d.money.push({ id: uid(), date: addDays(t, -(i * 2 % 12)), amount: m[1], kind: "expense", category: m[0], note: m[2] }));
  d.money.push({ id: uid(), date: addDays(t, -9), amount: 5000, kind: "income", category: "Pocket money", note: "Monthly" });
  [25, 25, 50, 25, 45, 25].forEach((min, i) => d.focus.push({ id: uid(), date: addDays(t, -(i % 4)), minutes: min, subjectId: S[i % 3].id, label: "" }));
  return d;
}
