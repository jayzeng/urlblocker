// dashboard/dashboard.js

(async function () {
  // ── State ──────────────────────────────────────────────────────────────────
  let allRecords = [];
  let settings = null;

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const filterDomain   = document.getElementById("filter-domain");
  const filterDateFrom = document.getElementById("filter-date-from");
  const filterDateTo   = document.getElementById("filter-date-to");
  const filterActiveOnly = document.getElementById("filter-active-only");
  const btnResetFilters  = document.getElementById("btn-reset-filters");

  const countBadge        = document.getElementById("count-badge");
  const btnExportCsv      = document.getElementById("btn-export-csv");
  const btnClearHistory   = document.getElementById("btn-clear-history");
  const clearChallengeArea = document.getElementById("clear-challenge-area");

  const tableEmpty  = document.getElementById("table-empty");
  const tableWrapper = document.getElementById("table-wrapper");
  const emptyMsg    = document.getElementById("empty-msg");
  const excTbody    = document.getElementById("exc-tbody");

  // ── Load ───────────────────────────────────────────────────────────────────
  async function load() {
    const data = await chrome.storage.local.get("settings");
    settings = data.settings || {};
    allRecords = await getAllExceptions();
    renderTable();
  }

  // ── Filter ─────────────────────────────────────────────────────────────────
  function getFiltered() {
    const domainFilter = filterDomain.value.trim().toLowerCase();
    const fromMs = filterDateFrom.value ? new Date(filterDateFrom.value).getTime() : 0;
    const toMs   = filterDateTo.value   ? new Date(filterDateTo.value).getTime() + 86400000 : Infinity;
    const activeOnly = filterActiveOnly.checked;
    const now = Date.now();

    return allRecords.filter(r => {
      if (domainFilter && !r.domain.toLowerCase().includes(domainFilter)) return false;
      if (r.grantedAt < fromMs || r.grantedAt >= toMs) return false;
      if (activeOnly && r.expiresAt <= now) return false;
      return true;
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function renderTable() {
    const rows = getFiltered();
    const now = Date.now();

    countBadge.textContent = `${rows.length} record${rows.length !== 1 ? "s" : ""}`;

    if (rows.length === 0) {
      tableWrapper.style.display = "none";
      tableEmpty.style.display = "";
      emptyMsg.textContent = allRecords.length === 0
        ? "No exception records yet."
        : "No records match the current filters.";
      return;
    }

    tableWrapper.style.display = "";
    tableEmpty.style.display = "none";
    excTbody.innerHTML = "";

    rows.forEach(r => {
      const tr = document.createElement("tr");

      // Date/Time
      const tdDate = document.createElement("td");
      tdDate.textContent = formatDateTime(r.grantedAt);
      tdDate.className = "col-date";

      // URL
      const tdUrl = document.createElement("td");
      tdUrl.className = "col-url";
      const urlSpan = document.createElement("span");
      urlSpan.className = "url-cell";
      urlSpan.title = r.url;
      urlSpan.textContent = r.url.length > 60 ? r.url.slice(0, 60) + "…" : r.url;
      tdUrl.appendChild(urlSpan);

      // Domain
      const tdDomain = document.createElement("td");
      tdDomain.textContent = r.domain;
      tdDomain.className = "col-domain";

      // Rule
      const tdRule = document.createElement("td");
      tdRule.className = "col-rule";
      let ruleHtml = `<span class="badge badge-${escHtml(r.ruleType)}">${escHtml(r.ruleType)}</span> `;
      ruleHtml += `<span class="pattern-cell">${escHtml(r.rulePattern)}</span>`;
      if (r.ruleLabel) ruleHtml += `<span class="label-sub">${escHtml(r.ruleLabel)}</span>`;
      tdRule.innerHTML = ruleHtml;

      // Duration
      const tdDur = document.createElement("td");
      tdDur.textContent = formatDuration(r.duration);
      tdDur.className = "col-duration";

      // Status
      const tdStatus = document.createElement("td");
      tdStatus.className = "col-status";
      if (r.expiresAt > now) {
        const remaining = r.expiresAt - now;
        tdStatus.innerHTML = `<span class="status-active">Active (${formatDuration(remaining)} left)</span>`;
      } else {
        const ago = now - r.expiresAt;
        tdStatus.innerHTML = `<span class="status-expired">Expired ${formatAgo(ago)}</span>`;
      }

      tr.appendChild(tdDate);
      tr.appendChild(tdUrl);
      tr.appendChild(tdDomain);
      tr.appendChild(tdRule);
      tr.appendChild(tdDur);
      tr.appendChild(tdStatus);
      excTbody.appendChild(tr);
    });
  }

  // ── Filter events ──────────────────────────────────────────────────────────
  [filterDomain, filterDateFrom, filterDateTo, filterActiveOnly].forEach(el => {
    el.addEventListener("input", renderTable);
    el.addEventListener("change", renderTable);
  });

  btnResetFilters.addEventListener("click", () => {
    filterDomain.value = "";
    filterDateFrom.value = "";
    filterDateTo.value = "";
    filterActiveOnly.checked = false;
    renderTable();
  });

  // ── Export CSV ─────────────────────────────────────────────────────────────
  btnExportCsv.addEventListener("click", () => {
    const rows = getFiltered();
    if (rows.length === 0) return;

    const header = ["Date/Time","URL","Domain","Rule Type","Rule Pattern","Rule Label","Duration (min)","Granted At","Expires At","Status"];
    const now = Date.now();

    const lines = [header.join(",")];
    rows.forEach(r => {
      const status = r.expiresAt > now ? "Active" : "Expired";
      lines.push([
        csvEsc(formatDateTime(r.grantedAt)),
        csvEsc(r.url),
        csvEsc(r.domain),
        csvEsc(r.ruleType),
        csvEsc(r.rulePattern),
        csvEsc(r.ruleLabel || ""),
        Math.round(r.duration / 60000),
        r.grantedAt,
        r.expiresAt,
        status
      ].join(","));
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `urlblocker-exceptions-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // ── Clear History ──────────────────────────────────────────────────────────
  btnClearHistory.addEventListener("click", async () => {
    if (allRecords.length === 0) return;

    const prot = settings.protection || {};
    if (prot.enabled) {
      showChallengeUI(clearChallengeArea, "Clear History", async () => {
        await clearExceptions();
        allRecords = [];
        renderTable();
      }, () => {});
    } else {
      if (!confirm("Clear all exception history? This cannot be undone.")) return;
      await clearExceptions();
      allRecords = [];
      renderTable();
    }
  });

  // ── Challenge UI ───────────────────────────────────────────────────────────
  function showChallengeUI(container, title, onPass, onCancel) {
    container.innerHTML = "";
    const prot = settings.protection || {};
    const ct = prot.challengeType || "passcode";
    let mathProblem = null;

    const box = document.createElement("div");
    box.className = "challenge-box";
    box.style.margin = "0 20px 16px";

    let questionHtml = "";
    let inputType = "password";
    let inputPlaceholder = "Enter passcode…";
    let subText = "Enter your passcode to continue.";

    if (ct === "math") {
      mathProblem = generateMathProblem(prot.mathDifficulty || "easy");
      subText = "Solve the problem to continue.";
      questionHtml = `<div class="question">${mathProblem.question}</div>`;
      inputType = "text";
      inputPlaceholder = "Your answer…";
    }

    box.innerHTML = `
      <h4>🔒 ${escHtml(title)}</h4>
      <p style="font-size:0.8125rem;color:var(--gray-600);margin-top:4px">${subText}</p>
      ${questionHtml}
      <div class="input-row">
        <input type="${inputType}" class="form-control challenge-input" placeholder="${inputPlaceholder}" autocomplete="off">
        <button class="btn btn-primary btn-sm challenge-submit">OK</button>
      </div>
      <div class="challenge-error"></div>
      <div style="text-align:right;margin-top:6px">
        <button class="btn btn-secondary btn-sm challenge-cancel-btn">Cancel</button>
      </div>
    `;

    container.appendChild(box);

    const input = box.querySelector(".challenge-input");
    const submitBtn = box.querySelector(".challenge-submit");
    const errorEl = box.querySelector(".challenge-error");
    const cancelBtn = box.querySelector(".challenge-cancel-btn");

    input.focus();

    async function attempt() {
      const val = input.value.trim();
      if (!val) { errorEl.textContent = "Please enter a value."; return; }

      if (ct === "math") {
        if (parseInt(val, 10) !== mathProblem.answer) {
          mathProblem = generateMathProblem(prot.mathDifficulty || "easy");
          box.querySelector(".question").textContent = mathProblem.question;
          input.value = "";
          errorEl.textContent = "Wrong answer. Try the new problem.";
          return;
        }
      } else {
        if (!prot.passcodeHash) {
          errorEl.textContent = "No passcode set.";
          return;
        }
        const hash = await sha256(val);
        if (hash !== prot.passcodeHash) {
          errorEl.textContent = "Incorrect passcode.";
          input.value = "";
          return;
        }
      }

      container.innerHTML = "";
      await onPass();
    }

    submitBtn.addEventListener("click", attempt);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") attempt(); });
    cancelBtn.addEventListener("click", () => {
      container.innerHTML = "";
      onCancel();
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function formatDateTime(ms) {
    return new Date(ms).toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit"
    });
  }

  function formatDuration(ms) {
    const min = Math.round(ms / 60000);
    if (min < 60) return `${min} min`;
    const hr = min / 60;
    return hr === 1 ? "1 hour" : `${hr} hours`;
  }

  function formatAgo(ms) {
    const min = Math.round(ms / 60000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.round(hr / 24)}d ago`;
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function csvEsc(val) {
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  // ── Start ──────────────────────────────────────────────────────────────────
  await load();
})();
