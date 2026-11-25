"use strict";
// Satellite map view modelled on the real portal's layout (Leaflet + Esri World Imagery).
// Falls back to the plain SVG map in app.js when Leaflet or the tiles are unavailable.
(function () {
  const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  const ICONS = {
    layers: '<svg viewBox="0 0 24 24"><path d="M12 3 2 8l10 5 10-5-10-5zm0 12L4.6 11.3 2 12.6l10 5 10-5-2.6-1.3L12 15zm0 4L4.6 15.3 2 16.6l10 5 10-5-2.6-1.3L12 19z"/></svg>',
    palette: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0 0 18c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.200a1.700 1.700 0 0 1 1.300-2.800H17a4 4 0 0 0 4-4C21 6.800 17 3 12 3zM6.500 12a1.500 1.500 0 1 1 0-3 1.500 1.500 0 0 1 0 3zm3-4a1.500 1.500 0 1 1 0-3 1.500 1.500 0 0 1 0 3zm5 0a1.500 1.500 0 1 1 0-3 1.500 1.500 0 0 1 0 3zm3 4a1.500 1.500 0 1 1 0-3 1.500 1.500 0 0 1 0 3z"/></svg>',
    crop: '<svg viewBox="0 0 24 24"><path d="M12 22V10m0 0C12 6 9 4 5 4c0 4 2 6 7 6zm0 3c0-3 2-5 7-5 0 3-2 5-7 5z" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    soil: '<svg viewBox="0 0 24 24"><path d="M3 18h18M5 14l4-6 3 4 3-5 4 7" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    fleet: '<svg viewBox="0 0 24 24"><path d="M3 16V8h9l2 3h5l2 3v2h-2a2.500 2.500 0 0 1-5 0H9a2.500 2.500 0 0 1-5 0z" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    alert: '<svg viewBox="0 0 24 24"><path d="M12 3 2 21h20L12 3zm0 7v5m0 3v.1" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    flask: '<svg viewBox="0 0 24 24"><path d="M9 3h6M10 3v6L4 20h16l-6-11V3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    ruler: '<svg viewBox="0 0 24 24"><path d="m3 17 14-14 4 4L7 21l-4-4zm5-3 2 2m1-5 2 2m1-5 2 2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    sat: '<svg viewBox="0 0 24 24"><path d="m4 20 5-5m-2-4 6 6M13 3l8 8-3 3-8-8zM3 21l2-2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    full: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  };
  const TOOLS = [
    ["layers", "Layers – base map and overlays"], ["palette", "Colour by and legend"], ["crop", "Crop and stage filter"],
    ["soil", "Soil preparation – operation completion"], ["fleet", "Fleet – live GPS positions"], ["alert", "Alerts · native high and critical issues"],
    ["flask", "Sampling plan"], ["ruler", "Measure distance, area and road"], ["sat", "Remote sensing"], ["full", "Full screen"],
  ];

  function half(p, radiusM, side) { // polygon points for a full circle or an E/W half circle
    const pts = [], dLat = radiusM / 111320, dLon = radiusM / (111320 * Math.cos(p.lat * Math.PI / 180));
    const from = side === "E" ? -90 : side === "W" ? 90 : 0, to = side === "F" || !side ? 360 : 180;
    for (let a = 0; a <= to; a += 6) { const r = (from + a) * Math.PI / 180; pts.push([p.lat + dLat * Math.cos(r), p.lon + dLon * Math.sin(r)]); }
    return pts;
  }

  window.renderMapView = function (m, ctx) {
    const { $, esc, toast, state } = ctx;
    const now = new Date();
    const today = now.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + ", " + now.toTimeString().slice(0, 5);
    const roads = [...new Set((m.roads || []))];
    $("#main").innerHTML = `
      <div class="mapbar">
        <label>Season <select disabled><option>Not supplied</option></select></label>
        <label>Colour by <select id="colorBy"><option value="status">Status today</option><option value="none">Outlines only</option></select></label>
        <label>Road <select id="roadSel"><option value="">All roads</option>${roads.map(r => `<option>${esc(r)}</option>`).join("")}</select></label>
        <label>Crop <select disabled><option>Not supplied</option></select></label>
        <button class="onlinepill" id="onlineOnly" aria-pressed="false" title="Show only online machinery on the map">Online only</button>
        <span class="grow"></span><span class="tot">${m.pivots} pivots · ${m.partCount} parts · ${m.fed.toLocaleString()} fed</span>
        <a href="#/pivots" class="listlink">☰ List view</a>
      </div>
      <div class="mapwrap2" id="mapwrap">
        <div id="leaflet"></div>
        <div class="todaypanel" id="today"><button class="mini" id="minPanel" aria-label="Minimize panel">⤡</button>
          <h4>Today · ${esc(today)}</h4><div class="cur">Current map data</div>
          <ul>
            <li><i class="sw o"></i>Harvest in progress <b>0</b></li><li><i class="sw b"></i>Ready to cut (≤ 5 d) <b>0</b></li>
            <li><i class="sw b"></i>Growing <b>0</b></li><li><i class="sw d"></i>Dry-down / irrigation off <b>0</b></li>
            <li><i class="sw g"></i>Unknown map status <b>${m.partCount} of ${m.partCount}</b></li>
            <li><i class="sw r"></i>Open high / critical native issues <b>0</b></li>
            <li><i class="sw gr"></i>Fleet · recent GPS fixes <b>0 of ${m.fleet.length}</b></li><li><i class="sw bl"></i>Saved sampling plans <b>0</b></li>
          </ul>
          <p>Crop and stage come from recorded seasons and scouting only. Readiness is not inferred. Weather is not connected. No verified lease link is supplied for status fills.</p>
          <div class="snap">Snapshot checked · ${esc(today)} Cairo<br>Native operations · 0 records</div></div>
        <div class="tools" id="tools">${TOOLS.map(([k, t]) => `<button data-t="${k}" aria-label="${esc(t)}" title="${esc(t)}">${ICONS[k]}</button>`).join("")}</div>
        <div class="zoomctl"><button id="zin" aria-label="Zoom in">+</button><button id="zout" aria-label="Zoom out">−</button><button id="loc" aria-label="Fit to farm">◎</button><button id="north" aria-label="Reset north">▲</button></div>
        <div id="pivpop"></div>
      </div>`;

    const map = L.map("leaflet", { zoomControl: false, attributionControl: false, maxZoom: 18 }).setView([m.center.lat, m.center.lon], 14);
    const tiles = L.tileLayer(ESRI, { maxNativeZoom: 17, maxZoom: 18 }).addTo(map);
    tiles.on("tileerror", () => { $("#leaflet").style.background = "#c9b48a"; });
    L.control.attribution({ prefix: false }).addAttribution("Tiles © Esri").addTo(map);

    const shapes = new Map(), labels = L.layerGroup().addTo(map), fleet = L.layerGroup();
    // Look of the real portal: thin white outline, imagery visible through the pivot, one label per pivot.
    const TINT = { alfalfa: "#3f7a3b", wheat: "#c2b25a" };
    const style = (p, sel) => ({ color: sel ? "#ff4d4d" : "#ffffff", weight: sel ? 3 : 1.5, fillColor: TINT[p.crop] || "#3f7a3b", fillOpacity: $("#colorBy").value === "none" ? 0 : 0.28 });
    let selected = null;
    const rings = L.layerGroup().addTo(map);

    function draw() {
      shapes.forEach(s => map.removeLayer(s)); shapes.clear(); labels.clearLayers(); rings.clearLayers();
      const road = $("#roadSel").value;
      const seen = new Set();
      m.parts.filter(p => !road || p.road === road).forEach(p => {
        const poly = L.polygon(half(p, m.radiusM, p.part), style(p, selected === p.id)).addTo(map);
        poly.on("click", () => select(p));
        shapes.set(p.id, poly);
        if (!seen.has(p.pivot)) { // one label and one pivot-track ring per pivot (a split pivot has two parts)
          seen.add(p.pivot);
          L.circle([p.lat, p.lon], { radius: m.radiusM * 0.6, color: "#ffffff", weight: 0.8, opacity: 0.35, fill: false, interactive: false }).addTo(rings);
          L.marker([p.lat, p.lon], { interactive: false, icon: L.divIcon({ className: "plabel", html: esc(p.pivot), iconSize: [60, 14], iconAnchor: [30, 7] }) }).addTo(labels);
        }
      });
      labelsVisible();
    }
    function labelsVisible() { // labels only when they fit; avoids the unreadable overlap at overview zoom
      const show = map.getZoom() >= 13;
      if (show && !map.hasLayer(labels)) labels.addTo(map);
      if (!show && map.hasLayer(labels)) map.removeLayer(labels);
    }
    map.on("zoomend", labelsVisible);
    function select(p) {
      selected = p.id; draw();
      $("#pivpop").innerHTML = `<div class="pivpop"><button class="x" aria-label="Close" id="pclose">×</button>
        <h3>${esc(p.pivot)} · ${esc(p.part === "F" ? "whole" : p.part === "E" ? "East half" : "West half")}</h3>
        <div class="meta">${p.road ? esc(p.road) : "Road not supplied"} · ${p.areaFed} fed · Crop not recorded</div>
        <dl><dt>Hay to date</dt><dd>Not supplied</dd><dt>Last cut</dt><dd>Not supplied</dd><dt>Recorded stage</dt><dd>Not recorded</dd>
        <dt>Recorded field status</dt><dd>Not recorded</dd><dt>Map status</dt><dd>Not recorded</dd><dt>Last scouted</dt><dd>Not recorded</dd>
        <dt>NDVI</dt><dd>${p.ndvi == null ? "Not supplied" : p.ndvi}</dd><dt>Open high / critical</dt><dd>0</dd></dl></div>`;
      $("#pclose").onclick = () => { selected = null; $("#pivpop").innerHTML = ""; draw(); };
    }
    draw();
    const fit = () => map.fitBounds(L.latLngBounds(m.parts.map(p => [p.lat, p.lon])).pad(0.08), { paddingTopLeft: [330, 10], paddingBottomRight: [70, 10] }); // keep clear of the Today panel and tool rail
    map.invalidateSize(); fit();

    fleet.addLayer(L.layerGroup(m.fleet.map(f => L.circleMarker([f.lat, f.lon], { radius: 7, color: "#fff", weight: 2, fillColor: "#8a8a8a", fillOpacity: 1 }).bindTooltip(`${f.code} · offline · last fix ${f.lastFixDays} d ago`))));
    let showFleet = false, online = false;
    $("#colorBy").onchange = draw; $("#roadSel").onchange = draw;
    $("#onlineOnly").onclick = e => { online = !online; e.currentTarget.setAttribute("aria-pressed", online); e.currentTarget.classList.toggle("on", online); if (showFleet) { map.removeLayer(fleet); if (!online) fleet.addTo(map); } toast(online ? "Online only: no tracker is online" : "Showing all machinery"); };
    $("#zin").onclick = () => map.zoomIn(); $("#zout").onclick = () => map.zoomOut(); $("#loc").onclick = fit; $("#north").onclick = () => map.setView(map.getCenter(), map.getZoom());
    $("#minPanel").onclick = () => $("#today").classList.toggle("min");
    $("#tools").onclick = e => {
      const b = e.target.closest("button[data-t]"); if (!b) return;
      const k = b.dataset.t;
      if (k === "full") { const w = $("#mapwrap"); document.fullscreenElement ? document.exitFullscreen() : w.requestFullscreen?.(); setTimeout(() => map.invalidateSize(), 300); return; }
      if (k === "fleet") { showFleet = !showFleet; b.classList.toggle("on", showFleet); showFleet && !online ? fleet.addTo(map) : map.removeLayer(fleet); toast(showFleet ? "Fleet: all trackers offline (stale GPS)" : "Fleet hidden"); return; }
      if (k === "layers") { toast("Base map: Esri World Imagery"); return; }
      toast(b.title + ": not supplied in this demo");
    };
    setTimeout(() => { map.invalidateSize(); fit(); }, 150);
  };

  // Small satellite map for Remote sensing: parts coloured by layer (only NDVI has values here).
  window.renderNdviMap = function (el, spec, m, layer) {
    el.innerHTML = '<div id="rsmap" style="height:100%"></div>';
    const map = L.map("rsmap", { zoomControl: true, attributionControl: false }).setView([m.center.lat, m.center.lon], 14);
    L.tileLayer(ESRI, { maxNativeZoom: 17, maxZoom: 18 }).addTo(map);
    L.control.attribution({ prefix: false }).addAttribution("Tiles © Esri · part-average map, not a 10 m pixel raster").addTo(map);
    const color = v => v == null ? "#9aa0a6" : v < 0.5 ? "#d9534f" : v < 0.65 ? "#f0ad4e" : "#2e8b57";
    m.parts.forEach(p => L.polygon(half(p, m.radiusM, p.part), { color: "#fff", weight: 1.5, fillOpacity: 0.7, fillColor: layer === "NDVI" ? color(p.ndvi) : "#9aa0a6" })
      .bindTooltip(p.id + " · " + (layer === "NDVI" && p.ndvi != null ? "NDVI " + p.ndvi : "Unknown")).addTo(map));
    map.fitBounds(L.latLngBounds(m.parts.map(p => [p.lat, p.lon])).pad(0.2));
    setTimeout(() => map.invalidateSize(), 100);
  };
})();
