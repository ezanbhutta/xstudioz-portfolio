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

## Keeping it closed

If the build reads the database over the open internet, step 4 is required.
If instead `npm run export-sql` keeps running locally and its output is
committed, the database is never exposed: git stays the source the build
reads, and MySQL is a queryable mirror. That is the safer arrangement and
needs no Remote MySQL at all.

## Files

| File | What it is |
| --- | --- |
| `db/schema.sql` | Tables. Import once. Safe to re-run. |
| `db/seed.sql` | Generated. The current portfolio as upserts. |
| `scripts/export-sql.mjs` | Regenerates `seed.sql` from the repo's content. No database connection, no new dependency. |
