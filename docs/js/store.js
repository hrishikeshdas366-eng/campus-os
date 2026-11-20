// Campus OS — data store.
// Local mode (served by server.py): saved to data/store.json on disk.
// Web mode (GitHub Pages / any static host): saved in this browser's localStorage.

const LS_KEY = "campusos:v1";
const listeners = new Set();
let saveTimer = null;

export const store = {
  data: null,
  mode: "browser",       // "disk" | "browser"
  diskPath: "",
  status: "idle",        // "idle" | "saving" | "saved" | "error"
};

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function emptyData() {
  return {
    app: "campus-os",
    version: 1,
    profile: { name: "", college: "", course: "", semester: "", target: 75, gradeScale: "10" },
    settings: { theme: "dark", focusMinutes: 25, breakMinutes: 5, currency: "₹", monthlyBudget: 0, intro: true },
    subjects: [],    // {id,name,code,faculty,color,target|null,credits,archived}
    timetable: [],   // {id,subjectId,day(0=Mon),start,end,room,kind}
    attendance: [],  // {id,subjectId,date,status:present|absent|cancelled,note}
    tasks: [],       // {id,title,subjectId,kind,due,priority,done,doneAt,notes}
    exams: [],       // {id,subjectId,title,kind,date,time,room,syllabus,score,maxScore}
    semesters: [],   // {id,name,courses:[{id,name,credits,grade}]}
    notes: [],       // {id,title,body,subjectId,pinned,updated}
    money: [],       // {id,date,amount,kind:expense|income,category,note}
    focus: [],       // {id,date,minutes,subjectId,label}
    links: [],       // {id,title,url,subjectId}
  };
}

function normalize(d) {
  const base = emptyData();
  if (!d || typeof d !== "object") return base;
  const out = Object.assign({}, base, d);
  out.profile = Object.assign({}, base.profile, d.profile || {});
  out.settings = Object.assign({}, base.settings, d.settings || {});
  for (const k of Object.keys(base)) {
    if (Array.isArray(base[k]) && !Array.isArray(out[k])) out[k] = [];
  }
  out.app = "campus-os";
  return out;
}

function isLocalHost() {
  return ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
}

export async function loadStore() {
  if (isLocalHost()) {
    try {
      const ping = await fetch("/api/ping", { cache: "no-store" });
      if (ping.ok) {
        const info = await ping.json();
        if (info.app === "campus-os") {
          const res = await fetch("/api/store", { cache: "no-store" });
          const body = await res.json();
          store.mode = "disk";
          store.diskPath = info.path;
          let d = body.data;
          if (!d) {
            // first run on disk: adopt anything already in this browser
            try { d = JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch (_) { d = null; }
          }
          store.data = normalize(d);
          return store.data;
        }
      }
    } catch (_) { /* fall through to browser storage */ }
  }
  store.mode = "browser";
  let d = null;
  try { d = JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch (_) { d = null; }
  store.data = normalize(d);
  return store.data;
}

function setStatus(s) {
  store.status = s;
  listeners.forEach(fn => fn({ type: "status" }));
}

async function flush() {
  saveTimer = null;
  const payload = JSON.stringify(store.data);
  try {
    if (store.mode === "disk") {
      setStatus("saving");
      const res = await fetch("/api/store", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: payload,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    } else {
      localStorage.setItem(LS_KEY, payload);
    }
    setStatus("saved");
  } catch (e) {
    console.error(e);
    setStatus("error");
    try { localStorage.setItem(LS_KEY, payload); } catch (_) { /* ignore */ }
  }
}

/** Mutate data with fn(data), then re-render and persist. */
export function update(fn) {
  fn(store.data);
  store.data.modifiedAt = Date.now();   // lets cloud sync tell what changed
  listeners.forEach(l => l({ type: "change" }));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
}

/** Swap in data that came from the cloud, keeping its own modifiedAt (does not count as a local edit). */
export function adopt(newData) {
  const n = normalize(newData);
  Object.keys(store.data).forEach(k => delete store.data[k]);
  Object.assign(store.data, n);
  listeners.forEach(l => l({ type: "change", remote: true }));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
}

export function replaceAll(newData) {
  update(d => {
    const n = normalize(newData);
    Object.keys(d).forEach(k => delete d[k]);
    Object.assign(d, n);
  });
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

window.addEventListener("beforeunload", () => {
  if (saveTimer) { clearTimeout(saveTimer); flush(); }
});
