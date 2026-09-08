# Deploy to MilesWeb with GitHub Actions (SSH)

This project ships a GitHub Actions workflow (`.github/workflows/deploy.yml`)
that automatically deploys to your **MilesWeb** hosting over **SSH** every
time a pull request is opened or pushed to. Credentials are never committed —
they are read from **repo secrets**.

---

## 1. What the workflow does

1. Logs into your MilesWeb server over SSH (using your username + password).
2. Runs the deploy commands from the `script:` block of the workflow.

It triggers on:
- `pull_request` (opened / synchronize / reopened) — *as you requested*, and
- `workflow_dispatch` (manual "Run workflow" button in the Actions tab).

---

## 2. Secrets you must add

**Repo → Settings → Secrets and variables → Actions → New repository secret.**

| Secret name    | Value                                    |
|----------------|------------------------------------------|
| `SSH_HOST`     | Server hostname/IP, e.g. `123.45.67.89`  |
| `SSH_USERNAME` | Your SSH / cPanel username               |
| `SSH_PASSWORD` | Your SSH / cPanel password               |
| `SSH_PORT`     | *(optional)* SSH port — `22` if not set (cPanel often uses `22` or `21098`) |

These map directly to `secrets.SSH_HOST`, `secrets.SSH_USERNAME`,
`secrets.SSH_PASSWORD`, and `secrets.SSH_PORT` in the workflow.

### Where to find each value in MilesWeb

| Secret          | Where to find it |
|-----------------|------------------|
| `SSH_HOST`      | cPanel → right sidebar "General Information" → **Shared IP Address** (for a VPS: the VPS IP from your provisioning email) |
| `SSH_USERNAME`  | Your **cPanel username** (top-right of cPanel, or in the "Hosting Account Information" email). VPS: `root` |
| `SSH_PASSWORD`  | The **same password you log into cPanel with**. VPS: the root password from the provisioning email |
| `SSH_PORT`      | Usually `22` — MilesWeb uses `7822` on some plans. The exact value is shown on the cPanel **SSH Access** page |

To enable/verify SSH on cPanel: **Security → SSH Access → Manage SSH
Access → choose Jailed Shell (or Shell) → Submit**. The SSH Access page
shows your exact connection command (e.g. `ssh username@203.0.113.5 -p 22`),
which maps 1:1 to the secrets above. On some shared plans SSH is disabled by
default and needs a support ticket to MilesWeb to enable.

Test it locally before adding secrets:
```bash
ssh -p 22 username@your-server-ip   # enter your cPanel password when prompted
```

---

## 3. What the deploy script does (on your server)

The `script:` block is tuned for MilesWeb **Node.js hosting**:

1. **Loads Node via nvm** (`~/.nvm/nvm.sh`) — the Actions SSH shell is
   non-interactive so nvm isn't loaded automatically; skipping this gives
   `npm: command not found`.
2. **`cd "$HOME/know-yourself"`** — the repo is already cloned there.
3. **Checks out the branch that triggered the run** and pulls it.
4. **`npm ci --include=dev` + `npm run build`** — dev deps are required for
   the Next.js build. `next.config.js` pins the build to a single worker
   (`experimental.cpus: 1`) to stay under the host's process limit.
5. **Restarts the app** by stopping the `next start` process — MilesWeb's
   "persistent app" supervisor respawns it with the new build.

If your app is cloned to a different folder, change the `cd` path. If the
restart step doesn't bring the app back, restart it from the MilesWeb Node.js
control panel (Restart button).

> Note: the server's `~/know-yourself` needs read access to the GitHub repo
> for `git fetch` to work. Public repos work out of the box; for a private
> repo, add a deploy key or PAT on the server.

---

## 4. ⚠️ Runtime requirement

Calibiai Score is a **Next.js app with API routes and server actions**, so it
needs a **Node.js runtime**. It will **not** run on plain cPanel shared
hosting (static/PHP only). Use MilesWeb **Node.js hosting** or a **VPS**.

---

## 5. Why there are no build/env secrets in the workflow

The deployment step only needs SSH credentials. Build-time environment
variables (Supabase, DeepSeek, `ADMIN_SECRET`, etc.) belong on **your server**
— set them in the server's `.env` / `.env.local`, or in the MilesWeb control
panel. The app already falls back to local demo mode when they're absent, so
none of them are required for the workflow to run.
