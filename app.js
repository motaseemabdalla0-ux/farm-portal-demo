"use strict";
const $ = s => document.querySelector(s);
const esc = v => String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const state = { farm: localStorage.getItem("farm") || "demo", role: localStorage.getItem("role") || "viewer", page: 1, status: "", pivot: "" };

const NAV = [
  ["Farm", [["map", "Map view"], ["pivots", "Pivots"], ["dashboard", "Dashboard"], ["calendar", "Crop calendar"]]],
  ["Work", [["plans", "Plans"], ["operations", "Operations"], ["dispatch", "Tasks & dispatch"], ["press-yard", "Harvest & press yard"], ["machinery", "Machinery"], ["contractors", "Contractors"]]],
  ["Resources", [["inventory", "Inventory (Odoo)"], ["people", "People (Odoo HR)"]]],
  ["Insight", [["remote-sensing", "Remote sensing"], ["soil", "Soil management"], ["reports", "Reports"]]],
];
const TITLES = Object.fromEntries(NAV.flatMap(([, l]) => l));

async function api(path, opts = {}) {
  const url = path + (path.includes("?") ? "&" : "?") + "farm=" + encodeURIComponent(state.farm);
  if (window.__LOCAL_API__) { // static demo: the API runs inside the page
    const u = new URL(url, "http://x");
    const out = window.__LOCAL_API__({ method: opts.method || "GET", path: u.pathname, query: Object.fromEntries(u.searchParams), headers: { "x-role": state.role }, body: opts.body ? JSON.parse(opts.body) : null });
    const data = out.type.startsWith("application/json") ? JSON.parse(out.body) : out.body;
    return { ok: out.status < 400, status: out.status, data };
  }
  const res = await fetch(url, { ...opts, headers: { "x-role": state.role, "content-type": "application/json", ...(opts.headers || {}) } });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}
function toast(m) { const t = $("#toast"); t.textContent = m; t.style.display = "block"; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = "none", 2600); }
const cell = v => (v === null || v === undefined) ? '<td class="ns">Not supplied</td>' : `<td>${esc(v)}</td>`;

function table(t) {
  const head = `<tr>${t.columns.map(c => `<th>${esc(c)}</th>`).join("")}</tr>`;
  const body = t.rows.length ? t.rows.map(r => `<tr>${r.map(cell).join("")}</tr>`).join("") : "";
  return `<section class="tbl"><h3>${esc(t.title)}</h3><table><thead>${head}</thead><tbody>${body}</tbody></table>${t.rows.length ? "" : `<div class="empty">${esc(t.empty)}</div>`}</section>`;
}

function buildNav(cur) {
  $("#nav").innerHTML = NAV.map(([g, items]) => `<h6>${g.toUpperCase()}</h6>` + items.map(([k, n]) => `<a href="#/${k}" data-k="${k}" class="${k === cur ? "on" : ""}">${n}</a>`).join("")).join("");
}

