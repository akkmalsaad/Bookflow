BookFlow branding assets

The current user-selected source is `assets/images/bookflow-logo.png`. The generator reads this file without overwriting it. `assets/branding/bookflow-logo-master.png` preserves the originally supplied master; it is currently byte-identical to the selected source but no longer overrides it.

`app.config.js` imports `app.json`; branding configuration is maintained in `app.json`. The transparent UI/splash asset keeps its existing path and is byte-identical to the master, so all five existing UI consumers receive the new symbol without component changes. Wordmark typography, layouts, splash width (160), contain mode, background (#F5F7FB), and animation remain unchanged.

The iOS icon is a square 1024×1024 RGB PNG with no alpha channel, flattened onto #F5F7FB. It retains the supplied square composition and visual padding. Android foreground pixels fit inside the central 66/108 safe circle; the background uses the same #F5F7FB. The themed launcher and notification images use only the new symbol’s alpha silhouette, as required by those Android image formats. Notification configuration, including its asset path and tint, is unchanged.

Regenerate the exports with `node scripts/generate-branding.cjs`. Add `--native` to refresh only branding resources in the existing ignored native projects. The script uses the image tooling installed with Expo SDK 54. EAS/prebuild generates branding from app.json for fresh native projects.

Validation: TypeScript (`npx --no-install tsc --noEmit`), Expo lint (`npm run lint`), script lint (`npx --no-install eslint scripts/generate-branding.cjs`), configuration/reference audit, original-master SHA-256 equality, UI/master byte equality, iOS dimensions/RGB opacity, Android foreground safe-circle bounds, and unchanged application/component source checks. No native release build was run; verify the installed launcher and splash in a release build. Expo documents that development builds do not fully reproduce release splash behavior: https://docs.expo.dev/versions/v54.0.0/sdk/splash-screen/. Icon configuration reference: https://docs.expo.dev/versions/v54.0.0/config/app/.

No remaining runtime references to retired source icon filenames or deleted Android background bitmaps were found. Old notification branding was also replaced, without changing notification configuration. Bundle identifiers, Supabase, Clerk, RevenueCat, navigation, application functionality, and subscription logic were not changed. Existing unrelated working-tree edits were preserved.

Exact file inventory (paths relative to the repository; ios/ and android/ are ignored local generated projects; temporary Expo image caches are excluded):

- Moved: `assets/images/bookflow-logo-master.png` → `assets/branding/bookflow-logo-master.png`
- Removed: `assets/images/Bookflow Andoid Icon.png`
- Removed: `assets/images/Bookflow apps icon-fullbleed.png`
- Removed: `assets/images/Bookflow apps icon.png`
- Removed: `assets/images/android-icon-background.png`
- Removed: `assets/images/android-icon-foreground.png`
- Removed: `assets/images/android-icon-monochrome.png`
- Replaced/modified: `assets/images/bookflow-logo.png`
- Removed: `assets/images/favicon.png`
- Removed: `assets/images/icon.png`
- Replaced/modified: `assets/images/notification-icon.png`
- Removed: `assets/images/splash-icon.png`
- Replaced/modified: `ios/Bookflow/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png`
- Replaced/modified: `ios/Bookflow/Images.xcassets/SplashScreenLogo.imageset/image.png`
- Replaced/modified: `ios/Bookflow/Images.xcassets/SplashScreenLogo.imageset/image@2x.png`
- Replaced/modified: `ios/Bookflow/Images.xcassets/SplashScreenLogo.imageset/image@3x.png`
- Replaced/modified: `android/app/src/main/res/drawable-hdpi/notification_icon.png`
- Replaced/modified: `android/app/src/main/res/drawable-hdpi/splashscreen_logo.png`
- Replaced/modified: `android/app/src/main/res/drawable-mdpi/notification_icon.png`
- Replaced/modified: `android/app/src/main/res/drawable-mdpi/splashscreen_logo.png`
- Replaced/modified: `android/app/src/main/res/drawable-xhdpi/notification_icon.png`
- Replaced/modified: `android/app/src/main/res/drawable-xhdpi/splashscreen_logo.png`
- Replaced/modified: `android/app/src/main/res/drawable-xxhdpi/notification_icon.png`
- Replaced/modified: `android/app/src/main/res/drawable-xxhdpi/splashscreen_logo.png`
- Replaced/modified: `android/app/src/main/res/drawable-xxxhdpi/notification_icon.png`
- Replaced/modified: `android/app/src/main/res/drawable-xxxhdpi/splashscreen_logo.png`
- Replaced/modified: `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`
- Replaced/modified: `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml`
- Replaced/modified: `android/app/src/main/res/mipmap-hdpi/ic_launcher.webp`
- Removed: `android/app/src/main/res/mipmap-hdpi/ic_launcher_background.webp`
- Replaced/modified: `android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.webp`
- Replaced/modified: `android/app/src/main/res/mipmap-hdpi/ic_launcher_monochrome.webp`
- Replaced/modified: `android/app/src/main/res/mipmap-hdpi/ic_launcher_round.webp`
- Replaced/modified: `android/app/src/main/res/mipmap-mdpi/ic_launcher.webp`
- Removed: `android/app/src/main/res/mipmap-mdpi/ic_launcher_background.webp`
- Replaced/modified: `android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.webp`
- Replaced/modified: `android/app/src/main/res/mipmap-mdpi/ic_launcher_monochrome.webp`
- Replaced/modified: `android/app/src/main/res/mipmap-mdpi/ic_launcher_round.webp`
- Replaced/modified: `android/app/src/main/res/mipmap-xhdpi/ic_launcher.webp`
- Removed: `android/app/src/main/res/mipmap-xhdpi/ic_launcher_background.webp`
- Replaced/modified: `android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.webp`
- Replaced/modified: `android/app/src/main/res/mipmap-xhdpi/ic_launcher_monochrome.webp`
- Replaced/modified: `android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.webp`
- Replaced/modified: `android/app/src/main/res/mipmap-xxhdpi/ic_launcher.webp`
- Removed: `android/app/src/main/res/mipmap-xxhdpi/ic_launcher_background.webp`
- Replaced/modified: `android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.webp`
- Replaced/modified: `android/app/src/main/res/mipmap-xxhdpi/ic_launcher_monochrome.webp`
- Replaced/modified: `android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.webp`
- Replaced/modified: `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.webp`
- Removed: `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_background.webp`
- Replaced/modified: `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.webp`
- Replaced/modified: `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_monochrome.webp`
- Replaced/modified: `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.webp`
- Replaced/modified: `android/app/src/main/res/values/colors.xml`
- Replaced/modified: `app.json`
- Created: `assets/branding/bookflow-app-icon.png`
- Created: `assets/branding/bookflow-adaptive-foreground.png`
- Created: `assets/branding/bookflow-adaptive-monochrome.png`
- Created: `scripts/generate-branding.cjs`
- Created: `assets/branding/README.md`
