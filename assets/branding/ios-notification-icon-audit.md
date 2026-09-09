BookFlow native notification icon audit — 2026-09-09

The user-confirmed source is `assets/images/bookflow-logo.png`. `scripts/generate-branding.cjs` now reads that file directly and no longer overwrites it from the archived master. Its opaque production iOS export is `assets/branding/bookflow-app-icon.png`. Both `expo.icon` and `expo.ios.icon` in `app.json` select it, and `app.config.js` forwards those settings unchanged. The resolved Expo configuration selects the same file. The supplied artwork is a green-and-gold origami bird; it has not been altered in this audit.

The native catalog `ios/Bookflow/Images.xcassets/AppIcon.appiconset/Contents.json` contains one universal 1024×1024 iOS icon, `App-Icon-1024x1024@1x.png`. Its SHA-256 is identical to the production source:

`fe15486addb572344eb9a163616e84f76b650cc74555bf1f95746aa53239547f`

The icon is RGB without transparency. Both Debug and Release select `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon`, and the catalog is included in the application's Resources build phase. There are no alternate app icons, extra AppIcon catalogs, or notification service/content extension targets. No old icon remains in the project's native iOS catalog. The catalog was regenerated from the configured production asset and checked again for byte equality; its contents were already correct, so regeneration made no net file changes.

Read-only inspection of existing device and simulator build products under `~/Library/Developer/Xcode/DerivedData/Bookflow-hjtydquvmulmuabjbiikknlsvxhx/Build/Products/` also confirmed that their `Bookflow.app/AppIcon60x60@2x.png` files show the new artwork. The device icon was decoded to a temporary PNG for inspection; the compiled bundle was not modified. Its compiled Info.plist selects `CFBundlePrimaryIcon.CFBundleIconName = AppIcon`. A subsequent clean native rebuild was performed using `npx --no-install expo run:ios --device --no-build-cache --no-install --no-bundler`, selecting Akkmal iphone. The Bookflow Debug device build succeeded with zero errors and one existing SDWebImage deployment-target warning. The new build log explicitly compiles `ios/Bookflow/Images.xcassets` with `--app-icon AppIcon` into `Debug-iphoneos/Bookflow.app`. Its compiled Info.plist selects AppIcon, Assets.car contains the 1024×1024 phone AppIcon, and the newly built AppIcon60x60@2x.png was decoded and visually checked against the selected source. Installation status is recorded below.

