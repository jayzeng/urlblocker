// background.js — Service worker for URL Blocker extension

const BLOCKED_PAGE = chrome.runtime.getURL("blocked/blocked.html");

let cachedRules = [];
let cachedSettings = null;
let cachedActiveExceptions = {};

const DEFAULT_SETTINGS = {
  extensionEnabled: true,
  protection: {
    enabled: false,
    challengeType: "passcode",
    passcodeHash: null,
    mathDifficulty: "easy"
  },
  exceptions: {
    enabled: false,
    allowedDurations: [5, 15, 30, 60, 120]
  }
};

// Load rules, settings, and active exceptions into memory cache
async function loadCache() {
  const data = await chrome.storage.local.get(["rules", "settings", "activeExceptions"]);
  cachedRules = data.rules || [];
  cachedSettings = data.settings || DEFAULT_SETTINGS;
  cachedActiveExceptions = data.activeExceptions || {};
}

// Initialize on service worker start
loadCache().then(syncDNRRules);

// Keep cache fresh when storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  let needsSync = false;
  if (changes.rules) { cachedRules = changes.rules.newValue || []; needsSync = true; }
  if (changes.settings) { cachedSettings = changes.settings.newValue || DEFAULT_SETTINGS; needsSync = true; }
  if (changes.activeExceptions) { cachedActiveExceptions = changes.activeExceptions.newValue || {}; needsSync = true; }
  if (needsSync) syncDNRRules();
});

// Normalize URL for exact matching
function normalizeUrl(urlStr) {
  try {
    return new URL(urlStr).href;
  } catch {
    return urlStr;
  }
}

// Strip www. prefix from hostname
function stripWww(hostname) {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

// Check if a URL matches a given rule
function matchesRule(url, rule) {
  if (!rule.enabled) return false;

  try {
    const parsed = new URL(url);

    switch (rule.type) {
      case "exact": {
        return normalizeUrl(url) === normalizeUrl(rule.pattern);
      }

      case "domain": {
        const urlHost = stripWww(parsed.hostname.toLowerCase());
        const ruleHost = stripWww(rule.pattern.toLowerCase().trim());
        return urlHost === ruleHost || urlHost.endsWith("." + ruleHost);
      }

      case "regex": {
        try {
          return new RegExp(rule.pattern, "i").test(url);
        } catch {
          return false;
        }
      }

      case "keyword": {
        return url.toLowerCase().includes(rule.pattern.toLowerCase());
      }

      default:
        return false;
    }
  } catch {
    return false;
  }
}

// Find first matching rule for a URL
function findMatchingRule(url) {
  for (const rule of cachedRules) {
    if (matchesRule(url, rule)) return rule;
  }
  return null;
}

// Check if there is a valid (unexpired) exception for a rule
function hasActiveException(ruleId) {
  const exc = cachedActiveExceptions[ruleId];
  return exc && exc.expiresAt > Date.now();
}

// --- declarativeNetRequest: block embedded/iframe content from blocked domains ---

function ruleToDNRCondition(rule) {
  const subframeTypes = ["sub_frame", "media", "object"];
  switch (rule.type) {
    case "domain": {
      const host = rule.pattern.toLowerCase().trim().replace(/^www\./, "");
      return { requestDomains: [host, "www." + host], resourceTypes: subframeTypes };
    }
    case "regex": {
      try { new RegExp(rule.pattern); } catch { return null; }
      return { regexFilter: rule.pattern, isUrlFilterCaseSensitive: false, resourceTypes: subframeTypes };
    }
    case "keyword": {
      // Escape regex metacharacters for literal substring matching
      const escaped = rule.pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
      return { regexFilter: escaped, isUrlFilterCaseSensitive: false, resourceTypes: subframeTypes };
    }
    case "exact": {
      try {
        return { urlFilter: `|${new URL(rule.pattern).href}|`, resourceTypes: subframeTypes };
      } catch { return null; }
    }
    default: return null;
  }
}

async function syncDNRRules() {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) return;
  const settings = cachedSettings || DEFAULT_SETTINGS;
  const now = Date.now();

  const excepted = new Set(
    Object.entries(cachedActiveExceptions)
      .filter(([, e]) => e.expiresAt > now)
      .map(([id]) => id)
  );

  const newRules = [];
  let dnrId = 1;
  if (settings.extensionEnabled) {
    for (const rule of cachedRules) {
      if (!rule.enabled || excepted.has(rule.id)) continue;
      const condition = ruleToDNRCondition(rule);
      if (condition) newRules.push({ id: dnrId++, priority: 1, action: { type: "block" }, condition });
    }
  }

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map(r => r.id),
    addRules: newRules
  });
}

