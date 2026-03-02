# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Chrome extension (Manifest V3) that blocks navigation to URLs matching user-defined rules. Pure HTML/CSS/JS — no build step, no npm, no bundler. Load directly in Chrome via `chrome://extensions` → Developer Mode → Load unpacked → select this directory.

## Running tests

The matching logic has a standalone unit test file:

```
node test-matching.js
```

This runs outside the browser and validates the four rule types (exact, domain, regex, keyword).

## Architecture

### Data flow

All persistent state lives in `chrome.storage.local`. The background service worker holds in-memory caches (`cachedRules`, `cachedSettings`, `cachedActiveExceptions`) that mirror storage and are kept fresh via `storage.onChanged`.

Navigation is intercepted in `background.js` via `chrome.webNavigation.onBeforeNavigate`. When a URL matches a rule and has no active exception, the tab is redirected to `blocked/blocked.html?url=...&ruleId=...&type=...&pattern=...&label=...`.

### Storage schema

```
chrome.storage.local:
  rules[]              — array of rule objects { id, type, pattern, enabled, label, createdAt }
  settings             — { extensionEnabled, protection: {...}, exceptions: {...} }
  activeExceptions     — { [ruleId]: { expiresAt, grantedAt, duration } }  ← hot cache

IndexedDB "urlblocker", store "exceptions":
  full exception history records (id, url, domain, ruleId, grantedAt, duration, expiresAt, ...)
```

`background.js` never touches IndexedDB — only `chrome.storage` for the hot cache. IndexedDB is used only by `blocked/blocked.js` (write) and `dashboard/dashboard.js` (read/clear), via `shared/db.js`.

### Rule types

| Type | Match logic |
|---|---|
| `domain` | strips `www.`, matches hostname exactly or as suffix (`sub.example.com` matches `example.com`) |
| `exact` | normalized `URL.href` equality |
| `regex` | `new RegExp(pattern, "i").test(url)` |
| `keyword` | `url.toLowerCase().includes(pattern.toLowerCase())` |

### Challenge / protection system

Protection mode gates destructive actions (add/delete/disable rule, disable extension, turn off protection, change PIN, clear history). Challenge logic is **duplicated** across `popup/popup.js`, `options/options.js`, `blocked/blocked.js`, and `dashboard/dashboard.js` — there is no shared challenge module, by design (each page is a separate document). When modifying challenge behaviour, update all four.

Exception requests reuse the same `settings.protection` passcode/math config — there is no separate exception passcode.

### Exception flow

1. `blocked/blocked.js` shows duration picker → challenge → on pass: writes to IndexedDB + sends `GRANT_EXCEPTION` message to background
2. `background.js` stores `{ expiresAt, grantedAt, duration }` in `cachedActiveExceptions[ruleId]` and persists to storage
3. `content.js` runs on every page at `document_idle`, sends `GET_EXCEPTION_STATUS` to background, and if an active exception exists renders a Shadow DOM countdown pill (bottom-right corner)
4. Countdown pill escalates: gray at ≤60% remaining, amber at ≤30%, red pulsing at ≤1 min; redirects to blocked page at expiry
5. Exception key is `ruleId` (not URL) — covers the whole rule, not just one URL

### Pages

| Page | Entry point | Purpose |
|---|---|---|
| Popup | `popup/popup.html` | Quick block current URL/domain, toggle extension |
| Options | `options/options.html` | Manage rules, protection settings, exception settings |
| Blocked | `blocked/blocked.html` | Shown when a URL is blocked; exception request flow |
| Dashboard | `dashboard/dashboard.html` | Parent view: exception history, CSV export, clear |

### Shared utilities

- `shared/utils.js` — `sha256(str)` (Web Crypto), `generateMathProblem(difficulty)`
- `shared/db.js` — IndexedDB wrapper: `openDB`, `addException`, `getAllExceptions`, `clearExceptions`, `deleteException`

Both are loaded via `<script src>` tags, not ES modules, because they must work across both regular extension pages and the blocked page.
