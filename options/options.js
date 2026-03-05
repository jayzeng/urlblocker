// options/options.js

(async function () {
  // ── State ─────────────────────────────────────────────────────────────────
  let rules = [];
  let settings = null;
  let editingRuleId = null;  // null = adding new rule

  // ── Defaults ──────────────────────────────────────────────────────────────
  const DEFAULT_SETTINGS = getDefaultSettings();
  const WORD_CHALLENGE_DEFAULTS = DEFAULT_SETTINGS.exceptions.wordChallenge;

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const rulesTbody = document.getElementById("rules-tbody");
  const rulesEmpty = document.getElementById("rules-empty");
  const rulesTable = document.getElementById("rules-table");
  const rulesChallengeArea = document.getElementById("rules-challenge-area");
  const rulesProtectionBadge = document.getElementById("rules-protection-badge");

  const toggleExceptions    = document.getElementById("toggle-exceptions");
  const exceptionsOptions   = document.getElementById("exceptions-options");
  const durationCheckList   = document.getElementById("duration-checkbox-list");
  const inputCustomDuration = document.getElementById("input-custom-duration");
  const customDurationError = document.getElementById("custom-duration-error");
  const toggleWordChallenge = document.getElementById("toggle-word-challenge");
  const inputWordRequiredCorrect = document.getElementById("input-word-required-correct");
  const inputWordRewardMinutes = document.getElementById("input-word-reward-minutes");
  const linkDashboard       = document.getElementById("link-dashboard");

  const toggleExtension = document.getElementById("toggle-extension");
  const toggleProtection = document.getElementById("toggle-protection");
  const protectionOptions = document.getElementById("protection-options");
  const selectChallengeType = document.getElementById("select-challenge-type");
  const selectMathDifficulty = document.getElementById("select-math-difficulty");
  const mathDifficultyRow = document.getElementById("math-difficulty-row");
  const protectionStatusBadge = document.getElementById("protection-status-badge");
  const protectionChallengeArea = document.getElementById("protection-challenge-area");

  const pinSection = document.getElementById("pin-section");
  const pinChallengeArea = document.getElementById("pin-challenge-area");
  const newPinLabel = document.getElementById("new-pin-label");
  const inputNewPin = document.getElementById("input-new-pin");
  const inputConfirmPin = document.getElementById("input-confirm-pin");
  const btnSavePin = document.getElementById("btn-save-pin");
  const pinError = document.getElementById("pin-error");
  const pinSuccess = document.getElementById("pin-success");

  const btnAddRule = document.getElementById("btn-add-rule");
  const ruleDialog = document.getElementById("rule-dialog");
  const dialogTitle = document.getElementById("dialog-title");
  const dialogCloseBtn = document.getElementById("dialog-close-btn");
  const dialogCancelBtn = document.getElementById("dialog-cancel-btn");
  const dialogSaveBtn = document.getElementById("dialog-save-btn");
  const ruleTypeSelect = document.getElementById("rule-type-select");
  const rulePatternInput = document.getElementById("rule-pattern-input");
  const rulePatternHint = document.getElementById("rule-pattern-hint");
  const rulePatternError = document.getElementById("rule-pattern-error");
  const ruleLabelInput = document.getElementById("rule-label-input");
  const ruleEnabledCheck = document.getElementById("rule-enabled-check");

  // ── Load ──────────────────────────────────────────────────────────────────
  async function load() {
    const data = await chrome.storage.local.get(["rules", "settings"]);
    rules = data.rules || [];
    settings = normalizeSettings(data.settings);
    render();
  }

  async function save() {
    await chrome.storage.local.set({ rules, settings });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function render() {
    renderRules();
    renderGeneralSettings();
    renderExceptionsSettings();
    renderProtectionSettings();
  }

  function renderRules() {
    const protectionOn = settings.protection.enabled;
    rulesProtectionBadge.style.display = protectionOn ? "" : "none";

    rulesTbody.innerHTML = "";

    if (rules.length === 0) {
      rulesTable.style.display = "none";
      rulesEmpty.style.display = "";
      return;
    }

    rulesTable.style.display = "";
    rulesEmpty.style.display = "none";

    rules.forEach(rule => {
      const tr = document.createElement("tr");

      // Type badge
      const tdType = document.createElement("td");
      tdType.className = "col-type";
      tdType.innerHTML = `<span class="badge badge-${rule.type}">${rule.type}</span>`;

      // Pattern + label
      const tdPattern = document.createElement("td");
      let inner = `<span class="pattern-cell">${escHtml(rule.pattern)}</span>`;
      if (rule.label) inner += `<span class="label-sub">${escHtml(rule.label)}</span>`;
      tdPattern.innerHTML = inner;

      // Toggle
      const tdToggle = document.createElement("td");
      tdToggle.className = "col-toggle";
      const toggleLabel = document.createElement("label");
      toggleLabel.className = "toggle";
      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = rule.enabled;
      const track = document.createElement("span");
      track.className = "track";
      toggleLabel.appendChild(chk);
      toggleLabel.appendChild(track);
      tdToggle.appendChild(toggleLabel);

      chk.addEventListener("change", async () => {
        if (!chk.checked && settings.protection.enabled) {
          // Disabling requires challenge
          chk.checked = true; // revert until challenge passes
          await runChallenge(rulesChallengeArea, "Disable Rule", async () => {
            rule.enabled = false;
            await save();
            renderRules();
          });
        } else {
          // Enabling does NOT require challenge
          rule.enabled = chk.checked;
          await save();
        }
      });

      // Actions
      const tdActions = document.createElement("td");
      tdActions.className = "col-actions";

      const btnEdit = document.createElement("button");
      btnEdit.className = "btn btn-sm btn-icon-only btn-secondary";
      btnEdit.title = "Edit";
      btnEdit.textContent = "✏️";
      btnEdit.addEventListener("click", () => openEditDialog(rule));

      const btnDel = document.createElement("button");
      btnDel.className = "btn btn-sm btn-icon-only btn-danger";
      btnDel.title = "Delete";
      btnDel.textContent = "🗑";
      btnDel.addEventListener("click", async () => {
        await runWithProtection(rulesChallengeArea, "Delete Rule", async () => {
          rules = rules.filter(r => r.id !== rule.id);
          await save();
          renderRules();
        });
      });

      tdActions.appendChild(btnEdit);
      tdActions.appendChild(document.createTextNode(" "));
      tdActions.appendChild(btnDel);

      tr.appendChild(tdType);
      tr.appendChild(tdPattern);
      tr.appendChild(tdToggle);
      tr.appendChild(tdActions);
      rulesTbody.appendChild(tr);
    });
  }

  function renderGeneralSettings() {
    toggleExtension.checked = !!settings.extensionEnabled;
  }

  function renderExceptionsSettings() {
    const ex = settings.exceptions;
    toggleExceptions.checked = !!ex.enabled;
    exceptionsOptions.style.display = ex.enabled ? "" : "none";

    const allowed = ex.allowedDurations || [];
    durationCheckList.querySelectorAll(".duration-check").forEach(chk => {
      chk.checked = allowed.includes(Number(chk.dataset.minutes));
    });
    inputCustomDuration.value = ex.customDurationMinutes == null ? "" : String(ex.customDurationMinutes);
    customDurationError.textContent = "";

    const wc = ex.wordChallenge || WORD_CHALLENGE_DEFAULTS;
    toggleWordChallenge.checked = !!wc.enabled;
    inputWordRequiredCorrect.value = wc.requiredCorrect;
    inputWordRewardMinutes.value = wc.rewardMinutes;
    linkDashboard.href = chrome.runtime.getURL("dashboard/dashboard.html");
  }

  function renderProtectionSettings() {
    const prot = settings.protection;
    toggleProtection.checked = !!prot.enabled;
    protectionOptions.style.display = prot.enabled ? "" : "none";
    protectionStatusBadge.style.display = prot.enabled ? "" : "none";
    selectChallengeType.value = prot.challengeType || "passcode";
    selectMathDifficulty.value = prot.mathDifficulty || "easy";
    mathDifficultyRow.style.display = prot.challengeType === "math" ? "" : "none";
    pinSection.style.display = prot.challengeType === "passcode" ? "" : "none";
    newPinLabel.textContent = prot.passcodeHash ? "Change Passcode" : "Set Passcode";
  }

  // ── Challenge system ──────────────────────────────────────────────────────
  // Returns a Promise that resolves when the challenge passes, or rejects on cancel.
  function runChallenge(container, title, onPass) {
    return new Promise((resolve) => {
      if (!settings.protection.enabled) {
        onPass().then(resolve);
        return;
      }
      showChallengeUI(container, title, async () => {
        await onPass();
        resolve();
      }, () => resolve());
    });
  }

  function runWithProtection(container, title, fn) {
    return runChallenge(container, title, fn);
  }

  function showChallengeUI(container, title, onPass, onCancel) {
    container.innerHTML = "";

    const ct = settings.protection.challengeType;
    let mathProblem = null;

    const box = document.createElement("div");
    box.className = "challenge-box";
    box.style.margin = "12px 20px";

    let questionHtml = "";
    let inputType = "password";
    let inputPlaceholder = "Enter passcode…";
    let subText = "Enter your passcode to continue.";

    if (ct === "math") {
      mathProblem = generateMathProblem(settings.protection.mathDifficulty || "easy");
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
          mathProblem = generateMathProblem(settings.protection.mathDifficulty || "easy");
          box.querySelector(".question").textContent = mathProblem.question;
          input.value = "";
          errorEl.textContent = "Wrong answer. Try the new problem.";
          return;
        }
      } else {
        if (!settings.protection.passcodeHash) {
          errorEl.textContent = "No passcode set. Please set one first.";
          return;
        }
        const hash = await sha256(val);
        if (hash !== settings.protection.passcodeHash) {
          errorEl.textContent = "Incorrect passcode.";
          input.value = "";
          input.classList.add("error");
          setTimeout(() => input.classList.remove("error"), 800);
          return;
        }
      }

      // Passed
      container.innerHTML = "";
      await onPass();
    }

    submitBtn.addEventListener("click", attempt);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") attempt(); });

    cancelBtn.addEventListener("click", () => {
      container.innerHTML = "";
      if (onCancel) onCancel();
    });
  }

  // ── General settings events ───────────────────────────────────────────────
  toggleExtension.addEventListener("change", async () => {
    if (!toggleExtension.checked && settings.protection.enabled) {
      toggleExtension.checked = true; // revert
      await runChallenge(document.getElementById("section-general").querySelector(".section-body"), "Disable Extension", async () => {
        settings.extensionEnabled = false;
        await save();
        renderGeneralSettings();
      });
    } else {
      settings.extensionEnabled = toggleExtension.checked;
      await save();
    }
  });

  // ── Protection events ─────────────────────────────────────────────────────
  toggleProtection.addEventListener("change", async () => {
    const turning_on = toggleProtection.checked;

    if (!turning_on && settings.protection.enabled) {
      // Turning protection OFF requires challenge
      toggleProtection.checked = true; // revert
      await runChallenge(protectionChallengeArea, "Disable Protection", async () => {
        settings.protection.enabled = false;
        await save();
        renderProtectionSettings();
      });
    } else {
      settings.protection.enabled = turning_on;
      await save();
      renderProtectionSettings();
    }
  });

  selectChallengeType.addEventListener("change", async () => {
    settings.protection.challengeType = selectChallengeType.value;
    await save();
    renderProtectionSettings();
  });

  selectMathDifficulty.addEventListener("change", async () => {
    settings.protection.mathDifficulty = selectMathDifficulty.value;
    await save();
  });

  // ── Exceptions events ─────────────────────────────────────────────────────
  toggleExceptions.addEventListener("change", async () => {
    settings.exceptions.enabled = toggleExceptions.checked;
    await save();
    renderExceptionsSettings();
  });

  durationCheckList.addEventListener("change", async () => {
    const checked = [];
    durationCheckList.querySelectorAll(".duration-check").forEach(chk => {
      if (chk.checked) checked.push(Number(chk.dataset.minutes));
    });
    settings.exceptions.allowedDurations = checked;
    await save();
  });

  inputCustomDuration.addEventListener("change", async () => {
    const raw = inputCustomDuration.value.trim();
    if (!raw) {
      settings.exceptions.customDurationMinutes = null;
      customDurationError.textContent = "";
      await save();
      return;
    }
    if (!/^\d+$/.test(raw)) {
      customDurationError.textContent = "Custom duration must be a whole number.";
      inputCustomDuration.value = settings.exceptions.customDurationMinutes == null
        ? ""
        : String(settings.exceptions.customDurationMinutes);
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (parsed < 1 || parsed > 720) {
      customDurationError.textContent = "Custom duration must be between 1 and 720 minutes.";
      inputCustomDuration.value = settings.exceptions.customDurationMinutes == null
        ? ""
        : String(settings.exceptions.customDurationMinutes);
      return;
    }

    settings.exceptions.customDurationMinutes = parsed;
    customDurationError.textContent = "";
    inputCustomDuration.value = String(parsed);
    await save();
  });

  toggleWordChallenge.addEventListener("change", async () => {
    if (!settings.exceptions.wordChallenge) settings.exceptions.wordChallenge = {};
    settings.exceptions.wordChallenge.enabled = toggleWordChallenge.checked;
    await save();
  });

  inputWordRequiredCorrect.addEventListener("change", async () => {
    if (!settings.exceptions.wordChallenge) settings.exceptions.wordChallenge = {};
    settings.exceptions.wordChallenge.requiredCorrect = clampInteger(
      inputWordRequiredCorrect.value,
      WORD_CHALLENGE_DEFAULTS.requiredCorrect,
      1,
      10
    );
    inputWordRequiredCorrect.value = settings.exceptions.wordChallenge.requiredCorrect;
    await save();
  });

  inputWordRewardMinutes.addEventListener("change", async () => {
    if (!settings.exceptions.wordChallenge) settings.exceptions.wordChallenge = {};
    settings.exceptions.wordChallenge.rewardMinutes = clampInteger(
      inputWordRewardMinutes.value,
      WORD_CHALLENGE_DEFAULTS.rewardMinutes,
      1,
      120
    );
    inputWordRewardMinutes.value = settings.exceptions.wordChallenge.rewardMinutes;
    await save();
  });

  // ── PIN management ────────────────────────────────────────────────────────
  btnSavePin.addEventListener("click", async () => {
    pinError.textContent = "";
    pinSuccess.classList.remove("visible");

    const newPin = inputNewPin.value;
    const confirmPin = inputConfirmPin.value;

    if (!newPin) { pinError.textContent = "Passcode cannot be empty."; return; }
    if (newPin !== confirmPin) { pinError.textContent = "Passcodes do not match."; return; }
    if (newPin.length < 4) { pinError.textContent = "Passcode must be at least 4 characters."; return; }

    // If there's an existing PIN, require challenge first
    if (settings.protection.passcodeHash) {
      await runChallenge(pinChallengeArea, "Verify Current Passcode", async () => {
        settings.protection.passcodeHash = await sha256(newPin);
        await save();
        inputNewPin.value = "";
        inputConfirmPin.value = "";
        pinSuccess.classList.add("visible");
        newPinLabel.textContent = "Change Passcode";
        setTimeout(() => pinSuccess.classList.remove("visible"), 3000);
      });
    } else {
      settings.protection.passcodeHash = await sha256(newPin);
      await save();
      inputNewPin.value = "";
      inputConfirmPin.value = "";
      pinSuccess.classList.add("visible");
      newPinLabel.textContent = "Change Passcode";
      setTimeout(() => pinSuccess.classList.remove("visible"), 3000);
    }
  });

  // ── Add Rule button ───────────────────────────────────────────────────────
  btnAddRule.addEventListener("click", async () => {
    await runWithProtection(rulesChallengeArea, "Add Rule", () => {
      openAddDialog();
      return Promise.resolve();
    });
  });

  // ── Rule Dialog ───────────────────────────────────────────────────────────
  const HINTS = {
    exact:   "Full URL including protocol, e.g. https://example.com/page",
    domain:  "Domain name only, e.g. example.com (subdomains included)",
    regex:   "JavaScript regex, e.g. (?:reddit|twitter)\\.com",
    keyword: "Any text that appears in the URL, e.g. social"
  };

  const PLACEHOLDERS = {
    exact:   "https://example.com/page",
    domain:  "example.com",
    regex:   "(?:youtube|vimeo)\\.com",
    keyword: "casino"
  };

  function updatePatternHint() {
    const type = ruleTypeSelect.value;
    rulePatternHint.textContent = HINTS[type] || "";
    rulePatternInput.placeholder = PLACEHOLDERS[type] || "";
  }

  ruleTypeSelect.addEventListener("change", updatePatternHint);

  function openAddDialog() {
    editingRuleId = null;
    dialogTitle.textContent = "Add Rule";
    ruleTypeSelect.value = "domain";
    rulePatternInput.value = "";
    rulePatternError.textContent = "";
    ruleLabelInput.value = "";
    ruleEnabledCheck.checked = true;
    updatePatternHint();
    ruleDialog.showModal();
    rulePatternInput.focus();
  }

  function openEditDialog(rule) {
    editingRuleId = rule.id;
    dialogTitle.textContent = "Edit Rule";
    ruleTypeSelect.value = rule.type;
    rulePatternInput.value = rule.pattern;
    rulePatternError.textContent = "";
    ruleLabelInput.value = rule.label || "";
    ruleEnabledCheck.checked = rule.enabled;
    updatePatternHint();
    ruleDialog.showModal();
    rulePatternInput.focus();
  }

  function closeDialog() {
    ruleDialog.close();
    rulePatternError.textContent = "";
  }

  dialogCloseBtn.addEventListener("click", closeDialog);
  dialogCancelBtn.addEventListener("click", closeDialog);

  ruleDialog.addEventListener("click", (e) => {
    if (e.target === ruleDialog) closeDialog();
  });

  dialogSaveBtn.addEventListener("click", async () => {
    const type = ruleTypeSelect.value;
    const pattern = rulePatternInput.value.trim();
    const label = ruleLabelInput.value.trim();
    const enabled = ruleEnabledCheck.checked;

    rulePatternError.textContent = "";

    // Validate
    if (!pattern) {
      rulePatternError.textContent = "Pattern cannot be empty.";
      return;
    }

    if (type === "exact") {
      try { new URL(pattern); } catch {
        rulePatternError.textContent = "Must be a valid URL (include https://).";
        return;
      }
    }

    if (type === "regex") {
      try { new RegExp(pattern); } catch (e) {
        rulePatternError.textContent = "Invalid regex: " + e.message;
        return;
      }
    }

    if (editingRuleId) {
      const rule = rules.find(r => r.id === editingRuleId);
      if (rule) {
        // Edit pattern/label/type — no challenge needed per spec
        rule.type = type;
        rule.pattern = pattern;
        rule.label = label;
        rule.enabled = enabled;
      }
    } else {
      rules.push({
        id: crypto.randomUUID(),
        type,
        pattern,
        enabled,
        label,
        createdAt: Date.now()
      });
    }

    await save();
    closeDialog();
    renderRules();
  });

  // ── Utilities ─────────────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function clampInteger(value, fallback, min, max) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  // ── Start ─────────────────────────────────────────────────────────────────
  await load();
})();
