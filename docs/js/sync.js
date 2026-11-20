// Campus OS — optional end-to-end-encrypted cloud sync (Google sign-in + Firestore).
//
// • Nothing here runs unless the user signs in; the Firebase SDK is only loaded on demand.
// • Data is gzip-compressed and encrypted on the device with AES-GCM before upload.
//   The key comes from a passphrase only the user knows (PBKDF2), so the server only ever
//   stores unreadable ciphertext.
// • Cloud layout: users/{uid}/sync/meta  +  users/{uid}/sync/c0 … c9 (ciphertext chunks).
import { store, subscribe, adopt } from "./store.js";
import { esc, toast, openForm } from "./ui.js";
import { firebaseConfig } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.14.1/";
const CHUNK = 600000, MAX_CHUNKS = 10, ITER = 600000, PUSH_DELAY = 15000;
const FLAG = "campusos:syncUser";

const enc = new TextEncoder(), dec = new TextDecoder();
const listeners = new Set();

/** status: unavailable | signed-out | working | locked | synced | offline | error */
export const S = { status: firebaseConfig ? "signed-out" : "unavailable", user: null, message: "", lastSync: 0 };
export function onSyncChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function setS(p) { Object.assign(S, p); listeners.forEach(l => l(S)); }

let fb = null, key = null, salt = "", meta = null, ST = {}, unsub = null, pushTimer = 0, queue = Promise.resolve(), starting = false, observing = false;

const DEVICE = (() => {
  try {
    let d = localStorage.getItem("campusos:device");
    if (!d) { d = Math.random().toString(36).slice(2, 10); localStorage.setItem("campusos:device", d); }
    return d;
  } catch (_) { return "dev"; }
})();

