"use strict";
const $ = s => document.querySelector(s);
const esc = v => String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const state = { farm: localStorage.getItem("farm") || "demo", role: localStorage.getItem("role") || "viewer", page: 1, status: "", pivot: "", farmInfo: null };

const NAV = [
  ["Farm", [["map", "Map view"], ["pivots", "Pivots"], ["dashboard", "Dashboard"], ["calendar", "Crop calendar"]]],
  ["Work", [["plans", "Plans"], ["operations", "Operations"], ["dispatch", "Tasks & dispatch"], ["press-yard", "Harvest & press yard"], ["machinery", "Machinery (خط المعدات)"], ["contractors", "Contractors (مقاولين)"]]],
  ["Resources", [["inventory", "Inventory (Odoo)"], ["people", "People (Odoo HR)"]]],
  ["Insight", [["remote-sensing", "Remote sensing"], ["soil", "Soil management"], ["reports", "Reports"]]],
];
const EXTRA = [ // groups that exist in the real portal; not built in this demo
  ["Studies · 7", [["s/alfalfa-fs", "Alfalfa feasibility study"], ["s/alfalfa-fs-summary", "Alfalfa FS – summary"], ["s/rhodes-fs", "Rhodes grass FS – summary"], ["s/wheat-fs", "Wheat FS – summary"], ["s/cotton-fs", "Cotton FS – summary"], ["s/soil-survey", "Soil survey report"], ["s/power", "Power station design"]]],
  ["Project · 5", [["s/tracker", "Project tracker"], ["s/issues", "Activities / issues"], ["s/meetings", "Meetings"], ["s/documents", "Documents"], ["s/shareholders", "Shareholders"]]],
  ["Admin · 3", [["s/users", "Users & roles"], ["s/activity", "Activity logs"], ["s/settings", "Farm settings"]]],
];
const TITLES = Object.fromEntries([...NAV, ...EXTRA].flatMap(([, l]) => l));

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
function toast(m) { const t = $("#toast"); t.textContent = m; t.style.display = "block"; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = "none", 2800); }
const cell = v => (v === null || v === undefined) ? '<td class="ns">Not supplied</td>' : `<td>${esc(v)}</td>`;

function table(t) {
  const hd = `<tr>${t.columns.map(c => `<th>${esc(c)}</th>`).join("")}</tr>`;
  const body = t.rows.length ? t.rows.map(r => `<tr>${r.map(cell).join("")}</tr>`).join("") : "";
  const empty = t.rows.length ? "" : (t.empty ? `<div class="empty"><b>${esc(t.empty)}</b>${t.sub ? `<br><span>${esc(t.sub)}</span>` : ""}</div>` : "");
  return `<section class="tbl"><h3>${esc(t.title)}${t.sub && t.rows.length ? `<small>${esc(t.sub)}</small>` : ""}</h3><table><thead>${hd}</thead><tbody>${body}</tbody></table>${empty}</section>`;
}
function kpis(items) {
  return `<div class="kpis">${items.map(k => `<div class="kpi"><small>${esc(k.label)}</small>${k.value === null ? '<b class="ns">Not supplied</b>' : `<b>${esc(k.value)}</b>`}<em>${esc(k.hint || "")}</em></div>`).join("")}</div>`;
}
function filterBar(items) {
  return `<div class="bar">${items.map(f => {
    if (f.kind === "select") return `<label>${esc(f.label)}<select ${f.disabled ? "disabled" : ""}>${f.options.map(o => `<option>${esc(o)}</option>`).join("")}</select></label>`;
    if (f.kind === "text") return `<label>${esc(f.label)}<input placeholder="${esc(f.label)}"></label>`;
    if (f.kind === "seg") return `<div class="seg">${f.options.map(o => `<button class="${o === f.value ? "on" : ""}" data-seg>${esc(o)}</button>`).join("")}</div>`;
    return `<button class="b g" disabled title="${esc(f.hint || "")}">${esc(f.label)}</button>`;
  }).join("")}</div>`;
}
function pageHead(d) {
  return `<div class="pagehead"><div><h1>${esc(d.title)}</h1><div class="sub">${esc(d.subtitle)}</div></div>
    <div class="acts">${(d.actions || []).map(a => `<button class="b g stub" data-stub="${esc(a.hint || a.label)}">${esc(a.label)}</button>`).join("")}</div></div>`;
}
function wireStubs() { $("#main").querySelectorAll("[data-stub]").forEach(b => b.onclick = () => toast(b.dataset.stub)); }

