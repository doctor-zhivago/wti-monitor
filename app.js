/**
 * app.js
 * ======
 * Display frontend for the NYMEX WTI Crude Oil (CL) Forward Curve & Volume Monitor.
 * Reads pre-computed CSV files from ./data/ and renders the charts and tables
 * directly without performing any domain calculation or analysis.
 */

(function () {
  "use strict";

  const COLOR_PRESETS = {
    "Red — rgb(1, 0, 0, alpha)": {
      rgb: "255, 0, 0",
      borderRgb: "166, 0, 0"
    },
    "Navy — rgb(0, 0.2, 0.8, alpha)": {
      rgb: "0, 51, 204",
      borderRgb: "0, 33, 133"
    },
    "Teal — rgb(0, 0.5, 0.4, alpha)": {
      rgb: "0, 128, 102",
      borderRgb: "0, 83, 66"
    }
  };

  const state = {
    pricesRawCsv: "",
    volumesRawCsv: "",
    pricesRows: [],
    volumesRows: [],
    scheduleRows: [],
    chartRows: [],
    meta: {}
  };

  /**
   * RFC-4180 compliant CSV parser returning an array of string arrays.
   */
  function parseCsvRows(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    const len = text.length;

    for (let i = 0; i < len; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < len && text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          row.push(field);
          field = "";
        } else if (ch === "\r") {
          continue;
        } else if (ch === "\n") {
          row.push(field);
          rows.push(row);
          row = [];
          field = "";
        } else {
          field += ch;
        }
      }
    }
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function rowsToObjects(rows) {
    if (!rows || rows.length < 2) return [];
    const headers = rows[0];
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (r.length === 1 && r[0] === "") continue;
      const obj = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = r[j] !== undefined ? r[j] : "";
      }
      out.push(obj);
    }
    return out;
  }

  function renderHtmlTable(containerId, csvRows, alignRightAll) {
    const container = document.getElementById(containerId);
    if (!container || !csvRows || csvRows.length === 0) return;

    const headers = csvRows[0];
    const table = document.createElement("table");
    table.className = alignRightAll ? "data-table align-right" : "data-table";

    const thead = document.createElement("thead");
    const trHead = document.createElement("tr");
    for (let j = 0; j < headers.length; j++) {
      const th = document.createElement("th");
      th.textContent = headers[j];
      if (alignRightAll || j === 0 || j >= 5) {
        th.style.textAlign = "right";
      } else {
        th.style.textAlign = "left";
      }
      trHead.appendChild(th);
    }
    thead.appendChild(trHead);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (let i = 1; i < csvRows.length; i++) {
      const r = csvRows[i];
      if (r.length === 1 && r[0] === "") continue;
      const tr = document.createElement("tr");
      for (let j = 0; j < headers.length; j++) {
        const td = document.createElement("td");
        td.textContent = r[j] !== undefined ? r[j] : "";
        if (alignRightAll || j === 0 || j >= 5) {
          td.style.textAlign = "right";
        } else {
          td.style.textAlign = "left";
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    container.innerHTML = "";
    container.appendChild(table);
  }

  function renderScheduleTable(containerId, csvRows) {
    const container = document.getElementById(containerId);
    if (!container || !csvRows || csvRows.length === 0) return;

    const headers = csvRows[0];
    const rightCols = { 0: true, 2: true, 3: true, 9: true };
    const table = document.createElement("table");
    table.className = "data-table";

    const thead = document.createElement("thead");
    const trHead = document.createElement("tr");
    for (let j = 0; j < headers.length; j++) {
      const th = document.createElement("th");
      th.textContent = headers[j];
      th.style.textAlign = rightCols[j] ? "right" : "left";
      trHead.appendChild(th);
    }
    thead.appendChild(trHead);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (let i = 1; i < csvRows.length; i++) {
      const r = csvRows[i];
      if (r.length === 1 && r[0] === "") continue;
      const tr = document.createElement("tr");
      for (let j = 0; j < headers.length; j++) {
        const td = document.createElement("td");
        td.textContent = r[j] !== undefined ? r[j] : "";
        td.style.textAlign = rightCols[j] ? "right" : "left";
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    container.innerHTML = "";
    container.appendChild(table);
  }

  function renderStatusBanner() {
    const banner = document.getElementById("status_banner_ui");
    if (!banner) return;

    const m = state.meta;
    banner.innerHTML = "";

    const b1 = document.createElement("b");
    b1.textContent = "Latest Settlement Date: ";
    banner.appendChild(b1);
    banner.appendChild(document.createTextNode((m.latest_trade_date || "") + " | "));

    const b2 = document.createElement("b");
    b2.textContent = "Front Month (0M): ";
    banner.appendChild(b2);
    banner.appendChild(document.createTextNode((m.front_month_summary || "") + " | "));

    const b3 = document.createElement("b");
    b3.textContent = "Last Updated: ";
    banner.appendChild(b3);
    banner.appendChild(document.createTextNode(m.last_updated || ""));

    banner.appendChild(document.createElement("br"));
    const span = document.createElement("span");
    span.textContent = m.status_msg || "";
    banner.appendChild(span);

    const refInput = document.getElementById("schedule_ref_date");
    if (refInput && m.schedule_ref_date) {
      refInput.value = m.schedule_ref_date;
    }
  }

  function getSelectedRadio(name, fallback) {
    const el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : fallback;
  }

  function setupFixedViewBoxCanvas(canvas, logicalWidth, logicalHeight) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = logicalWidth * dpr;
    canvas.height = logicalHeight * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  /**
   * Draw the Forward Curve plot matching R's `plot_forward_curve()`.
   * Uses pre-computed 800x370 coordinates directly from `wti_chart_data.csv` and `wti_metadata.csv`.
   */
  function drawForwardCurve() {
    const canvas = document.getElementById("forward_curve_plot");
    if (!canvas || state.chartRows.length === 0) return;

    const ctx = setupFixedViewBoxCanvas(canvas, 800, 370);
    const m = state.meta;
    const rows = state.chartRows;

    const xSpacing = getSelectedRadio("x_spacing", "proportional");
    const presetKey = document.getElementById("color_preset").value;
    const preset = COLOR_PRESETS[presetKey] || COLOR_PRESETS["Red — rgb(1, 0, 0, alpha)"];
    const minAlphaKey = "alphas_" + document.getElementById("min_alpha_val").textContent.trim();
    const alphasStr = m[minAlphaKey] || m["alphas_0.10"] || "1.0000|0.7656|0.5821|0.4331|0.3077|0.1984|0.1000";
    const alphas = alphasStr.split("|");

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, 800, 370);

    // Main title
    ctx.fillStyle = "#000000";
    ctx.font = "bold 14.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(m.curve_chart_title || "NYMEX WTI Crude Oil (CL) Forward Curve", 400, 20);

    // Y-axis gridlines and ticks (from pre-computed metadata)
    const yTicks = (m.price_y_ticks || "").split("|");
    const yTicksPy = (m.price_y_ticks_py || "").split("|");

    ctx.save();
    ctx.strokeStyle = "#EBEBEB";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (let i = 0; i < yTicksPy.length; i++) {
      const py = Number(yTicksPy[i]);
      if (isNaN(py)) continue;
      ctx.beginPath();
      ctx.moveTo(64, py);
      ctx.lineTo(784, py);
      ctx.stroke();
    }
    ctx.restore();

    // Vertical dotted gridlines at each tenor X position
    ctx.save();
    ctx.strokeStyle = "#F2F2F2";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    for (let i = 0; i < rows.length; i++) {
      const px = Number(xSpacing === "proportional" ? rows[i].x_prop_px : rows[i].x_even_px);
      ctx.beginPath();
      ctx.moveTo(px, 42);
      ctx.lineTo(px, 302);
      ctx.stroke();
    }
    ctx.restore();

    // Draw curves from oldest (w = n_curves - 1) down to Present EOD (w = 0)
    const nCurves = parseInt(m.n_curves || "7", 10);

    for (let w = nCurves - 1; w >= 0; w--) {
      const alpha = alphas[w] || "0.20";
      const color = "rgba(" + preset.rgb + ", " + alpha + ")";
      const lw = w === 0 ? 2.5 : 1.4;
      const ptRadius = w === 0 ? 4.3 : 2.8;

      const pts = [];
      for (let i = 0; i < rows.length; i++) {
        const px = Number(xSpacing === "proportional" ? rows[i].x_prop_px : rows[i].x_even_px);
        const py = Number(rows[i]["p_w" + w + "_py"]);
        if (!isNaN(px) && !isNaN(py)) {
          pts.push({ x: px, y: py });
        }
      }

      if (pts.length > 1) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.stroke();
      }

      // Draw circular points with a crisp white separation halo (matching R type = "b")
      for (let i = 0; i < pts.length; i++) {
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, ptRadius, 0, Math.PI * 2);
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 3.2;
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.fill();
      }
    }

    // Plot border box
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.strokeRect(64, 42, 720, 260);

    // Y-axis ticks and labels
    ctx.fillStyle = "#333333";
    ctx.strokeStyle = "#000000";
    ctx.font = "11.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i < yTicksPy.length; i++) {
      const py = Number(yTicksPy[i]);
      if (isNaN(py)) continue;
      ctx.beginPath();
      ctx.moveTo(64, py);
      ctx.lineTo(58, py);
      ctx.stroke();
      ctx.fillText(yTicks[i], 55, py);
    }

    // Y-axis title
    ctx.save();
    ctx.translate(18, 172);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "#222222";
    ctx.font = "13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(m.curve_y_label || "Settlement Price (USD)", 0, 0);
    ctx.restore();

    // X-axis ticks and two-line labels
    ctx.fillStyle = "#222222";
    ctx.strokeStyle = "#000000";
    ctx.font = "10.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const px = Number(xSpacing === "proportional" ? r.x_prop_px : r.x_even_px);

      ctx.beginPath();
      ctx.moveTo(px, 302);
      ctx.lineTo(px, 307);
      ctx.stroke();

      const showLabel = xSpacing === "even" || r.show_prop_label === "1";
      if (showLabel) {
        ctx.fillText(r.tick_line1, px, 311);
        ctx.fillText(r.tick_line2, px, 324);
      }
    }

    // X-axis title
    ctx.fillStyle = "#222222";
    ctx.font = "13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(m.curve_x_label || "Forward Tenor", 424, 364);
  }

  /**
   * Draw the Daily Traded Volume bar chart matching R's `plot_contract_volumes()`.
   * Uses pre-computed 800x320 coordinates directly from `wti_chart_data.csv` and `wti_metadata.csv`.
   */
  function drawVolumeChart() {
    const details = document.getElementById("vol_details");
    if (details && !details.open) return;

    const canvas = document.getElementById("volume_plot");
    if (!canvas || state.chartRows.length === 0) return;

    const ctx = setupFixedViewBoxCanvas(canvas, 800, 320);
    const m = state.meta;
    const rows = state.chartRows;

    const volScale = getSelectedRadio("vol_scale", "linear");
    const presetKey = document.getElementById("color_preset").value;
    const preset = COLOR_PRESETS[presetKey] || COLOR_PRESETS["Red — rgb(1, 0, 0, alpha)"];

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, 800, 320);

    // Two-line Main Title
    ctx.fillStyle = "#000000";
    ctx.font = "bold 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(m.vol_chart_title_1 || "Volume", 400, 16);
    ctx.fillText(m.vol_chart_title_2 || "", 400, 34);

    const yTicks = (volScale === "log10" ? m.vol_log_y_ticks : m.vol_lin_y_ticks || "").split("|");
    const yTicksPy = (volScale === "log10" ? m.vol_log_y_ticks_py : m.vol_lin_y_ticks_py || "").split("|");

    const barFill = "rgba(" + preset.rgb + ", 0.82)";
    const barBorder = "rgba(" + preset.borderRgb + ", 1.0)";

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const bx = Number(r.bar_x_px);
      const bw = Number(r.bar_w_px);
      const bcx = Number(r.bar_cx_px);
      const by = Number(volScale === "log10" ? r.vol_log_py : r.vol_lin_py);
      const bh = Number(volScale === "log10" ? r.vol_log_h : r.vol_lin_h);

      ctx.fillStyle = barFill;
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = barBorder;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bw, bh);

      // Vertical rotated X-axis bar label (matching R las = 2)
      ctx.save();
      ctx.translate(bcx, 240);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = "#222222";
      ctx.font = "10.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(r.vol_bar_label, 0, 0);
      ctx.restore();
    }

    // Horizontal dashed gridlines drawn over the plot (matching R grid(nx=NA, ny=NULL))
    ctx.save();
    ctx.strokeStyle = "#E5E5E5";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (let i = 0; i < yTicksPy.length; i++) {
      const py = Number(yTicksPy[i]);
      if (isNaN(py)) continue;
      ctx.beginPath();
      ctx.moveTo(72, py);
      ctx.lineTo(784, py);
      ctx.stroke();
    }
    ctx.restore();

    // Left Y-axis spine and outward tick marks
    const topTickPy = Number(yTicksPy[yTicksPy.length - 1] || "52");
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(72, 232);
    ctx.lineTo(72, topTickPy);
    ctx.stroke();

    ctx.fillStyle = "#222222";
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i < yTicksPy.length; i++) {
      const py = Number(yTicksPy[i]);
      if (isNaN(py)) continue;
      ctx.beginPath();
      ctx.moveTo(72, py);
      ctx.lineTo(66, py);
      ctx.stroke();
      ctx.fillText(yTicks[i], 63, py);
    }

    // Two-line vertical rotated Y-axis label
    const ylab1 = volScale === "log10" ? (m.vol_y_label_log10_1 || "Volume") : (m.vol_y_label_linear_1 || "Volume");
    const ylab2 = volScale === "log10" ? (m.vol_y_label_log10_2 || "log10(Contracts)") : (m.vol_y_label_linear_2 || "'000 Contracts");

    ctx.save();
    ctx.translate(15, 147);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "#222222";
    ctx.font = "12.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ylab1, 0, -7);
    ctx.fillText(ylab2, 0, 8);
    ctx.restore();
  }

  function triggerCsvDownload(rawCsvText, filename) {
    if (!rawCsvText) return;
    const blob = new Blob([rawCsvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function loadAllCsvData() {
    const bust = "?t=" + Date.now();
    const [pricesText, volumesText, scheduleText, chartText, metaText] = await Promise.all([
      fetch("data/wti_eow_prices.csv" + bust).then(function (r) { return r.text(); }),
      fetch("data/wti_volumes.csv" + bust).then(function (r) { return r.text(); }),
      fetch("data/wti_schedule.csv" + bust).then(function (r) { return r.text(); }),
      fetch("data/wti_chart_data.csv" + bust).then(function (r) { return r.text(); }),
      fetch("data/wti_metadata.csv" + bust).then(function (r) { return r.text(); })
    ]);

    state.pricesRawCsv = pricesText;
    state.volumesRawCsv = volumesText;
    state.pricesRows = parseCsvRows(pricesText);
    state.volumesRows = parseCsvRows(volumesText);
    state.scheduleRows = parseCsvRows(scheduleText);
    state.chartRows = rowsToObjects(parseCsvRows(chartText));

    const metaRows = parseCsvRows(metaText);
    const metaObj = {};
    for (let i = 1; i < metaRows.length; i++) {
      if (metaRows[i].length >= 2) {
        metaObj[metaRows[i][0]] = metaRows[i][1];
      }
    }
    state.meta = metaObj;

    renderHtmlTable("prices_table_container", state.pricesRows, false);
    renderHtmlTable("volumes_table_container", state.volumesRows, true);
    renderScheduleTable("schedule_table_container", state.scheduleRows);
    renderStatusBanner();
    drawForwardCurve();
    drawVolumeChart();
  }

  function bindEvents() {
    document.querySelectorAll('input[name="x_spacing"]').forEach(function (el) {
      el.addEventListener("change", drawForwardCurve);
    });

    document.getElementById("color_preset").addEventListener("change", function () {
      drawForwardCurve();
      drawVolumeChart();
    });

    const alphaSlider = document.getElementById("min_alpha");
    const alphaBadge = document.getElementById("min_alpha_val");
    alphaSlider.addEventListener("input", function () {
      alphaBadge.textContent = Number(alphaSlider.value).toFixed(2);
      drawForwardCurve();
    });

    document.querySelectorAll('input[name="vol_scale"]').forEach(function (el) {
      el.addEventListener("change", drawVolumeChart);
    });

    const volDetails = document.getElementById("vol_details");
    if (volDetails) {
      volDetails.addEventListener("toggle", function () {
        if (volDetails.open) {
          setTimeout(drawVolumeChart, 20);
        }
      });
    }

    document.getElementById("reload_btn").addEventListener("click", function () {
      loadAllCsvData();
    });

    document.getElementById("dl_prices").addEventListener("click", function () {
      const dt = state.meta.latest_trade_date || "latest";
      triggerCsvDownload(state.pricesRawCsv, "NYMEX_WTI_Forward_Curve_Prices_" + dt + ".csv");
    });

    document.getElementById("dl_volumes").addEventListener("click", function () {
      const dt = state.meta.latest_trade_date || "latest";
      triggerCsvDownload(state.volumesRawCsv, "NYMEX_WTI_Forward_Curve_Volumes_" + dt + ".csv");
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindEvents();
    loadAllCsvData().catch(function (err) {
      const banner = document.getElementById("status_banner_ui");
      if (banner) {
        banner.textContent = "Unable to load CSV dataset: " + err.message;
      }
    });
  });
})();
