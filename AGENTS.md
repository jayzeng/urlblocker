# Repository Guidelines

## Project Structure & Module Organization
- `background.js`: Service worker that enforces blocking rules and handles messaging.
- `content.js`: Injected overlay for exception countdowns on blocked sites.
- `manifest.json`: Chrome extension manifest (MV3).
- `options/`, `popup/`, `dashboard/`, `blocked/`: Extension UI pages (HTML/CSS/JS).
- `shared/`: Shared helpers such as `shared/utils.js` and storage helpers in `shared/db.js`.
- `icons/`: Extension icons (generated).
- `make-icons.js`: Node script to generate icons.
- `test-matching.js`: Standalone script to sanity-check URL rule matching.

## Build, Test, and Development Commands
- `node make-icons.js`: Regenerate `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`.
- `node test-matching.js`: Run rule-matching checks (prints pass/fail to stdout).
- Local run: Load the repository root as an unpacked Chrome extension (Developer Mode → “Load unpacked”).

## Coding Style & Naming Conventions
- JavaScript uses 2-space indentation, semicolons, and double quotes.
- Prefer `camelCase` for variables/functions and descriptive constants (e.g., `DEFAULT_SETTINGS`).
- Keep module responsibilities clear: UI logic stays in page folders; shared utilities live in `shared/`.
- No formatter or linter is currently configured; keep edits consistent with nearby code.

## Testing Guidelines
- No automated test framework is configured.
- Use `node test-matching.js` for quick regression checks of URL rule logic.
- If adding new rule types or parsing logic, add cases to `test-matching.js` following the existing array format.

## Commit & Pull Request Guidelines
- This repository has no Git commit history yet, so there are no established commit message conventions.
- Suggested approach: short, imperative commit subjects (e.g., “Add rule exception timer”).
- PRs should include:
  - A brief summary of behavior changes.
  - Screenshots or screen recordings for UI changes in `popup/`, `options/`, `dashboard/`, or `blocked/`.
  - Any manual test steps (e.g., “Loaded unpacked and verified blocking rule with regex”).

## Security & Configuration Tips
- Blocking rules and settings persist in `chrome.storage.local`; avoid storing secrets in plain text.
- If adding new permissions, update `manifest.json` and justify them in the PR description.
