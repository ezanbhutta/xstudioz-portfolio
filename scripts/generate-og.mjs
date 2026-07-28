/**
 * Generates the Open Graph image + apple-touch-icon.
 * Output is committed, so this only needs re-running when the brand changes.
 *
 * Note: uses the studio fonts via fontconfig. If "Fraunces" isn't installed
 * system-wide, convert the woff2 in public/fonts to TTF and register it
 * (fontTools: TTFont(src).save(dst) with flavor=None, then fc-cache).
 */
import sharp from 'sharp';

const INK = '#1a1815';
const PAPER = '#faf8f5';
const ACCENT = '#d97b4a';

const crop = (x, y, s = 16) =>
  `<g stroke="${PAPER}" stroke-width="2" opacity="0.35">` +
  `<line x1="${x - s}" y1="${y}" x2="${x + s}" y2="${y}"/>` +
  `<line x1="${x}" y1="${y - s}" x2="${x}" y2="${y + s}"/></g>`;

const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${INK}"/>
  ${crop(52, 52)}${crop(1148, 52)}${crop(52, 578)}${crop(1148, 578)}
  <g transform="translate(985 315) scale(1.35)">
    <path d="M 62 -37 A 72 72 0 1 0 62 37" stroke="${PAPER}" stroke-width="26" fill="none" stroke-linecap="round" opacity="0.16"/>
    <circle cx="86" cy="0" r="19" fill="${ACCENT}" opacity="0.9"/>
  </g>
  <text x="92" y="348" font-family="Fraunces" font-size="128" font-weight="600" letter-spacing="-3" fill="${PAPER}">XStudioz<tspan fill="${ACCENT}">.</tspan></text>
  <text x="97" y="432" font-family="Archivo" font-size="26" font-weight="500" letter-spacing="7" fill="${PAPER}" opacity="0.62">INDEPENDENT DESIGN STUDIO</text>
  <rect x="97" y="480" width="72" height="6" rx="3" fill="${ACCENT}"/>
</svg>`;

const touchIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${INK}"/>
  <g stroke="${PAPER}" stroke-width="7" stroke-linecap="round">
    <line x1="20" y1="20" x2="38" y2="38"/>
    <line x1="38" y1="20" x2="20" y2="38"/>
  </g>
  <circle cx="46" cy="44" r="5" fill="${ACCENT}"/>
</svg>`;

await sharp(Buffer.from(og)).png({ compressionLevel: 9 }).toFile('public/og.png');
await sharp(Buffer.from(touchIcon))
  .png({ compressionLevel: 9 })
  .toFile('public/apple-touch-icon.png');
console.log('✓ public/og.png\n✓ public/apple-touch-icon.png');