iOS displays the application's icon in its notification header. No separate iOS notification icon was added. See [Apple's notification guidance](https://developer.apple.com/design/human-interface-guidelines/notifications/).

The `expo-notifications.icon` setting is Android-only. It correctly selects `assets/images/notification-icon.png`, a 96×96 white silhouette derived from the current master. Its pixels and all five native Android notification density variants were verified against that master. Android launcher assets and all notification configuration remain unchanged. See [Expo SDK 54 notification configuration](https://docs.expo.dev/versions/v54.0.0/sdk/notifications/#configurable-properties).

Repository-wide search found retired icon filenames only in the historical removal inventory in `assets/branding/README.md` and an old generated web bundle, `dist/_expo/static/js/web/entry-1fd3dfc23787994fa78dd2db8c2aa8af.js`. That web bundle is not an input to the iOS application target and was left untouched because this task concerns native app/notification icons. Regenerate the web export before using that old output for a web deployment. No active source configuration references retired icon files.

Removed 60 obsolete Expo icon cache files whose source-image hashes no longer match any current asset. These are regenerable files under `.expo/web/cache/production/images/`, not native build inputs. Current icon cache entries were retained. The exact removed files are listed below.

Changes in this follow-up:

- Updated this audit report and `assets/branding/README.md` with the confirmed source and native-build evidence.
- Modified `scripts/generate-branding.cjs` to read the user-selected `assets/images/bookflow-logo.png` directly.
- Removed the 60 obsolete icon cache files listed below.
- Refreshed the native AppIcon catalog with no net content changes.
- No changes to the supplied master, production icon, app.json, app.config.js, Xcode build settings, Android icons, notification logic/configuration, UI, identifiers, or service integrations.

To change the icon on a phone running an older binary, rebuild and install the native iOS app from this checkout. A JavaScript reload or OTA update cannot replace the installed native icon. Use a clean Xcode build if the regular build retains old asset output, then install the new app and inspect a newly delivered notification. Existing local build products already contain the new artwork; installing the appropriate current binary may be sufficient. The icon on the user's installed app cannot be verified from the repository alone. The clean native rebuild described above has now been completed.

Removed cache files:

- `.expo/web/cache/production/images/iconsuniversal-icon/iconsuniversal-icon-119462bb78eb240a65c869fc067ee599639b3cb5a41953f25c07b17d2a8c7e0f-cover-#ffffff/App-Icon-1024x1024@1x.png`
- `.expo/web/cache/production/images/iconsuniversal-icon/iconsuniversal-icon-6b9a735796d617146f0eeb667bb528696754c032b2fff10a6ac96791559d9f5a-cover-#ffffff/App-Icon-1024x1024@1x.png`
- `.expo/web/cache/production/images/iconsuniversal-icon/iconsuniversal-icon-c9f4e52c77fd2dfb5115d5b47ce637fe2df1c0412c53033e98d4b4a002752817-cover-#ffffff/App-Icon-1024x1024@1x.png`
- `.expo/web/cache/production/images/android-notification/android-notification-ad834f0b361e0e542bef3af2260f8f484ebec49ae2290b40b5068bdaac14cd28-cover-transparent/icon_24.png`
- `.expo/web/cache/production/images/android-notification/android-notification-ad834f0b361e0e542bef3af2260f8f484ebec49ae2290b40b5068bdaac14cd28-cover-transparent/icon_36.png`
- `.expo/web/cache/production/images/android-notification/android-notification-ad834f0b361e0e542bef3af2260f8f484ebec49ae2290b40b5068bdaac14cd28-cover-transparent/icon_48.png`
- `.expo/web/cache/production/images/android-notification/android-notification-ad834f0b361e0e542bef3af2260f8f484ebec49ae2290b40b5068bdaac14cd28-cover-transparent/icon_72.png`
- `.expo/web/cache/production/images/android-notification/android-notification-ad834f0b361e0e542bef3af2260f8f484ebec49ae2290b40b5068bdaac14cd28-cover-transparent/icon_96.png`
- `.expo/web/cache/production/images/android-adaptive-background/android-adaptive-background-fb139c2dee362ebf2070e23b96da6fc0d43f8492de38b8af1fd7223e19b5861d-cover-transparent/icon_108.png`
- `.expo/web/cache/production/images/android-adaptive-background/android-adaptive-background-fb139c2dee362ebf2070e23b96da6fc0d43f8492de38b8af1fd7223e19b5861d-cover-transparent/icon_162.png`
- `.expo/web/cache/production/images/android-adaptive-background/android-adaptive-background-fb139c2dee362ebf2070e23b96da6fc0d43f8492de38b8af1fd7223e19b5861d-cover-transparent/icon_216.png`
- `.expo/web/cache/production/images/android-adaptive-background/android-adaptive-background-fb139c2dee362ebf2070e23b96da6fc0d43f8492de38b8af1fd7223e19b5861d-cover-transparent/icon_324.png`
- `.expo/web/cache/production/images/android-adaptive-background/android-adaptive-background-fb139c2dee362ebf2070e23b96da6fc0d43f8492de38b8af1fd7223e19b5861d-cover-transparent/icon_432.png`
- `.expo/web/cache/production/images/android-adaptive-foreground/android-adaptive-foreground-38295ab2142ae861072b1eba4000add1b41efc1c1c5ba45de49a91c40f200e3f-cover-transparent/icon_108.png`
- `.expo/web/cache/production/images/android-adaptive-foreground/android-adaptive-foreground-38295ab2142ae861072b1eba4000add1b41efc1c1c5ba45de49a91c40f200e3f-cover-transparent/icon_162.png`
- `.expo/web/cache/production/images/android-adaptive-foreground/android-adaptive-foreground-38295ab2142ae861072b1eba4000add1b41efc1c1c5ba45de49a91c40f200e3f-cover-transparent/icon_216.png`
- `.expo/web/cache/production/images/android-adaptive-foreground/android-adaptive-foreground-38295ab2142ae861072b1eba4000add1b41efc1c1c5ba45de49a91c40f200e3f-cover-transparent/icon_324.png`
- `.expo/web/cache/production/images/android-adaptive-foreground/android-adaptive-foreground-38295ab2142ae861072b1eba4000add1b41efc1c1c5ba45de49a91c40f200e3f-cover-transparent/icon_432.png`
- `.expo/web/cache/production/images/android-adaptive-foreground/android-adaptive-foreground-c9f4e52c77fd2dfb5115d5b47ce637fe2df1c0412c53033e98d4b4a002752817-cover-transparent/icon_108.png`
- `.expo/web/cache/production/images/android-adaptive-foreground/android-adaptive-foreground-c9f4e52c77fd2dfb5115d5b47ce637fe2df1c0412c53033e98d4b4a002752817-cover-transparent/icon_162.png`
- `.expo/web/cache/production/images/android-adaptive-foreground/android-adaptive-foreground-c9f4e52c77fd2dfb5115d5b47ce637fe2df1c0412c53033e98d4b4a002752817-cover-transparent/icon_216.png`
- `.expo/web/cache/production/images/android-adaptive-foreground/android-adaptive-foreground-c9f4e52c77fd2dfb5115d5b47ce637fe2df1c0412c53033e98d4b4a002752817-cover-transparent/icon_324.png`
- `.expo/web/cache/production/images/android-adaptive-foreground/android-adaptive-foreground-c9f4e52c77fd2dfb5115d5b47ce637fe2df1c0412c53033e98d4b4a002752817-cover-transparent/icon_432.png`
- `.expo/web/cache/production/images/android-adaptive-monochrome/android-adaptive-monochrome-6371fc2c12e33ad2215a86c281db3d682a81bebe7c957a842c13b8bf00cceb83-cover-transparent/icon_108.png`
- `.expo/web/cache/production/images/android-adaptive-monochrome/android-adaptive-monochrome-6371fc2c12e33ad2215a86c281db3d682a81bebe7c957a842c13b8bf00cceb83-cover-transparent/icon_162.png`
- `.expo/web/cache/production/images/android-adaptive-monochrome/android-adaptive-monochrome-6371fc2c12e33ad2215a86c281db3d682a81bebe7c957a842c13b8bf00cceb83-cover-transparent/icon_216.png`
- `.expo/web/cache/production/images/android-adaptive-monochrome/android-adaptive-monochrome-6371fc2c12e33ad2215a86c281db3d682a81bebe7c957a842c13b8bf00cceb83-cover-transparent/icon_324.png`
- `.expo/web/cache/production/images/android-adaptive-monochrome/android-adaptive-monochrome-6371fc2c12e33ad2215a86c281db3d682a81bebe7c957a842c13b8bf00cceb83-cover-transparent/icon_432.png`
- `.expo/web/cache/production/images/android-standard-square/android-standard-square-38295ab2142ae861072b1eba4000add1b41efc1c1c5ba45de49a91c40f200e3f-cover-transparent/icon_144.png`
- `.expo/web/cache/production/images/android-standard-square/android-standard-square-38295ab2142ae861072b1eba4000add1b41efc1c1c5ba45de49a91c40f200e3f-cover-transparent/icon_192.png`
- `.expo/web/cache/production/images/android-standard-square/android-standard-square-38295ab2142ae861072b1eba4000add1b41efc1c1c5ba45de49a91c40f200e3f-cover-transparent/icon_48.png`
- `.expo/web/cache/production/images/android-standard-square/android-standard-square-38295ab2142ae861072b1eba4000add1b41efc1c1c5ba45de49a91c40f200e3f-cover-transparent/icon_72.png`
- `.expo/web/cache/production/images/android-standard-square/android-standard-square-38295ab2142ae861072b1eba4000add1b41efc1c1c5ba45de49a91c40f200e3f-cover-transparent/icon_96.png`
- `.expo/web/cache/production/images/android-standard-square/android-standard-square-c9f4e52c77fd2dfb5115d5b47ce637fe2df1c0412c53033e98d4b4a002752817-cover-transparent/icon_144.png`
- `.expo/web/cache/production/images/android-standard-square/android-standard-square-c9f4e52c77fd2dfb5115d5b47ce637fe2df1c0412c53033e98d4b4a002752817-cover-transparent/icon_192.png`
- `.expo/web/cache/production/images/android-standard-square/android-standard-square-c9f4e52c77fd2dfb5115d5b47ce637fe2df1c0412c53033e98d4b4a002752817-cover-transparent/icon_48.png`
- `.expo/web/cache/production/images/android-standard-square/android-standard-square-c9f4e52c77fd2dfb5115d5b47ce637fe2df1c0412c53033e98d4b4a002752817-cover-transparent/icon_72.png`
- `.expo/web/cache/production/images/android-standard-square/android-standard-square-c9f4e52c77fd2dfb5115d5b47ce637fe2df1c0412c53033e98d4b4a002752817-cover-transparent/icon_96.png`
- `.expo/web/cache/production/images/android-standard-square-background/android-standard-square-background-fb139c2dee362ebf2070e23b96da6fc0d43f8492de38b8af1fd7223e19b5861d-cover-transparent/icon_144.png`
- `.expo/web/cache/production/images/android-standard-square-background/android-standard-square-background-fb139c2dee362ebf2070e23b96da6fc0d43f8492de38b8af1fd7223e19b5861d-cover-transparent/icon_192.png`
- `.expo/web/cache/production/images/android-standard-square-background/android-standard-square-background-fb139c2dee362ebf2070e23b96da6fc0d43f8492de38b8af1fd7223e19b5861d-cover-transparent/icon_48.png`
- `.expo/web/cache/production/images/android-standard-square-background/android-standard-square-background-fb139c2dee362ebf2070e23b96da6fc0d43f8492de38b8af1fd7223e19b5861d-cover-transparent/icon_72.png`
- `.expo/web/cache/production/images/android-standard-square-background/android-standard-square-background-fb139c2dee362ebf2070e23b96da6fc0d43f8492de38b8af1fd7223e19b5861d-cover-transparent/icon_96.png`
- `.expo/web/cache/production/images/android-standard-circle/android-standard-circle-38295ab2142ae861072b1eba4000add1b41efc1c1c5ba45de49a91c40f200e3f-cover-transparent/icon_144.png`
- `.expo/web/cache/production/images/android-standard-circle/android-standard-circle-38295ab2142ae861072b1eba4000add1b41efc1c1c5ba45de49a91c40f200e3f-cover-transparent/icon_192.png`
- `.expo/web/cache/production/images/android-standard-circle/android-standard-circle-38295ab2142ae861072b1eba4000add1b41efc1c1c5ba45de49a91c40f200e3f-cover-transparent/icon_48.png`
- `.expo/web/cache/production/images/android-standard-circle/android-standard-circle-38295ab2142ae861072b1eba4000add1b41efc1c1c5ba45de49a91c40f200e3f-cover-transparent/icon_72.png`
- `.expo/web/cache/production/images/android-standard-circle/android-standard-circle-38295ab2142ae861072b1eba4000add1b41efc1c1c5ba45de49a91c40f200e3f-cover-transparent/icon_96.png`
- `.expo/web/cache/production/images/android-standard-circle/android-standard-circle-c9f4e52c77fd2dfb5115d5b47ce637fe2df1c0412c53033e98d4b4a002752817-cover-transparent/icon_144.png`
- `.expo/web/cache/production/images/android-standard-circle/android-standard-circle-c9f4e52c77fd2dfb5115d5b47ce637fe2df1c0412c53033e98d4b4a002752817-cover-transparent/icon_192.png`
- `.expo/web/cache/production/images/android-standard-circle/android-standard-circle-c9f4e52c77fd2dfb5115d5b47ce637fe2df1c0412c53033e98d4b4a002752817-cover-transparent/icon_48.png`
- `.expo/web/cache/production/images/android-standard-circle/android-standard-circle-c9f4e52c77fd2dfb5115d5b47ce637fe2df1c0412c53033e98d4b4a002752817-cover-transparent/icon_72.png`
- `.expo/web/cache/production/images/android-standard-circle/android-standard-circle-c9f4e52c77fd2dfb5115d5b47ce637fe2df1c0412c53033e98d4b4a002752817-cover-transparent/icon_96.png`
- `.expo/web/cache/production/images/android-standard-round-background/android-standard-round-background-fb139c2dee362ebf2070e23b96da6fc0d43f8492de38b8af1fd7223e19b5861d-cover-transparent/icon_144.png`
- `.expo/web/cache/production/images/android-standard-round-background/android-standard-round-background-fb139c2dee362ebf2070e23b96da6fc0d43f8492de38b8af1fd7223e19b5861d-cover-transparent/icon_192.png`
- `.expo/web/cache/production/images/android-standard-round-background/android-standard-round-background-fb139c2dee362ebf2070e23b96da6fc0d43f8492de38b8af1fd7223e19b5861d-cover-transparent/icon_48.png`
- `.expo/web/cache/production/images/android-standard-round-background/android-standard-round-background-fb139c2dee362ebf2070e23b96da6fc0d43f8492de38b8af1fd7223e19b5861d-cover-transparent/icon_72.png`
- `.expo/web/cache/production/images/android-standard-round-background/android-standard-round-background-fb139c2dee362ebf2070e23b96da6fc0d43f8492de38b8af1fd7223e19b5861d-cover-transparent/icon_96.png`
- `.expo/web/cache/production/images/favicon/favicon-a4e030697a7571b3e95d31860e4da55d2f98e5e861e2b55e414f45a8556828ba-contain-transparent/favicon-48.png`
- `.expo/web/cache/production/images/favicon/favicon-c9f4e52c77fd2dfb5115d5b47ce637fe2df1c0412c53033e98d4b4a002752817-contain-transparent/favicon-48.png`
