# XStudioz — Portfolio

The portfolio site for **XStudioz**, a logo and brand-identity studio working
through Fiverr. Static, fast, and built so the work is the interface:
[Astro 5](https://astro.build), hand-crafted CSS design tokens, zero
client-side framework.

The site has one job: a founder lands, believes the taste is real, understands
what they can buy, trusts the process, and messages the studio on Fiverr.

## Quick start

```sh
npm install
npm run dev        # local dev server → localhost:4321
npm run build      # production build → dist/
npm run preview    # serve the production build locally
npm run ingest     # turn dropped portfolio.pdf / sheet.png files into projects
npm run check      # type-check (astro check)
npm run format     # prettier over src/ and scripts/
```

## Pages

| Route | What it is |
| --- | --- |
| `/` | Hero, three featured plates, selected work, services, trust, process, Fiverr brief |
| `/work/` | Every project, with working filters (service · industry · type) |
| `/work/<slug>/` | Case study — hero, story, deliverables, curated pages, full deck, CTA |
| `/services/` | Services hub |
| `/<service-id>/` | One service page each: promise, scope, deliverables, related work, CTA |
| `/process/` | The engagement, stage by stage, on both sides of the table |
| `/404` | Not-found, with real routes out |

Two rules the code enforces, so they survive future edits:

1. **No control that does nothing.** The service filter chips are real links
   (they work without JavaScript); the dropdowns and the Clear button ship
   `hidden` and are revealed by their own script, so a no-JS visitor never
   meets a dead control. Same pattern for the mobile menu trigger.
2. **No empty destination.** A service page sells the service whether or not
   any work is published under it — scope, deliverables, who it suits, CTA.
   The only thing that depends on having work is the work section itself.

## Editing content — the CMS

The site ships with a git-based CMS ([Sveltia](https://github.com/sveltia/sveltia-cms))
at **`/admin/`** on the deployed site. Every save is a commit to `main`, and
the host rebuilds automatically. No database, no extra service.

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

### Where everything lives

| I want to change… | CMS location | File |
| --- | --- | --- |
| The Fiverr link | Site settings → Brand & links → Fiverr profile URL | `src/config/site.json` |
| The homepage headline | Site settings → Brand & links → Homepage headline | `src/config/site.json` |
| LinkedIn / Behance / Instagram | Site settings → Brand & links | `src/config/site.json` |
| A project | Projects → *the project* | `src/content/projects/<slug>/index.json` |
| Which projects lead the homepage | Projects → *the project* → Feature on the homepage | same |
| Grid order | Projects → *the project* → Grid position | same |
| A service's scope or deliverables | Site settings → Services | `src/data/categories.json` |
| Testimonials, client names, stats | Site settings → Studio content → Proof | `src/data/studio.json` |
| The process copy | Site settings → Studio content → Process | `src/data/studio.json` |
| The "what to send first" checklist | Site settings → Studio content → Start a project | `src/data/studio.json` |

### The Fiverr URL

One value, used by every call to action on the site — header, hero, service
pages, case studies, the brief section and the footer. Set it in
**Site settings → Brand & links → Fiverr profile URL**
(`fiverrUrl` in `src/config/site.json`).

### Proof, and the rule about it

`src/data/studio.json` ships with `proof.testimonials`, `proof.clients` and
`proof.stats` **empty**, and the site is built to be complete in that state:
the homepage renders a "What to expect" section instead of social proof.

Add a testimonial only when you have the client's own words and their
permission; add a stat only when you can back the number up. The moment
`testimonials` has one entry, the homepage section changes shape on the next
build — nothing else needs editing.

The two numbers on the homepage (projects published, industries served) are
counted from the content at build time, so they can never drift out of date
and are not claims that need defending.

## Everyday maintenance

### Add a project (one asset per brand)

Each portfolio is a single presentation — one tall image or one PDF.

1. Create a folder: `src/content/projects/<slug>/`
2. Drop the asset in, named by convention:
   - `portfolio.pdf` — a multi-page presentation (brand book, stationery
     suite, social kit…)
   - `sheet.png` / `sheet.jpg` / `sheet.webp` — a single tall presentation
     image
3. Run `npm run ingest`

Ingest renders PDF pages to crisp 1600px images, crops a cover from page 1,
and writes `index.json`. Then fill in the fields below — ingest never
overwrites them once set.

Everything else (grid, filters, service pages, prev/next, sitemap, structured
data) updates on the next build. Delete the folder to remove a project.

### The fields that matter most on a project

Ordered by how much difference they make:

1. **`intent`** — the strategic idea in about 70 characters. It is the line
   under the project name on every card and the standfirst on the case study.
   A grid of projects with intent lines sells; a grid of bare titles does not.
   Example: *"Geometric precision for a product studio that ships software."*
2. **`highlights`** — the page numbers of the strongest 5–8 pages of the deck,
   in the order you want them shown. **These are the only pages a visitor sees
   before the call to action**; the rest sit behind "Explore the full deck".
   Leave it empty and an even spread is picked automatically — which is fine,
   but it will sometimes land on a text page where you would have chosen the
   logo lock-up. This is the single highest-value edit per project.
3. **`context` / `challenge` / `direction`** — the story. Each renders only
   when filled, so a project with none of them still produces a clean page.
   Fill these and a case study starts communicating thinking rather than
   slides. Never guess: these are statements about a real client's business.
4. **`outcome` / `testimonial`** — leave empty unless real. Both sections are
   absent without data, by design.
5. **`extras`** — tick these accurately. They are what makes a project appear
   on the Stationery and Social Media service pages (see below).
6. **`featured`** — the three lowest-numbered featured projects fill the
   homepage opening. Pick three that show range, not three from one industry.

Covers are displayed at a **16:9 crop**; ingest already targets that ratio, so
a hand-made cover should be 16:9 too or it will be cropped top and bottom.

Hand-assembled sets still work — list images in `index.json`'s `images` array
yourself and skip ingest. Aim for ≥1600px wide sources.

### Add or change a service

Services live in `src/data/categories.json` (CMS: **Site settings →
Services**). One entry drives three things: the project tag, the page at
`/<id>/`, and the row in navigation, the services hub and the footer.

- `deliverables` is a promise a client can hold you to. Only list what you
  actually ship.
- `relatedExtras` is how a service with no standalone case study still shows
  real work. Stationery lists `"Stationery Design Kit"` and `"Business Card"`,
  so guideline projects that included one appear on the Stationery page under
  *"Also delivered as part of these identity projects"*. Spelling must match
  the extra exactly.
- `active: false` removes a service from navigation, the hub, the footer and
  the filters — but keeps its URL alive, so old links never 404.

Adding a **new** service id also means adding it to the Projects → Service
options in `public/admin/config.yml`.

### Commercial terms

`studio.json` → `process.revisionsNote` and `process.timelineNote` are empty
on purpose. Fill them in with your own terms (e.g. *"Two revision rounds are
included"*, *"Most logo projects run 3–5 days"*) and the lines appear on
`/process/`. They are deliberately not guessed for you.

## Design system

- Tokens (colour, fluid type scale, spacing, weights, shadows, image
  treatment, motion) live in `src/styles/tokens.css`. Every component consumes
  tokens — change a token, change the site.
- Shared primitives live in `src/styles/global.css`: `.section`,
  `.section-head`, `.overline`, `.button` (+ `--primary/--outline/--paper/
  --ghost/--lg`), `.link-arrow`, `.spec-list`, `.tag`, `.media`.
- Type: **Bricolage Grotesque**, a self-hosted variable subset (~77 KB) with
  metric-matched fallbacks for zero layout shift. Body text uses the native
  system stack — no download.
- Motion is opt-in: `data-reveal` (or `data-reveal="wipe"` for artwork) for
  scroll reveals, `data-enter` + `--enter-step` for the one choreographed
  entrance on first paint. Everything respects `prefers-reduced-motion`.

## Generated assets

- `npm run placeholders` regenerates seeded placeholder artwork
  (`scripts/generate-placeholders.mjs`). Never runs during the site build.
- `npm run og` regenerates `public/og.png` and `public/apple-touch-icon.png`
  (`scripts/generate-og.mjs`). Requires the brand fonts registered with
  fontconfig (see the script header).
- `npm run industries` rebuilds the CMS industry dropdown from every project
  (`scripts/sync-industries.mjs`). Runs automatically before each build, so an
  industry typed into "New industry" today is a dropdown option tomorrow.

## Performance & SEO

- Fully static output. Client JavaScript is small and per-page: the filter
  rail only ships on `/work/`, the deck viewer only on case studies.
- A 45-page brand book used to render 45 full-size images inline. Now the case
  study renders the hero plus the curated pages at display size; the rest are
  400px thumbnails behind a drawer, with one full-resolution source each for
  the viewer. Same access to everything, a fraction of the weight.
- Images: build-time WebP, responsive `srcset`/`sizes`, lazy below the fold,
  explicit dimensions and inline blur placeholders (no layout shift).
- Per-page canonical URLs, Open Graph + Twitter cards, JSON-LD (Organization,
  WebSite, CreativeWork, Service, OfferCatalog, HowTo, BreadcrumbList,
  CollectionPage), `sitemap-index.xml` and `robots.txt`.

## Deploying — Vercel, straight from GitHub

The site is hosted on **Vercel** at <https://xstudioz.com>, deployed from this
repository. Vercel watches `main`, runs `npm run build` on push and publishes
`dist/`. SSL, the CDN and auto-deployment are handled on their side.

Because every CMS save is a commit to `main`, editing content in `/admin/` is
what triggers a deploy. A build takes a few minutes, most of it spent
rendering PDF pages through sharp and pdfjs.

Vercel project settings:

| Setting | Value |
| --- | --- |
| Framework preset | Astro |
| Branch | `main` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | 22.x |

That build command matters: it **must** be `npm run build`, not `astro build`.
`scripts/ingest.mjs` is what renders every PDF into page images and generates
the covers — skip it and every project fails the "has a cover and images"
check, producing a site that builds cleanly with an empty portfolio.

`vercel.json` holds the response headers: immutable caching for the
content-hashed `_astro/` assets, no caching for `/admin/config.yml`, plus
`nosniff` and a referrer policy. `public/.htaccess` is kept for Apache hosts
and is ignored by Vercel.

Changing the production URL (canonicals, sitemap, `robots.txt`, social cards)
is a content edit, not a code one — *Site settings → Brand & links →
Production URL* in the CMS.
