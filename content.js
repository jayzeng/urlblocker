// content.js — Exception countdown timer overlay

(async function () {
  // Don't run inside extension pages
  if (location.protocol === "chrome-extension:") return;

  // Ask background if there is an active exception for the current URL
  let exc;
  try {
    exc = await chrome.runtime.sendMessage({
      type: "GET_EXCEPTION_STATUS",
      url: location.href
    });
  } catch {
    return; // service worker unavailable (extension reloaded, etc.)
  }
  if (!exc) return;

  const { ruleId, ruleType, rulePattern, ruleLabel, expiresAt, duration } = exc;

  // Redirect immediately if the exception already expired before page loaded
  if (expiresAt <= Date.now()) { doRedirect(); return; }

  // ── Shadow-DOM overlay (isolated from host-page styles) ───────────────────
  const host = document.createElement("div");
  host.id = "__urlblocker_timer__";
  Object.assign(host.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    zIndex: "2147483647",
    pointerEvents: "none"
  });
  (document.body ?? document.documentElement).appendChild(host);

  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      .pill {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        font-weight: 600;
        line-height: 1;
        padding: 9px 15px;
        border-radius: 9999px;
        display: flex;
        align-items: center;
        gap: 7px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.25);
        opacity: 0;
        transform: translateY(10px);
        transition: opacity 0.3s ease, transform 0.3s ease, background-color 0.5s ease;
        white-space: nowrap;
        pointer-events: none;
        user-select: none;
      }
      .pill.visible  { opacity: 1; transform: translateY(0); }
      .pill.info     { background: #1f2937; color: #f9fafb; }
      .pill.warning  { background: #b45309; color: #fffbeb; }
      .pill.urgent   { background: #dc2626; color: white; }
      .pill.expired  { background: #dc2626; color: white; opacity: 1; transform: translateY(0); }
      @keyframes pulse {
        0%, 100% { box-shadow: 0 2px 12px rgba(0,0,0,0.25); }
        50%       { box-shadow: 0 4px 20px rgba(220,38,38,0.55); }
      }
      .pill.urgent { animation: pulse 1.2s ease-in-out infinite; }
    </style>
    <div class="pill" id="pill"></div>
  `;
  const pill = shadow.getElementById("pill");

  // ── Helpers ────────────────────────────────────────────────────────────────
  function formatRemaining(ms) {
    const s   = Math.max(0, Math.ceil(ms / 1000));
    const m   = Math.floor(s / 60);
    const sec = s % 60;
    if (m >= 60) {
      const h = Math.floor(m / 60), rem = m % 60;
      return rem ? `${h}h ${rem}m` : `${h}h`;
    }
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  function urgencyFor(remaining) {
    if (remaining <= 60000)           return "urgent";
    if (remaining <= duration * 0.3)  return "warning";
    return "info";
  }

  function updatePill(remaining) {
    const level = urgencyFor(remaining);
    const icon  = level === "urgent" ? "🚨" : level === "warning" ? "⏰" : "🕐";
    pill.className = `pill visible ${level}`;
    pill.textContent = `${icon} ${formatRemaining(remaining)}`;
  }

  // ── Countdown ──────────────────────────────────────────────────────────────
  let redirected = false;
  let intervalId = null;

  function startCountdown() {
    const rem = expiresAt - Date.now();
    if (rem <= 0) { doRedirect(); return; }
    updatePill(rem);
    intervalId = setInterval(() => {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        clearInterval(intervalId);
        pill.className = "pill expired";
        pill.textContent = "🚫 Access expired";
        setTimeout(doRedirect, 1500);
        return;
      }
      updatePill(remaining);
    }, 500);
  }

  // Delay countdown start until the 60%-remaining threshold.
  // If we're already past it (page loaded mid-exception), start immediately.
  const remaining = expiresAt - Date.now();
  const startDelay = remaining > duration * 0.6
    ? (expiresAt - duration * 0.6) - Date.now()
    : 0;

  setTimeout(startCountdown, Math.max(0, startDelay));

  // ── Redirect to blocked page ───────────────────────────────────────────────
  function doRedirect() {
    if (redirected) return;
    redirected = true;
    const blocked = new URL(chrome.runtime.getURL("blocked/blocked.html"));
    blocked.searchParams.set("url", location.href);
    blocked.searchParams.set("ruleId", ruleId);
    blocked.searchParams.set("type", ruleType);
    blocked.searchParams.set("pattern", rulePattern);
    if (ruleLabel) blocked.searchParams.set("label", ruleLabel);
    location.replace(blocked.toString());
  }
})();
