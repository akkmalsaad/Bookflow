// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Release bundles hold copies of deployed Deno functions and SQL for recovery, not app code.
    ignores: ['dist/*', 'supabase/releases/*'],
  },
]);
