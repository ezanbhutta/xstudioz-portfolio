# XStudioz — Portfolio

The portfolio site for **XStudioz**, an independent design studio. Static,
fast, and built so the work is the interface: [Astro 5](https://astro.build),
hand-crafted CSS design tokens, zero client-side framework.

## Quick start

```sh
npm install
npm run dev        # local dev server
npm run build      # production build → dist/
npm run preview    # serve the production build locally
```

## Everyday maintenance

### Add a project

Create a folder under `src/content/projects/<slug>/` containing the images and
an `index.json`:

```json
{
  "title": "Aurel",
  "category": "logo-design",
  "year": 2026,
  "order": 1,
  "summary": "One sentence about the project.",
  "cover": "./cover.png",
  "coverAlt": "What the cover shows",
  "images": [{ "src": "./01.png", "alt": "What this image shows" }]
}
```

That's it — the grid, filters, category pages, prev/next navigation, sitemap
and structured data all update automatically. `order` controls grid position
(lower = earlier). Delete the folder to remove the project.

**Replacing placeholder art with real work:** overwrite the image files in the
project folder (any raster format works — update the filenames in `index.json`
if they change). Aim for ≥1600px wide sources; the build generates responsive
AVIF/WebP automatically.

### Add a category

Add one entry to `src/data/categories.ts`. The filter button and the
`/<category-id>/` landing page are generated from it. Then tag projects with
the new `id`.

### Edit packages

Everything on `/packages/` renders from `src/data/packages.ts` — copy, pricing,
inclusions, the highlighted tier and CTA targets.

### Brand-level settings

`src/config/site.ts` holds the site name, **production URL**, description and
the **Fiverr profile link** used by every CTA. Update `url` before going live —
canonical URLs, the sitemap and robots.txt all derive from it.

## Design system

- Tokens (color, type scale, spacing, motion) live in `src/styles/tokens.css`.
  Every component consumes tokens — change a token, change the site.
- Fonts are self-hosted variable subsets in `public/fonts/` (Fraunces +
  Archivo, both SIL OFL licensed) with metric-matched fallbacks for zero CLS.
- Interactive motion respects `prefers-reduced-motion` everywhere.

## Generated assets

- `npm run placeholders` regenerates the seeded placeholder artwork and
  project metadata (`scripts/generate-placeholders.mjs`). Only needed until
  real work replaces it — it never runs during the site build.
- `npm run og` regenerates `public/og.png` and `public/apple-touch-icon.png`
  (`scripts/generate-og.mjs`). Requires the brand fonts registered with
  fontconfig (see the script header).

## Performance & SEO

- Fully static output; the only JavaScript shipped is ~2 KB for category
  filtering and scroll reveals.
- Images: build-time AVIF/WebP, responsive `srcset`/`sizes`, lazy-loaded below
  the fold, explicit dimensions (no layout shift).
- Per-page canonical URLs, Open Graph + Twitter cards, JSON-LD
  (Organization, CreativeWork, BreadcrumbList, CollectionPage, OfferCatalog),
  `sitemap-index.xml` and `robots.txt` out of the box.

## Deploying

`npm run build` produces a fully static `dist/` — host it anywhere (Netlify,
Vercel, Cloudflare Pages, GitHub Pages…). Serve `public/fonts/` and Astro's
`_astro/` assets with long-lived cache headers if your host doesn't already.