const routes = {
  async map() {
    const { data: m } = await api("/api/map");
    const cols = Math.max(...m.parts.map(p => p.x)) + 80, rows = Math.max(...m.parts.map(p => p.y)) + 80;
    $("#main").innerHTML = `<h1>Map view</h1><div class="sub">${m.pivots} pivots · ${m.partCount} parts · ${m.fed.toLocaleString()} fed</div>
    <div class="mapwrap"><svg id="svg" viewBox="0 0 ${cols} ${rows}">${m.parts.map(p => `<circle class="${p.crop}" data-id="${esc(p.id)}" cx="${p.x}" cy="${p.y}" r="${p.r}"></circle><text x="${p.x}" y="${p.y + 4}">${esc(p.id)}</text>`).join("")}</svg>
    <div class="legend"><b>Today</b><br>Unknown map status: ${m.partCount - m.mapStatusKnown} of ${m.partCount}<br><small>Crop and stage come from recorded seasons only.</small></div>
    <div class="mapctl"><button id="zi" aria-label="Zoom in">+</button><button id="zo" aria-label="Zoom out">−</button></div><div id="pop"></div></div>`;
    let z = 1; const svg = $("#svg");
    const apply = () => svg.setAttribute("viewBox", `0 0 ${cols / z} ${rows / z}`);
    $("#zi").onclick = () => { z = Math.min(z * 1.4, 4); apply(); }; $("#zo").onclick = () => { z = Math.max(z / 1.4, 1); apply(); };
    svg.onclick = e => {
      const c = e.target.closest("circle"); if (!c) return;
      svg.querySelectorAll("circle").forEach(x => x.classList.remove("sel")); c.classList.add("sel");
      const p = m.parts.find(x => x.id === c.dataset.id);
      $("#pop").innerHTML = `<div class="popup"><h4>${esc(p.id)}</h4><div class="note">${esc(p.crop)} · ${p.areaFed} fed</div><dl><dt>Hay to date</dt><dd>Not supplied</dd><dt>Last cut</dt><dd>Not supplied</dd><dt>Recorded stage</dt><dd>Not recorded</dd><dt>NDVI</dt><dd>Not supplied</dd></dl></div>`;
    };
  },
  async pivots() {
    $("#main").innerHTML = `<h1>Pivots</h1><div class="sub">Pivot register</div>
    <div class="bar"><label>Crop<select id="fc"><option value="">All</option><option>alfalfa</option><option>wheat</option></select></label>
    <label>Road<select id="fr"><option value="">All roads</option><option>C03</option></select></label><label>Search<input id="fq" placeholder="Search field or part"></label></div><div id="tb"></div>`;
    const load = async () => {
      const qs = `?crop=${$("#fc").value}&road=${$("#fr").value}&q=${encodeURIComponent($("#fq").value)}`;
      const { data } = await api("/api/pivots" + qs);
      $("#tb").innerHTML = table({ title: `${data.total} parts`, columns: ["Pivot", "Part", "Crop", "Road", "Area, fed", "Stage", "Hay, t", "CP, %", "NDVI", "Leased"],
        rows: data.rows.map(r => [r.pivot, r.part, r.crop, r.road, r.areaFed, r.stage, r.hay, r.cp, r.ndvi, r.leased]), empty: "No matching parts" });
    };
    ["fc", "fr"].forEach(i => $("#" + i).onchange = load); $("#fq").oninput = load; load();
  },
  async operations() {
    const q = `?status=${state.status}&pivot=${state.pivot}&page=${state.page}`;
    const { data } = await api("/api/mobile/submissions" + q);
    const rows = data.rows.map(s => `<tr><td><span class="pill ${s.status}">${s.status}</span></td><td>${esc(s.operation)}</td><td>${esc(s.pivot)}${s.part ? " · " + esc(s.part) : ""}</td><td>${esc(s.contractor)} · ${esc(s.operator)}</td><td>${esc(s.work_date)}</td>
      <td>${s.bill ? esc(s.bill.id) + " (" + esc(s.bill.state) + ")" : "No bill"}</td>
      <td>${s.status === "new" ? `<button class="b" data-a="approve" data-id="${s.id}" ${data.canReview ? "" : "disabled"}>Approve</button> <button class="b g" data-a="reject" data-id="${s.id}" ${data.canReview ? "" : "disabled"}>Reject</button>` : (s.reason ? esc(s.reason) : "")}</td></tr>`).join("");
    $("#main").innerHTML = `<h1>Operations</h1><div class="sub">Field activity and native operation records</div>
    <div class="warnbox"><b>Mobile activity review · ${data.total} recorded.</b> Field submissions sync from the mobile app through Odoo. Approval creates a draft vendor bill only; it does not post the bill or move inventory.</div>
    ${data.canReview ? "" : '<div class="note">Review actions are unavailable for your current role. Evidence remains read-only.</div>'}
    <div class="bar"><label>Status<select id="st"><option value="">All statuses</option><option>new</option><option>approved</option><option>rejected</option></select></label>
    <button class="b g" id="sim">Simulate mobile submission</button></div>
    <section class="tbl"><h3>Field evidence and contractor bill review queue</h3><table><thead><tr><th>Status</th><th>Activity</th><th>Pivot</th><th>Contractor · operator</th><th>Work date</th><th>Vendor bill</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></section>
    <div class="bar"><button class="b g" id="pv" ${data.page <= 1 ? "disabled" : ""}>Previous</button><span>Page ${data.page} of ${data.pages}</span><button class="b g" id="nx" ${data.page >= data.pages ? "disabled" : ""}>Next</button></div>`;
    $("#st").value = state.status; $("#st").onchange = e => { state.status = e.target.value; state.page = 1; render(); };
    $("#pv").onclick = () => { state.page--; render(); }; $("#nx").onclick = () => { state.page++; render(); };
    $("#sim").onclick = async () => {
      const { data: m } = await api("/api/map"); const p = m.parts[Math.floor(Math.random() * m.parts.length)];
      const r = await api("/api/mobile/submissions", { method: "POST", body: JSON.stringify({ client_ref: "ui-" + Date.now(), operation: "سطارة", pivot: p.pivot, part: p.part, contractor: "مقاول تجريبي 1", work_date: new Date().toISOString().slice(0, 10) }) });
      toast(r.ok ? "Submission received from the (simulated) mobile app" : "Rejected: " + (r.data.errors || []).join(", ")); render();
    };
    $("#main").onclick = async e => {
      const b = e.target.closest("button[data-a]"); if (!b) return;
      let body = {};
      if (b.dataset.a === "approve") { const v = prompt("Rate per feddan (EGP)", "100"); if (v === null) return; body = { rate_per_fed: v }; }
      else { const v = prompt("Reason for rejection"); if (v === null) return; body = { reason: v }; }
      const r = await api(`/api/mobile/submissions/${b.dataset.id}/${b.dataset.a}`, { method: "POST", body: JSON.stringify(body) });
      toast(r.ok ? (r.data.note || "Rejected") : (r.data.error || (r.data.errors || []).join(", "))); render();
    };
  },
  async generic(slug) {
    const { status, data: d } = await api("/api/pages/" + slug);
    if (status !== 200) { $("#main").innerHTML = `<div class="empty">Page not available</div>`; return; }
    let html = `<h1>${esc(d.title)}</h1><div class="sub">${esc(d.subtitle)}</div>`;
    if (d.restricted) html += `<div class="warnbox">${esc(d.notes[0])}</div>`;
    if (d.kpis.length) html += `<div class="kpis">${d.kpis.map(k => `<div class="kpi"><small>${esc(k.label)}</small>${k.value === null ? '<b class="ns">Not supplied</b>' : `<b>${esc(k.value)}</b>`}<em>${esc(k.hint || "")}</em></div>`).join("")}</div>`;
    html += d.tables.map(table).join("");
    if (d.exports) {
      html += `<section class="tbl"><h3>Export recorded data (CSV)</h3><div class="bar" style="padding:12px 14px"><label>Start (UTC)<input id="ef" type="date" value="2026-11-19"></label><label>End, exclusive<input id="et" type="date" value="2026-11-26"></label><button class="b" id="exp">Export CSV</button></div></section>`;
    }
    if (!d.restricted) html += d.notes.map(n => `<div class="note">${esc(n)}</div>`).join("");
    $("#main").innerHTML = html;
    const exp = $("#exp");
    if (exp) exp.onclick = async () => {
      const r = await api(`/api/reports/export?from=${$("#ef").value}&to=${$("#et").value}`);
      if (!r.ok) { toast((r.data.errors || ["failed"]).join(", ")); return; }
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([r.data], { type: "text/csv" })); a.download = "records.csv"; a.click();
    };
  },
};

