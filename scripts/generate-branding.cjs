/* global __dirname */
// Deterministic format exports only: never redraw or recolor the color symbol.
// jimp-compact is supplied by the installed Expo SDK 54 image tooling.
const fs = require('node:fs/promises');
const path = require('node:path');
const Jimp = require('jimp-compact');

const root = path.resolve(__dirname, '..');
const branding = path.join(root, 'assets/branding');
const background = 0xf5f7fbff;

async function main() {
  // User-selected source. Never overwrite it from an older branding export.
  const masterPath = path.join(root, 'assets/images/bookflow-logo.png');
  const master = await Jimp.read(masterPath);
  if (master.bitmap.width !== master.bitmap.height) {
    throw new Error('The supplied master must retain its square composition.');
  }

  // The master already has visual padding. Preserve the complete composition,
  // flatten onto the existing splash color, and omit the PNG alpha channel.
  const icon = new Jimp(1024, 1024, background);
  icon.composite(master.clone().resize(1024, 1024, Jimp.RESIZE_BICUBIC), 0, 0);
  await icon.colorType(2).writeAsync(path.join(branding, 'bookflow-app-icon.png'));

  // Fit EVERY nontransparent pixel inside Android's central 66/108 safe circle.
  // Include even the master's nearly invisible pixels; do not trim or clean it.
  const center = (master.bitmap.width - 1) / 2;
  let radius = 0;
  master.scan(0, 0, master.bitmap.width, master.bitmap.height, (x, y, i) => {
    if (master.bitmap.data[i + 3]) radius = Math.max(radius, Math.hypot(x - center, y - center));
  });
  const safeRadius = 1024 * 33 / 108;
  // Four pixels of allowance for interpolation at the perimeter.
  const size = Math.floor(master.bitmap.width * (safeRadius - 4) / radius);
  const foreground = new Jimp(1024, 1024, 0x00000000);
  foreground.composite(
    master.clone().resize(size, size, Jimp.RESIZE_BICUBIC),
    Math.floor((1024 - size) / 2),
    Math.floor((1024 - size) / 2),
  );
  await foreground.writeAsync(path.join(branding, 'bookflow-adaptive-foreground.png'));

  // Android themed icons require an alpha silhouette; retain the exact alpha.
  const monochrome = foreground.clone();
  monochrome.scan(0, 0, 1024, 1024, (x, y, i) => {
    monochrome.bitmap.data[i] = 255;
    monochrome.bitmap.data[i + 1] = 255;
    monochrome.bitmap.data[i + 2] = 255;
  });
  await monochrome.writeAsync(path.join(branding, 'bookflow-adaptive-monochrome.png'));
  // Keep notification configuration intact; replace its old branding silhouette.
  const notification = master.clone();
  notification.scan(0, 0, notification.bitmap.width, notification.bitmap.height, (x, y, i) => {
    notification.bitmap.data[i] = 255;
    notification.bitmap.data[i + 1] = 255;
    notification.bitmap.data[i + 2] = 255;
  });
  await notification.clone().resize(96, 96).writeAsync(path.join(root, 'assets/images/notification-icon.png'));
  console.log(`Exported iOS 1024px RGB icon, Android foreground (${size}px source on 1024px), themed mask, and unchanged transparent UI logo.`);

  // Refresh only branding resources in existing, ignored native projects.
  // Normal EAS/prebuild generation reads the same assets from app.json.
  if (process.argv.includes('--native')) {
    const config = require('../app.json').expo;
    const splash = config.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen')[1];
    if (await exists(path.join(root, 'ios/Bookflow/Images.xcassets'))) {
      const { setIconsAsync } = require('@expo/prebuild-config/build/plugins/icons/withIosIcons');
      await setIconsAsync(config, root);
      for (const scale of [1, 2, 3]) {
        const suffix = scale === 1 ? '' : `@${scale}x`;
        await master.clone().resize(splash.imageWidth * scale, splash.imageWidth * scale)
          .writeAsync(path.join(root, `ios/Bookflow/Images.xcassets/SplashScreenLogo.imageset/image${suffix}.png`));
      }
    }
    if (await exists(path.join(root, 'android/app/src/main/res'))) {
      const { setIconAsync } = require('@expo/prebuild-config/build/plugins/icons/withAndroidIcons');
      const { setSplashImageDrawablesAsync } = require('@expo/prebuild-config/build/plugins/unversioned/expo-splash-screen/withAndroidSplashImages');
      await setIconAsync(root, {
        icon: config.android.adaptiveIcon.foregroundImage,
        backgroundColor: config.android.adaptiveIcon.backgroundColor,
        monochromeImage: config.android.adaptiveIcon.monochromeImage,
        isAdaptive: true,
      });
      const colorsPath = path.join(root, 'android/app/src/main/res/values/colors.xml');
      const colors = await fs.readFile(colorsPath, 'utf8');
      await fs.writeFile(colorsPath, colors.replace(
        /(<color name="iconBackground">)[^<]*(<\/color>)/,
        `$1${config.android.adaptiveIcon.backgroundColor}$2`,
      ));
      await setSplashImageDrawablesAsync(config, splash, root, splash.android.imageWidth);
      for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
        const file = path.join(root, `android/app/src/main/res/drawable-${density}/notification_icon.png`);
        if (await exists(file)) {
          const existing = await Jimp.read(file);
          await notification.clone().resize(existing.bitmap.width, existing.bitmap.height).writeAsync(file);
        }
      }
    }
    console.log('Refreshed existing native icon and splash resources.');
  }
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