function buildNav(cur) {
  const link = ([k, n]) => `<a href="#/${k}" data-k="${k}" class="${k === cur ? "on" : ""}">${n}</a>`;
  $("#nav").innerHTML = NAV.map(([g, items]) => `<h6>${g.toUpperCase()}</h6>` + items.map(link).join("")).join("") +
    EXTRA.map(([g, items]) => `<details class="grp"><summary>${g}</summary>${items.map(link).join("")}</details>`).join("");
}

const routes = {
  async map() {
    const { data: m } = await api("/api/map");
    if (window.L && window.renderMapView) { try { window.renderMapView(m, { $, esc, toast, state }); return; } catch (e) { console.warn("satellite map failed, using plain map", e); } }
    const cols = Math.max(...m.parts.map(p => p.x)) + 80, rows = Math.max(...m.parts.map(p => p.y)) + 80;
    $("#main").innerHTML = `<h1>Map view</h1><div class="sub">${m.pivots} pivots · ${m.partCount} parts · ${m.fed.toLocaleString()} fed</div>
    <div class="mapwrap"><svg id="svg" viewBox="0 0 ${cols} ${rows}">${m.parts.map(p => `<circle class="${p.crop}" cx="${p.x}" cy="${p.y}" r="${p.r}"></circle><text x="${p.x}" y="${p.y + 4}">${esc(p.id)}</text>`).join("")}</svg></div>`;
  },

  async pivots() {
    const { data: all } = await api("/api/pivots");
    const fi = state.farmInfo;
    $("#main").innerHTML = `${pageHead({ title: "Pivots", subtitle: `${fi.name} · ${fi.pivots} pivots · ${fi.parts} field parts · ${fi.fed.toLocaleString()} fed`, actions: [{ label: "Export", hint: "Export is not available in this demo" }, { label: "Import KML", hint: "Import is not available in this demo" }] })}
    <div class="bar"><label>Season (rent year)<select disabled><option>Select season</option></select></label></div>
    ${kpis([
      { label: "Leased pivots", value: null, hint: "Active lease dates are incomplete" }, { label: "Leased area", value: null, hint: "Not all lease areas are confirmed" },
      { label: "Hay to date · 13 % moisture", value: null, hint: "No season-wide weighbridge aggregate" }, { label: "CP in bale · last cuts", value: null, hint: "No pivot-linked lab results" },
      { label: "Open alerts", value: null, hint: "Alert feed is not connected to the pivot register" }])}
    <div class="sub" style="margin:4px 0 8px">All leased pivots · season not selected</div>
    <div class="bar"><div class="seg" id="seg"><button class="on">All ${all.total}</button><button>Harvest —</button><button>Ready —</button><button>Dry-down —</button><button>Alerts —</button></div>
    <label>Road<select id="fr"><option value="">All roads</option><option>C03</option></select></label>
    <label>Crop<select id="fc"><option value="">All</option><option>alfalfa</option><option>wheat</option></select></label>
    <label>Columns<select id="cols"><option>Agronomy</option><option>Harvest planning (regrowth, bloom, dry-down, PHI, night slot)</option><option>Stand (stems/m², date)</option><option>Economics</option><option>Water (incl. irrigation off since)</option><option>Lease</option></select></label>
    <label>Search<input id="fq" placeholder="Search field or part"></label></div><div id="tb"></div>
    <div class="note">The columns follow the supplied farm register. Stage, cuts, yield, CP, NDVI, water, next work and alerts remain unknown unless supplied by their native sources. A boundary alone is never treated as an active lease.</div>`;
    const load = async () => {
      const { data } = await api(`/api/pivots?crop=${$("#fc").value}&road=${$("#fr").value}&q=${encodeURIComponent($("#fq").value)}`);
      $("#tb").innerHTML = table({ title: "Pivot register", sub: `${data.total} parts`, columns: ["Stage", "Pivot", "Part", "Road", "Leased, fed", "Cuts", "Hay, t", "t hay/fed vs plan", "Cuts taken", "CP in bale, %", "NDVI", "Water / ETc", "Next", "Alerts"],
        rows: data.rows.map(r => [r.stage, r.pivot, r.crop ? `${r.part} · ${r.crop}` : r.part, r.road, r.leased, null, r.hay, null, null, r.cp, r.ndvi, null, null, null]), empty: "No matching parts" });
    };
    ["fc", "fr"].forEach(i => $("#" + i).onchange = load); $("#fq").oninput = load; load();
    $("#seg").querySelectorAll("button").forEach(b => b.onclick = () => { $("#seg").querySelectorAll("button").forEach(x => x.classList.remove("on")); b.classList.add("on"); });
    wireStubs();
  },

  async operations() {
    const { data: m } = await api("/api/map");
    const q = `?status=${state.status}&pivot=${encodeURIComponent(state.pivot)}&page=${state.page}`;
    const { data } = await api("/api/mobile/submissions" + q);
    const rows = data.rows.map(s => `<tr><td><span class="pill ${s.status}">${s.status}</span></td><td>${esc(s.operation)}<br><small>${esc(s.operation)} · ${esc(s.pivot)}</small></td><td>${esc(s.pivot)}${s.part ? " · " + esc(s.part) : ""}</td><td>${esc(s.contractor)}<br><small>${esc(s.operator)}</small></td><td>${esc(s.work_date)}<br><small>Recorded ${esc(s.recorded_at.slice(0, 10))}</small></td>
      <td>${s.bill ? esc(s.bill.id) + " (" + esc(s.bill.state) + ")" : "No bill"}</td>
      <td>${s.status === "new" ? `<button class="b" data-a="approve" data-id="${s.id}" ${data.canReview ? "" : "disabled"}>Approve</button> <button class="b g" data-a="reject" data-id="${s.id}" ${data.canReview ? "" : "disabled"}>Reject</button>` : (s.reason ? esc(s.reason) : "")}</td></tr>`).join("");
    const pivots = [...new Set(m.parts.map(p => p.pivot))];
    $("#main").innerHTML = `${pageHead({ title: "Operations", subtitle: `${state.farmInfo.name} · field activity and native operation records` })}
    <div class="warnbox"><b>Mobile activity review · ${data.total} recorded.</b> Field submissions sync from the mobile app through Odoo. Review the original contractor and operator evidence, application rates and prices before approval. Approval creates a draft vendor bill only; it does not post the bill or move inventory.</div>
    <div class="note">Independent review queue. Pivot and status filters apply here; planned-operation season and period filters do not.</div>
    <div class="bar"><label>Pivot<select id="pv"><option value="">All pivots</option>${pivots.map(p => `<option ${p === state.pivot ? "selected" : ""}>${esc(p)}</option>`).join("")}</select></label>
    <label>Status<select id="st"><option value="">All statuses</option><option>new</option><option>approved</option><option>rejected</option></select></label>
    <button class="b g" id="refresh">Refresh</button><button class="b g" id="sim">Simulate mobile submission</button></div>
    ${data.canReview ? "" : '<div class="note">Review actions are unavailable for your current role. Evidence remains read-only.</div>'}
    <section class="tbl"><h3>Field evidence and contractor bill review queue</h3><table><thead><tr><th>Status</th><th>Activity / evidence</th><th>Pivot</th><th>Contractor · operator</th><th>Work date · recorded</th><th>Vendor bill</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></section>
    <div class="bar"><span>Showing ${(data.page - 1) * 25 + 1}–${Math.min(data.page * 25, data.total)} of ${data.total}</span><button class="b g" id="prev" ${data.page <= 1 ? "disabled" : ""}>Previous</button><span>Page ${data.page} of ${data.pages}</span><button class="b g" id="next" ${data.page >= data.pages ? "disabled" : ""}>Next</button></div>
    <div class="note">Financial details are hidden because cost access is not granted.</div>
    <h2 class="h2">Native planned operations</h2><div class="note">Records returned by the operations service. Season and period controls here apply only to this list, not the mobile review queue.</div>
    <div class="bar"><label>Season<select disabled><option>All seasons</option></select></label><label>Period<select><option>Last 7 and next 7 days</option><option>Last 30 days</option><option>Season to date</option><option>Custom dates</option></select></label>
    <button class="b g" disabled>+ New operation</button><button class="b g" disabled>Plans</button><button class="b g" disabled>Export</button></div>
    ${kpis([{ label: "Operations", value: 0, hint: "Returned in selected period" }, { label: "Awaiting confirmation", value: 0, hint: "Returned operation status" }, { label: "Area mown today", value: null, hint: "No completed mowing area returned for today" }, { label: "Fertigation · next 14 days", value: null, hint: "Returned future operation records only" }, { label: "Late", value: 0, hint: "Planned end times before now" }])}
    <div class="bar"><div class="seg"><button class="on">All 0</button><button>Planned 0</button><button>Conflict 0</button><button>In progress 0</button><button>Awaiting 0</button><button>Done 0</button></div><label>Type<select><option>All types</option></select></label><label>Road<select><option>All roads</option></select></label></div>
    ${table({ title: "Farm operations", columns: ["Status", "ID", "Date", "Operation", "Pivot", "Area plan / done, fed", "Machine · implement", "Inputs / output · finish", "Source"], rows: [], empty: "No operations returned for this period", sub: "The native service returned no operation records for the selected season and date range." })}`;
    $("#st").value = state.status;
    $("#st").onchange = e => { state.status = e.target.value; state.page = 1; render(); };
    $("#pv").onchange = e => { state.pivot = e.target.value; state.page = 1; render(); };
    $("#refresh").onclick = () => render();
    $("#prev").onclick = () => { state.page--; render(); }; $("#next").onclick = () => { state.page++; render(); };
    $("#sim").onclick = async () => {
      const p = m.parts[Math.floor(Math.random() * m.parts.length)];
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
    let html = pageHead(d);
    if (d.tabs) html += `<div class="tabs">${d.tabs.map((t, i) => `<button class="${i === 0 ? "on" : ""}" data-tab>${esc(t)}</button>`).join("")}</div>`;
    if (d.restricted) html += `<div class="warnbox">${esc(d.notes[0])}</div><div class="warnbox">${esc(d.notes[1] || "")}</div><button class="b g" id="retry">Retry</button>`;
    if (d.filters) html += filterBar(d.filters);
    if (d.kpis && d.kpis.length) html += kpis(d.kpis);
    if (d.map) {
      html += `<section class="tbl"><h3>Farm map · NDVI<small>${d.map.known} of ${d.map.total} parts with values</small></h3>
        <div class="bar" style="padding:10px 14px"><div class="seg" id="layers">${d.map.layers.map((l, i) => `<button class="${i === 0 ? "on" : ""}" data-layer="${esc(l)}">${esc(l)}</button>`).join("")}</div>
        <label>Scene<select>${d.map.scenes.map(s => `<option>${esc(s)}</option>`).join("")}</select></label></div>
        <div id="rsel" class="rsmap"></div>
        <div class="legendbar"><i style="background:#d9534f"></i>Low <i style="background:#f0ad4e"></i>Mid <i style="background:#2e8b57"></i>High <i style="background:#9aa0a6"></i>Unknown</div></section>`;
    }
    if (d.cards) {
      html += `<div class="cards">${d.cards.map(c => `<div class="card"><h3>${esc(c.title)}</h3><p>${esc(c.desc)}</p><small>Filters: ${esc(c.filters)}</small>
        <div class="cbtn"><button class="b g stub" data-stub="${esc(c.note)}">Open</button><button class="b g stub" data-stub="Report export is unavailable until a matching output source is connected.">Excel</button><button class="b g stub" data-stub="PDF output is unavailable until a matching report source is connected.">PDF</button></div><div class="note">${esc(c.note)}</div></div>`).join("")}</div>`;
    }
    if (d.tables && d.tables.length) html += d.tables.map(table).join("");
    if (d.datasets) {
      html += `<section class="tbl"><h3>Report catalogue<small>Persisted native Farm records only</small></h3>
        <div class="bar" style="padding:12px 14px"><label>Dataset<select id="ds">${d.datasets.map(x => `<option>${esc(x)}</option>`).join("")}</select></label>
        <label>Start date (UTC)<input id="ef" type="date" value="2026-11-19"></label><label>End date, exclusive (UTC)<input id="et" type="date" value="2026-11-26"></label><label>Season (optional)<input placeholder="Season key"></label>
        <button class="b" id="pre">Preview</button><button class="b g" id="exp">Export CSV</button></div><div id="prev"></div></section>`;
    }
    if (!d.restricted) html += (d.notes || []).map(n => `<div class="note">${esc(n)}</div>`).join("");
    $("#main").innerHTML = html;
    wireStubs();
    $("#main").querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { $("#main").querySelectorAll("[data-tab]").forEach(x => x.classList.remove("on")); b.classList.add("on"); });
    $("#main").querySelectorAll(".seg [data-seg]").forEach(b => b.onclick = () => { b.parentElement.querySelectorAll("button").forEach(x => x.classList.remove("on")); b.classList.add("on"); });
    if (d.map && window.L && window.renderNdviMap) {
      const { data: m } = await api("/api/map");
      let layer = "NDVI"; const draw = () => window.renderNdviMap($("#rsel"), d.map, m, layer); draw();
      $("#layers").onclick = e => { const b = e.target.closest("[data-layer]"); if (!b) return; $("#layers").querySelectorAll("button").forEach(x => x.classList.remove("on")); b.classList.add("on"); layer = b.dataset.layer; draw(); };
    }
    const retry = $("#retry"); if (retry) retry.onclick = () => toast("Soil reference feed is restricted to permitted portal administrators");
    const pre = $("#pre");
    if (pre) {
      const run = async () => {
        const r = await api(`/api/reports/preview?dataset=${encodeURIComponent($("#ds").value)}&from=${$("#ef").value}&to=${$("#et").value}`);
        if (!r.ok) { $("#prev").innerHTML = `<div class="warnbox">${esc((r.data.errors || ["failed"]).join(", "))}</div>`; return; }
        $("#prev").innerHTML = table({ title: `Recorded data preview · ${r.data.total} rows`, columns: r.data.columns, rows: r.data.rows, empty: "No records in this UTC window", sub: "Try another date range or dataset. Null fields are shown as Not supplied and are not treated as zero." });
      };
      pre.onclick = run; run();
      $("#exp").onclick = async () => {
        const r = await api(`/api/reports/export?from=${$("#ef").value}&to=${$("#et").value}`);
        if (!r.ok) { toast((r.data.errors || ["failed"]).join(", ")); return; }
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([r.data], { type: "text/csv" })); a.download = "records.csv"; a.click();
      };
    }
  },

  async info(slug) { // pages that exist in the real portal but are not part of this demo
    $("#main").innerHTML = `${pageHead({ title: TITLES["s/" + slug] || slug, subtitle: `${state.farmInfo.name} · not built in this demo` })}<div class="warnbox">This section exists in the real portal. It is not part of the demo, and no data is shown.</div>`;
  },
};