async function render() {
  const slug = location.hash.replace(/^#\/?/, "") || "map";
  const key = TITLES[slug] ? slug : "map";
  buildNav(key); $("#crumb").textContent = `${TITLES[key]}`;
  const farms = (await api("/api/farms")).data;
  $("#farmSel").innerHTML = farms.map(f => `<option value="${esc(f.key)}">${esc(f.name)}</option>`).join(""); $("#farmSel").value = state.farm;
  $("#farmName").textContent = (farms.find(f => f.key === state.farm) || farms[0]).name;
  $("#roleSel").value = state.role;
  const handler = routes[key];
  if (handler) await handler(); else await routes.generic(key);
}
document.addEventListener("click", e => {
  const a = e.target.closest("#nav a"); if (!a) return;
  state.page = 1; state.status = "";
  if (location.hash === a.getAttribute("href")) render(); // same page: hashchange will not fire
});
window.addEventListener("hashchange", render);
$("#farmSel").onchange = e => { state.farm = e.target.value; localStorage.setItem("farm", state.farm); state.page = 1; render(); };
$("#roleSel").onchange = e => { state.role = e.target.value; localStorage.setItem("role", state.role); render(); };
$("#search").onkeydown = e => { if (e.key === "Enter" && e.target.value.trim()) { const term = e.target.value.trim(); location.hash = "#/pivots"; setTimeout(() => { const q = $("#fq"); if (q) { q.value = term; q.dispatchEvent(new Event("input")); } }, 400); } };
render();
