import { esc, today, fmtDate, money, MONTHS, openForm } from "../ui.js";
import { update } from "../store.js";
import { moneyForm } from "../actions.js";
import { pageHead, emptyState } from "./common.js";

let month = today().slice(0, 7);

function shift(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

export function render(root, d, ctx) {
  const cur = d.settings.currency || "₹";
  const [y, m] = month.split("-").map(Number);
  const items = d.money.filter(x => x.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
  const spent = items.filter(x => x.kind === "expense").reduce((s, x) => s + Number(x.amount), 0);
  const income = items.filter(x => x.kind === "income").reduce((s, x) => s + Number(x.amount), 0);
  const budget = Number(d.settings.monthlyBudget) || 0;
  const isNow = month === today().slice(0, 7);
  const dayCount = new Date(y, m, 0).getDate();
  const elapsed = isNow ? new Date().getDate() : dayCount;
  const cats = {};
  items.filter(x => x.kind === "expense").forEach(x => { cats[x.category] = (cats[x.category] || 0) + Number(x.amount); });
  const catList = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const maxCat = catList.length ? catList[0][1] : 1;
  const over = budget && spent > budget;

  root.innerHTML = '<div class="page">' +
    pageHead("08", "Budget", '<button class="btn" data-a="income">+ Income</button><button class="btn solid" data-a="expense">+ Expense</button>', "Money") +
    '<div class="spread fade-up" style="--d:.15s;margin-bottom:20px"><button class="btn sm icon ghost" data-a="prev" aria-label="Previous month">←</button><span class="h-md">' + MONTHS[m - 1] + " " + y +
    '</span><button class="btn sm icon ghost" data-a="next" aria-label="Next month">→</button></div>' +
    '<section class="att-hero fade-up" style="--d:.2s"><div class="num big ' + (over ? "bad" : "") + '" style="font-size:clamp(70px,13vw,220px)">' + esc(money(spent, cur)) + '</div>' +
    '<div class="stack" style="gap:12px;padding-bottom:1vw"><div class="h-md">spent' + (budget ? " of " + esc(money(budget, cur)) : "") + '</div>' +
    (budget ? '<div class="bar" style="max-width:420px"><i class="' + (over ? "bad" : "good") + '" style="width:' + Math.min(100, spent / budget * 100) + '%"></i></div>' : "") +
    '<div class="muted">' + (budget ? (over ? esc(money(spent - budget, cur)) + " over budget" : esc(money(budget - spent, cur)) + " left") + " · " : "") + esc(money(elapsed ? spent / elapsed : 0, cur)) + " / day · income " + esc(money(income, cur)) + "</div>" +
    '<button class="btn xs" data-a="budget" style="align-self:flex-start">' + (budget ? "Change" : "Set") + " monthly budget</button></div></section>" +
    '<section class="section"><div class="grid g2" style="gap:clamp(20px,4vw,56px);align-items:start"><div><div class="section-head"><h2 class="h-md">Categories</h2></div>' +
    (catList.length ? catList.map(c => '<div class="cat-row"><span>' + esc(c[0]) + '</span><div class="bar"><i style="width:' + (c[1] / maxCat * 100) + '%"></i></div><span class="num" style="font-size:16px;text-align:right">' + esc(money(c[1], cur)) + "</span></div>").join("") : '<p class="muted">No expenses this month.</p>') +
    '</div><div><div class="section-head"><h2 class="h-md">Entries</h2><span class="mono">' + items.length + "</span></div>" +
    (items.length ? '<div class="list">' + items.map(x => '<div class="item" data-a="edit" data-id="' + x.id + '" style="cursor:pointer"><span class="mono muted" style="width:80px;flex:none">' + esc(fmtDate(x.date, { weekday: false })) + '</span><div class="grow"><div class="title">' + esc(x.category) + '</div><div class="sub">' + esc(x.note || "") + '</div></div><span class="num ' + (x.kind === "income" ? "good" : "") + '" style="font-size:20px">' + (x.kind === "income" ? "+" : "−") + esc(money(x.amount, cur)) + "</span></div>").join("") + "</div>" :
      emptyState("Nothing logged", "Track canteen runs, travel, books and pocket money.", '<button class="btn sm" data-a="expense">+ Add expense</button>')) +
    "</div></div></section></div>";

  root.addEventListener("click", e => {
    const b = e.target.closest("[data-a]");
    if (!b) return;
    const a = b.dataset.a;
    if (a === "expense") moneyForm(null, "expense");
    else if (a === "income") moneyForm(null, "income");
    else if (a === "edit") moneyForm(d.money.find(x => x.id === b.dataset.id));
    else if (a === "prev") { month = shift(month, -1); ctx.refresh(); }
    else if (a === "next") { month = shift(month, 1); ctx.refresh(); }
    else if (a === "budget") openForm({
      eyebrow: "Budget", title: "Monthly budget",
      fields: [{ name: "amount", label: "Amount (" + cur + ") — 0 to switch off", type: "number", min: 0, step: 1, value: budget, full: true }],
      onSubmit: v => update(dd => { dd.settings.monthlyBudget = Math.max(0, v.amount || 0); }),
    });
  });
}
