/**
 * Generates the Open Graph image + apple-touch-icon on the brand gradient.
 * Output is committed, so this only needs re-running when the brand changes.
 *
 * Note: uses the studio fonts via fontconfig. If "Outfit" isn't installed
 * system-wide, convert the woff2 in src/assets/fonts to TTF and register it
 * (fontTools: TTFont(src).save(dst) with flavor=None, then fc-cache).
 */
import sharp from 'sharp';

// Keep in sync with src/styles/tokens.css
const VIOLET = '#5e17b8';
const PURPLE = '#a928d9';
const MAGENTA = '#ed4fcf';

const gradientDefs = (rotatedId = false) => `
  <linearGradient id="g" x1="0" y1="630" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${VIOLET}"/>
    <stop offset="0.55" stop-color="${PURPLE}"/>
    <stop offset="1" stop-color="${MAGENTA}"/>
  </linearGradient>${
    rotatedId
      ? `
  <linearGradient id="gi" x1="0" y1="630" x2="1200" y2="0" gradientUnits="userSpaceOnUse" gradientTransform="rotate(-45 985 315)">
    <stop offset="0" stop-color="${VIOLET}"/>
    <stop offset="0.55" stop-color="${PURPLE}"/>
    <stop offset="1" stop-color="${MAGENTA}"/>
  </linearGradient>`
      : ''
  }
`;

/** The X mark, scaled into a 100-unit box at (x, y). */
const mark = (x, y, scale) => `
  <g transform="translate(${x} ${y}) scale(${scale})">
    <g transform="rotate(45 50 50)">
      <rect x="35" y="12" width="30" height="76" rx="11" fill="#fff"/>
      <rect x="12" y="35" width="76" height="30" rx="11" fill="#fff"/>
      <rect x="42" y="19" width="16" height="62" rx="6" fill="url(#gi)"/>
      <rect x="19" y="42" width="62" height="16" rx="6" fill="url(#gi)"/>
    </g>
  </g>
`;

const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>${gradientDefs(true)}</defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <g opacity="0.9">${mark(830, 165, 3)}</g>
  <text x="92" y="330" font-family="Outfit" font-size="110" font-weight="700" letter-spacing="-2" fill="#ffffff">XStudioz</text>
  <text x="95" y="408" font-family="Manrope" font-size="26" font-weight="600" letter-spacing="7" fill="#ffffff" opacity="0.75">INDEPENDENT DESIGN STUDIO</text>
  <rect x="97" y="456" width="72" height="6" rx="3" fill="#ffffff" opacity="0.9"/>
</svg>`;

// The touch icon is exactly the favicon, rasterized.
const touchIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="g" x1="0" y1="100" x2="100" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${VIOLET}"/>
      <stop offset="0.55" stop-color="${PURPLE}"/>
      <stop offset="1" stop-color="${MAGENTA}"/>
    </linearGradient>
    <linearGradient id="gi" x1="0" y1="100" x2="100" y2="0" gradientUnits="userSpaceOnUse" gradientTransform="rotate(-45 50 50)">
      <stop offset="0" stop-color="${VIOLET}"/>
      <stop offset="0.55" stop-color="${PURPLE}"/>
      <stop offset="1" stop-color="${MAGENTA}"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" fill="url(#g)"/>
  <g transform="rotate(45 50 50)">
    <rect x="35" y="12" width="30" height="76" rx="11" fill="#fff"/>
    <rect x="12" y="35" width="76" height="30" rx="11" fill="#fff"/>
    <rect x="42" y="19" width="16" height="62" rx="6" fill="url(#gi)"/>
    <rect x="19" y="42" width="62" height="16" rx="6" fill="url(#gi)"/>
  </g>
</svg>`;

await sharp(Buffer.from(og)).png({ compressionLevel: 9 }).toFile('public/og.png');
await sharp(Buffer.from(touchIcon))
  .png({ compressionLevel: 9 })
  .toFile('public/apple-touch-icon.png');
console.log('✓ public/og.png\n✓ public/apple-touch-icon.png');
