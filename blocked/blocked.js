// blocked/blocked.js

(async function () {
  const params = new URLSearchParams(location.search);
  const blockedUrl    = params.get("url")     || "";
  const ruleType      = params.get("type")    || "";
  const rulePattern   = params.get("pattern") || "";
  const ruleLabel     = params.get("label")   || "";
  const ruleId        = params.get("ruleId")  || "";

  // ── Display blocked info ──────────────────────────────────────────────────
  const MAX_URL_LEN = 80;
  const displayUrl = blockedUrl.length > MAX_URL_LEN
    ? blockedUrl.slice(0, MAX_URL_LEN) + "…"
    : blockedUrl;

  document.getElementById("blocked-url").textContent = displayUrl || "Unknown URL";
  document.getElementById("rule-type").textContent   = ruleType   || "unknown";
  document.getElementById("rule-pattern").textContent = rulePattern || "—";

  if (ruleLabel) {
    document.getElementById("rule-label").textContent = ruleLabel;
    document.getElementById("label-row").style.display = "";
  }

  document.getElementById("go-back").addEventListener("click", () => {
    if (history.length > 1) {
      history.back();
    } else {
      window.close();
    }
  });

  document.getElementById("close-tab").addEventListener("click", () => {
    window.close();
  });

  // ── Load settings for exception flow ─────────────────────────────────────
  const data = await chrome.storage.local.get("settings");
  const settings = data.settings || {};
  const prot = settings.protection || {};
  const exc  = settings.exceptions || { enabled: false, allowedDurations: [15, 30, 60, 120] };

  if (!exc.enabled || !ruleId) return;

  // Show exception section
  document.getElementById("exception-section").style.display = "";

  // ── Exception flow ────────────────────────────────────────────────────────
  const stepRequest   = document.getElementById("exc-step-request");
  const stepDuration  = document.getElementById("exc-step-duration");
  const stepChallenge = document.getElementById("exc-step-challenge");
  const stepWord      = document.getElementById("exc-step-word");
  const stepSuccess   = document.getElementById("exc-step-success");
  const challengeArea = document.getElementById("exc-challenge-area");
  const durationBtns  = document.getElementById("duration-buttons");

  let selectedDurationMs = 0;

  function showStep(id) {
    [stepRequest, stepDuration, stepChallenge, stepWord, stepSuccess].forEach(el => {
      el.style.display = el.id === id ? "" : "none";
    });
  }

  // Step 1 → 2: show duration picker
  document.getElementById("btn-request-exception").addEventListener("click", () => {
    const durations = exc.allowedDurations || [15, 30, 60, 120];

    durationBtns.innerHTML = "";
    durations.forEach(min => {
      const btn = document.createElement("button");
      btn.className = "btn btn-ghost duration-btn";
      btn.textContent = formatDuration(min * 60000);
      btn.addEventListener("click", () => {
        selectedDurationMs = min * 60000;
        showStep("exc-step-challenge");
        renderChallenge();
      });
      durationBtns.appendChild(btn);
    });

    showStep("exc-step-duration");
  });

  // Back button
  document.getElementById("exc-back-to-request").addEventListener("click", () => {
    challengeArea.innerHTML = "";
    showStep("exc-step-request");
  });

  // Word challenge entry
  if (exc.wordChallenge && exc.wordChallenge.enabled) {
    document.getElementById("word-challenge-entry").style.display = "";
    document.getElementById("btn-word-challenge").addEventListener("click", () => {
      wcStreak = 0;
      showStep("exc-step-word");
      renderWCWord();
    });
    document.getElementById("wc-back").addEventListener("click", () => {
      wcStreak = 0;
      showStep("exc-step-request");
    });
  }

  // Step 3: challenge UI
  function renderChallenge() {
    challengeArea.innerHTML = "";

    const protEnabled = prot.enabled;
    const ct = prot.challengeType || "passcode";

    // If protection not configured, warn
    if (!protEnabled || (ct === "passcode" && !prot.passcodeHash)) {
      challengeArea.innerHTML = `
        <div class="exc-warn">
          No protection passcode is set. Ask a parent to set one in Options → Protection Mode.
          <br><br>
          <button class="btn btn-ghost btn-sm exc-back-btn" id="exc-warn-back">← Back</button>
        </div>
      `;
      document.getElementById("exc-warn-back").addEventListener("click", () => {
        showStep("exc-step-request");
      });
      return;
    }

    let mathProblem = null;
    let questionHtml = "";
    let inputType = "password";
    let inputPlaceholder = "Enter passcode…";
    let subText = "Enter the parent passcode to continue.";

    if (ct === "math") {
      mathProblem = generateMathProblem(prot.mathDifficulty || "easy");
      subText = "Solve the math problem to continue.";
      questionHtml = `<div class="exc-math-question">${mathProblem.question}</div>`;
      inputType = "text";
      inputPlaceholder = "Your answer…";
    }

    challengeArea.innerHTML = `
      <p style="font-size:0.8125rem;color:#6b7280;margin-bottom:10px">${subText}</p>
      ${questionHtml}
      <div class="exc-input-row">
        <input type="${inputType}" id="exc-challenge-input" class="exc-input" placeholder="${inputPlaceholder}" autocomplete="off">
        <button class="btn btn-ghost btn-sm" id="exc-challenge-submit">OK</button>
      </div>
      <div class="exc-error" id="exc-error"></div>
      <button class="btn btn-ghost btn-sm exc-back-btn" id="exc-challenge-back" style="margin-top:10px">← Back</button>
    `;

    const input     = document.getElementById("exc-challenge-input");
    const submitBtn = document.getElementById("exc-challenge-submit");
    const errorEl   = document.getElementById("exc-error");

    input.focus();

    document.getElementById("exc-challenge-back").addEventListener("click", () => {
      challengeArea.innerHTML = "";
      showStep("exc-step-duration");
    });

    async function attempt() {
      const val = input.value.trim();
      if (!val) { errorEl.textContent = "Please enter a value."; return; }

      if (ct === "math") {
        if (parseInt(val, 10) !== mathProblem.answer) {
          mathProblem = generateMathProblem(prot.mathDifficulty || "easy");
          challengeArea.querySelector(".exc-math-question").textContent = mathProblem.question;
          input.value = "";
          errorEl.textContent = "Wrong answer. Try the new problem.";
          return;
        }
      } else {
        const hash = await sha256(val);
        if (hash !== prot.passcodeHash) {
          errorEl.textContent = "Incorrect passcode.";
          input.value = "";
          return;
        }
      }

      // Challenge passed — grant exception
      await grantException();
    }

    submitBtn.addEventListener("click", attempt);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") attempt(); });
  }

  // Step 4: grant exception, log to DB, redirect
  async function grantException() {
    const now = Date.now();
    const expiresAt = now + selectedDurationMs;
    const domain = extractDomain(blockedUrl);

    const record = {
      id:          crypto.randomUUID(),
      url:         blockedUrl,
      domain,
      ruleId,
      ruleType,
      rulePattern,
      ruleLabel,
      grantedAt:   now,
      duration:    selectedDurationMs,
      expiresAt,
      note:        ""
    };

    // Write to IndexedDB history
    try {
      await addException(record);
    } catch (e) {
      console.warn("Failed to write exception to IndexedDB:", e);
    }

    // Notify background service worker to update hot cache
    await chrome.runtime.sendMessage({ type: "GRANT_EXCEPTION", ruleId, expiresAt, grantedAt: now, duration: selectedDurationMs });

    // Show countdown and redirect
    showStep("exc-step-success");
    let count = 3;
    const msgEl = document.getElementById("exc-countdown-msg");
    msgEl.textContent = `Access granted — redirecting in ${count}…`;

    const interval = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(interval);
        location.href = blockedUrl;
      } else {
        msgEl.textContent = `Access granted — redirecting in ${count}…`;
      }
    }, 1000);
  }

  // ── Word Challenge ────────────────────────────────────────────────────────
  const WC_WORDS = [
    { word: "ball",  emoji: "⚽" }, { word: "fish",  emoji: "🐟" },
    { word: "bird",  emoji: "🐦" }, { word: "frog",  emoji: "🐸" },
    { word: "cake",  emoji: "🎂" }, { word: "milk",  emoji: "🥛" },
    { word: "book",  emoji: "📚" }, { word: "tree",  emoji: "🌳" },
    { word: "duck",  emoji: "🦆" }, { word: "bear",  emoji: "🐻" },
    { word: "star",  emoji: "⭐" }, { word: "rain",  emoji: "🌧️" },
    { word: "hand",  emoji: "✋" }, { word: "nose",  emoji: "👃" },
    { word: "door",  emoji: "🚪" }, { word: "play",  emoji: "🎮" },
    { word: "jump",  emoji: "🦘" }, { word: "swim",  emoji: "🏊" },
    { word: "ship",  emoji: "🚢" }, { word: "drum",  emoji: "🥁" },
    { word: "cloud", emoji: "☁️" }, { word: "house", emoji: "🏠" },
    { word: "mouse", emoji: "🐭" }, { word: "horse", emoji: "🐴" },
    { word: "apple", emoji: "🍎" }, { word: "smile", emoji: "😊" },
    { word: "bunny", emoji: "🐰" }, { word: "candy", emoji: "🍬" },
    { word: "sunny", emoji: "☀️" }, { word: "pizza", emoji: "🍕" },
    { word: "snail", emoji: "🐌" }, { word: "crown", emoji: "👑" },
    { word: "dream", emoji: "💭" }, { word: "happy", emoji: "😁" },
    { word: "sleep", emoji: "😴" }, { word: "slide", emoji: "🛝" },
    { word: "clown", emoji: "🤡" }, { word: "flame", emoji: "🔥" },
    { word: "robot", emoji: "🤖" }, { word: "grape", emoji: "🍇" },
  ];

  let wcStreak = 0;
  let wcCurrentWord = null;
  let wcBlankIndices = null;
  let wcFilled = [];
  let wcUsedWords = new Set();

  function wcPickWord() {
    const available = WC_WORDS.filter(w => !wcUsedWords.has(w.word));
    if (available.length === 0) wcUsedWords = new Set();
    const pool = available.length > 0 ? available : WC_WORDS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function wcMakeBlanks(word) {
    // Always keep first letter visible; blank 2 for 4-letter words, 3 for 5+
    const numBlanks = word.length >= 5 ? 3 : 2;
    const indices = Array.from({ length: word.length - 1 }, (_, i) => i + 1);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return new Set(indices.slice(0, numBlanks));
  }

  function wcUpdateStars() {
    const s1 = document.getElementById("wc-star-1");
    const s2 = document.getElementById("wc-star-2");
    if (s1) s1.className = `wc-star ${wcStreak >= 1 ? "wc-star-lit" : "wc-star-dim"}`;
    if (s2) s2.className = `wc-star ${wcStreak >= 2 ? "wc-star-lit" : "wc-star-dim"}`;
  }

  function renderWCWord() {
    wcUpdateStars();
    wcCurrentWord = wcPickWord();
    wcUsedWords.add(wcCurrentWord.word);
    wcBlankIndices = wcMakeBlanks(wcCurrentWord.word);
    wcFilled = Array(wcCurrentWord.word.length).fill(null);

    const gameEl = document.getElementById("wc-game");
    gameEl.innerHTML = "";

    // Emoji hint
    const emojiEl = document.createElement("div");
    emojiEl.className = "wc-emoji";
    emojiEl.textContent = wcCurrentWord.emoji;
    gameEl.appendChild(emojiEl);

    // Letter tiles
    const wordEl = document.createElement("div");
    wordEl.className = "wc-word";
    wordEl.id = "wc-word-display";
    wcCurrentWord.word.split("").forEach((letter, i) => {
      const span = document.createElement("span");
      span.className = wcBlankIndices.has(i) ? "wc-letter wc-blank" : "wc-letter wc-given";
      span.textContent = wcBlankIndices.has(i) ? "" : letter.toUpperCase();
      span.dataset.idx = i;
      wordEl.appendChild(span);
    });
    gameEl.appendChild(wordEl);

    // Feedback line
    const feedbackEl = document.createElement("div");
    feedbackEl.id = "wc-feedback";
    feedbackEl.className = "wc-feedback";
    gameEl.appendChild(feedbackEl);

    // A–Z tap keyboard
    const kbEl = document.createElement("div");
    kbEl.className = "wc-keyboard";
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(letter => {
      const btn = document.createElement("button");
      btn.className = "wc-key";
      btn.textContent = letter;
      btn.addEventListener("click", () => wcHandleKey(letter.toLowerCase()));
      kbEl.appendChild(btn);
    });
    const bksp = document.createElement("button");
    bksp.className = "wc-key wc-key-bksp";
    bksp.textContent = "⌫";
    bksp.addEventListener("click", wcHandleBackspace);
    kbEl.appendChild(bksp);
    gameEl.appendChild(kbEl);
  }

  function wcHandleKey(letter) {
    const blanks = [...wcBlankIndices].sort((a, b) => a - b);
    const next = blanks.find(i => wcFilled[i] === null);
    if (next === undefined) return;
    wcFilled[next] = letter;
    wcUpdateDisplay();
    if (blanks.every(i => wcFilled[i] !== null)) wcCheckAnswer();
  }

  function wcHandleBackspace() {
    const blanks = [...wcBlankIndices].sort((a, b) => a - b);
    const last = [...blanks].reverse().find(i => wcFilled[i] !== null);
    if (last === undefined) return;
    wcFilled[last] = null;
    wcUpdateDisplay();
  }

  function wcUpdateDisplay() {
    const blanks = [...wcBlankIndices].sort((a, b) => a - b);
    const spans = document.querySelectorAll("#wc-word-display .wc-blank");
    blanks.forEach((blankIdx, pos) => {
      const span = spans[pos];
      if (!span) return;
      const val = wcFilled[blankIdx];
      span.textContent = val ? val.toUpperCase() : "";
      span.classList.toggle("wc-filled", val !== null);
    });
  }

  async function wcCheckAnswer() {
    const word = wcCurrentWord.word;
    const correct = [...wcBlankIndices].every(i => wcFilled[i] === word[i]);
    const wordEl = document.getElementById("wc-word-display");
    const feedbackEl = document.getElementById("wc-feedback");

    document.querySelectorAll(".wc-key").forEach(b => b.disabled = true);

    if (correct) {
      wordEl.classList.add("wc-word-correct");
      feedbackEl.textContent = "✓ Correct!";
      feedbackEl.className = "wc-feedback wc-correct";
      wcStreak++;
      wcUpdateStars();
      if (wcStreak >= 2) {
        feedbackEl.textContent = "🎉 Amazing! You earned 5 minutes!";
        setTimeout(async () => {
          selectedDurationMs = 5 * 60 * 1000;
          await grantException();
        }, 1200);
      } else {
        setTimeout(() => renderWCWord(), 1100);
      }
    } else {
      wordEl.classList.add("wc-word-wrong");
      feedbackEl.textContent = "✗ Not quite! Try a new word.";
      feedbackEl.className = "wc-feedback wc-wrong";
      wcStreak = 0;
      wcUpdateStars();
      setTimeout(() => renderWCWord(), 1100);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function formatDuration(ms) {
    const min = Math.round(ms / 60000);
    if (min < 60) return `${min} min`;
    const hr = min / 60;
    return hr === 1 ? "1 hour" : `${hr} hours`;
  }

  function extractDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }
})();
