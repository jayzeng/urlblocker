// background.js — Service worker for URL Blocker extension

importScripts("shared/settings.js");

const BLOCKED_PAGE = chrome.runtime.getURL("blocked/blocked.html");

let cachedRules = [];
let cachedSettings = null;
let cachedActiveExceptions = {};
let cacheReady = null;

// Load rules, settings, and active exceptions into memory cache
async function loadCache() {
  const data = await chrome.storage.local.get(["rules", "settings", "activeExceptions"]);
  cachedRules = data.rules || [];
  cachedSettings = normalizeSettings(data.settings);
  cachedActiveExceptions = data.activeExceptions || {};
}

function loadCacheAndSync() {
  cacheReady = loadCache()
    .then(() => syncDNRRules())
    .catch((error) => {
      console.warn("URL Blocker failed to load cache:", error);
      cacheReady = null;
    });
  return cacheReady;
}

async function ensureCacheLoaded() {
  if (!cacheReady) {
    await loadCacheAndSync();
    return;
  }
  await cacheReady;
}

// Initialize on service worker start
loadCacheAndSync();

// Keep cache fresh when storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  let needsSync = false;
  if (changes.rules) { cachedRules = changes.rules.newValue || []; needsSync = true; }
  if (changes.settings) { cachedSettings = normalizeSettings(changes.settings.newValue); needsSync = true; }
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

function escapeRegexLiteral(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shouldIgnoreUrl(url) {
  if (!url) return true;

  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("about:") ||
    url.startsWith("data:") ||
    url.startsWith("file://") ||
    url.startsWith(BLOCKED_PAGE)
  );
}

function getBlockedUrl(url, rule) {
  const blockedUrl = new URL(BLOCKED_PAGE);
  blockedUrl.searchParams.set("url", url);
  blockedUrl.searchParams.set("ruleId", rule.id);
  blockedUrl.searchParams.set("type", rule.type);
  blockedUrl.searchParams.set("pattern", rule.pattern);
  if (rule.label) blockedUrl.searchParams.set("label", rule.label);
  return blockedUrl.toString();
}

async function enforceBlockedUrl(tabId, url) {
  if (tabId < 0 || shouldIgnoreUrl(url)) return;

  await ensureCacheLoaded();

  const settings = cachedSettings || normalizeSettings(null);
  if (!settings.extensionEnabled) return;

  const rule = findMatchingRule(url);
  if (!rule) return;

  // Skip blocking if a valid exception exists for this rule
  if (hasActiveException(rule.id)) return;

  try {
    await chrome.tabs.update(tabId, { url: getBlockedUrl(url, rule) });
  } catch (error) {
    console.warn("URL Blocker failed to redirect blocked tab:", error);
  }
}

// --- declarativeNetRequest: request-layer fallback blocking ---

const EMBEDDED_RESOURCE_TYPES = ["sub_frame", "media", "object"];

function ruleToDNRCondition(rule) {
  switch (rule.type) {
    case "domain": {
      const host = rule.pattern.toLowerCase().trim().replace(/^www\./, "");
      return { requestDomains: [host, "www." + host], resourceTypes: EMBEDDED_RESOURCE_TYPES };
    }
    case "regex": {
      try { new RegExp(rule.pattern); } catch { return null; }
      return { regexFilter: rule.pattern, isUrlFilterCaseSensitive: false, resourceTypes: EMBEDDED_RESOURCE_TYPES };
    }
    case "keyword": {
      // Escape regex metacharacters for literal substring matching
      const escaped = escapeRegexLiteral(rule.pattern);
      return { regexFilter: escaped, isUrlFilterCaseSensitive: false, resourceTypes: EMBEDDED_RESOURCE_TYPES };
    }
    case "exact": {
      try {
        return { urlFilter: `|${new URL(rule.pattern).href}|`, resourceTypes: EMBEDDED_RESOURCE_TYPES };
      } catch { return null; }
    }
    default: return null;
  }
}

function ruleToDNRMainFrameCondition(rule) {
  switch (rule.type) {
    case "domain": {
      const host = rule.pattern.toLowerCase().trim().replace(/^www\./, "");
      if (!host) return null;
      return {
        regexFilter: `^https?://([^/?#]+\\.)?${escapeRegexLiteral(host)}(:[0-9]+)?([/?#].*)?$`,
        isUrlFilterCaseSensitive: false,
        resourceTypes: ["main_frame"]
      };
    }
    case "regex": {
      try { new RegExp(rule.pattern); } catch { return null; }
      return {
        regexFilter: rule.pattern,
        isUrlFilterCaseSensitive: false,
        resourceTypes: ["main_frame"]
      };
    }
    case "keyword": {
      if (!rule.pattern) return null;
      return {
        regexFilter: `^.*${escapeRegexLiteral(rule.pattern)}.*$`,
        isUrlFilterCaseSensitive: false,
        resourceTypes: ["main_frame"]
      };
    }
    case "exact": {
      try {
        return {
          regexFilter: `^${escapeRegexLiteral(new URL(rule.pattern).href)}$`,
          isUrlFilterCaseSensitive: true,
          resourceTypes: ["main_frame"]
        };
      } catch { return null; }
    }
    default: return null;
  }
}

function ruleToDNRMainFrameRedirect(rule, id) {
  const condition = ruleToDNRMainFrameCondition(rule);
  if (!condition) return null;

  const params = new URLSearchParams();
  params.set("source", "dnr");
  params.set("ruleId", rule.id);
  params.set("type", rule.type);
  params.set("pattern", rule.pattern);
  if (rule.label) params.set("label", rule.label);

  return {
    id,
    priority: 2,
    action: {
      type: "redirect",
      redirect: {
        regexSubstitution: `${BLOCKED_PAGE}?${params.toString()}#\\0`
      }
    },
    condition
  };
}

async function syncDNRRules() {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) return;
  const settings = cachedSettings || normalizeSettings(null);
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
      const mainFrameRule = ruleToDNRMainFrameRedirect(rule, dnrId);
      if (mainFrameRule) {
        newRules.push(mainFrameRule);
        dnrId++;
      }

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

// Intercept top-level navigations in the service worker; DNR also covers them
// as a request-layer fallback for app/external launch paths.
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0 || details.tabId < 0) return;

  enforceBlockedUrl(details.tabId, details.url);
});

// Re-check tab URLs that may have been created or activated by external apps.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) enforceBlockedUrl(tabId, changeInfo.url);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab?.url) return;
    enforceBlockedUrl(tabId, tab.url);
  });
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
chrome.runtime.onStartup.addListener(loadCacheAndSync);
chrome.runtime.onInstalled.addListener(async () => {
  await ensureCacheLoaded();
  // Set defaults if first install
  const data = await chrome.storage.local.get("settings");
  if (!data.settings) {
    await chrome.storage.local.set({ settings: getDefaultSettings(), rules: [], activeExceptions: {} });
    cachedSettings = normalizeSettings(null);
    cachedRules = [];
    cachedActiveExceptions = {};
  }
  await syncDNRRules();
});
