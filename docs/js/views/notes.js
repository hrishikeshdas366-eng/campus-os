import { esc, fmtDate, iso, subjectOptions, openForm, toast } from "../ui.js";
import { update, uid } from "../store.js";
import { noteForm, subjById, subjectTag } from "../actions.js";
import { pageHead, emptyState } from "./common.js";

let q = "", subj = "";

function safeUrl(u) {
  u = (u || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try { const p = new URL(u); return /^https?:$/.test(p.protocol) ? p.href : ""; } catch (_) { return ""; }
}

function linkForm(link, d) {
  openForm({
    eyebrow: link ? "Edit link" : "New link", title: link ? link.title : "Save a useful link",
    fields: [
      { name: "title", label: "Title", required: true, full: true, value: link && link.title, maxlength: 120, placeholder: "e.g. NPTEL — DBMS lectures" },
      { name: "url", label: "URL", required: true, full: true, value: link && link.url, placeholder: "https://…" },
      { name: "subjectId", label: "Subject", type: "select", options: subjectOptions(d.subjects, true), value: (link && link.subjectId) || "", full: true },
    ],
    onSubmit: v => {
      const u = safeUrl(v.url);
      if (!u) { toast("That doesn't look like a web address", { error: true }); return false; }
      v.url = u;
      update(dd => { if (link) Object.assign(dd.links.find(x => x.id === link.id), v); else dd.links.push(Object.assign({ id: uid() }, v)); });
    },
    onDelete: link ? () => update(dd => { dd.links = dd.links.filter(x => x.id !== link.id); }) : null,
  });
}

function cards(d) {
  const needle = q.trim().toLowerCase();
  const list = d.notes.filter(n => (!subj || n.subjectId === subj) && (!needle || ((n.title || "") + " " + (n.body || "")).toLowerCase().includes(needle)))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updated || "").localeCompare(a.updated || ""));
  if (!list.length) return emptyState(d.notes.length ? "No notes match" : "No notes yet", d.notes.length ? "Try a different search or subject." : "Lecture notes, formulas, ideas — keep them all here.", d.notes.length ? "" : '<button class="btn sm" data-a="add">+ New note</button>');
  return '<div class="grid auto">' + list.map(n =>
    '<div class="card hover note" data-a="edit" data-id="' + n.id + '"><div class="spread"><div class="h-sm">' + esc(n.title || "Untitled") + "</div>" + (n.pinned ? '<span class="mono">PINNED</span>' : "") + "</div>" +
    '<div class="body">' + esc(n.body || "") + '</div><div class="foot"><span>' + subjectTag(n.subjectId) + '</span><span class="mono faint">' + esc(n.updated ? fmtDate(n.updated.slice(0, 10)) : "") + "</span></div></div>").join("") + "</div>";
}

export function render(root, d) {
  root.innerHTML = '<div class="page">' +
    pageHead("07", "Notes", '<button class="btn solid" data-a="add">+ New note</button>', "Notes & links") +
    '<div class="row fade-up" style="--d:.2s;margin-bottom:22px"><input id="n-q" type="search" placeholder="Search notes…" value="' + esc(q) + '" style="max-width:340px">' +
    '<select id="n-s" style="width:auto"><option value="">All subjects</option>' + d.subjects.map(s => '<option value="' + s.id + '"' + (subj === s.id ? " selected" : "") + ">" + esc(s.name) + "</option>").join("") + "</select></div>" +
    '<div id="n-grid">' + cards(d) + "</div>" +
    '<section class="section"><div class="section-head"><h2 class="h-md">Links</h2><button class="btn sm" data-a="add-link">+ Add link</button></div>' +
    (d.links.length ? '<div class="list">' + d.links.map(l =>
      '<div class="item"><div class="grow"><a class="title" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.title) + '</a><div class="sub">' + esc(l.url) + "</div></div>" + subjectTag(l.subjectId) +
      '<button class="btn xs ghost" data-a="edit-link" data-id="' + l.id + '">Edit</button></div>').join("") + "</div>" : '<p class="muted">Save course pages, drive folders, lecture playlists…</p>') +
    "</section></div>";

  const grid = root.querySelector("#n-grid");
  root.querySelector("#n-q").addEventListener("input", e => { q = e.target.value; grid.innerHTML = cards(d); });
  root.querySelector("#n-s").addEventListener("change", e => { subj = e.target.value; grid.innerHTML = cards(d); });
  root.addEventListener("click", e => {
    const b = e.target.closest("[data-a]");
    if (!b) return;
    const a = b.dataset.a;
    if (a === "add") noteForm(null, subj ? { subjectId: subj } : null);
    else if (a === "edit") noteForm(d.notes.find(n => n.id === b.dataset.id));
    else if (a === "add-link") linkForm(null, d);
    else if (a === "edit-link") linkForm(d.links.find(l => l.id === b.dataset.id), d);
  });
}
