#!/bin/bash
# Remove Chrome lockdown policies for a macOS user account.
# Usage: sudo ./uninstall.sh <kid-username>
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "This script must run as root. Usage: sudo ./uninstall.sh <kid-username>" >&2
  exit 1
fi

if [[ $# -ne 1 ]]; then
  echo "Usage: sudo ./uninstall.sh <kid-username>" >&2
  exit 1
fi

TARGET_USER="$1"
DEST="/Library/Managed Preferences/$TARGET_USER/com.google.Chrome.plist"

if [[ ! -f "$DEST" ]]; then
  echo "Nothing to remove: $DEST does not exist."
  exit 0
fi

rm "$DEST"
killall cfprefsd 2>/dev/null || true

echo "Removed $DEST"
echo "Quit and relaunch Chrome in that account; chrome://policy should now be empty."
