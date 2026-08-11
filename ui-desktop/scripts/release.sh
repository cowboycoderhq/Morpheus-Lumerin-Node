#!/bin/bash
# release.sh — build a signed, notarized, stapled Morpheus desktop DMG.
#
# One command, and the result opens on a Mac that has never seen it: no
# "Apple cannot check it for malicious software", no right-click -> Open.
#
# Prerequisites (one-time):
#   - Developer ID Application cert + private key in the login keychain, plus
#     Apple's "Developer ID Certification Authority" intermediate.
#       security find-identity -v -p codesigning     # must list the identity
#   - Notary credentials stored as a keychain profile (default name: <NOTARY_PROFILE>):
#       xcrun notarytool store-credentials <NOTARY_PROFILE> \
#         --apple-id <id@example.com> --team-id <TEAMID>
#     (paste an app-specific password from appleid.apple.com when prompted)
#
# Usage:
#   scripts/release.sh                 # arm64 (this machine)
#   scripts/release.sh x64             # intel
#   NOTARY_PROFILE=Other scripts/release.sh
#
# WHY THE ORDER BELOW MATTERS: the .app is notarized and stapled BEFORE the DMG
# is built around it, then the DMG is notarized and stapled too. Notarizing only
# the DMG leaves the app without its own ticket, so it needs Apple's service
# online the first time someone drags it out — which is exactly the machine you
# are least sure about.
set -euo pipefail

cd "$(dirname "$0")/.."                       # ui-desktop/

ARCH="${1:-arm64}"
PROFILE="${NOTARY_PROFILE:-<NOTARY_PROFILE>}"
ID="Developer ID Application: <ORG> (<TEAMID>)"
CONFIG="electron.builder.config.ts"
VERSION=$(node -p "require('./package.json').version")
APP_DIR="dist/mac-$ARCH"
APP="$APP_DIR/MorpheusUI.app"
DMG="dist/mac-$ARCH-morpheus-app-$VERSION.dmg"

fail() { echo "✗ $*" >&2; exit 1; }

echo "▸ Preflight"

# A dev instance writes to the same out/ this build regenerates. Racing it
# produces a DMG built from half-written bundles, which is the kind of failure
# that shows up on the test machine rather than here.
pgrep -f "electron-vite.*dev" >/dev/null &&
  fail "a dev instance is running. Stop it first:  pkill -f 'electron-vite.*dev'"

security find-identity -v -p codesigning 2>/dev/null | grep -q "$ID" ||
  fail "signing identity not found in the keychain: $ID"

# Fail here rather than after a ten-minute build.
xcrun notarytool history --keychain-profile "$PROFILE" --limit 1 >/dev/null 2>&1 ||
  fail "notary profile '$PROFILE' is not set up. Create it with:
       xcrun notarytool store-credentials $PROFILE --apple-id <id> --team-id <TEAMID>"

# Apple rejects a notarization request whose bundle carries the debug
# get-task-allow entitlement. Cheaper to check than to discover from a rejection.
grep -q "get-task-allow" buildResources/entitlements.mac.plist &&
  fail "buildResources/entitlements.mac.plist contains get-task-allow — Apple will reject this"

echo "  identity, notary profile and entitlements all check out"
echo "  version $VERSION, arch $ARCH"

echo "▸ Typecheck and bundle"
npm run typecheck >/dev/null
npx electron-vite build >/dev/null

echo "▸ Packaging the .app (unpacked, so it can be notarized before the DMG)"
npx electron-builder --config "$CONFIG" --mac --"$ARCH" --dir >/dev/null
[ -d "$APP" ] || fail "expected $APP — electron-builder put it somewhere else"

codesign --verify --strict --deep "$APP" ||
  fail "the packaged app does not verify; notarization would fail"

echo "▸ Notarizing the app (Apple's service — this is the slow part)"
ZIP="dist/morpheus-notarize-$ARCH.zip"
rm -f "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"
xcrun notarytool submit "$ZIP" --keychain-profile "$PROFILE" --wait
xcrun stapler staple "$APP"
rm -f "$ZIP"

echo "▸ Building the DMG around the stapled app"
rm -f "$DMG"
npx electron-builder --config "$CONFIG" --mac dmg --"$ARCH" --prepackaged "$APP" >/dev/null
[ -f "$DMG" ] || fail "expected $DMG — check dist/ for what was produced"

codesign --force --timestamp --sign "$ID" "$DMG"

echo "▸ Notarizing the DMG"
xcrun notarytool submit "$DMG" --keychain-profile "$PROFILE" --wait
xcrun stapler staple "$DMG"

echo "▸ Verifying the way a fresh machine will"
xcrun stapler validate "$DMG" || fail "the DMG has no stapled ticket"
spctl -a -t open --context context:primary-signature -vv "$DMG" 2>&1 |
  grep -q "source=Notarized Developer ID" ||
  fail "Gatekeeper does not see this as notarized — do not ship it"
spctl -a -t exec -vv "$APP" 2>&1 | grep -q "source=Notarized Developer ID" ||
  fail "the app inside is signed but not notarized"

if cp "$DMG" "$HOME/Downloads/" 2>/dev/null; then
  echo "▸ Copied to ~/Downloads/$(basename "$DMG")"
fi

echo
echo "✅ Distributable: $DMG"
echo "   Notarized and stapled — it will open on a Mac that has never seen it."
echo
echo "   NOTE: the app downloads its own service binaries (proxy-router, IPFS,"
echo "   the AI runtime) on first run. Those are not in this bundle and are not"
echo "   covered by this notarization — watch the first launch on the test"
echo "   machine for a Gatekeeper prompt naming one of them."
