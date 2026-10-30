// The Android app's icons and start screen, from the web app's own icons (apps/web/public), so
// the phone shows the same picture as the browser and the desktop app. Run it again after the
// icon changes, and commit what it writes:
//
//   node apps/mobile/icons.mjs
import sharp from 'sharp';
import {readdirSync, renameSync} from 'node:fs';
import {join} from 'node:path';

const RES = 'apps/mobile/android/app/src/main/res';
const ICON = 'apps/web/public/icon-512.png';
/** Drawn with room to spare: Android crops an adaptive icon to a circle or a squircle. */
const MASKABLE = 'apps/web/public/icon-maskable-512.png';
/** The app's background (manifest.webmanifest): the start screen and the icon's back. */
const BACKGROUND = '#151316';

/** Density → the size of a launcher icon (48 dp) and of an adaptive one's layer (108 dp). */
const DENSITIES = {mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4};

for (const [density, scale] of Object.entries(DENSITIES)) {
  const dir = join(RES, `mipmap-${density}`);
  const launcher = Math.round(48 * scale);
  const layer = Math.round(108 * scale);
  await sharp(ICON)
    .resize(launcher, launcher)
    .toFile(join(dir, 'ic_launcher.png'));
  await sharp(ICON)
    .resize(launcher, launcher)
    .composite([
      {
        input: Buffer.from(
          `<svg width="${launcher}" height="${launcher}"><circle cx="${launcher / 2}" cy="${launcher / 2}" r="${launcher / 2}"/></svg>`,
        ),
        blend: 'dest-in',
      },
    ])
    .toFile(join(dir, 'ic_launcher_round.png'));
  await sharp(MASKABLE)
    .resize(layer, layer)
    .toFile(join(dir, 'ic_launcher_foreground.png'));
}

// The start screen: the icon in the middle of the app's background, every size Capacitor made.
for (const folder of readdirSync(RES).filter(name =>
  name.startsWith('drawable'),
)) {
  const file = join(RES, folder, 'splash.png');
  let meta;
  try {
    meta = await sharp(file).metadata();
  } catch {
    continue; // This folder has no start screen.
  }
  const size = Math.round(Math.min(meta.width, meta.height) / 4);
  const icon = await sharp(ICON).resize(size, size).toBuffer();
  await sharp({
    create: {
      width: meta.width,
      height: meta.height,
      channels: 4,
      background: BACKGROUND,
    },
  })
    .composite([{input: icon, gravity: 'center'}])
    .png()
    .toFile(`${file}.tmp`);
  renameSync(`${file}.tmp`, file);
}
console.log('Icons and start screens written.');