// ---------- small helpers ----------
const toB64 = buf => { const u = new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const stKey = uid => "campusos:sync:" + uid;
const loadSt = uid => { try { return JSON.parse(localStorage.getItem(stKey(uid)) || "{}"); } catch (_) { return {}; } };
const saveSt = () => { try { if (S.user) localStorage.setItem(stKey(S.user.uid), JSON.stringify(ST)); } catch (_) { /* ignore */ } };
const dirty = () => (store.data.modifiedAt || 0) !== (ST.baseModified || 0);
const isEmpty = d => !(d.subjects.length || d.attendance.length || d.tasks.length || d.exams.length || d.notes.length || d.money.length || d.focus.length || d.links.length || d.semesters.length || d.timetable.length || (d.profile && d.profile.name));

// ---------- remembered key (non-extractable, this device only) ----------
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("campusos-sync", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("keys");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function keyGet(uid) {
  try { const db = await idb(); return await new Promise(res => { const q = db.transaction("keys").objectStore("keys").get(uid); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch (_) { return null; }
}
async function keyPut(uid, val) {
  try { const db = await idb(); await new Promise((res, rej) => { const tx = db.transaction("keys", "readwrite"); tx.objectStore("keys").put(val, uid); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch (_) { /* ignore */ }
}
async function keyDel(uid) {
  try { const db = await idb(); await new Promise(res => { const tx = db.transaction("keys", "readwrite"); tx.objectStore("keys").delete(uid); tx.oncomplete = res; tx.onerror = res; }); } catch (_) { /* ignore */ }
}

// ---------- crypto ----------
async function derive(pass, saltBytes, iter) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: saltBytes, iterations: iter || ITER, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function seal(obj) {
  let raw = enc.encode(JSON.stringify(obj)), z = 0;
  if (typeof CompressionStream !== "undefined") {
    raw = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
    z = 1;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, raw));
  const b = toB64(ct), chunks = [];
  for (let i = 0; i < b.length; i += CHUNK) chunks.push(b.slice(i, i + CHUNK));
  if (!chunks.length) chunks.push("");
  return { iv: toB64(iv), z, chunks };
}
async function unseal(k, m, chunkStrs) {
  let raw = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(m.iv) }, k, fromB64(chunkStrs.join(""))));
  if (m.z) raw = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
  return JSON.parse(dec.decode(raw));
}

// ---------- firebase ----------
async function ensureFirebase() {
  if (fb) return fb;
  if (!firebaseConfig) throw new Error("Cloud sync isn't switched on for this copy of the app.");
  const [appM, authM, fsM] = await Promise.all([import(SDK + "firebase-app.js"), import(SDK + "firebase-auth.js"), import(SDK + "firebase-firestore.js")]);
  const app = appM.initializeApp(firebaseConfig);
  fb = { A: authM, F: fsM, auth: authM.getAuth(app), db: fsM.getFirestore(app) };
  return fb;
}
const ref = (uid, id) => fb.F.doc(fb.db, "users", uid, "sync", id);
async function readChunks(uid, m) {
  const snaps = await Promise.all(Array.from({ length: m.chunks }, (_, i) => fb.F.getDoc(ref(uid, "c" + i))));
  return snaps.map(s => { if (!s.exists()) throw new Error("Cloud data is incomplete — try again in a moment."); return s.data().d; });
}

function describe(e) {
  const c = (e && e.code) || "";
  if (!navigator.onLine || /unavailable|network|offline/i.test(c + " " + (e && e.message))) return ["offline", "Offline — changes will sync when you're back online."];
  if (c === "auth/unauthorized-domain") return ["error", "This web address isn't authorised for Google sign-in yet. Add it under Firebase → Authentication → Settings → Authorised domains."];
  if (c === "permission-denied" || c === "firestore/permission-denied") return ["error", "The cloud database refused access. Check the Firestore security rules."];
  return ["error", (e && e.message) || "Sync failed."];
}
function fail(e) {
  console.error(e);
  const [status, message] = describe(e);
  setS({ status, message });
}

// ---------- dialogs ----------
function askPassphrase(o) {
  return new Promise(resolve => {
    let done = false;
    const fields = [{
      name: "n", type: "html", full: true,
      html: '<p class="muted" style="margin:0">' + (o.create
        ? "Choose a <b>sync passphrase</b>. Your data is encrypted with it <b>on this device</b> before it's uploaded, so nobody else can read it — not even the app's developer. <b>If you forget it, the cloud copy can't be recovered</b> (your devices keep their own copies). You'll enter it once on each new device."
        : "Enter your sync passphrase to unlock your cloud data on this device.") +
        (o.error ? '<br><span class="bad">' + esc(o.error) + "</span>" : "") + "</p>",
    },
    { name: "passphrase", label: "Sync passphrase", type: "password", required: true, full: true, placeholder: o.create ? "At least 8 characters" : "" }];
    if (o.create) fields.push({ name: "confirm", label: "Repeat passphrase", type: "password", required: true, full: true });
    fields.push({ name: "remember", label: "Remember on this device", type: "checkbox", value: true, full: true });
    const dlg = openForm({
      eyebrow: "Cloud sync", title: o.create ? "Create your passphrase" : "Unlock your data", fields, submitLabel: o.create ? "Create & start syncing" : "Unlock",
      onSubmit: v => {
        if (o.create && v.passphrase.length < 8) { toast("Use at least 8 characters", { error: true }); return false; }
        if (o.create && v.passphrase !== v.confirm) { toast("The two passphrases don't match", { error: true }); return false; }
        done = true; resolve(v);
      },
    });
    dlg.addEventListener("close", () => { if (!done) resolve(null); }, { once: true });
  });
}
function choose(title, text, options) {
  return new Promise(resolve => {
    const dlg = document.getElementById("dlg");
    dlg.innerHTML = '<form method="dialog"><div class="dlg-head"><div><p class="mono muted" style="margin:0 0 8px">Cloud sync</p><h2 class="h-md">' + esc(title) + "</h2></div></div>" +
      '<p class="muted" style="margin-top:0">' + esc(text) + '</p><div class="stack">' +
      options.map((o, i) => '<button type="button" class="btn" data-i="' + i + '" style="height:auto;padding:12px 18px;justify-content:flex-start;text-align:left;white-space:normal"><span><b>' + esc(o.label) + '</b><br><span class="muted" style="font-weight:400;font-size:13px">' + esc(o.hint) + "</span></span></button>").join("") + "</div></form>";
    let done = false;
    dlg.querySelectorAll("[data-i]").forEach(b => { b.onclick = () => { done = true; dlg.close(); resolve(options[Number(b.dataset.i)].value); }; });
    dlg.addEventListener("close", () => { if (!done) resolve(null); }, { once: true });
    dlg.showModal();
  });
}

// ---------- merge (union by id; this device wins on clashes) ----------
function mergeData(local, cloud) {
  const out = Object.assign({}, cloud, local);
  ["subjects", "timetable", "attendance", "tasks", "exams", "notes", "money", "focus", "links"].forEach(k => {
    const seen = new Set(local[k].map(x => x.id));
    out[k] = local[k].concat((cloud[k] || []).filter(x => !seen.has(x.id)));
  });
  const sems = local.semesters.map(s => Object.assign({}, s));
  const byId = new Map(sems.map(s => [s.id, s]));
  (cloud.semesters || []).forEach(cs => {
    const m = byId.get(cs.id);
    if (!m) sems.push(cs);
    else { const ids = new Set(m.courses.map(c => c.id)); m.courses = m.courses.concat((cs.courses || []).filter(c => !ids.has(c.id))); }
  });
  out.semesters = sems;
  return out;
}

// ---------- push / pull ----------
function schedulePush() {
  if (!key || !S.user || pushTimer) return;
  pushTimer = setTimeout(push, PUSH_DELAY);
}
async function push() {
  clearTimeout(pushTimer); pushTimer = 0;
  if (!fb || !key || !S.user) return;
  const uid = S.user.uid;
  try {
    setS({ status: "working", message: "" });
    const modified = store.data.modifiedAt || 0;
    const sealed = await seal(store.data);
    if (sealed.chunks.length > MAX_CHUNKS) throw new Error("Your data is too large to sync.");
    const updatedAt = Date.now();
    const batch = fb.F.writeBatch(fb.db);
    sealed.chunks.forEach((d, i) => batch.set(ref(uid, "c" + i), { d }));
    for (let i = sealed.chunks.length; i < (ST.chunks || 0); i++) batch.delete(ref(uid, "c" + i));
    const m = { v: 1, salt, iter: ITER, iv: sealed.iv, z: sealed.z, chunks: sealed.chunks.length, updatedAt, device: DEVICE };
    batch.set(ref(uid, "meta"), m);
    await batch.commit();
    meta = m; ST.cloudRev = updatedAt; ST.baseModified = modified; ST.chunks = m.chunks; saveSt();
    setS({ status: "synced", lastSync: Date.now(), message: "" });
    if (dirty()) schedulePush();
  } catch (e) { fail(e); }
}

function applyCloud(cloudData, m) {
  adopt(cloudData);
  ST.baseModified = store.data.modifiedAt || 0; ST.cloudRev = m.updatedAt; ST.chunks = m.chunks; saveSt();
  setS({ status: "synced", lastSync: Date.now(), message: "" });
}

async function reconcile(m) {
  if (!S.user || !key) return;
  const uid = S.user.uid;
  if (!m) {
    if (ST.cloudRev) { setS({ status: "locked", message: "Your cloud data was deleted from another device." }); await stopSync(false); return; }
    return push();
  }
  if (m.updatedAt === ST.cloudRev) {
    setS({ status: "synced", lastSync: S.lastSync || Date.now(), message: "" });
    if (dirty()) schedulePush();
    return;
  }
  setS({ status: "working" });
  let cloud;
  try { cloud = await unseal(key, m, await readChunks(uid, m)); }
  catch (e) {
    if (e && e.name === "OperationError") { key = null; setS({ status: "locked", message: "Couldn't decrypt the cloud data with the saved passphrase." }); return; }
    throw e;
  }
  meta = m;
  if (!ST.cloudRev) {                                   // first time this device meets this account
    if (isEmpty(store.data)) return applyCloud(cloud, m);
    const pick = await choose("Your cloud data and this device both have data",
      "Choose what to keep. You can always download a backup first in Settings.", [
        { value: "merge", label: "Combine both (recommended)", hint: "Keeps everything from both; if the same item exists in both, this device's version wins." },
        { value: "cloud", label: "Use the cloud copy", hint: "Replaces what's on this device." },
        { value: "device", label: "Use this device's copy", hint: "Overwrites the cloud copy." },
      ]);
    if (!pick) { setS({ status: "locked", message: "Sync paused — nothing was changed." }); await stopSync(false); return; }
    if (pick === "cloud") return applyCloud(cloud, m);
    ST.cloudRev = m.updatedAt; ST.chunks = m.chunks;
    if (pick === "merge") adopt(mergeData(store.data, cloud));
    store.data.modifiedAt = Date.now();
    return push();
  }
  if (!dirty()) return applyCloud(cloud, m);            // simple fast-forward
  const pick = await choose("Changed on two devices",
    "This device and another device both changed data since the last sync.", [
      { value: "merge", label: "Combine both (recommended)", hint: "Keeps everything from both; this device's version wins on clashes." },
      { value: "cloud", label: "Use the other device's copy", hint: "Discards this device's recent changes." },
      { value: "device", label: "Keep this device's copy", hint: "Overwrites the cloud copy." },
    ]);
  if (!pick || pick === "cloud") return pick ? applyCloud(cloud, m) : setS({ status: "synced" });
  ST.cloudRev = m.updatedAt; ST.chunks = m.chunks;
  if (pick === "merge") { adopt(mergeData(store.data, cloud)); store.data.modifiedAt = Date.now(); }
  return push();
}

function listen() {
  if (unsub) unsub();
  const uid = S.user.uid;
  unsub = fb.F.onSnapshot(ref(uid, "meta"), snap => {
    if (snap.metadata.hasPendingWrites) return;
    const m = snap.exists() ? snap.data() : null;
    queue = queue.then(() => reconcile(m)).catch(fail);
  }, fail);
}

async function stopSync(clearKey) {
  if (unsub) { unsub(); unsub = null; }
  clearTimeout(pushTimer); pushTimer = 0;
  if (clearKey) key = null;
}

// ---------- session ----------
async function startSession(fbUser) {
  if (starting) return;
  starting = true;
  try {
    const uid = fbUser.uid;
    ST = loadSt(uid);
    setS({ user: { uid, email: fbUser.email || "", name: fbUser.displayName || "", photo: fbUser.photoURL || "" }, status: "working", message: "" });
    try { localStorage.setItem(FLAG, uid); } catch (_) { /* ignore */ }
    const snap = await fb.F.getDoc(ref(uid, "meta"));
    if (!snap.exists()) {                                // brand-new account: create the passphrase
      const v = await askPassphrase({ create: true });
      if (!v) { await signOut(); return; }
      salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
      key = await derive(v.passphrase, fromB64(salt), ITER);
      if (v.remember) keyPut(uid, { key, salt });
      ST = {}; meta = null;
      await push();
      listen();
      return;
    }
    const m = snap.data();
    salt = m.salt; meta = m; key = null;
    const cached = await keyGet(uid);
    if (cached && cached.salt === m.salt) {
      try { await unseal(cached.key, m, await readChunks(uid, m)); key = cached.key; } catch (_) { key = null; }
    }
    let error = "";
    while (!key) {
      const v = await askPassphrase({ create: false, error });
      if (!v) { setS({ status: "locked", message: "Enter your passphrase to start syncing." }); return; }
      const k = await derive(v.passphrase, fromB64(m.salt), m.iter || ITER);
      try {
        await unseal(k, m, await readChunks(uid, m));
        key = k;
        if (v.remember) keyPut(uid, { key: k, salt: m.salt });
      } catch (e) {
        if (e && e.name === "OperationError") error = "That passphrase didn't work.";
        else throw e;
      }
    }
    listen();
  } catch (e) { fail(e); }
  finally { starting = false; }
}

function observeAuth() {
  if (observing) return;
  observing = true;
  fb.A.onAuthStateChanged(fb.auth, u => {
    if (u) startSession(u);
    else { stopSync(true); setS({ user: null, status: "signed-out", message: "" }); }
  });
}

// ---------- public API ----------
/** Call once at startup: resumes an earlier session in the background (needs internet; otherwise stays dormant). */
export function init() {
  subscribe(ev => { if (ev.type === "change" && !ev.remote && key && S.user) schedulePush(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && pushTimer) push(); });
  window.addEventListener("online", () => { if (key && S.user && dirty()) push(); });
  let flagged = false;
  try { flagged = !!localStorage.getItem(FLAG); } catch (_) { /* ignore */ }
  if (firebaseConfig && flagged && navigator.onLine) {
    ensureFirebase().then(observeAuth).catch(e => console.warn("Sync unavailable:", e));
  }
}

export async function signIn() {
  try {
    setS({ status: "working", message: "" });
    await ensureFirebase();
    observeAuth();
    const provider = new fb.A.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await fb.A.signInWithPopup(fb.auth, provider);
  } catch (e) {
    if (e && (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request")) { setS({ status: S.user ? S.status : "signed-out", message: "" }); return; }
    fail(e);
    if (!S.user) setS({ status: "error" });
  }
}

export async function unlock() {
  if (!S.user || !fb) return;
  starting = false;
  await startSession(fb.auth.currentUser);
}

export async function syncNow() {
  if (!fb || !key || !S.user) return;
  try {
    const snap = await fb.F.getDoc(ref(S.user.uid, "meta"));
    queue = queue.then(() => reconcile(snap.exists() ? snap.data() : null)).catch(fail);
    await queue;
    if (dirty()) await push();
    toast("Synced");
  } catch (e) { fail(e); }
}

export async function signOut() {
  const uid = S.user && S.user.uid;
  await stopSync(true);
  try { if (fb) await fb.A.signOut(fb.auth); } catch (_) { /* ignore */ }
  if (uid) keyDel(uid);
  try { localStorage.removeItem(FLAG); } catch (_) { /* ignore */ }
  setS({ user: null, status: firebaseConfig ? "signed-out" : "unavailable", message: "" });
}

/** Delete this account's encrypted cloud data and the sign-in account itself. Local data is untouched. */
export async function deleteAccount() {
  if (!S.user || !fb) return;
  if (!confirm("Delete your cloud data and sync account?\n\nThis removes everything stored in the cloud for you and can't be undone. Data on your devices is NOT deleted.")) return;
  const uid = S.user.uid;
  try {
    setS({ status: "working" });
    const b = fb.F.writeBatch(fb.db);
    b.delete(ref(uid, "meta"));
    for (let i = 0; i < MAX_CHUNKS; i++) b.delete(ref(uid, "c" + i));
    await b.commit();
    const u = fb.auth.currentUser;
    try { await fb.A.deleteUser(u); }
    catch (e) {
      if (e.code === "auth/requires-recent-login") { await fb.A.reauthenticateWithPopup(u, new fb.A.GoogleAuthProvider()); await fb.A.deleteUser(u); }
      else throw e;
    }
    try { localStorage.removeItem(stKey(uid)); } catch (_) { /* ignore */ }
    await signOut();
    toast("Your cloud data and sync account were deleted");
  } catch (e) { fail(e); }
}
