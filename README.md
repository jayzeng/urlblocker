# URL Blocker

A Chrome extension for blocking websites by URL, domain, regex, or keyword — with parental controls, a challenge system to prevent easy bypassing, and a temporary exception flow so children can request supervised access.

---

## Installation

1. Open `chrome://extensions`
2. Enable **Developer Mode** (top right)
3. Click **Load unpacked** and select this directory

No build step required.

## Install From Release (ZIP)

1. Download the latest release ZIP from GitHub Releases.
2. Unzip it to a folder.
3. Open `chrome://extensions`
4. Enable **Developer Mode** (top right)
5. Click **Load unpacked** and select the unzipped folder.

---

## Features

### Blocking rules
Four matching modes:
- **Domain** — blocks a domain and all subdomains (e.g. `youtube.com` also blocks `m.youtube.com`)
- **Exact URL** — blocks one specific URL
- **Regex** — e.g. `(?:youtube|vimeo)\.com`
- **Keyword** — blocks any URL containing the text

Rules are managed in the Options page and can be toggled on/off individually.

### Protection mode
Prevents children from modifying the extension without a parent's passcode or by solving a math problem. Protected actions: adding/deleting/disabling rules, disabling the extension, turning off protection, changing the PIN.

Enabling a rule does **not** require a challenge.

### Exception requests
When a blocked page is reached, children can request temporary access for a parent-approved duration (5 min, 15 min, 30 min, 1 hour, 2 hours). The parent enters their passcode or solves the math challenge to grant it.

Once granted, a countdown timer appears in the bottom-right corner of the page, escalating from a subtle pill to an urgent red alert as time runs out, then automatically re-blocks the page.

### Exception history dashboard
Parents can review all granted exceptions — domain, duration, timestamp, and current status — filter by domain or date, export to CSV, and clear the log.

---

## Usage

**Popup** (click the extension icon): quickly block the current URL or domain, or toggle the extension on/off.

**Options** (`⚙` in the popup, or `chrome://extensions` → Details → Extension options):
- Add and manage block rules
- Enable Protection Mode and set a passcode or math challenge
- Enable Exception Requests and choose which durations to offer
- Open the Exception History dashboard

---

## Development

Run the URL matching unit tests (no browser needed):

```
node test-matching.js
```

After any code change, go to `chrome://extensions` and click the reload button on the extension card. No build step is needed.
