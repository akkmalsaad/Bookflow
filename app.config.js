/**
 * Variant-driven Expo config.
 *
 * `app.json` stays the single source of truth for everything the two builds share; this file only
 * overrides the handful of values that must differ between the development app and the App Store
 * app. Nothing here needs editing before a build — the variant is selected by an environment
 * variable, which EAS sets per build profile in `eas.json`.
 *
 *   development  my.bookflow.app.dev   dev client, free Personal Team signing
 *   preview      my.bookflow.app       release build, internal distribution
 *   production   my.bookflow.app       release build, TestFlight / App Store
 *
 * A bare `expo start` or `expo run:ios` sets no variable at all, so local development falls back
 * to `development` and keeps behaving exactly as it did before.
 */

const DEFAULT_VARIANT = 'development';

/**
 * Registered first in `app.json` because entitlement mods run in reverse registration order, so
 * this one has to execute last. It deletes the push and Apple Sign In entitlements, which a free
 * Apple Personal Team is not allowed to sign. A paid-team build must keep them, so the plugin is
 * dropped from every variant except development.
 */
const PERSONAL_TEAM_PLUGIN = './plugins/withPersonalTeamSigning';

const VARIANTS = {
  development: {
    bundleIdentifier: 'my.bookflow.app.dev',
    // `bookflow` stays first, so every deep link that already resolves today keeps resolving.
    // The second scheme is what disambiguates once the dev app and the store app are both
    // installed — iOS picks an arbitrary winner when two apps claim the same scheme.
    scheme: ['bookflow', 'bookflow.dev'],
    // Home-screen label only. The App Store build keeps the untouched name from app.json.
    name: 'BookFlow Dev',
    personalTeamSigning: true,
  },
  preview: {
    bundleIdentifier: 'my.bookflow.app',
    scheme: 'bookflow',
    name: null,
    personalTeamSigning: false,
  },
  production: {
    bundleIdentifier: 'my.bookflow.app',
    scheme: 'bookflow',
    name: null,
    personalTeamSigning: false,
  },
};

module.exports = ({ config }) => {
  const variantName = process.env.APP_VARIANT ?? DEFAULT_VARIANT;
  const variant = VARIANTS[variantName];

  // Fail loudly rather than silently shipping a development bundle identifier to the App Store.
  if (!variant) {
    throw new Error(
      `Unknown APP_VARIANT "${variantName}". Expected one of: ${Object.keys(VARIANTS).join(', ')}.`,
    );
  }

  const plugins = (config.plugins ?? []).filter((plugin) => {
    if (variant.personalTeamSigning) return true;
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return name !== PERSONAL_TEAM_PLUGIN;
  });

  return {
    ...config,
    name: variant.name ?? config.name,
    scheme: variant.scheme,
    plugins,
    ios: {
      ...config.ios,
      bundleIdentifier: variant.bundleIdentifier,
    },
    extra: {
      ...config.extra,
      // Lets runtime code (analytics, diagnostics, support screens) report which build it is
      // without inferring it from __DEV__, which cannot tell preview apart from production.
      appVariant: variantName,
      posthogProjectToken: process.env.EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN,
      posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST,
    },
  };
};
