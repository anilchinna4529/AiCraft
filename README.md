# AICraft

> The premium directory for curated AI tools — built for developers, creators, and businesses.

[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## ✨ What is AICraft?

AICraft is a hand-curated catalog of AI tools with a clean, Apple/Framer‑inspired interface. It lets visitors **discover, favorite, and review** the best AI products across every sector — and gives creators a place to submit and showcase their work.

**Phase 1 (shipped)**
- Premium redesign (design system, animations, dark/light theme)
- Full auth flow: signup → OTP verification → login → password reset
- Tool directory with search, sector / price filters, and pagination
- Tool detail pages with images, descriptions, reviews, ratings
- User favorites (save to dashboard) and 5‑star reviews
- Personal dashboard with 4 tabs (Favorites / My Tools / My Reviews / Profile)
- REST API (documented at `/api-docs.html`)
- Email notifications via Resend
- SEO ready: sitemap, robots.txt, meta tags, theme‑color, semantic HTML

**Phase 2 (roadmap)**
- Stripe checkout for Pro / Team plans
- Supabase Storage avatar upload
- Admin moderation UI for reviews and submissions
- Full admin dashboard polish

---

## 🧱 Tech Stack

| Layer        | Stack                                         |
|--------------|-----------------------------------------------|
| Server       | Node.js 18+, Express                          |
| Database     | Supabase (Postgres + Row‑Level Security)      |
| Auth         | Supabase Auth (email OTP + password)          |
| Email        | Resend                                        |
| Frontend     | Vanilla HTML / CSS / ES‑module JS (no build)  |
| Hosting      | Vercel / Railway / any Node host              |

---

## 🚀 Quick Start

### 1. Clone and install
```bash
git clone https://github.com/your-org/aicraft.git
cd aicraft
npm install
```

### 2. Set env variables
Create a `.env` file in the project root:

```bash
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Email (Resend)
RESEND_API_KEY=re_xxx
MAIL_FROM="AICraft <no-reply@aicraft.co>"

# App
PORT=3000
APP_URL=http://localhost:3000
```

### 3. Run database migrations
Open Supabase Studio → **SQL Editor** and execute the files in order:

1. `migrations/001_initial_schema.sql` (if present)
2. `migrations/002_premium_features.sql` — adds `favorites`, `reviews`, profile fields, and the `tool_ratings` view
3. `migrations/003_admin_moderation.sql` — adds `status`, `rejection_reason`, `featured` to `ai_tools` for the approval workflow
4. `migrations/004_salesforce_webapp.sql` — adds the Salesforce Developer Toolkit tables (tokens, org info, OAuth states, API logs, metadata cache)

### 4. Start the server
```bash
npm start
# or for dev
npm run dev
```

Open http://localhost:3000 🎉

---

## 📁 Project Structure

```
AiCraft/
├── server.js                 # Express app + all API routes
├── supabaseClient.js         # Supabase SDK singleton
├── worker.js                 # Background worker (email queue etc.)
├── migrations/               # SQL migrations
│   └── 002_premium_features.sql
├── public/                   # Static front‑end (served by Express)
│   ├── index.html            # Landing
│   ├── ai-tools.html         # Tool directory
│   ├── tool-detail.html      # Single tool page
│   ├── sectors.html          # Browse by sector
│   ├── pricing.html          # Plans
│   ├── login.html · signup.html · verify.html · reset-password.html
│   ├── dashboard.html        # User dashboard
│   ├── admin.html            # Admin dashboard
│   ├── about.html · contact.html · blog.html · careers.html
│   ├── community.html · press.html · support.html
│   ├── api-docs.html · status.html
│   ├── privacy-policy.html · terms-of-service.html
│   ├── style.css · pages.css · admin.css
│   ├── site.js               # Shared UI behaviour (nav, theme, toast, api())
│   ├── auth.js               # Supabase auth helpers
│   ├── sitemap.xml · robots.txt
└── README.md
```

---

## 🔌 REST API

Full reference: [public/api-docs.html](public/api-docs.html)

Protected routes require a Supabase access token in the `Authorization` header:
```
Authorization: Bearer <access-token>
```

| Method | Endpoint                         | Auth | Description                    |
|--------|----------------------------------|:----:|--------------------------------|
| GET    | `/api/tools`                     |   —  | List tools (filters, paging)   |
| GET    | `/api/tools/:id`                 |   —  | Single tool                    |
| GET    | `/api/sectors`                   |   —  | All sectors                    |
| GET    | `/api/tools/:id/reviews`         |   —  | Reviews for a tool             |
| POST   | `/api/tools/:id/reviews`         |   ✓  | Post a review                  |
| GET    | `/api/favorites`                 |   ✓  | My favorites                   |
| POST   | `/api/favorites`                 |   ✓  | Add favorite                   |
| DELETE | `/api/favorites/:toolId`         |   ✓  | Remove favorite                |
| GET    | `/api/reviews/mine`              |   ✓  | My reviews (with tool names)   |
| GET    | `/api/profile`                   |   ✓  | My profile                     |
| PUT    | `/api/profile`                   |   ✓  | Update profile                 |
| GET    | `/api/admin/reviews`             |  ✓🛡️ | List reviews (moderation)      |
| DELETE | `/api/admin/reviews/:id`         |  ✓🛡️ | Delete a review                |
| GET    | `/api/admin/tools?status=pending`|  ✓🛡️ | List tools by status           |
| PUT    | `/api/admin/tools/:id`           |  ✓🛡️ | Approve / reject / feature     |
| POST   | `/api/checkout/session`          |   ✓  | Stripe checkout (Phase 2 stub) |

🛡️ = admin role required (`users.is_admin = true`).

---

## 🚢 Deploy to Render

1. Push the repo to GitHub.
2. In Render, click **New → Blueprint** and select the repo.
   The included [`render.yaml`](render.yaml) provisions a Node web service.
3. Set the following environment variables in the Render dashboard (see [`.env.example`](.env.example)):
   - `SITE_URL`, `ALLOWED_ORIGINS`
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY` (optional — email sending skips gracefully if unset)
   - `FROM_EMAIL`
4. Run the SQL migrations in Supabase Studio (see **Quick Start** above).
5. Open `https://your-app.onrender.com/api` — you should see a JSON health check.

The server already includes: `trust proxy`, `0.0.0.0` binding, graceful `SIGTERM` shutdown, CORS whitelist, rate-limit bucket pruning, and a JSON 404 handler for unknown API routes.

---

## ⚡ Salesforce Developer Toolkit

AiCraft ships with a browser-based Salesforce developer workspace at **`/salesforce-dev/`**, backed by API routes under **`/api/salesforce/*`**. Sixteen modules — Query Runner, SOQL Builder, Metadata Explorer, Schema Viewer, Org Manager, Org Comparator, Data Loader, Bulk Manager, sMock-it, Apex Debug, Log Debugger, Package.xml, Reports & Insights, Event Monitor, AI Assistant, and Tool Suite — let a logged-in AiCraft user connect one or more Salesforce orgs and work with them without installing a Chrome extension.

### How it works
- **Auth:** OAuth 2.0 Authorization Code flow with PKCE. The server stores access/refresh tokens encrypted with AES-256-GCM (key = `SF_ENCRYPTION_KEY`). Every API call is scoped by `(user_id, org_id)` so multi-tenancy is enforced at the DB layer.
- **Reuse:** The existing Supabase `authMiddleware` and `rateLimit` gate every Salesforce endpoint — no new auth stack.
- **No new dependencies:** Uses the built-in `node:crypto` and global `fetch`. Zero additions to `package.json`.

### Setup
1. In Salesforce, create a **Connected App** (Setup → App Manager → New Connected App):
   - Enable OAuth Settings
   - Callback URL: `${SITE_URL}/api/salesforce/auth/callback`
   - Selected OAuth Scopes: **Manage user data via APIs (`api`)**, **Perform requests at any time (`refresh_token`, `offline_access`)**, **Access the identity URL (`id`, `profile`, `email`, `address`, `phone`)**
   - PKCE: set "Require Proof Key for Code Exchange" → **Require**
2. Fill the new env vars in your `.env` (see [`.env.example`](.env.example)):
   ```bash
   SALESFORCE_CLIENT_ID=
   SALESFORCE_CLIENT_SECRET=
   SALESFORCE_LOGIN_URL=https://login.salesforce.com
   SALESFORCE_SCOPES=api refresh_token offline_access id
   SF_API_VERSION=v62.0
   SF_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
   ```
3. Run migration `004_salesforce_webapp.sql` in Supabase Studio.
4. Start the server and visit `/salesforce-dev/` while logged in.

Verify the configuration quickly:
```bash
# Public readiness (no auth required)
curl http://localhost:3000/api/salesforce/status

# Full diagnostic (requires a Supabase JWT from localStorage.aicraft_token)
npm run smoke:sf -- --base http://localhost:3000 --token <jwt>
```
The smoke test checks `/status`, `/health` (env + crypto + DB reachability), `/orgs`,
and if any org is connected, also `/limits` and a `SELECT Id, Name FROM Account LIMIT 1`.

### Key files
| Path | Purpose |
|------|---------|
| [`salesforce/routes.js`](salesforce/routes.js) | Express router mounted at `/api/salesforce` |
| [`salesforce/salesforceClient.js`](salesforce/salesforceClient.js) | REST / Tooling client with auto-refresh on 401 |
| [`salesforce/oauth.js`](salesforce/oauth.js) | PKCE helpers + authorization-URL / callback handlers |
| [`salesforce/crypto.js`](salesforce/crypto.js) | AES-256-GCM token encryption + PKCE verifier/challenge helpers |
| [`salesforce/tokenStore.js`](salesforce/tokenStore.js) | Supabase-backed persistence for tokens, org info, OAuth state, audit log |
| [`salesforce/metadataCache.js`](salesforce/metadataCache.js) | Per-user, per-org describe cache |
| [`public/salesforce-dev/`](public/salesforce-dev/) | Vanilla ES-module UI shell + 16 module files |

### Security notes
- **SOQL allow-list.** `assertSafeSoql` rejects anything other than `SELECT`/`FIND` and caps length at 20,000 chars.
- **No token leakage.** The audit log (`salesforce_api_logs`) stores only endpoint/method/status/duration — never tokens or response bodies.
- **Open-redirect safe.** `oauth.js` only accepts `login.salesforce.com`, `test.salesforce.com`, and `*.my.salesforce.com` as authorization hosts.
- **Per-user isolation.** Every DB query is filtered by `user_id`; every Salesforce client is built via `getClient(userId, orgId)`.

---

## 🎨 Design System

Design tokens live in `public/style.css` (lines 1–150):

- **Colors:** `--primary` `#7c6cff`, `--secondary` `#18e0ff`, semantic `--success/--warning/--danger`
- **Surfaces:** `--bg`, `--bg-elevated`, `--surface`, `--border`
- **Text:** `--text`, `--text-muted`, `--text-dim`
- **Radii:** `--r-xs` (6px) → `--r-xl` (28px) → `--r-full`
- **Spacing:** `--s-1` (4px) → `--s-20` (80px)
- **Motion:** `--t` (.24s), `--ease` cubic‑bezier

Component classes are in `public/pages.css`:
`.page-hero`, `.page-wrap`, `.feature-grid`, `.value-grid`, `.pricing-grid`, `.blog-grid`, `.contact-grid`, `.docs-layout`, `.auth-shell`, `.dash-shell`, `.otp-group` / `.otp-digit`, `.service-row`, `.status-indicator`.

---

## 🧪 Testing

No formal test suite yet. Manual smoke‑test checklist:

- [ ] Sign up → receive OTP → verify → logged in
- [ ] Forgot password → reset via email link
- [ ] Browse tools, filter by sector + price, paginate
- [ ] Open a tool, favorite it, post a review
- [ ] Dashboard shows favorite, review, and profile edit works
- [ ] Theme toggle persists across reload
- [ ] Status page pings `/api/sectors` and updates live

---

## 🤝 Contributing

1. Fork and create a branch: `git checkout -b feature/my-feature`
2. Keep PRs focused — one feature per PR
3. Follow existing class names (see "Design System" above)
4. Run Prettier + ESLint before pushing (config TBD)

---

## 📄 License

[MIT](LICENSE) © AICraft

---

## 🙏 Credits

- Fonts: [Inter](https://rsms.me/inter/), [JetBrains Mono](https://www.jetbrains.com/lp/mono/)
- Database & auth: [Supabase](https://supabase.com)
- Email: [Resend](https://resend.com)
- Design inspiration: Apple · Framer · Linear
