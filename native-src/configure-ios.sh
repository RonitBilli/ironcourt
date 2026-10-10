#!/usr/bin/env bash
# Runs on the GitHub macOS runner after `npx cap add ios`. Sets the app name, alarm
# permission text, the infinity:// deep link and the icon on the generated Xcode project.
set -euo pipefail
PLIST="native/ios/App/App/Info.plist"
PB=/usr/libexec/PlistBuddy
set_str() { $PB -c "Set :$1 \"$2\"" "$PLIST" 2>/dev/null || $PB -c "Add :$1 string \"$2\"" "$PLIST"; }

set_str CFBundleDisplayName "Infinity"
set_str NSAlarmKitUsageDescription "Infinity sets your wake-up and gym alarms so they ring even on silent."
$PB -c "Delete :ITSAppUsesNonExemptEncryption" "$PLIST" 2>/dev/null || true
$PB -c "Add :ITSAppUsesNonExemptEncryption bool false" "$PLIST"

# infinity:// deep links (used by the Health shortcut)
$PB -c "Delete :CFBundleURLTypes" "$PLIST" 2>/dev/null || true
$PB -c "Add :CFBundleURLTypes array" "$PLIST"
$PB -c "Add :CFBundleURLTypes:0 dict" "$PLIST"
$PB -c "Add :CFBundleURLTypes:0:CFBundleURLName string com.ronitbilli.infinity" "$PLIST"
$PB -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$PLIST"
$PB -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string infinity" "$PLIST"

# App icon: Capacitor's template uses one 1024 px image; replace every png in the set.
ICONSET="native/ios/App/App/Assets.xcassets/AppIcon.appiconset"
for f in "$ICONSET"/*.png; do cp www/icons/icon-1024.png "$f"; done

echo "Info.plist now:"
$PB -c "Print" "$PLIST"
