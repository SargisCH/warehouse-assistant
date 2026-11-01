# Warehouse Assistant

Private developer workspace for reviewing Warehouse feedback and implementation plans. Plans stay in the existing PostgreSQL database. The app renders and edits Markdown, copies a selected plan into an AI-ready prompt, and uses the existing approval and implementation workflow. It never grants access through an email URL.

## Run locally

```sh
npm ci
cp .env.example .env
# Configure the values described below.
npm start
```

The development URL is `http://localhost:3006`.

Configure:

- `REACT_APP_API_URL`: existing Warehouse backend API, including `/api/v1/`.
- `REACT_APP_COGNITO_USER_POOL_ID`: the same user pool as Warehouse.
- `REACT_APP_COGNITO_CLIENT_ID`: a dedicated public app client in that pool, without a client secret. Enable the same SRP authentication flow used by the current Warehouse app. Existing accounts and passwords are reused. Password challenges and common SMS/email/TOTP code challenges are supported; additional enrollment flows can be completed in the main app.
- `REACT_APP_WAREHOUSE_URL`: optional browser URL of the app under review.

These are public frontend settings. Do not put AWS credentials, Gemini keys or a Cognito client secret here. They are compiled into the frontend build.

On the backend, set `COGNITO_USER_POOL_ID` to the same pool and `ASSISTANT_APP_URL=http://localhost:3006` so CORS permits this app. Apply the backend migrations through `0013_assistant_plan_email`, then assign existing developer accounts:

```sh
# In warehouse-backend
npm run assistant:access -- developer@example.com DEVELOPER
```

CONTRIBUTOR and NONE accounts cannot enter the workspace. API checks enforce permission and tenant boundaries independently of the UI. Authentication stays scoped to this app's origin/client; automatic sign-in across both applications is not implemented.

## Links and review

- `/`: inbox, with filters and search across the most recent 100 conversations returned by the existing API.
- `/threads/<thread-id>`: discussion and latest plan.
- `/plans/<plan-id>`: exact immutable plan version, used in notification emails.

Opening a plan, editing it, or copying it never starts coding. Approve & start requires explicit confirmation and uses the exact latest plan ID. Backend concurrency and stale-feedback checks remain authoritative. Markdown is rendered as React text nodes with a small supported subset; raw HTML is never executed. Copy for AI uses the clipboard (with a legacy fallback), without downloading a file or publishing the plan.

## Email delivery

The outbox and email worker stay in `warehouse-backend`, alongside its Gemini planning/coding worker. No additional worker repository or project is needed. Email uses Resend's free-tier REST API, not AWS SES or SMTP.

Configure these worker-only settings: `ASSISTANT_EMAIL_ENABLED=true`, `ASSISTANT_EMAIL_FROM`, `RESEND_API_KEY`, and this app's HTTPS origin in `ASSISTANT_APP_URL`. Use a sender approved for the intended recipients; arbitrary recipient delivery requires domain verification. No email API key belongs in this frontend.

Notifications go to current developers in the feedback's tenant for new AI-created plans, not manual edits. Links require normal sign-in and open the exact requested version. Configure `.env.worker` from `.env.worker.example` in warehouse-backend, then run `DOTENV_CONFIG_PATH=.env.worker npm run assistant:worker` (or optionally `assistant:email-worker`) from that same repo. The planning/coding worker automatically finds the backend checkout and sibling warehouse-frontend. No repository-path variables are needed for the standard layout; this frontend and the HTTP API do not need repository access.

Full setup, worker limits and recovery instructions: [backend assistant documentation](../warehouse-backend/docs/assistant.md).

## Build and deploy

```sh
npm run build
CI=true npm test -- --watchAll=false --runInBand
```

Deploy `build/` to your static host with HTTPS. Configure a fallback rewrite to `/index.html` for all app routes, including `/plans/*` and `/threads/*`; otherwise email links will return hosting 404 errors. Set the backend/worker `ASSISTANT_APP_URL` to this exact origin and restart them. There is no public plan-sharing endpoint and no separate object/file storage.

### Cloudflare Pages

The workflow `.github/workflows/deploy-pages.yml` tests, builds and directly
uploads to Pages on pushes to `main` or manual runs. No Cloudflare GitHub
connection is required. Create a Direct Upload Pages project first, with
production branch `main`.

In GitHub **Settings → Secrets and variables → Actions**, configure repository
secrets:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | API token with Account → Cloudflare Pages → Edit for the target account |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `API_URL` | Backend HTTPS URL ending in `/api/v1/` |

Configure repository variables:

| Variable | Value |
| --- | --- |
| `CLOUDFLARE_PAGES_PROJECT` | Existing Direct Upload Pages project name |
| `COGNITO_USER_POOL_ID` | Existing Warehouse user pool ID |
| `COGNITO_CLIENT_ID` | Public app client ID with SRP enabled and no client secret |
| `WAREHOUSE_URL` | Optional HTTPS business-app URL |

Frontend settings are compiled into the build in GitHub Actions; changing Pages
build environment settings will not change these direct uploads. Never put
backend, Gemini or Resend secrets in frontend settings. Push to `main` or use
**Actions → Deploy assistant to Cloudflare Pages → Run workflow**.

The included `public/_redirects` provides the SPA fallback for plan and thread
links. After the first deployment, set `ASSISTANT_APP_URL` in both
`/srv/warehouse-api/shared/.env` and `.env.worker` to the exact Pages or custom
HTTPS origin (without a path). Restart `warehouse-api` and
`warehouse-assistant-worker`. Verify developer login, the inbox, and a plan link
opened directly in a fresh tab. Existing plans are available without email.

Cloudflare Access can additionally guard the dashboard domain. The dashboard
continues using Cognito to authenticate its requests to the existing backend.
