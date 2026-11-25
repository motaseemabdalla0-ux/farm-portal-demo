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
  for (let row = 0; row < 8 && n < 62; row++) {
    for (let col = 0; col < 8 && n < 62; col++) {
      n++;
      const code = `${prefix}-${String(n).padStart(3, "0")}`;
      const kinds = n % 5 === 0 ? ["E", "W"] : ["F"]; // 62 pivots, 12 of them split in two parts = 74 parts (same counts as the real farm)
      for (const part of kinds) {
        parts.push({
          pivot: code, part, id: `${code}-${part}`,
          crop: r() < 0.7 ? "alfalfa" : "wheat",
          road: r() < 0.4 ? "C03" : null,
          areaFed: Math.round((part === "F" ? 66 : 33) * (0.9 + r() * 0.2) * 10) / 10,
          x: 80 + col * 130, y: 80 + row * 130, rPx: 52,
          ndvi: r() < 0.37 ? Math.round((0.35 + r() * 0.5) * 100) / 100 : null, // 27 of 74 parts have values in the real portal
          leased: null, stage: null,
        });
      }
    }
  }
  // Normalise so the farm total equals the real farm's 4,875.5 fed.
  const total = parts.reduce((t, p) => t + p.areaFed, 0), k = 4875.5 / total;
  parts.forEach(p => { p.areaFed = Math.round(p.areaFed * k * 10) / 10; });
  const diff = Math.round((4875.5 - parts.reduce((t, p) => t + p.areaFed, 0)) * 10) / 10;
  parts[parts.length - 1].areaFed = Math.round((parts[parts.length - 1].areaFed + diff) * 10) / 10;
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
// Read-only pages modelled on the real portal. Principle copied from it:
// no source connected -> null (rendered "Not supplied"), never 0.
const NS = null;
const btn = (label, hint) => ({ label, disabled: true, hint: hint || "Not available in this demo" });
const sel = (label, options, extra = {}) => ({ kind: "select", label, options, ...extra });

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
  const bills = db.submissions.filter(s => s.bill).length;
  switch (slug) {
    case "dashboard":
      return {
        title: "Dashboard", subtitle: `${farm.name} · native farm performance and decisions`,
        filters: [sel("Period", ["Today", "This week"])],
        kpis: [
          { label: "Operations planned", value: 0, hint: "In the selected period" },
          { label: "In progress", value: 0, hint: "Persisted operation status" },
          { label: "Tasks due", value: 0, hint: "Not marked done" },
          { label: "Tasks done", value: 0, hint: "Persisted task status" },
          { label: "Awaiting review (mobile)", value: pending, hint: "Mobile submissions with status New" },
          { label: "Manual tickets", value: 0, hint: "Recorded weighbridge tickets" },
          { label: "Hay, t @ 13%", value: NS, hint: "No season-wide weighbridge aggregate" },
          { label: "CP in bale, %", value: NS, hint: "No pivot-linked lab results" },
          { label: "Margin", value: NS, hint: "Accounting integration not available" },
        ],
        tables: [
          { title: "Operations", columns: ["Status", "Operation", "Field part", "When", "Area, fed"], rows: [], empty: "No operations in this period", sub: "The native service returned no scheduled operations for these dates." },
          { title: "Open tasks", columns: ["Status", "Task", "What", "When"], rows: [], empty: "No tasks in this period", sub: "The native service returned no tasks due in these dates." },
          { title: "Risks · blocked plan targets", columns: ["Plan", "Field part", "Blocked because"], rows: [], empty: "No blocked targets", sub: "No blocked plan targets were returned by the native service." },
        ],
        notes: ["Farm work records and manual weighbridge; no inferred production, inventory or accounting. Accounting margin and vs-plan figures remain unknown until their source is connected."],
      };
    case "calendar":
      return {
        title: "Crop calendar", subtitle: `${farm.name} · persisted work and cut records`,
        filters: [sel("Season", ["All seasons"]), sel("Road", ["All roads", ...new Set(farm.parts.map(p => p.road).filter(Boolean))]), sel("View", ["Month", "Week"])],
        kpis: [{ label: "Cuts recorded", value: 0 }, { label: "Work records", value: 0 }, { label: "Next cut", value: NS, hint: "Readiness is not inferred" }],
        tables: [{ title: "Cuts and work by week", columns: ["Week", "Pivot", "Work", "Status"], rows: [], empty: "No persisted work or cut records" }],
        notes: ["Only recorded seasons and cuts are shown."],
      };
    case "plans":
      return {
        title: "Plans", subtitle: `${farm.name} · saved farm plans`,
        actions: [btn("+ New plan", "Plan creation is not available in this demo")],
        filters: [sel("Season", ["All seasons"]), { kind: "button", label: "Generate proposal", disabled: true, hint: "Bulk proposal generation is unavailable. Open a saved draft to run its server preview." }],
        kpis: [{ label: "Plans", value: 0, hint: "Returned by the native plans service" }, { label: "Draft", value: 0 }, { label: "Generated", value: 0 }, { label: "Season", value: NS, hint: "All plans · all seasons" }],
        tables: [
          { title: "Templates", columns: ["Template", "Steps"], rows: [], empty: "No template catalogue is exposed by the native plans service." },
          { title: "Farm plans", columns: ["Status", "Plan", "Name", "Steps", "Range", "Day 0 or trigger", "Created"], rows: [], empty: "No saved plans", sub: "The native plans endpoint returned no plans for this season." },
        ],
        notes: ["Only persisted plan records are shown. Scenario and lease state come from the native service; field geometry does not imply an active lease."],
      };
    case "dispatch":
      return {
        title: "Tasks & dispatch", subtitle: `${farm.name} · native task and resource bookings`,
        actions: [btn("Publish to operators", "No authorized dispatch publish mutation is available. The board will not send messages."), btn("Print dispatch sheet")],
        filters: [{ kind: "seg", options: ["Next 72 hours", "Tonight"], value: "Next 72 hours" }],
        kpis: [
          { label: "Tasks today", value: 0, hint: "Open native task records" },
          { label: "Tractor-hours, next 48 h", value: NS, hint: "Booking duration data is not returned" },
          { label: "Conflicts", value: 0, hint: "Native dispatch checks for this window" },
          { label: "Window breaches, 72 h", value: NS, hint: "No window-breach summary is available" },
          { label: "Operators on shift", value: NS, hint: "No shift roster is connected" },
        ],
        tables: [
          { title: "Dispatch board · by tractor", columns: ["Resource", "Day 1", "Day 2", "Day 3"], rows: [], empty: "No resource bookings returned", sub: "Booking requires dispatch write access." },
          { title: "Dispatch conflicts and required actions", columns: ["Level", "Conflict / required action", "Task"], rows: [], empty: "No conflicts returned" },
          { title: "Dispatch checks", columns: ["Check", "Result", "Detail"], rows: [], empty: "No check details returned" },
          { title: "Tasks awaiting a resource slot", columns: ["Task", "Work", "Pivot", "Due", "Night · finish"], rows: [], empty: "No tasks waiting for a slot" },
          { title: "Farm tasks", columns: ["Task", "Status", "Type", "Field part", "Planned start", "Due", "Assigned user ID"], rows: [], empty: "No tasks" },
        ],
        notes: ["Resource assignments are explicit booking records. They are never inferred from a machine's last GPS position."],
      };
    case "press-yard":
      return {
        title: "Harvest & press yard", subtitle: `${farm.name} · intake, pressing, lot genealogy and dispatch status`,
        actions: [btn("Open existing harvest entry")],
        kpis: [
          { label: "Weighbridge intake", value: NS, hint: "No farm-wide ticket projection; intake is per pivot" },
          { label: "Presses · current capacity", value: NS, hint: "No press telemetry or production status feed" },
          { label: "Lots in the yard", value: NS, hint: "No yard inventory or lot-genealogy source" },
          { label: "Grade mix · season", value: NS, hint: "No yard grading or season aggregate source" },
        ],
        tables: [
          { title: "Weighbridge intake today", columns: ["Ticket · time", "Pivot", "Load", "Net wet, t", "Field meter, %", "Yard moisture, %", "t @ 13 %", "Lot"], rows: [], empty: "No farm-wide weighbridge tickets are available" },
          { title: "Presses · now", columns: ["Press line", "Current state", "Capacity", "Shift output", "Queue", "Power / availability"], rows: [[NS, NS, NS, NS, NS, NS]], empty: "" },
          { title: "Lots in the yard", columns: ["Lot", "From", "Form", "t @ 13 %", "Days in yard", "Feed moisture, % (tested)", "CP in bale, %", "Grade", "PY/IN", "Status"], rows: [], empty: "Yard lots are unavailable" },
          { title: "New press lot · preview", columns: ["Field lot", "Target press lot", "Input t @ 13 %", "Output / waste", "Press line", "Run status"], rows: [[NS, NS, NS, NS, NS, NS]], empty: "" },
          { title: "Season grade mix (التصنيف)", columns: ["Grade", "Lots", "t @ 13 %", "Share"], rows: [], empty: "Season grade data is unavailable" },
          { title: "Intake plan · next 3 nights", columns: ["Night", "Pivot", "Route", "Expected t @ 13 %", "Lot", "Status"], rows: [], empty: "No intake plan is connected" },
        ],
        notes: ["Receiving a field lot, creating PY/IN stock, pressing, grade confirmation, bale labels and dispatch are not performed by this read-only page."],
      };
    case "machinery":
      return {
        title: "Machinery (خط المعدات)", subtitle: `${farm.name} · GPS tracker positions only`,
        actions: [btn("+ New machine", "The connected fleet source does not expose machine registration."), btn("Full report", "No full fleet report feed is connected.")],
        kpis: [
          { label: "Working now", value: NS, hint: "GPS position does not prove machine operation" },
          { label: "Tractor hours · season", value: NS, hint: "No hour-meter source is connected" },
          { label: "Diesel · season", value: NS, hint: "No fuel-consumption feed is connected" },
          { label: "Service due · 30 h", value: NS, hint: "Service schedules are not supplied" },
          { label: "Hired tractor-hours", value: NS, hint: "No hired-hour ledger is connected" },
        ],
        tables: [
          { title: "Farm machinery GPS positions", sub: `${db.fleet.length} tracker records · GPS only`, columns: ["Code", "Machine", "Owner", "Now", "Hours, season", "Diesel, l", "Next service", "GPS", "Route"],
            rows: db.fleet.map(m => [m.code, m.name, NS, `Offline · stale ${m.lastFixDays} d`, NS, NS, NS, `${m.lat}, ${m.lon}`, NS]), empty: "No trackers" },
          { title: "Harvest line capacity check", columns: ["Job", "Need", "Capacity at the settings", "Observed · last 10 sessions", "Gap"], rows: [], empty: "Capacity inputs are unavailable" },
          { title: "Night collection capacity by road", columns: ["Road", "Parts fed", "km to road", "Cycle, min", "Loads per part (cut)", "Nights with available wagons", "Route capacity in one night", "Suggested"], rows: [], empty: "Road collection estimates are unavailable" },
          { title: "Harvest line account · season to date", columns: ["Source", "Basis", "Actual, EGP"], rows: [], empty: "Harvest line account is unavailable" },
        ],
        notes: ["No capacity or gap is calculated. Actual cost is not inferred from machine fuel or GPS activity."],
      };
    case "contractors":
      return {
        title: "Contractors (مقاولين)", subtitle: `${farm.name} · work orders, rates, billing basis and bills for hired services`,
        actions: [btn("+ New work order"), btn("Export", "No audited contractor or work-order export is available from the connected sources.")],
        kpis: [
          { label: "Active contractors", value: NS, hint: "Counted only where a contractor status is returned" },
          { label: "Work orders", value: 0, hint: "Native work orders returned for the current filter" },
          { label: "Draft vendor bills", value: bills, hint: "Created from approved mobile activity" },
          { label: "On-time rate", value: NS, hint: "No measured contractor performance feed is connected" },
        ],
        tables: [
          { title: "Contractor services, rates and payment status", columns: ["Contractor", "Service", "Rates", "Billing basis", "Volume", "Billed, EGP", "Paid, EGP", "Status"], rows: [], empty: "No contractor records returned. Rates, billing and payment status remain unknown." },
          { title: "Contractor work orders", columns: ["WO", "Contractor", "Work", "Pivot", "When", "Billing basis · quantity", "Status"], rows: [], empty: "No work orders returned" },
        ],
        filters: [{ kind: "text", label: "Search records" }, sel("Status", ["All statuses", "Draft", "Ordered", "In progress", "Done", "Canceled"])],
        notes: ["Work orders record hired services. Completion requires a confirmed linked operation. This view does not post vendor bills or stock.", "Rules · Rates: contract-rate source is not connected. Billing basis: only the recorded basis and quantity. Costing: harvest-line and pivot analytic mappings are not part of this projection."],
      };
    case "inventory":
      return {
        title: "Inventory (Odoo)", subtitle: `${farm.name} · stock, demand from the plan, allocation of short inputs and documents exchanged with Odoo`,
        actions: [btn("+ New purchase request", "Purchase requests are not writable from this connected view."), btn("Open in Odoo", "No authorized Odoo destination was supplied.")],
        kpis: [
          { label: "Products tracked", value: NS, hint: "Inventory / Odoo stock feed unavailable" },
          { label: "Short in 14 days", value: NS, hint: "Plan demand and stock data are not connected" },
          { label: "Hay at AVCO", value: NS, hint: "No Odoo valuation layers available" },
          { label: "Inputs on hand", value: NS, hint: "Warehouse quantities are not available" },
        ],
        tables: [
          { title: "Stock and 14-day demand", sub: "Odoo · read only · Odoo sync: Not supplied · Cache age: Not supplied", columns: ["Product", "Location", "On hand", "Reserved", "Planned use 14 d", "Cover, days", "Action"], rows: [], empty: "Inventory feed unavailable" },
          { title: "Allocation priorities", columns: ["Priority", "Part / group", "Operation", "Date", "Need, kg", "Allocated, kg", "Short, kg"], rows: [], empty: "No inventory allocations supplied" },
          { title: "Documents to and from Odoo", columns: ["Document", "Type", "State", "Date"], rows: [], empty: "Odoo documents are not connected" },
        ],
        notes: ["Stock values stay unknown until supplied by Odoo. Demand calculation cannot be displayed without live planned operations and plan-step inputs."],
      };
    case "people":
      return {
        title: "People (Odoo HR)", subtitle: `${farm.name} · who is on the farm today and what they are assigned to`,
        actions: [btn("Open in Odoo", "No authorized Odoo HR destination was supplied.")],
        kpis: [
          { label: "Headcount", value: NS, hint: "Odoo HR department feed unavailable" },
          { label: "On shift now", value: NS, hint: "Attendance feed unavailable" },
          { label: "Field crew on shift", value: NS, hint: "Staff assignment feed unavailable" },
          { label: "Overtime this week", value: NS, hint: "No attendance-hours feed" },
        ],
        tables: [{ title: "Team by role · today", sub: "Odoo HR · read only", columns: ["Role", "Headcount", "Present", "Leave / absent", "Assignment"], rows: [], empty: "People records are not connected" }],
        notes: ["Data boundary: names and employee records remain in Odoo HR. Personal and pay data are not read here."],
      };
    case "remote-sensing": {
      const known = farm.parts.filter(p => p.ndvi !== null);
      return {
        title: "Remote sensing", subtitle: `${farm.name} · scene products, crop-cycle estimates and field-part status`,
        actions: [btn("Export", "Export is unavailable until the farm export format is configured.")],
        kpis: [
          { label: "Latest worker status", value: db.scenes[0].date, hint: "Run " + db.scenes[0].date },
          { label: "Standing DM", value: NS, hint: "0 parts with a supported estimate" },
          { label: "Season DM cumulative", value: NS, hint: "Partial totals stay flagged" },
          { label: "Open remote-sensing alerts", value: 0, hint: "0 cut-log entries in the last 7 days" },
        ],
        map: { layers: ["NDVI", "Daily DM", "Season DM", "Leaf N estimate", "CP in bale estimate", "Canopy water status", "NDVI variability"], scenes: db.scenes.map(s => `${s.date} · ${s.sat} · ${s.note} · cloud ${s.cloud}%`), known: known.length, total: farm.parts.length },
        tables: [
          { title: "Pipeline and scene coverage", columns: ["Last run", "Worker", "Weather source", "Next expected passes", "Latest usable scene", "Scene records"], rows: [[db.scenes[0].date, "1.2.0", "nasa_power", 5, `${db.scenes[1].date} · ${db.scenes[1].sat}`, `${db.scenes.length} recent`]], empty: "" },
          { title: "Scenes", columns: ["Date", "Satellite", "Condition", "Cloud %", "Delivered layers"], rows: db.scenes.map(s => [s.date, s.sat, s.note, s.cloud, "cloud_mask · ndvi · ndmi · ndre · true_colour"]), empty: "No scenes" },
          { title: "Daily and cumulative dry matter", columns: ["Standing DM, farm total", "Standing hay estimate", "Season DM cumulative", "Season hay estimate"], rows: [[NS, NS, NS, NS]], empty: "" },
          { title: "Leaf N and crude protein estimates", columns: ["Leaf N estimate", "CP in bale estimate"], rows: [[NS, NS]], empty: "" },
          { title: "Field-part status", sub: `As of ${db.scenes[0].date}`, columns: ["Field part", "Image / data state", "Daily DM", "Season DM", "Leaf N estimate", "CP in bale estimate", "Cut timing", "NDVI"],
            rows: farm.parts.map(p => [p.id, `fresh · ${db.scenes[1].date}`, NS, NS, NS, NS, "no_cycle", p.ndvi]), empty: "No parts" },
        ],
        notes: [`NDVI values for ${known.length} of ${farm.parts.length} parts. Values are part means, not per-pixel measurements. Missing data stays unknown; no zero is substituted. These are model estimates, not lab results.`],
      };
    }
    case "soil":
      return {
        title: "Soil management", subtitle: `${farm.name} · study reference · read only`, restricted: true,
        tabs: ["Overview", "Operation progress", "Sampling", "Zones", "Salinity & water", "Nutrient budget", "Amendments & soil health"],
        kpis: [], tables: [],
        notes: ["Soil management requires an explicitly assigned farm role. Administrator access is available; this session's soil-role mapping is not configured.", "The soil reference feed is restricted by the server to its permitted portal administrators. Access is not inferred from farm write permissions."],
      };
    case "reports":
      return {
        title: "Reports", subtitle: `${farm.name} · recorded operational data and exports`,
        actions: [btn("+ New schedule", "Report scheduling is not available from the connected feeds.")],
        cards: [
          ["Work report", "Area done by work type, pivot and week; vs plan", "Season · week · road"],
          ["Application report", "Planned vs actual rate per product and pivot, deviation %", "Programme · product"],
          ["Harvest & lots", "Cuts, weighbridge, t @ 13 %, CP in bale, grade, lots and genealogy", "Season · cut · route"],
          ["Press yard", "Intake, pressing, waste, bale serials, dispatch", "Day · week · lot"],
          ["Machinery productivity", "Hours, fed/h observed vs setting, idle, fuel per fed, service", "Machine · operator"],
          ["Harvest line account", "Norm credited vs Odoo actuals by source, variance per t", "Month · source"],
          ["Cost per pivot and per t hay", "Plan, forecast, paid/posted by line; break-even", "Rent year · pivot"],
          ["Water", "Applied vs ETc, m³ per t, pressure faults, irrigation-off days", "Pivot · cut cycle"],
          ["Soil & tissue", "Results by pivot and depth, trends, follow-ups", "Plan · season"],
          ["Alerts and response time", "Alerts opened, time to task, time to close", "Type · month"],
        ].map(([title, desc, filters]) => ({ title, desc, filters, note: "No matching report output is supplied by the connected source." })),
        tables: [{ title: "Scheduled", columns: ["Report", "To", "When", "Format"], rows: [], empty: "No schedules supplied", sub: "Schedule names and cadence in the reference are not live schedules in this farm." }],
        datasets: ["Recorded field operations", "Tasks and assignments", "Recorded irrigation passes", "Recorded scouting observations", "Sampling plan register"],
        exports: ["submissions"],
        notes: ["Report catalogue: preview records supplied by the farm reporting service. Persisted native Farm records only. Odoo stock, HR, valuation, profitability, satellite and telemetry coverage are not supplied by these reports."],
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
// Synthetic location (open desert with Esri imagery coverage; no real farm is meant to be here). Grid spacing 700 m; col/row are grid units.
const BASE = { lat: 22.40, lon: 31.25 }, SPACING_M = 700;
function geo(col, row) {
  const lat = BASE.lat - row * SPACING_M / 111320;
  const lon = BASE.lon + col * SPACING_M / (111320 * Math.cos(lat * Math.PI / 180));
  return { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 };
}

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
        center: geo(0, 0), radiusM: 290, roads: [...new Set(farm.parts.map(p => p.road).filter(Boolean))],
        fleet: db.fleet.map((m, i) => ({ code: m.code, name: m.name, ...geo(-0.6 - i * 0.5, 0.5 + i * 0.7), lastFixDays: m.lastFixDays, online: m.online })),
        parts: farm.parts.map(p => ({ id: p.id, pivot: p.pivot, part: p.part, crop: p.crop, areaFed: p.areaFed, x: p.x, y: p.y, r: p.rPx, ...geo((p.x - 80) / 130, (p.y - 80) / 130), ndvi: p.ndvi, road: p.road, status: null })),
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

    if (method === "GET" && path === "/api/reports/preview") {
      const { dataset, from, to } = query;
      if (!isDate(from || "") || !isDate(to || "")) return json(400, { errors: ["from and to must be YYYY-MM-DD"] });
      if (Date.parse(to) <= Date.parse(from)) return json(400, { errors: ["to must be after from (end exclusive)"] });
      const columns = ["ID", "Operation", "Pivot", "Part", "Season", "Work type", "Status", "Actual start UTC", "Recorded completed fed", "Source"];
      const rows = dataset && dataset !== "Recorded field operations" ? [] : db.submissions.filter(s => s.work_date >= from && s.work_date < to)
        .map(s => [s.id, s.operation, s.pivot, s.part, null, null, s.status, s.recorded_at, null, "mobile app"]);
      return json(200, { dataset: dataset || "Recorded field operations", columns, rows, total: rows.length, generated: new Date().toISOString() });
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