async function render() {
  const slug = location.hash.replace(/^#\/?/, "") || "map";
  const isInfo = slug.startsWith("s/");
  const key = TITLES[slug] ? slug : "map";
  buildNav(key);
  const farms = (await api("/api/farms")).data;
  state.farmInfo = farms.find(f => f.key === state.farm) || farms[0];
  $("#farmSel").innerHTML = farms.map(f => `<option value="${esc(f.key)}">${esc(f.name)}</option>`).join(""); $("#farmSel").value = state.farm;
  $("#farmName").textContent = state.farmInfo.name;
  $("#sideFoot").textContent = `${state.farmInfo.name} · ${state.farmInfo.pivots} pivots · ${Math.round(state.farmInfo.fed).toLocaleString()} fed`;
  $("#roleSel").value = state.role;
  $("#crumb").innerHTML = key === "map" ? "<b>Map view</b>" : `<a href="#/map">Map view</a> ›<a href="#/pivots">${esc(state.farmInfo.name)}</a> › <b>${esc(TITLES[key].replace(/ \(.*\)/, ""))}</b>`;
  $("#main").onclick = null;
  if (isInfo) return routes.info(slug.slice(2));
  const handler = routes[key];
  if (handler) await handler(); else await routes.generic(key);
}
document.addEventListener("click", e => {
  const a = e.target.closest("#nav a"); if (!a) return;
  state.page = 1; state.status = ""; state.pivot = "";
  if (location.hash === a.getAttribute("href")) render(); // same page: hashchange will not fire
});
window.addEventListener("hashchange", render);
$("#farmSel").onchange = e => { state.farm = e.target.value; localStorage.setItem("farm", state.farm); state.page = 1; render(); };
$("#roleSel").onchange = e => { state.role = e.target.value; localStorage.setItem("role", state.role); render(); };
$("#bell").onclick = () => toast("Notifications · 0 unread");
$("#lang").onclick = () => { const rtl = document.documentElement.dir !== "rtl"; document.documentElement.dir = rtl ? "rtl" : "ltr"; $("#lang").textContent = rtl ? "English" : "العربية"; };
$("#search").onkeydown = e => { if (e.key === "Enter" && e.target.value.trim()) { const term = e.target.value.trim(); location.hash = "#/pivots"; setTimeout(() => { const q = $("#fq"); if (q) { q.value = term; q.dispatchEvent(new Event("input")); } }, 400); } };
render();
