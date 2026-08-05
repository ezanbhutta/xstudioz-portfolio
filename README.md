# XStudioz — Portfolio

The portfolio site for **XStudioz**, a logo and brand-identity studio working
through Fiverr. Static, fast, and built so the work is the interface:
[Astro 5](https://astro.build), hand-crafted CSS design tokens, zero
client-side framework.

The site has one job: a founder lands, believes the taste is real, sees what
they can buy, and messages the studio on Fiverr. It is deliberately only that
— no blog, no about page, no process essay. Five services, the work under
each, and a way to get in touch.

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
| `/` | Hero, then a two-project preview per service |
| `/<service-id>/` | One service page each: promise, the argument, all its work with filters, CTA |
| `/work/<slug>/` | Case study — hero, story, deliverables, curated pages, full deck, CTA |
| `/404` | Not-found, with real routes out |

That is the whole site. `/work/`, `/services/` and `/process/` used to exist
and were removed; `public/.htaccess` 301s all three to `/` so anything already
linked or indexed still lands somewhere. Individual case studies at
`/work/<slug>/` are untouched — the redirect matches `/work/` exactly.

Two rules the code enforces, so they survive future edits:

1. **No control that does nothing.** Every dropdown and Clear button ships
   `hidden` and is revealed by its own script, so a no-JS visitor never meets
   a dead control. The same rule applies to the CMS: a field that renders
   nowhere gets deleted, not left in the editor doing nothing.

   The Type and Logo type filters are the deliberate exception. They offer
   the **whole taxonomy**, not just the values that occur, because the list
   is a statement about what the studio designs — both Logo Design projects
   are Combination marks, so a values-that-occur list would have held one
   option and been hidden, and a visitor looking for the logo-type filter
   would have found no filter at all. Choosing a type with nothing behind it
   lands on the empty state under the grid, which says so and offers a way
   back. Industry stays derived from the projects: there is no fixed list to
   advertise, so an industry nobody has worked in would be a claim rather
   than a capability.
2. **No empty destination.** A service page sells the service whether or not
   any work is published under it — the promise, the argument, the CTA. The
   only thing that depends on having work is the work section itself.
   Every hand-off link on the homepage lands on one of these, so none of them
   is a dead end even before a case study exists.

### Navigation

The services are the navigation, and they sit **in the page, directly under
the hero** — not in the sticky bar:

```
XStudioz.                                    [ Hire on Fiverr ↗ ]
────────────────────────────────────────────────────────────────
   Look like the brand
   you're becoming.
   [ Start on Fiverr ]  [ View the work ↓ ]
────────────────────────────────────────────────────────────────
   Logo Design   Brand Guidelines   Logo Animation
   Social Media Kit   Stationery Design
────────────────────────────────────────────────────────────────
```

A visitor reads what the studio does before being asked to choose between its
services. The sticky bar keeps only the wordmark and the Fiverr button.

That placement deleted a whole mechanism. Because the links are in the
document flow they simply wrap — so there is **no mobile menu, no dialog, no
focus trap, no hamburger and no breakpoint to maintain**. Every service name
is visible at every width, with or without JavaScript, and `ServiceNav.astro`
ships zero lines of script. The row carries the `.container` class for its
width and gutter, so it aligns with the rest of the page; note that it uses
`margin-block: 0` rather than `margin: 0`, because the shorthand would
silently kill `.container`'s `margin-inline: auto` and shove the row against
the left gutter.

The row is built from `categories.json`, so adding, renaming, reordering or
deactivating a service updates the nav, the footer and the homepage together.
Whichever service is listed first is the one the site leads with.

Case studies do not carry the row: they have a "Back to <service>" link and
the footer, and the point of that page is the work.

### How work is split across pages

The homepage does not hold the portfolio. **Every service gets a section** —
just its name, up to two covers, and a link out:

> **Brand Guidelines**
> ▢ ▢
> *See all 6 Brand Guidelines projects →*

The heading is the service name and nothing else: no count, no strapline. The
work is the argument, and a row of covers under a name says more than a
sentence explaining the name would.

A service with nothing published still gets its section — the name and the
link, no empty grid. That is not a failure state on a portfolio: it says the
studio offers the thing and has not shown it yet, which is true and is what a
visitor scanning the range needs to know. Publish a project under it and the
covers appear on the next build with no other edit.

The rest of a service's work, and the filters for it, live on
`/<service-id>/`. A set of two has nothing worth filtering; a set of six does.
Change `PREVIEW_COUNT` in `src/pages/index.astro` to show more or fewer.

Which two appear is `order` — the lowest-numbered projects in that service
come first, so it is a content decision. The hand-off link names what is
behind it (*"See all 6…"*), and falls back to *"About Logo Design"* when the
preview already shows everything there is, rather than promising more.

**The running order is a content edit.** Whichever service is listed first in
`categories.json` opens the portfolio, so the strongest body of work leads by
being listed first — no code involved. That order also drives the service nav
and the footer, so all three agree.



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
| Which homepage section a project lands in | Projects → *the project* → Service | same |
| Grid order | Projects → *the project* → Grid position | same |
| A service's opening argument | Site settings → Services → *the service* → Opening paragraph | `src/data/categories.json` |
| A service's promise line | Site settings → Services → *the service* → Outcome | `src/data/categories.json` |
| Header / footer / homepage order | Site settings → Services — reorder the list | `src/data/categories.json` |

### The Fiverr URL

One value, used by every call to action on the site — header, hero, service
pages, case studies and the footer. Set it in
**Site settings → Brand & links → Fiverr profile URL**
(`fiverrUrl` in `src/config/site.json`).

### Numbers on the homepage

The two counts in the hero — projects published, industries served — are
counted from the content at build time. They cannot drift out of date and
they are not claims that need defending.

There are no testimonials, client logos or performance stats anywhere on the
site, and no field to put them in. Add one only by building it deliberately,
with the client's own words and their permission.

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

1. **`intent`** — the strategic idea in about 70 characters. It is the
   standfirst on the case study, the line under each prev/next link, and the
   meta description search engines show. Cards stay a title and a service ·
   industry label, so this is what carries the thinking.
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
5. **`extras`** — tick these accurately. They are listed on the case study,
   and they are what surfaces a project on the Stationery and Social Media
   service pages via `relatedExtras`.
6. **`category`** — which homepage section the project lands in, and which
   service page counts it as its own work. The single most structural field.
7. **`industry`** — also the Industry filter's options. Two projects sharing a
   spelling group together; a typo makes a category of one.

Covers are shown **whole, at whatever proportion they were made in** — nothing
is cropped to a house ratio, so a cover keeps the composition it was designed
with. Aim for ≥1600px wide.

Hand-assembled sets still work — list images in `index.json`'s `images` array
yourself and skip ingest. Aim for ≥1600px wide sources.

### Add or change a service

Services live in `src/data/categories.json` (CMS: **Site settings →
Services**). One entry drives three things: the project tag, the page at
`/<id>/`, and the row in the service nav and the footer.

- `relatedExtras` is how a service with no standalone case study still shows
  real work on its own page. Stationery lists `"Stationery Design Kit"` and
  `"Business Card"`, so guideline projects that included one appear under
  *"Also delivered as part of these identity projects"*. Spelling must match
  the extra exactly.
- `active: false` removes a service from the nav, the footer and the
  homepage — but keeps its URL alive, so old links never 404.

Adding a **new** service id also means adding it to the Projects → Service
options in `public/admin/config.yml`.

## Design system

- Tokens (colour, fluid type scale, spacing, weights, shadows, image
  treatment, motion) live in `src/styles/tokens.css`. Every component consumes
  tokens — change a token, change the site.
- Shared primitives live in `src/styles/global.css`: `.section`,
  `.section-head`, `.overline`, `.button` (+ `--primary/--outline/--paper/
  --ghost/--lg`), `.link-arrow`, `.spec-list`, `.tag`, `.media`.
- Type: **Schibsted Grotesk**, one self-hosted variable file (latin subset,
  ~46 KB) used for everything — headlines, interface and body. A grotesk with
  some editorial warmth rather than a neutral UI face: a portfolio's type
  should have a point of view. A single family means the only typographic
  contrast is size, weight and space, so nothing in the chrome competes with
  the artwork. Metric overrides on the `@font-face` keep the fallback swap
  from shifting a single line.
- Whitespace is the only decoration. The large spacing steps (`--space-lg`
  and up) are where the look actually lives — shrink them and the design
  stops working long before anything breaks.
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

## Deploying — Hostinger, straight from GitHub

The site is hosted on **Hostinger** at <https://portfolio.xstudioz.com>,
deployed by Hostinger's own GitHub integration. Nothing else is involved: it
watches `main`, runs the build on push and publishes the resulting `dist/`.
SSL, the CDN and auto-deployment are handled on their side.

Because every CMS save is a commit to `main`, editing content in `/admin/` is
what triggers a deploy. A build takes a few minutes, most of it spent
rendering PDF pages through sharp and pdfjs.

Hostinger panel settings for this project:

| Setting | Value |
| --- | --- |
| Framework | Astro |
| Branch | `main` |
| Node version | 22.x |
| Root directory | `./` |
| Build and output | Default (resolves to `npm run build`) |

That last row matters: the build **must** run `npm run build`, not
`astro build`. `scripts/ingest.mjs` is what renders every PDF into page images
and generates the grid covers — skip it and every project fails the "has a
cover and images" check, producing a site that builds cleanly with an empty
portfolio.

### Server configuration

`public/.htaccess` is the only server config, and Astro copies it into `dist/`
on every build: immutable caching for the content-hashed `_astro/` assets, no
caching for HTML so CMS edits appear immediately, the custom 404, HTTPS
enforcement, compression and correct MIME types. There is no platform-specific
config file — the whole deployment is "build, then upload `dist/`", which
works on any Apache/LiteSpeed host.

### Build memory

Hostinger's builder has run out of memory on this project before. The cause
was image transforms multiplying across a 45-page deck; the build now emits
around 600 variants rather than 1,900, and `dist/` lands near 12 MB. Two rules
keep it there:

- WebP only, never AVIF as well (`formats={['webp']}`).
- Three responsive widths per displayed image, not four.

Case studies now render only the hero plus the curated pages at display size,
so adding projects grows the build roughly linearly rather than by deck length.

### Changing the production URL

`url` in `src/config/site.json` drives canonicals, the sitemap, `robots.txt`
and social cards. It is a content edit, not a code one — *Site settings →
Brand & links → Production URL* in the CMS. Whatever it is set to must be the
hostname the site is actually served from, or search engines will be told to
index a page that isn't there.

The DNS record for that hostname has to point at Hostinger. If it was
previously pointed elsewhere, change it in the domain's DNS zone before the
certificate can be issued.
