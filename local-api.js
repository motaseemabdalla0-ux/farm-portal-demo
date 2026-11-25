(function(){
const defs={},cache={};
function req(n){n=n.replace('./','');if(cache[n])return cache[n].exports;const m={exports:{}};cache[n]=m;defs[n](m,m.exports,req);return m.exports}
defs["seed"]=function(module,exports,require){
// Mock data only. Codes, names and coordinates are synthetic; nothing here is real farm data.
// Convention copied from the real portal: a value nobody supplied is null (shown as "Not supplied"), never 0.

function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }

function buildFarm(key, name, prefix, seed) {
  const r = rng(seed);
  const parts = [];
  let n = 0;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 6; col++) {
      n++;
      const code = `${prefix}-${String(n).padStart(3, "0")}`;
      const kinds = n % 3 === 0 ? ["E", "W"] : ["F"];
      for (const part of kinds) {
        parts.push({
          pivot: code, part, id: `${code}-${part}`,
          crop: r() < 0.7 ? "alfalfa" : "wheat",
          road: r() < 0.4 ? "C03" : null,
          areaFed: Math.round((part === "F" ? 62 : 31) * (0.9 + r() * 0.2) * 10) / 10,
          x: 80 + col * 130, y: 80 + row * 130, rPx: 52,
          ndvi: r() < 0.6 ? Math.round((0.35 + r() * 0.5) * 100) / 100 : null,
          leased: null, stage: null,
        });
      }
    }
  }
  return { key, name, parts };
}

const ops = ["سطارة", "بدارة", "ديسك مع زحافة", "تسوية زحافة"];
const contractors = ["مقاول تجريبي 1", "مقاول تجريبي 2", "مقاول تجريبي 3"];

function buildSubmissions(parts) {
  const r = rng(7);
  const out = [];
  for (let i = 0; i < 30; i++) {
    const p = parts[Math.floor(r() * parts.length)];
    const day = 24 - Math.floor(i / 10) * 2;
    out.push({
      id: i + 1, client_ref: `seed-${i + 1}`, status: "new",
      operation: ops[Math.floor(r() * ops.length)], pivot: p.pivot, part: p.part,
      contractor: contractors[Math.floor(r() * contractors.length)], operator: "operator.demo",
      work_date: `2026-11-${day}`, recorded_at: `2026-11-${day}T12:00:00Z`,
      rate_per_fed: null, bill: null, reason: null,
    });
  }
  return out;
}

function buildDb() {
  const farms = [buildFarm("demo", "Demo Farm", "D1", 11), buildFarm("demo2", "Demo Farm 2", "D2", 23)];
  const demo = farms[0];
  return {
    farms,
    submissions: buildSubmissions(demo.parts),
    nextId: 31,
    fleet: [
      { code: "T-01", name: "Tractor 01", lat: 22.51, lon: 31.03, lastFixDays: 8, online: false },
      { code: "T-02", name: "Tractor 02", lat: 22.52, lon: 31.04, lastFixDays: 28, online: false },
      { code: "T-03", name: "Tractor 03", lat: 22.53, lon: 31.05, lastFixDays: 21, online: false },
    ],
    scenes: [
      { date: "2026-11-23", sat: "Sentinel-2C", note: "cloudy", cloud: 0 },
      { date: "2026-11-18", sat: "Sentinel-2B", note: "clear", cloud: 0 },
      { date: "2026-11-13", sat: "Sentinel-2C", note: "clear", cloud: 0 },
      { date: "2026-11-08", sat: "Sentinel-2B", note: "clear", cloud: 0 },
    ],
  };
}

