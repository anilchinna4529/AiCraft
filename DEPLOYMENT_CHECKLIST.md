# 🚀 AICraft v1.2 — Quick Deployment Checklist

## Before You Deploy

### 1. ✅ Supabase Configuration (5 min)
```
Dashboard → Auth → Email → Toggle "Confirm email" ON
Dashboard → Auth → Email Templates → Confirm signup → Update template
```

**Template Settings:**
```
Subject: Your AICraft verification code
Body: Your verification code is: {{ .Token }}
```

### 2. ✅ Environment Variables (2 min)
Get these values:
- `SUPABASE_URL` → Supabase Dashboard → Settings → API → Project URL
- `SUPABASE_ANON_KEY` → Settings → API → `anon` `public` key (starts with `sb_`)
- `SUPABASE_SERVICE_ROLE_KEY` → Settings → API → `service_role` key
- `SITE_URL` → Your Render domain (e.g., `https://aicraft.onrender.com`)

### 3. ✅ Git Push (2 min)
```bash
# Verify .env is in .gitignore
cat .gitignore | grep .env

# Check no secrets in git
git status

# Commit all changes
git add .
git commit -m "feat: add authentication system v1.2"
git push origin main
```

### 4. ✅ Render Deployment (10 min)
1. Go to [render.com](https://render.com)
2. Connect GitHub repo
3. New Web Service
4. **Build Command**: `npm install`
5. **Start Command**: `npm start`
6. Add all environment variables
7. Click Deploy
8. Wait for "Deploy live" status

### 5. ✅ Test Production (5 min)
```bash
# API Test
curl https://your-app.onrender.com/api

# Signup Test
# Visit https://your-app.onrender.com/signup.html
# Sign up → Check email for OTP
# Verify OTP → Login → Dashboard
```

---

## Environment Variables Template

Copy these to Render dashboard:

```
SUPABASE_URL=https://ztvjekrysqraofwamewf.supabase.co
SUPABASE_ANON_KEY=sb_publishable_Vwr0JQpU657teKIfDbTUrQ_qp_Gb0qa
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SITE_URL=https://aicraft.onrender.com
NODE_ENV=production
PORT=3000
```

---

## Files Modified/Created

**New Files (6):**
- ✅ `public/auth.js` — Browser auth client
- ✅ `public/signup.html` — Registration
- ✅ `public/verify.html` — OTP verification
- ✅ `public/login.html` — Login
- ✅ `public/dashboard.html` — Protected dashboard
- ✅ `public/reset-password.html` — Password reset

**Modified Files (3):**
- ✅ `.gitignore` — Added `.env`
- ✅ `server.js` — Added auth routes
- ✅ `public/index.html` — Wired navbar buttons

---

## Quick Test Flow (10 min)

1. **Signup** → http://localhost:3000/signup.html
   - Enter email, password
   - Should get OTP email

2. **Verify** → http://localhost:3000/verify.html
   - Enter 6-digit code
   - Redirects to login

3. **Login** → http://localhost:3000/login.html
   - Enter verified email + password
   - Redirects to dashboard

4. **Dashboard** → http://localhost:3000/dashboard.html
   - Shows user profile
   - Shows stats
   - Logout button works

---

## Troubleshooting Quick Fixes

| Issue | Fix |
|-------|-----|
| OTP not arriving | Check Supabase email template uses `{{ .Token }}` |
| CORS error | Add `SITE_URL` env var to Render |
| "Email not confirmed" | User needs to verify OTP first |
| Reset link invalid | Tokens expire in 1 hour, request new reset |
| Stats not loading | Check `/api/stats` works: `curl https://your-app.onrender.com/api/stats` |

---

## Success Checklist ✅

- [ ] All 6 auth pages load
- [ ] Signup sends OTP email
- [ ] OTP verification works
- [ ] Unverified users blocked from login
- [ ] Dashboard only accessible after login
- [ ] Logout clears session
- [ ] Password reset works
- [ ] Mobile responsive
- [ ] No console errors
- [ ] API endpoints responding

---

## Support Files

- Full guide: `AUTH_TESTING_GUIDE.md`
- Implementation plan: `.claude/plans/stateless-giggling-dewdrop.md`
- Supabase setup: Check Supabase Dashboard → Auth settings

---

**Ready to deploy?** Run:
```bash
npm start  # Test locally first
git push   # Then push to GitHub
# Render auto-deploys on push!
```
