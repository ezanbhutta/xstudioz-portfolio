# Switching to Node.js hosting — read the warning first

## ⚠️ Switching destroys the current website, and its databases with it

Hostinger cannot convert an existing static site to a Node.js app in place.
Their documentation is explicit: a Node.js website must be added as a **new**
website, and if the domain is already on the plan the existing website has to
be **removed first**.

> "Before you remove your website, it is strongly advised to download backups
> as this action is **not reversible**, and all files, databases, emails, and
> any configuration **will be lost**."
> — [Hostinger, How to add a Node.js Web App](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)

**`u666480115_XStudiozfolio` is attached to `portfolio.xstudioz.com`.** That is
the database this project was just loaded into. Removing the website may take
it with it, and there is no undo.

### Back up before touching anything

1. hPanel → **Databases → phpMyAdmin** → **Enter phpMyAdmin**
2. Select `u666480115_XStudiozfolio` in the left sidebar
3. **Export** tab → Format **SQL** → **Export**
4. Save the `.sql` file somewhere that is not the hosting account

Also keep `db/schema.sql` and `db/seed.sql` from this repo. Between the two you
can rebuild the database from nothing, but only the export has any edits made
since the seed was generated.

Take the backup even if you believe the database will survive. It costs a
minute; being wrong costs the portfolio.

## Where files live after the switch

Hostinger splits a Node.js deployment across two directories, and the split is
what makes runtime uploads possible at all:

| Path | What it holds | Survives a redeploy? |
| --- | --- | --- |
| `/home/u666480115/domains/portfolio.xstudioz.com/nodejs` | The built app — `dist/`, `node_modules`, everything from git | **No.** Replaced on every deploy. |
| `/home/u666480115/domains/portfolio.xstudioz.com/public_html` | Served directly by Apache/LiteSpeed. Only gets an auto-generated `.htaccess` routing to the app. | **Yes.** |

So uploaded decks go in **`public_html/uploads/`**:

- It is outside the deploy target, so a redeploy cannot wipe it.
- Apache serves it directly, without a request touching the Node process.
- It is on the same account as the database, so nothing leaves Hostinger.

Anything written inside the app directory is temporary by definition. Uploads
must never go there.

## The switch, in order

1. **Back up the database** (above). Not optional.
2. Merge the Node.js branch to `main` so the repo Hostinger deploys is the
   server-rendered version. A static deploy of this branch would serve an
   empty site — there are no prebuilt pages any more.
3. hPanel → **Websites** → remove `portfolio.xstudioz.com`.
4. **Add Website → Deploy Web App → Import Git Repository** →
   `ezanbhutta/xstudioz-portfolio`, branch `main`.
5. Build settings:

   | Setting | Value |
   | --- | --- |
   | Framework | Astro |
   | Node version | 22.x |
   | Build command | `npm run build` |
   | Start command | `node ./dist/server/entry.mjs` |
   | Output directory | `dist` |

6. **Environment variables** — add before the first deploy, or it will build
   and then fail on every request:

   ```
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=u666480115_xstudiozfolio
   DB_PASSWORD=<the password you set>
   DB_NAME=u666480115_XStudiozfolio
   ADMIN_PASSWORD=<a long random password for /admin/>
   SESSION_SECRET=<32+ random characters>
   UPLOADS_DIR=/home/u666480115/domains/portfolio.xstudioz.com/public_html/uploads
   ```

   Optionally also:

   ```
   UV_THREADPOOL_SIZE=2
   ```

   Not required, and the only one of the three thread caps that cannot be set
   from inside the app. This machine reports **64 cores** — the whole shared
   box, not the slice this plan may use — and every native library sizes its
   thread pool from that number. libvips and the canvas runtime are both capped
   in code (`src/lib/sharp.ts`, `src/lib/canvas.ts`), which is what stopped
   uploads failing with `glib: Error creating thread: Resource temporarily
   unavailable`. libuv cannot be: it sizes its pool the first time anything
   uses it, during module loading, long before any of our code runs. Setting it
   here saves a further two or three threads per render. `/health?render=1`
   prints all three, the core count, and the account's process ceiling.

   `UPLOADS_DIR` is not optional in production, and leaving it out fails
   quietly rather than loudly. Unset, it resolves to `public/uploads` relative
   to whatever directory the process was started in — which is inside the
   deployed app. Uploaded decks would then be written into the directory
   Hostinger replaces on the next deploy, and every `/uploads/…` request would
   404 in the meantime. `/health` prints the resolved path and whether it
   exists, so check there first if images are missing.

7. If the database did not survive step 3, recreate it (`db/README.md` steps
   1–3) and import your backup.
8. Point the domain at the new website and confirm SSL is issued.

## Why the database is reached over `localhost`

The Node process and MySQL run on the same machine, so `DB_HOST=localhost`
works and **Remote MySQL stays off**. Port 3306 never opens to the internet
and the password is never the only thing guarding the data. This is the whole
reason the app is hosted on the same account rather than anywhere else.

## After the switch

- **Restart** in the website dashboard restarts the Node process without a
  full rebuild — useful after changing an environment variable.
- **Runtime logs** in the sidebar is where a failed request explains itself.
- A `git push` to `main` still triggers an automatic deploy, exactly as before.
- Content edits no longer need any of that: they are live on the next request.
