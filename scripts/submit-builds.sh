#!/bin/bash
# Run this script to check build status and submit to stores when ready.
# Usage: EXPO_TOKEN=<your-token> bash scripts/submit-builds.sh

ANDROID_BUILD_ID="4b4fdb95-4b99-499b-9d0a-6b7e3cb6aff5"
IOS_BUILD_ID="d360f0c8-8d8a-48ae-b019-842ba866d94a"

check_status() {
  EXPO_TOKEN=$EXPO_TOKEN npx eas-cli build:view "$1" --json 2>/dev/null | grep '"status"' | head -1 | tr -d ' ",' | cut -d: -f2
}

echo "Checking build status..."
ANDROID_STATUS=$(check_status $ANDROID_BUILD_ID)
IOS_STATUS=$(check_status $IOS_BUILD_ID)

echo "Android: $ANDROID_STATUS"
echo "iOS:     $IOS_STATUS"

if [ "$IOS_STATUS" = "FINISHED" ]; then
  echo ""
  echo "iOS build ready — submitting to App Store..."
  EXPO_TOKEN=$EXPO_TOKEN npx eas-cli submit --platform ios --id $IOS_BUILD_ID --profile production --non-interactive
else
  echo "iOS build not ready yet. Check at: https://expo.dev/accounts/alburhan786/projects/alburhan-travels-/builds/$IOS_BUILD_ID"
fi

if [ "$ANDROID_STATUS" = "FINISHED" ]; then
  echo ""
  if [ -f "google-play-key.json" ]; then
    echo "Android build ready — submitting to Play Store..."
    EXPO_TOKEN=$EXPO_TOKEN npx eas-cli submit --platform android --id $ANDROID_BUILD_ID --profile production --non-interactive
  else
    echo "Android build ready but google-play-key.json is missing."
    echo "Download it from: Google Play Console → Setup → API access → Service account → Download JSON key"
    echo "Save it as: google-play-key.json in the project root, then re-run this script."
  fi
else
  echo "Android build not ready yet. Check at: https://expo.dev/accounts/alburhan786/projects/alburhan-travels-/builds/$ANDROID_BUILD_ID"
fi
