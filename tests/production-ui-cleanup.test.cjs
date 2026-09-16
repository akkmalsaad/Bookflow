const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const sourceFiles = ['app', 'components', 'context', 'lib']
  .flatMap((dir) => fs.readdirSync(path.join(root, dir), { recursive: true }).map((file) => path.join(dir, file)))
  .filter((file) => /\.(ts|tsx)$/.test(file));

/** String literals and JSX text only — comments are allowed to explain history. */
function userFacingText(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('no unfinished, prototype or developer-instruction copy reaches users', () => {
  const banned = [
    /(?<!\.)\bprototype\b(?!\.)/i,
    /before (production )?launch/i,
    /not available yet/i,
    /not configurable yet/i,
    /not (been )?built/i,
    /does not support yet/i,
    /coming soon/i,
    /under development/i,
    /rebuild and reinstall/i,
    /Expo SDK \$\{/,
    /is not published to the App Store/i,
  ];
  for (const file of sourceFiles) {
    const text = userFacingText(read(file));
    for (const pattern of banned) assert.equal(pattern.test(text), false, `${file} contains ${pattern}`);
  }
});

test('developer setup instructions only appear in development logging', () => {
  // lib/supabase.ts throws its setup error only if a client is created without configuration, and
  // every caller checks isSupabaseConfigured first, so that message can never reach a screen.
  const configurationGuards = ['lib/supabase.ts'];
  for (const file of sourceFiles.filter((name) => !configurationGuards.includes(name))) {
    const text = userFacingText(read(file));
    for (const match of text.matchAll(/restart Expo|apply the (business-logo )?storage migration/gi)) {
      const line = text.slice(text.lastIndexOf('\n', match.index - 200 > 0 ? match.index : 0), match.index);
      const context = text.slice(Math.max(0, match.index - 240), match.index);
      assert.match(context, /__DEV__|console\.warn/, `${file}: "${match[0]}" is not development-only (${line.trim()})`);
    }
  }
});

test('sign-up uses the production legal documents, not built-in copy', () => {
  const signup = read('app/(auth)/signup.tsx');
  assert.match(signup, /getTermsOfService\(locale\)/);
  assert.match(signup, /getPrivacyPolicy\(locale\)/);
  assert.match(signup, /<LegalDocumentView /);
  assert.equal(/paragraphs:/.test(signup), false);
});

test('removed v1 surfaces stay removed', () => {
  assert.equal(fs.existsSync(path.join(root, 'app/modal.tsx')), false);
  assert.equal(/name="modal"/.test(read('app/_layout.tsx')), false);
  assert.equal(/settings\.rate|handleRate/.test(read('app/(tabs)/settings.tsx')), false);
  assert.equal(/notifset\.(payment|invoice)/.test(read('app/settings/notifications.tsx')), false);
  assert.equal(/sub\.currency\.taxYear/.test(read('app/settings/currency-region.tsx')), false);
  assert.equal(/sub\.about\.runtime/.test(read('app/settings/about.tsx')), false);
  assert.equal(/construct-outline/.test(read('components/settings/SettingsDetailScreen.tsx')), false);
});

test('the appearance preference is saved and restored', () => {
  const theme = read('context/theme-context.tsx');
  assert.match(theme, /SecureStore\.getItem\(THEME_PREFERENCE_KEY\)/);
  assert.match(theme, /SecureStore\.setItemAsync\(THEME_PREFERENCE_KEY, preference\)/);
  assert.match(theme, /useState<ThemePreference>\(readStoredPreference\)/);
});

test('user-facing brand is spelled BookFlow', () => {
  for (const file of sourceFiles) {
    const text = userFacingText(read(file));
    const literals = text.match(/(['"`])(?:(?!\1)[^\\\n]|\\.)*\1|>[^<>{}\n]+</g) ?? [];
    for (const literal of literals) assert.equal(/\bBookflow\b/.test(literal), false, `${file}: ${literal}`);
  }
});
