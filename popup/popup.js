// popup/popup.js

(async function () {
  // ── State ─────────────────────────────────────────────────────────────────
  let settings = null;
  let currentUrl = "";
  let currentDomain = "";
  let pendingAction = null;   // { fn } — action to run after challenge passes
  let mathProblem = null;     // current math problem if challengeType === "math"

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const stateOff = document.getElementById("state-off");
  const stateOn = document.getElementById("state-on");
  const statusDot = document.getElementById("status-dot");
  const currentUrlEl = document.getElementById("current-url");

  const challengePanel = document.getElementById("challenge-panel");
  const challengeTitle = document.getElementById("challenge-title");
  const challengeSub = document.getElementById("challenge-sub");
  const challengeQuestion = document.getElementById("challenge-question");
  const challengeInput = document.getElementById("challenge-input");
  const challengeSubmit = document.getElementById("challenge-submit");
  const challengeError = document.getElementById("challenge-error");
  const challengeCancel = document.getElementById("challenge-cancel");

  const btnTurnOn = document.getElementById("btn-turn-on");
  const btnBlockUrl = document.getElementById("btn-block-url");
  const btnBlockDomain = document.getElementById("btn-block-domain");
  const btnSettings = document.getElementById("btn-settings");
  const btnDisable = document.getElementById("btn-disable");
  const settingsLink = document.getElementById("settings-link");

  const lockBlockUrl = document.getElementById("lock-block-url");
  const lockBlockDomain = document.getElementById("lock-block-domain");
  const lockSettings = document.getElementById("lock-settings");
  const lockDisable = document.getElementById("lock-disable");

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    const data = await chrome.storage.local.get(["settings"]);
    settings = normalizeSettings(data.settings);

    // Get current tab URL
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("chrome-extension://")) {
      currentUrl = tab.url;
      try {
        const parsed = new URL(currentUrl);
        currentDomain = parsed.hostname.replace(/^www\./, "");
      } catch {
        currentDomain = "";
      }
      const MAX = 48;
      currentUrlEl.textContent = currentUrl.length > MAX ? currentUrl.slice(0, MAX) + "…" : currentUrl;
    } else {
      currentUrl = "";
      currentDomain = "";
      currentUrlEl.textContent = "No URL available";
      btnBlockUrl.disabled = true;
      btnBlockDomain.disabled = true;
    }

    render();
  }

  function render() {
    const enabled = settings.extensionEnabled;
    const protectionOn = settings.protection && settings.protection.enabled;

    statusDot.className = "status-dot" + (enabled ? " on" : "");

    if (!enabled) {
      stateOff.style.display = "";
      stateOn.style.display = "none";
    } else {
      stateOff.style.display = "none";
      stateOn.style.display = "";

      // Show lock icons when protection is on
      [lockBlockUrl, lockBlockDomain, lockSettings, lockDisable].forEach(el => {
        el.style.display = protectionOn ? "" : "none";
      });
    }
  }

  // ── Challenge helpers ─────────────────────────────────────────────────────
  function isProtected() {
    return settings.protection && settings.protection.enabled;
  }

  async function runWithChallenge(title, actionFn) {
    if (!isProtected()) {
      await actionFn();
      return;
    }
    pendingAction = actionFn;
    showChallenge(title);
  }

  function showChallenge(title) {
    challengePanel.classList.add("visible");
    challengeTitle.textContent = title;
    challengeError.textContent = "";
    challengeInput.value = "";
    challengeInput.classList.remove("error");

    const ct = settings.protection.challengeType;

    if (ct === "math") {
      mathProblem = generateMathProblem(settings.protection.mathDifficulty || "easy");
      challengeSub.textContent = "Solve the problem to continue.";
      challengeQuestion.textContent = mathProblem.question;
      challengeQuestion.style.display = "";
      challengeInput.type = "text";
      challengeInput.placeholder = "Your answer…";
    } else {
      mathProblem = null;
      challengeSub.textContent = "Enter your passcode to continue.";
      challengeQuestion.style.display = "none";
      challengeInput.type = "password";
      challengeInput.placeholder = "Passcode…";
    }

    challengeInput.focus();
  }

  function hideChallenge() {
    challengePanel.classList.remove("visible");
    pendingAction = null;
    mathProblem = null;
    challengeError.textContent = "";
    challengeInput.value = "";
  }

  async function submitChallenge() {
    const val = challengeInput.value.trim();
    if (!val) {
      showError("Please enter a value.");
      return;
    }

    const ct = settings.protection.challengeType;

    if (ct === "math") {
      if (parseInt(val, 10) !== mathProblem.answer) {
        // Wrong — regenerate problem
        mathProblem = generateMathProblem(settings.protection.mathDifficulty || "easy");
        challengeQuestion.textContent = mathProblem.question;
        challengeInput.value = "";
        showError("Wrong answer. Try the new problem.");
        return;
      }
    } else {
      // Passcode
      if (!settings.protection.passcodeHash) {
        showError("No passcode set. Open settings to configure.");
        return;
      }
      const hash = await sha256(val);
      if (hash !== settings.protection.passcodeHash) {
        showError("Incorrect passcode.");
        challengeInput.value = "";
        challengeInput.classList.add("error");
        setTimeout(() => challengeInput.classList.remove("error"), 800);
        return;
      }
    }

    // Passed
    const action = pendingAction;
    hideChallenge();
    if (action) await action();
  }

  function showError(msg) {
    challengeError.textContent = msg;
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  async function doBlockUrl() {
    if (!currentUrl) return;
    const rule = {
      id: crypto.randomUUID(),
      type: "exact",
      pattern: currentUrl,
      enabled: true,
      label: "",
      createdAt: Date.now()
    };
    await addRule(rule);
    window.close();
  }

  async function doBlockDomain() {
    if (!currentDomain) return;
    const rule = {
      id: crypto.randomUUID(),
      type: "domain",
      pattern: currentDomain,
      enabled: true,
      label: "",
      createdAt: Date.now()
    };
    await addRule(rule);
    window.close();
  }

  async function addRule(rule) {
    const data = await chrome.storage.local.get("rules");
    const rules = data.rules || [];
    rules.push(rule);
    await chrome.storage.local.set({ rules });
  }

  async function doDisableExtension() {
    settings.extensionEnabled = false;
    await chrome.storage.local.set({ settings });
    render();
  }

  async function doOpenSettings() {
    chrome.runtime.openOptionsPage();
    window.close();
  }

  // ── Event listeners ───────────────────────────────────────────────────────
  btnTurnOn.addEventListener("click", async () => {
    settings.extensionEnabled = true;
    await chrome.storage.local.set({ settings });
    render();
  });

  btnBlockUrl.addEventListener("click", () => {
    runWithChallenge("Block this URL", doBlockUrl);
  });

  btnBlockDomain.addEventListener("click", () => {
    runWithChallenge("Block this domain", doBlockDomain);
  });

  btnSettings.addEventListener("click", () => {
    runWithChallenge("Open Settings", doOpenSettings);
  });

  btnDisable.addEventListener("click", () => {
    runWithChallenge("Disable Extension", doDisableExtension);
  });

  settingsLink.addEventListener("click", () => {
    runWithChallenge("Open Settings", doOpenSettings);
  });

  challengeSubmit.addEventListener("click", submitChallenge);
  challengeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitChallenge();
  });

  challengeCancel.addEventListener("click", hideChallenge);

  // ── Start ─────────────────────────────────────────────────────────────────
  await init();
})();