module.exports = { buildDb, ops, contractors };

};
defs["pages"]=function(module,exports,require){
// Generic read-only pages. Same principle as the real portal:
// no source connected -> null (shown as "Not supplied"), never 0.
const NS = null;

function farmTotals(farm) {
  const fed = farm.parts.reduce((a, p) => a + p.areaFed, 0);
  return {
    pivots: new Set(farm.parts.map(p => p.pivot)).size,
    parts: farm.parts.length,
    fed: Math.round(fed * 10) / 10,
  };
}

function pageFor(slug, farm, db) {
  const pending = db.submissions.filter(s => s.status === "new").length;
  switch (slug) {
    case "dashboard":
      return {
        title: "Dashboard", subtitle: `${farm.name} · native farm performance and decisions`,
        kpis: [
          { label: "Operations planned", value: 0, hint: "In the selected period" },
          { label: "Awaiting review (mobile)", value: pending, hint: "Mobile submissions with status New" },
          { label: "Tasks due", value: 0, hint: "Not marked done" },
          { label: "Hay, t @ 13%", value: NS, hint: "No season-wide weighbridge aggregate" },
          { label: "CP in bale, %", value: NS, hint: "No pivot-linked lab results" },
          { label: "Margin", value: NS, hint: "Accounting integration not available" },
        ],
        tables: [
          { title: "Operations", columns: ["Status", "Operation", "Field part", "When", "Area, fed"], rows: [], empty: "No operations in this period" },
          { title: "Open tasks", columns: ["Status", "Task", "What", "When"], rows: [], empty: "No tasks in this period" },
        ],
        notes: ["Farm work records only; no inferred production, inventory or accounting."],
      };
    case "calendar":
      return {
        title: "Crop calendar", subtitle: `${farm.name} · persisted work and cut records`, kpis: [],
        tables: [{ title: "Cuts and work by week", columns: ["Week", "Pivot", "Work", "Status"], rows: [], empty: "No persisted work or cut records" }],
        notes: ["Only recorded seasons and cuts are shown. Readiness is not inferred."],
      };
    case "plans":
      return {
        title: "Plans", subtitle: `${farm.name} · saved farm plans`,
        kpis: [{ label: "Plans", value: 0, hint: "Returned by the plans service" }, { label: "Draft", value: 0 }, { label: "Season", value: NS, hint: "Not selected" }],
        tables: [{ title: "Farm plans", columns: ["Status", "Plan", "Name", "Steps", "Range", "Created"], rows: [], empty: "No saved plans" }],
        notes: ["Bulk proposal generation is unavailable. Only persisted plan records are shown."],
      };
    case "dispatch":
      return {
        title: "Tasks & dispatch", subtitle: `${farm.name} · task and resource bookings`,
        kpis: [
          { label: "Tasks today", value: 0 },
          { label: "Tractor-hours, next 48 h", value: NS, hint: "Booking duration not returned" },
          { label: "Conflicts", value: 0 },
          { label: "Operators on shift", value: NS, hint: "No shift roster connected" },
        ],
        tables: [
          { title: "Dispatch board · by tractor", columns: ["Resource", "Day 1", "Day 2", "Day 3"], rows: [], empty: "No resource bookings returned" },
          { title: "Farm tasks", columns: ["Task", "Status", "Type", "Field part", "Due"], rows: [], empty: "No tasks" },
        ],
        notes: ["Assignments are explicit booking records; never inferred from a machine's last GPS position."],
      };
    case "press-yard":
      return {
        title: "Harvest & press yard", subtitle: `${farm.name} · intake, pressing, lots`,
        kpis: [
          { label: "Weighbridge intake", value: NS, hint: "No farm-wide ticket projection" },
          { label: "Presses · capacity", value: NS },
          { label: "Lots in the yard", value: NS },
          { label: "Grade mix", value: NS },
        ],
        tables: [{ title: "Weighbridge intake today", columns: ["Ticket", "Pivot", "Net wet, t", "Moisture, %", "t @ 13 %", "Lot"], rows: [], empty: "No farm-wide weighbridge tickets are available" }],
        notes: ["Read-only page. Receiving, pressing, grading and dispatch are not performed here."],
      };
    case "machinery":
      return {
        title: "Machinery", subtitle: `${farm.name} · GPS tracker positions only`,
        kpis: [
          { label: "Working now", value: NS, hint: "GPS position does not prove machine operation" },
          { label: "Tractor hours · season", value: NS },
          { label: "Diesel · season", value: NS },
          { label: "Service due · 30 h", value: NS },
        ],
        tables: [{
          title: "Farm machinery GPS positions", columns: ["Code", "Machine", "Hours, season", "Diesel, l", "GPS", "State"],
          rows: db.fleet.map(m => [m.code, m.name, NS, NS, `${m.lat}, ${m.lon}`, `Offline · stale ${m.lastFixDays} d`]), empty: "No trackers",
        }],
        notes: ["No hour-meter or fuel feed is connected."],
      };
    case "contractors":
      return {
        title: "Contractors", subtitle: `${farm.name} · work orders, rates and bills for hired services`,
        kpis: [
          { label: "Active contractors", value: NS },
          { label: "Work orders", value: 0 },
          { label: "Draft vendor bills", value: db.submissions.filter(s => s.bill).length, hint: "Created from approved mobile activity" },
          { label: "On-time rate", value: NS },
        ],
        tables: [{ title: "Contractor work orders", columns: ["WO", "Contractor", "Work", "Pivot", "When", "Status"], rows: [], empty: "No work orders returned" }],
        notes: ["Completion requires a confirmed linked operation. This view does not post vendor bills or stock."],
      };
    case "inventory":
      return {
        title: "Inventory (Odoo)", subtitle: `${farm.name} · stock and demand`,
        kpis: [{ label: "Products tracked", value: NS }, { label: "Short in 14 days", value: NS }, { label: "Inputs on hand", value: NS }],
        tables: [{ title: "Stock and 14-day demand", columns: ["Product", "Location", "On hand", "Reserved", "Planned use 14 d", "Cover, days"], rows: [], empty: "Inventory feed unavailable" }],
        notes: ["Stock values stay unknown until supplied by Odoo."],
      };
    case "people":
      return {
        title: "People (Odoo HR)", subtitle: `${farm.name} · who is on the farm today`,
        kpis: [{ label: "Headcount", value: NS }, { label: "On shift now", value: NS }, { label: "Overtime this week", value: NS }],
        tables: [{ title: "Team by role", columns: ["Role", "Headcount", "Present", "Leave / absent"], rows: [], empty: "People records are not connected" }],
        notes: ["Names and employee records remain in Odoo HR."],
      };
    case "remote-sensing": {
      const known = farm.parts.filter(p => p.ndvi !== null);
      return {
        title: "Remote sensing", subtitle: `${farm.name} · scene products and field-part status`,
        kpis: [
          { label: "Parts with NDVI", value: `${known.length} of ${farm.parts.length}` },
          { label: "Standing DM", value: NS, hint: "0 parts with a supported estimate" },
          { label: "Latest usable scene", value: db.scenes[1].date },
        ],
        tables: [
          { title: "Scenes", columns: ["Date", "Satellite", "Condition", "Cloud %"], rows: db.scenes.map(s => [s.date, s.sat, s.note, s.cloud]), empty: "No scenes" },
          { title: "Field-part status", columns: ["Field part", "NDVI", "Daily DM", "Cut timing"], rows: farm.parts.map(p => [p.id, p.ndvi, NS, "no_cycle"]), empty: "No parts" },
        ],
        notes: ["Values are part means, not per-pixel. Missing data stays unknown; no zero is substituted."],
      };
    }
    case "soil":
      return {
        title: "Soil management", subtitle: `${farm.name} · study reference · read only`, kpis: [], tables: [], restricted: true,
        notes: ["Soil management requires an explicitly assigned farm role. Access is not inferred from farm write permissions."],
      };
    case "reports":
      return {
        title: "Reports", subtitle: `${farm.name} · recorded operational data and exports`, kpis: [],
        tables: [{
          title: "Standard reports", columns: ["Report", "Filters", "Excel", "PDF"],
          rows: ["Work report", "Application report", "Harvest & lots", "Press yard", "Machinery productivity", "Cost per pivot and per t hay", "Water", "Soil & tissue", "Alerts and response time"].map(n => [n, "—", "Unavailable", "Unavailable"]),
          empty: "",
        }],
        exports: ["submissions"],
        notes: ["Native records can be exported as CSV. Unconnected economics and stock valuations are not included."],
      };
    default:
      return null;
  }
}

module.exports = {
  pageFor, farmTotals,
  SLUGS: ["dashboard", "calendar", "plans", "dispatch", "press-yard", "machinery", "contractors", "inventory", "people", "remote-sensing", "soil", "reports"],
};

};
defs["app"]=function(module,exports,require){
const { buildDb, ops } = require("./seed");
const { pageFor, farmTotals, SLUGS } = require("./pages");

const PAGE_SIZE = 25;

function createApp() {
  const db = buildDb();
  const farmOf = key => db.farms.find(f => f.key === key) || db.farms[0];
  const json = (status, body) => ({ status, type: "application/json; charset=utf-8", body: JSON.stringify(body) });
  const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
  const findPart = (farm, pivot, part) => farm.parts.find(p => p.pivot === pivot && (!part || p.part === part));

  function validateSubmission(b, farm) {
    const errors = [];
    if (typeof b.client_ref !== "string" || !b.client_ref.trim() || b.client_ref.length > 64) errors.push("client_ref required (max 64 chars)");
    if (!ops.includes(b.operation)) errors.push("operation must be one of: " + ops.join(", "));
    if (!findPart(farm, b.pivot, b.part)) errors.push("unknown pivot/part");
    if (typeof b.contractor !== "string" || !b.contractor.trim()) errors.push("contractor required");
    if (typeof b.work_date !== "string" || !isDate(b.work_date)) errors.push("work_date must be YYYY-MM-DD");
    return errors;
  }

  function handle({ method, path, query = {}, headers = {}, body }) {
    const role = String(headers["x-role"] || "viewer").toLowerCase();
    const farm = farmOf(query.farm);

    if (method === "GET" && path === "/api/health") return json(200, { status: "ok" });
    if (method === "GET" && path === "/api/farms") return json(200, db.farms.map(f => ({ key: f.key, name: f.name, ...farmTotals(f) })));

    if (method === "GET" && path === "/api/map") {
      return json(200, {
        farm: farm.key, pivots: farmTotals(farm).pivots, partCount: farmTotals(farm).parts, fed: farmTotals(farm).fed, mapStatusKnown: 0,
        parts: farm.parts.map(p => ({ id: p.id, pivot: p.pivot, part: p.part, crop: p.crop, areaFed: p.areaFed, x: p.x, y: p.y, r: p.rPx, status: null })),
      });
    }

    if (method === "GET" && path === "/api/pivots") {
      const q = (query.q || "").toLowerCase();
      const rows = farm.parts
        .filter(p => (!query.crop || p.crop === query.crop) && (!query.road || p.road === query.road) && (!q || p.id.toLowerCase().includes(q)))
        .map(p => ({ id: p.id, pivot: p.pivot, part: p.part, crop: p.crop, road: p.road, areaFed: p.areaFed, stage: null, hay: null, cp: null, ndvi: p.ndvi, leased: null }));
      return json(200, { total: rows.length, rows });
    }

    const page = path.match(/^\/api\/pages\/([a-z-]+)$/);
    if (method === "GET" && page) {
      if (!SLUGS.includes(page[1])) return json(404, { error: "unknown page" });
      return json(200, pageFor(page[1], farm, db));
    }

    if (method === "GET" && path === "/api/mobile/submissions") {
      const all = db.submissions.filter(s => (!query.status || s.status === query.status) && (!query.pivot || s.pivot === query.pivot));
      const total = all.length;
      const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const p = Math.min(Math.max(parseInt(query.page || "1", 10) || 1, 1), pages);
      const rows = all.slice().sort((a, b) => b.recorded_at.localeCompare(a.recorded_at) || b.id - a.id).slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
      return json(200, { total, page: p, pages, rows, canReview: role === "reviewer" });
    }

    if (method === "POST" && path === "/api/mobile/submissions") {
      const b = body || {};
      const existing = db.submissions.find(s => s.client_ref === b.client_ref);
      if (existing) return json(200, { duplicate: true, submission: existing }); // idempotent: same client_ref never creates a 2nd record
      const errors = validateSubmission(b, farm);
      if (errors.length) return json(400, { errors });
      const rec = {
        id: db.nextId++, client_ref: b.client_ref, status: "new", operation: b.operation, pivot: b.pivot, part: b.part || null,
        contractor: b.contractor, operator: b.operator || "operator.demo", work_date: b.work_date,
        recorded_at: new Date().toISOString(), rate_per_fed: null, bill: null, reason: null,
      };
      db.submissions.push(rec);
      return json(201, { duplicate: false, submission: rec });
    }

    const act = path.match(/^\/api\/mobile\/submissions\/(\d+)\/(approve|reject)$/);
    if (method === "POST" && act) {
      if (role !== "reviewer") return json(403, { error: "Review actions are unavailable for your current role." });
      const s = db.submissions.find(x => x.id === Number(act[1]));
      if (!s) return json(404, { error: "not found" });
      if (s.status !== "new") return json(409, { error: `already ${s.status}` });
      const b = body || {};
      if (act[2] === "reject") {
        if (typeof b.reason !== "string" || !b.reason.trim()) return json(400, { errors: ["reason required"] });
        s.status = "rejected"; s.reason = b.reason.trim();
        return json(200, { submission: s });
      }
      const rate = Number(b.rate_per_fed);
      if (!Number.isFinite(rate) || rate <= 0) return json(400, { errors: ["rate_per_fed must be a positive number"] });
      const part = findPart(farm, s.pivot, s.part) || { areaFed: 0 };
      s.status = "approved"; s.rate_per_fed = rate;
      s.bill = { id: "BILL-" + String(s.id).padStart(4, "0"), state: "draft", amount: Math.round(rate * part.areaFed * 100) / 100 };
      return json(200, { submission: s, note: "Draft vendor bill only. Not posted; no inventory moved." });
    }

    if (method === "GET" && path === "/api/reports/export") {
      const { from, to } = query;
      if (!isDate(from || "") || !isDate(to || "")) return json(400, { errors: ["from and to must be YYYY-MM-DD"] });
      if (Date.parse(to) <= Date.parse(from)) return json(400, { errors: ["to must be after from (end exclusive)"] });
      const head = ["id", "operation", "pivot", "part", "contractor", "work_date", "status"];
      const rows = db.submissions.filter(s => s.work_date >= from && s.work_date < to)
        .map(s => head.map(h => `"${String(s[h] ?? "").replace(/"/g, '""')}"`).join(","));
      return { status: 200, type: "text/csv; charset=utf-8", body: [head.join(","), ...rows].join("\n") };
    }

    return json(404, { error: "not found" });
  }

  return { handle, db };
}

module.exports = { createApp };

};
const api=req('app').createApp();
window.__LOCAL_API__=function(r){return api.handle(r)};
})();
