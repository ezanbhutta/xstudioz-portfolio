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
npm run ingest     # turn dropped portfolio.pdf / sheet.png files into projects
npm run check      # type-check (astro check)
npm run format     # prettier over src/ and scripts/
```

## Editing content — the CMS

The site ships with a git-based CMS ([Sveltia](https://github.com/sveltia/sveltia-cms))
at **`/admin/`** on the deployed site. It edits projects (with image
uploads), categories and the site settings (including the Fiverr URL)
through forms — every save is a commit to `main`, and the host
rebuilds the site automatically. No database, no extra service.

**Signing in** (one-time setup, pick one):

1. **Personal access token** — create a GitHub
   [fine-grained token](https://github.com/settings/personal-access-tokens)
   scoped to this repo with *Contents: read & write*, open `/admin/`, and
   sign in with the token.
2. **One-click OAuth** — deploy the free
   [sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth)
   Cloudflare Worker and add its URL as `base_url` in
   `public/admin/config.yml`.
3. **Locally** — run `npm run dev`, open `localhost:4321/admin/` and choose
   "Work with local repository". No sign-in needed.

Notes:
- New project images uploaded in the CMS land inside that project's own
  folder; site-wide uploads go to `public/uploads/`.
- Adding a category in the CMS? Also add its id to the Projects category
  dropdown options in `public/admin/config.yml` (one list, commented).
- PDFs: the CMS is for images + copy. For a PDF-based portfolio, use the
  `npm run ingest` flow below — it renders the pages as images
  automatically.

## Everyday maintenance

### Add a project (one asset per brand)

Each portfolio is a single presentation — one tall image or one PDF. The
workflow:

1. Create a folder: `src/content/projects/<slug>/`
2. Drop the asset in, named by convention:
   - `portfolio.pdf` — a multi-page presentation (brand book, stationery
     suite, social kit…)
   - `sheet.png` / `sheet.jpg` / `sheet.webp` — a single tall presentation
     image
3. Run `npm run ingest`

The ingest step renders PDF pages (any size or dimensions) to crisp 1600px
images, crops a 4:3 grid cover from the top of page 1 (or the sheet), and
writes `index.json`. Then open `index.json` and set `title`, `category`,
`year`, `order` (lower = earlier in the grid) and a one-sentence `summary` —
ingest never overwrites those once set. Alt text is generated per page and
can be refined in the same file.

The grid, filters, category pages, prev/next navigation, sitemap and
structured data all update automatically on the next build. Delete the
folder to remove a project. The `solace` project is a working PDF-based
example.

Hand-assembled sets still work too — list any images in `index.json`'s
`images` array yourself and skip ingest. Aim for ≥1600px wide sources; the
build generates responsive AVIF/WebP automatically.

### Add a category

Add one entry to `src/data/categories.ts`. The filter button and the
`/<category-id>/` landing page are generated from it. Then tag projects with
the new `id`.

### Brand-level settings

`src/config/site.ts` holds the site name, **production URL**, description and
the **Fiverr profile link** used by every CTA. Update `url` before going live —
canonical URLs, the sitemap and robots.txt all derive from it.

**Before launch:** set `fiverrUrl` — every "Hire on Fiverr" button points
there.

## Design system

- Tokens (color, type scale, spacing, weights, motion) live in
  `src/styles/tokens.css`. Every component consumes tokens — change a token,
  change the site.
- Fonts are self-hosted variable subsets in `src/assets/fonts/` (Fraunces +
  Archivo, both SIL OFL licensed, sourced from the `@fontsource-variable`
  packages) with metric-matched fallbacks for zero CLS. The build gives them
  content-hashed URLs so they cache immutably (see `public/_headers`).
- Interactive motion respects `prefers-reduced-motion` everywhere.

## Generated assets

- `npm run placeholders` regenerates the seeded placeholder artwork and
  project metadata (`scripts/generate-placeholders.mjs`). Only needed until
  real work replaces it — it never runs during the site build.
- `npm run og` regenerates `public/og.png` and `public/apple-touch-icon.png`
  (`scripts/generate-og.mjs`). Requires the brand fonts registered with
  fontconfig (see the script header).

## Performance & SEO

- Fully static output. Client JavaScript is ~4 KB total: ~2.2 KB Astro
  prefetch runtime plus ~1.8 KB for category filtering and scroll reveals.
- Images: build-time AVIF/WebP (WebP fallback — no PNG payload), responsive
  `srcset`/`sizes`, lazy-loaded below the fold, explicit dimensions (no
  layout shift).
- Per-page canonical URLs, Open Graph + Twitter cards, JSON-LD
  (Organization, CreativeWork, BreadcrumbList, CollectionPage, OfferCatalog),
  `sitemap-index.xml` and `robots.txt` out of the box.

## Deploying — Hostinger, straight from GitHub

The site is hosted on **Hostinger** at <https://xstudioz.com>, deployed by
Hostinger's own GitHub integration. Nothing else is required: it watches
`main`, runs `npm run build` on push, and publishes the resulting `dist/`.
SSL, the CDN and auto-deployment are handled on their side.

Because every CMS save is a commit to `main`, editing content in `/admin/`
is what triggers a deploy. A build takes roughly 4–5 minutes, most of it
spent rendering PDF pages through sharp and pdfjs.

Hostinger's panel settings for this project:

| Setting | Value |
| --- | --- |
| Framework | Astro |
| Branch | `main` |
| Node version | 22.x |
| Root directory | `./` |
| Build and output | Default (resolves to `npm run build`) |

That last row matters: the build **must** run `npm run build`, not
`astro build`. `scripts/ingest.mjs` is what renders every PDF into page
images and generates the grid covers — skip it and every project fails the
"has a cover and images" check, producing a site that builds cleanly with an
empty portfolio.

Server configuration lives in `public/.htaccess`, which Astro copies into
`dist/` on every build: immutable caching for the content-hashed `_astro/`
assets, no caching for HTML so CMS edits appear immediately, the custom 404,
HTTPS and `www` → apex redirects, and compression.

Changing the production URL (canonicals, sitemap, `robots.txt`, social cards)
is a content edit, not a code one — *Site settings → Brand & links →
Production URL* in the CMS.
