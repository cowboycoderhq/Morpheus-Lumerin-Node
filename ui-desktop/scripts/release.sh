#!/usr/bin/env bash
# release.sh — build a signed, notarized, stapled MorpheusUI DMG.
#
# One-command distribution build. Produces dist/mac-<arch>-morpheus-app-<ver>.dmg,
# ready to hand to anyone — it passes Gatekeeper on a clean Mac.
#
# Why this is more than "npm run build:mac": electron.builder.config.ts sets
# `notarize: false`, so that script emits a DMG that is SIGNED but NOT NOTARIZED —
# and `spctl` rejects it ("source=Unnotarized Developer ID") on any Mac that did
# not build it. Signed is not shippable. This script does the rest: notarize the
# .app, staple it, rebuild the DMG around the STAPLED app, then notarize and
# staple the DMG itself, and verify both.
#
# We notarize the app FIRST and pass it back with --prepackaged, because a DMG
# built from an un-stapled app leaves the extracted .app without its ticket: it
# only passes Gatekeeper while Apple is reachable. Stapling makes it verify
# offline, which is the whole point of shipping a file someone downloads once.
#
# The Morpheus-specific trap this guards: the packaged app DOWNLOADS proxy-router
# at first run from SERVICE_PROXY_DOWNLOAD_URL_* (see orchestrator.config.ts).
# Those vars default to '' — CI injects them (build.yml). Build without them and
# you get a DMG that installs, launches, and then sits there with no services,
# forever. The preflight below refuses to build in that state.
#
# Prerequisites (one-time):
#   - Developer ID Application cert + private key in the login keychain, and
#     Apple's "Developer ID Certification Authority" (G2) intermediate installed
#     (security find-identity -v -p codesigning  must list the identity).
#   - Notary credentials stored as a keychain profile named "<NOTARY_PROFILE>":
#       xcrun notarytool store-credentials <NOTARY_PROFILE> \
#         --apple-id <id@example.com> --team-id <TEAMID>
#     (paste an app-specific password from appleid.apple.com when prompted).
#   - .env carrying the five SERVICE_PROXY_DOWNLOAD_URL_* entries.
#
# Usage:  scripts/release.sh              # arm64 (this Mac)
#         ARCH=x64 scripts/release.sh     # Intel
set -euo pipefail

cd "$(dirname "$0")/.."                 # ui-desktop/
ID="Developer ID Application: <ORG> (<TEAMID>)"
TEAM="<TEAMID>"
PROFILE="<NOTARY_PROFILE>"                       # notary keychain-profile alias (local, not shipped)
ARCH="${ARCH:-arm64}"

# electron-builder does NOT name the output dir after the arch: arm64 lands in
# dist/mac-arm64/, but x64 lands in plain dist/mac/ (x64 is its "default", so it
# gets no suffix). Assuming dist/mac-$ARCH/ works for arm64 and fails for Intel
# with "No such file or directory".
case "$ARCH" in
  arm64) APP="dist/mac-arm64/MorpheusUI.app"; WANT_ARCH="arm64"  ;;
  x64)   APP="dist/mac/MorpheusUI.app";       WANT_ARCH="x86_64" ;;
  *)     echo "✗ ARCH must be arm64 or x64 (got '$ARCH')"; exit 1 ;;
esac

VERSION=$(node -p "require('./package.json').version")

echo "▸ Preflight…"

# The signing identity must exist, or electron-builder silently ships an ad-hoc
# signature and the notary rejects it minutes later.
security find-identity -v -p codesigning | grep -qF "$TEAM" \
  || { echo "✗ Developer ID for team $TEAM not in the keychain. See the header."; exit 1; }

# The notary profile must exist, or we discover it AFTER a 10-minute build.
xcrun notarytool history --keychain-profile "$PROFILE" >/dev/null 2>&1 \
  || { echo "✗ Notary keychain-profile '$PROFILE' not found. See the header."; exit 1; }

# The services URLs — the trap described above. An app that cannot fetch its
# proxy-router is not a distributable app, it is a very polished error screen.
MISSING=()
for v in SERVICE_PROXY_DOWNLOAD_URL_MAC_ARM64 SERVICE_PROXY_DOWNLOAD_URL_MAC_X64 \
         SERVICE_PROXY_DOWNLOAD_URL_LINUX_X64 SERVICE_PROXY_DOWNLOAD_URL_LINUX_ARM64 \
         SERVICE_PROXY_DOWNLOAD_URL_WINDOWS_X64; do
  grep -qE "^$v=." .env 2>/dev/null || MISSING+=("$v")
