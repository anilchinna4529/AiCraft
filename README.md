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
