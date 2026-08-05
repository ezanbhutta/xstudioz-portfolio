# The database — MySQL on Hostinger

## Read this first: what a database does and does not change here

The site is **statically built**. Hostinger runs `npm run build` on every push
to `main` and publishes the resulting `dist/` — plain HTML, CSS and images.
There is no PHP and no Node process running when a visitor loads a page.

That has one consequence worth being blunt about:

> **A database cannot serve this site.** Nothing on the page queries MySQL at
> request time, because there is nothing running to query it. The database can
> only feed the **build**.

So changing a row does not change the site. A rebuild does. That is true of
the current setup too — every CMS save is a commit, and the commit is what
triggers the rebuild — but with MySQL the rebuild is no longer automatic,
because editing a table is not a git push. See "The catch" below.

## Setup

### 1. Create the database

hPanel → **Websites → Manage** (pick `portfolio.xstudioz.com`) → search
**Management** in the sidebar → **Create a New MySQL Database And Database
User**.

| Field | Value |
| --- | --- |
| Database name | `portfolio` (becomes `u123456789_portfolio`) |
| Username | `portfolio` (becomes `u123456789_portfolio`) |
| Password | 8+ characters, at least one number, one uppercase, one lowercase |

Hostinger prefixes both with your account number and that prefix cannot be
changed. Each database gets exactly one user on shared hosting.

Click **Create**. Write down the **full** names including the prefix.

### 2. Create the tables

hPanel → **Databases → phpMyAdmin** → open the new database → **Import** tab →
choose `db/schema.sql` from this repo → **Go**.

### 3. Load the current portfolio into it

```sh
npm run export-sql        # regenerates db/seed.sql from src/content + src/data
```

Then import `db/seed.sql` the same way. It is safe to re-import: every
statement is an upsert, and deck pages are replaced per project so a page
removed from a shorter deck also disappears from the table.

That gets you 5 services, 8 projects, 228 deck pages and 11 settings.

### 4. Remote access — only if the build will read the database

The build does not run on your hosting account, so it reaches MySQL from
outside. hPanel → **Websites → Dashboard** → **Remote MySQL**:

- **Any Host** — tick it. This writes `%` into the IP field, allowing a
  connection from any address. It is required because Hostinger's build runner
  has no fixed IP to whitelist.
- **Database** — the one you just created.
- **Create**, then copy the **MySQL server hostname** shown above the form.
  The port is **3306**.

**Understand what you just did.** `%` means the only thing standing between
your database and the internet is the password. Use a long random one, never
commit it, and set it as an environment variable in Hostinger's deployment
settings rather than in any file. If you would rather not open the port at
all, see "Keeping it closed" below.

## Where the images go

Images are **not** in the database. 236 deck pages and covers are 62 MB;
that does not belong in a table, and MySQL is not a CDN. `projects.cover` and
`project_images.src` store paths, not bytes.

This is the part of the current setup that actually degrades over time: those
62 MB live in git, `.git` is already 39 MB, and git keeps every version of
every binary forever. Each new project adds roughly 8 MB permanently. Moving
the files to a folder on the hosting account (or any object store) and keeping
only paths in the database is the change that fixes it.

## The catch

Two things get worse the moment content moves out of the repo, and both are
worth solving deliberately rather than discovering later:

1. **Editing.** `/admin/` is Sveltia, which is a *git-based* CMS: it reads and
   writes files in this repository through the GitHub API. It cannot read
   MySQL. Move the content and the editor stops working, leaving phpMyAdmin's
   raw table editor — no field hints, no validation, no image upload — unless
   a replacement admin is built.

2. **Publishing.** Today a save is a commit and the commit triggers the
   rebuild, so an edit is live a few minutes later with no further action.
   A row edited in phpMyAdmin triggers nothing. Something has to kick the
   build: the **Deploy** button in hPanel by hand, or a small script that
   commits the exported SQL back to the repo.

## The arrangement in use: mirror

**Git is the source. MySQL is a mirror.** Remote MySQL is not enabled and
port 3306 is closed, so step 4 above does not apply — it is documented only
in case the arrangement changes.

What that means day to day:

- Content is edited in `/admin/` exactly as before. Every save commits to
  `main`, and the commit triggers the rebuild. Nothing about publishing
  changes.
- The build reads the repository, never the database. A site deploy cannot
  be affected by the database being down, slow, or wrong.
- `npm run export-sql` regenerates `db/seed.sql`. Importing it in phpMyAdmin
  brings the mirror back in step.

The database's job is to be a queryable copy: something to report off, hand to
another tool, or migrate from later, without a query ever sitting between a
visitor and a page.

### Keeping the mirror in step

An edit in `/admin/` updates the repo and does not touch MySQL, so the mirror
drifts silently and the drift is invisible until someone imports a months-old
file. The build therefore runs `export-sql --check` on every deploy, which
compares what the content *would* generate against the committed `seed.sql`
and prints a warning when they differ.

It warns rather than fails on purpose. A stale mirror is a bookkeeping
problem, not a broken site, and taking production down to report one would be
the wrong trade. To check by hand at any time:

```sh
npm run check-sql
```

When it reports stale, refresh in two steps:

```sh
npm run export-sql        # rewrites db/seed.sql
```

then import `db/seed.sql` in phpMyAdmin as in step 3. Both are safe to repeat.

### If the database should ever become the source

It would need three things, and all three are real work rather than a switch:
Remote MySQL opened to `%` (making the password the only guard), a replacement
for `/admin/` — Sveltia is a git-based CMS and cannot read MySQL — and
something to trigger a rebuild after a row changes, because a table edit
publishes nothing on its own.

## Files

| File | What it is |
| --- | --- |
| `db/schema.sql` | Tables. Import once. Safe to re-run. |
| `db/seed.sql` | Generated. The current portfolio as upserts. |
| `scripts/export-sql.mjs` | Regenerates `seed.sql` from the repo's content. No database connection, no new dependency. |