done
if [ ${#MISSING[@]} -gt 0 ]; then
  echo "✗ .env is missing ${#MISSING[@]} service URL(s):"
  printf '    %s\n' "${MISSING[@]}"
  echo "  The packaged app downloads proxy-router from these at first run. Without"
  echo "  them it installs, launches, and never starts a service. Point them at a"
  echo "  published router release, e.g."
  echo "    SERVICE_PROXY_DOWNLOAD_URL_MAC_ARM64=https://github.com/MorpheusAIs/Morpheus-Lumerin-Node/releases/download/v7.5.0/mac-arm64-morpheus-router-7.5.0"
  exit 1
fi

# Reachability: a typo'd URL is a 404 the user only meets on first launch.
# (Plain mapping, not ${ARCH^^} — macOS ships bash 3.2, which has no case
# expansion, and this script runs under /usr/bin/env bash.)
if [ "$ARCH" = "arm64" ]; then URL_VAR=SERVICE_PROXY_DOWNLOAD_URL_MAC_ARM64
else                           URL_VAR=SERVICE_PROXY_DOWNLOAD_URL_MAC_X64
fi
URL=$(grep -E "^$URL_VAR=" .env | cut -d= -f2-)
CODE=$(curl -s -o /dev/null -w "%{http_code}" -L "$URL")
[ "$CODE" = "200" ] \
  || { echo "✗ Router asset is not reachable (HTTP $CODE): $URL"; exit 1; }
echo "  Developer ID ✓   notary profile ✓   router asset ✓ (HTTP 200)"

echo "▸ Version $VERSION ($ARCH)"

# 1. Package the .app only (--dir). electron-builder signs it with the Developer
#    ID it finds in the keychain; we notarize it ourselves below.
echo "▸ Building and signing the app…"
npx electron-vite build >/dev/null
npx electron-builder --config electron.builder.config.ts --mac --"$ARCH" --dir >/dev/null
[ -d "$APP" ] || { echo "✗ Expected $APP — electron-builder produced:"; ls -d dist/mac*/; exit 1; }

# Guard the mapping above: notarizing the wrong bundle would ship an arm64 app as
# the Intel build, and nothing downstream would notice.
GOT_ARCH=$(lipo -archs "$APP/Contents/MacOS/MorpheusUI")
[ "$GOT_ARCH" = "$WANT_ARCH" ] \
  || { echo "✗ $APP is $GOT_ARCH, expected $WANT_ARCH"; exit 1; }
echo "  $APP  [$GOT_ARCH]"

codesign --verify --strict "$APP"

# 2. Notarize the .app and staple, so the EXTRACTED app verifies offline.
echo "▸ Notarizing the app…"
ZIP="dist/MorpheusUI-notarize.zip"
rm -f "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"
xcrun notarytool submit "$ZIP" --keychain-profile "$PROFILE" --wait
xcrun stapler staple "$APP"
spctl -a -t exec -vv "$APP"

# 3. Build the DMG around the STAPLED app. --prepackaged is what keeps the ticket:
#    a normal `--mac` run would re-package from source and drop it.
echo "▸ Building the DMG around the stapled app…"
npx electron-builder --config electron.builder.config.ts --mac --"$ARCH" \
  --prepackaged "$APP" >/dev/null
DMG="dist/mac-$ARCH-morpheus-app-$VERSION.dmg"
[ -f "$DMG" ] || { echo "✗ Expected $DMG — electron-builder produced something else:"; ls dist/*.dmg; exit 1; }
codesign --force --timestamp --sign "$ID" "$DMG"

# 4. Notarize the DMG too, so the download itself passes Gatekeeper, + staple.
echo "▸ Notarizing the DMG…"
xcrun notarytool submit "$DMG" --keychain-profile "$PROFILE" --wait
xcrun stapler staple "$DMG"

echo "▸ Final verification…"
spctl -a -t open --context context:primary-signature -vv "$DMG"
xcrun stapler validate "$DMG"
rm -f "$ZIP"

# Drop a copy in ~/Downloads for easy hand-off (non-fatal if it fails).
if cp "$DMG" "$HOME/Downloads/" 2>/dev/null; then
  echo "▸ Copied to ~/Downloads/$(basename "$DMG")"
else
  echo "▸ (could not copy to ~/Downloads — leaving it in dist/)"
fi

echo
echo "✅ Distributable: $DMG"