// Intercept top-level navigations only (sub-frames handled by declarativeNetRequest)
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0 || details.tabId < 0) return;

  const url = details.url;

  // Skip internal browser URLs
  if (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("about:") ||
    url.startsWith("data:") ||
    url.startsWith("file://")
  ) return;

  // Skip our own blocked page
  if (url.startsWith(BLOCKED_PAGE)) return;

  const settings = cachedSettings || DEFAULT_SETTINGS;
  if (!settings.extensionEnabled) return;

  const rule = findMatchingRule(url);
  if (!rule) return;

  // Skip blocking if a valid exception exists for this rule
  if (hasActiveException(rule.id)) return;

  // Build blocked page URL with context
  const blockedUrl = new URL(BLOCKED_PAGE);
  blockedUrl.searchParams.set("url", url);
  blockedUrl.searchParams.set("ruleId", rule.id);
  blockedUrl.searchParams.set("type", rule.type);
  blockedUrl.searchParams.set("pattern", rule.pattern);
  if (rule.label) blockedUrl.searchParams.set("label", rule.label);

  chrome.tabs.update(details.tabId, { url: blockedUrl.toString() });
});

// Handle messages from blocked page and other extension pages
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "GET_EXCEPTION_STATUS") {
    const rule = findMatchingRule(msg.url);
    if (!rule) { sendResponse(null); return true; }
    const entry = cachedActiveExceptions[rule.id];
    if (!entry || entry.expiresAt <= Date.now()) { sendResponse(null); return true; }
    sendResponse({
      ruleId:      rule.id,
      ruleType:    rule.type,
      rulePattern: rule.pattern,
      ruleLabel:   rule.label || "",
      expiresAt:   entry.expiresAt,
      grantedAt:   entry.grantedAt,
      duration:    entry.duration
    });
    return true;
  }

  if (msg.type === "GRANT_EXCEPTION") {
    const { ruleId, expiresAt, grantedAt, duration } = msg;
    cachedActiveExceptions[ruleId] = { expiresAt, grantedAt, duration };

    // Persist to storage and clean up any expired entries at the same time
    const cleaned = {};
    const now = Date.now();
    for (const [id, entry] of Object.entries(cachedActiveExceptions)) {
      if (entry.expiresAt > now) cleaned[id] = entry;
    }
    cachedActiveExceptions = cleaned;
    chrome.storage.local.set({ activeExceptions: cachedActiveExceptions });
    syncDNRRules();
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "EXPIRE_EXCEPTIONS") {
    const now = Date.now();
    const cleaned = {};
    for (const [id, entry] of Object.entries(cachedActiveExceptions)) {
      if (entry.expiresAt > now) cleaned[id] = entry;
    }
    cachedActiveExceptions = cleaned;
    chrome.storage.local.set({ activeExceptions: cachedActiveExceptions });
    syncDNRRules();
    sendResponse({ ok: true });
    return true;
  }
});

// Refresh cache when service worker wakes
chrome.runtime.onStartup.addListener(() => loadCache().then(syncDNRRules));
chrome.runtime.onInstalled.addListener(async () => {
  await loadCache();
  // Set defaults if first install
  const data = await chrome.storage.local.get("settings");
  if (!data.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS, rules: [], activeExceptions: {} });
    cachedSettings = DEFAULT_SETTINGS;
    cachedRules = [];
    cachedActiveExceptions = {};
  }
  await syncDNRRules();
});
