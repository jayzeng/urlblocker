# Chrome lockdown policies (macOS)

Per-user Chrome enterprise policies that protect the URL Blocker extension from
being disabled or removed by the kid, without affecting other accounts on the
Mac (i.e., the parent's Chrome and extension development stay untouched).

## What it does

Applied only to the target macOS account:

- Blocks `chrome://extensions` and `chrome://flags`
- Disables Incognito mode and Guest browsing (no extension-free windows)
- Disables creating new Chrome profiles (new profiles wouldn't have the extension)
- Disables DevTools

## Prerequisites

1. The kid has their own macOS account, and it is **Standard**, not Admin
   (System Settings → Users & Groups). A root-owned policy file means nothing
   if the kid can authenticate as admin.
2. The extension is installed in the kid's Chrome profile. Note: the kid's
   account cannot read `/Users/jay/...`, so either copy this repo to
   `/Users/Shared/urlblocker` and load it unpacked from there, or (better,
   step 3 below) publish to the Chrome Web Store.

## Install / verify / uninstall

```bash
sudo ./install.sh <kid-username>
```

Then, logged in as the kid: quit Chrome fully (Cmd+Q), relaunch, and check:

1. `chrome://policy` lists the policies with no errors ("Source: Platform,
   Scope: Current user, Status: OK"). If a policy shows as ignored, that's the
   signal this approach needs an MDM profile instead — tell Claude and we'll
   pivot.
2. `chrome://extensions` is blocked ("Blocked by your administrator")
3. File menu has no "New Incognito Window"

```bash
sudo ./uninstall.sh <kid-username>
```

## Known gap (until step 3)

With only these policies, the kid can still right-click the extension's
toolbar icon (or open the puzzle-piece menu) and choose **Remove from
Chrome**. Closing that hole requires the `ExtensionSettings` →
`force_installed` policy, which needs the extension published to the Chrome
Web Store (unlisted is fine) — see the commented block in
`com.google.Chrome.plist`. Force-installed extensions show no Remove or
Disable controls anywhere.

Also out of scope for Chrome policies: other browsers (Safari, Firefox).
Cover those with macOS Screen Time or DNS filtering if needed.
