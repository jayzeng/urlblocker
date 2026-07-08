#!/bin/bash
# Install Chrome lockdown policies for ONE macOS user account (the kid's).
# Usage: sudo ./install.sh <kid-username>
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "This script must run as root. Usage: sudo ./install.sh <kid-username>" >&2
  exit 1
fi

if [[ $# -ne 1 ]]; then
  echo "Usage: sudo ./install.sh <kid-username>" >&2
  echo "Existing local users:" >&2
  dscl . -list /Users | grep -v '^_' >&2
  exit 1
fi

TARGET_USER="$1"

if ! id -u "$TARGET_USER" >/dev/null 2>&1; then
  echo "Error: user '$TARGET_USER' does not exist on this Mac." >&2
  exit 1
fi

if dsmemberutil checkmembership -U "$TARGET_USER" -G admin | grep -q "is a member"; then
  echo "WARNING: '$TARGET_USER' is an ADMIN account. They can remove these" >&2
  echo "policies themselves. Make the account Standard in System Settings" >&2
  echo "-> Users & Groups before relying on this." >&2
fi

SRC="$(cd "$(dirname "$0")" && pwd)/com.google.Chrome.plist"
DEST_DIR="/Library/Managed Preferences/$TARGET_USER"
DEST="$DEST_DIR/com.google.Chrome.plist"

plutil -lint "$SRC" >/dev/null

mkdir -p "$DEST_DIR"
chown root:wheel "/Library/Managed Preferences" "$DEST_DIR"
chmod 755 "/Library/Managed Preferences" "$DEST_DIR"

cp "$SRC" "$DEST"
chown root:wheel "$DEST"
chmod 644 "$DEST"

# Flush the preferences daemon cache so the policies are picked up
killall cfprefsd 2>/dev/null || true

echo "Installed policies for user '$TARGET_USER' at:"
echo "  $DEST"
echo
echo "Next steps:"
echo "  1. Log in as $TARGET_USER"
echo "  2. Quit Chrome completely (Cmd+Q), relaunch it"
echo "  3. Open chrome://policy and confirm the policies are listed with no errors"
echo "  4. Try opening chrome://extensions - it should be blocked"
echo "  5. Confirm 'New Incognito Window' is gone from the File menu"
