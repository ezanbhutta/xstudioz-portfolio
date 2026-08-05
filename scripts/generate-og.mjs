/**
 * Generates the Open Graph image + icons.
 *
 * EXACT-FILE MODE: if src/assets/logo-original.png (or .jpg/.webp) exists,
 * that file is composited verbatim onto the social card and becomes the
 * favicon.png + apple-touch-icon.png. Otherwise a faithful vector
 * recreation of the mark is drawn.
 *
 * Output is committed — re-run with `npm run og` after changing the logo.
 * Text uses the studio fonts via fontconfig (see README).
 */
import { existsSync } from 'node:fs';
import sharp from 'sharp';

const ORIGINAL = ['png', 'jpg', 'jpeg', 'webp']
  .map((ext) => `src/assets/logo-original.${ext}`)
  .find((p) => existsSync(p));

const VIOLET = '#5e0fa8';
const PURPLE = '#9c1fd6';
const MAGENTA = '#e33ed4';
const GLOW = '#ff8ae2';

/** Vector recreation of the mark in a 100-unit box (used when no file). */
const vectorMark = `
  <defs>
    <linearGradient id="bg" x1="0" y1="100" x2="100" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${VIOLET}"/>
      <stop offset="0.5" stop-color="${PURPLE}"/>
      <stop offset="1" stop-color="${MAGENTA}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.88" cy="0.08" r="0.55">
      <stop offset="0" stop-color="${GLOW}" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${GLOW}" stop-opacity="0"/>
    </radialGradient>
    <mask id="m">
      <g transform="translate(50 50) scale(0.74) rotate(45) translate(-50 -50)">
        <rect x="35" y="12" width="30" height="76" rx="11" fill="#fff"/>
        <rect x="12" y="35" width="76" height="30" rx="11" fill="#fff"/>
        <rect x="42" y="19" width="16" height="62" rx="6" fill="#000"/>
        <rect x="19" y="42" width="62" height="16" rx="6" fill="#000"/>
      </g>
    </mask>
  </defs>
  <rect width="100" height="100" rx="10" fill="url(#bg)"/>
  <rect width="100" height="100" rx="10" fill="url(#glow)"/>
  <rect width="100" height="100" fill="#fff" mask="url(#m)"/>
`;

const badgeSvg = (px) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 100 100">${vectorMark}</svg>`;

/** Card background + text; the mark is composited on top afterwards. */
const cardSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="g" x1="0" y1="630" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${VIOLET}"/>
      <stop offset="0.5" stop-color="${PURPLE}"/>
      <stop offset="1" stop-color="${MAGENTA}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.93" cy="0.05" r="0.6">
      <stop offset="0" stop-color="${GLOW}" stop-opacity="0.75"/>
      <stop offset="1" stop-color="${GLOW}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <text x="92" y="330" font-family="Outfit" font-size="110" font-weight="700" letter-spacing="-2" fill="#ffffff">XStudioz</text>
  <text x="95" y="408" font-family="Manrope" font-size="26" font-weight="600" letter-spacing="6" fill="#ffffff" opacity="0.75">LOGO &amp; BRAND IDENTITY DESIGN</text>
  <rect x="97" y="456" width="72" height="6" rx="3" fill="#ffffff" opacity="0.9"/>
</svg>`;

const MARK_SIZE = 300;
const markBuffer = ORIGINAL
  ? await sharp(ORIGINAL).resize(MARK_SIZE, MARK_SIZE, { fit: 'cover' }).png().toBuffer()
  : await sharp(Buffer.from(badgeSvg(MARK_SIZE)))
      .png()
      .toBuffer();

await sharp(Buffer.from(cardSvg))
  .composite([{ input: markBuffer, left: 810, top: 165 }])
  .png({ compressionLevel: 9 })
  .toFile('public/og.png');

const iconSource = ORIGINAL ?? Buffer.from(badgeSvg(512));
await sharp(iconSource)
  .resize(180, 180, { fit: 'cover' })
  .png({ compressionLevel: 9 })
  .toFile('public/apple-touch-icon.png');

if (ORIGINAL) {
  // Pixel-exact favicon from the original file; BaseLayout prefers it.
  await sharp(ORIGINAL).resize(64, 64, { fit: 'cover' }).png().toFile('public/favicon.png');
  console.log(`✓ used exact logo file: ${ORIGINAL} (og.png, apple-touch-icon.png, favicon.png)`);
} else {
  console.log(
    '✓ public/og.png\n✓ public/apple-touch-icon.png (vector recreation — add src/assets/logo-original.png for the exact file)',
  );
}
