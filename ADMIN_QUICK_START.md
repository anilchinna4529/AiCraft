# ⚡ Admin Dashboard v1.3 — Quick Start (15 Minutes)

## Done ✅ (Already Implemented)

- Backend: 13 admin API routes with Resend email integration
- Frontend: Admin dashboard with 6 tabs
- Database schema: 5 SQL migrations ready to run
- Auth hooks: Login tracking integrated
- Styling: Complete dark theme admin UI

---

## To Do (You) 🚀

### 1️⃣ Run SQL Migrations (5 min)
```
Supabase Dashboard → SQL Editor → New Query
Copy & paste all 5 migrations from ADMIN_SQL_MIGRATIONS.md
Run each one, wait for ✅ success
```

### 2️⃣ Add Environment Variables (2 min)
```
Render Dashboard → Web Service Settings → Environment
Add:
  RESEND_API_KEY=re_3JjR1pgq_7YBG6wai4Vpz4orb5WYgpqkJ
  ADMIN_EMAIL=majjiga.anil@cognizant.com  (use your email, remove after bootstrap)
```

### 3️⃣ Deploy (3 min)
```bash
git add .
git commit -m "feat: add admin dashboard v1.3"
git push origin main
# Render auto-deploys
```

### 4️⃣ Bootstrap Admin (3 min)
```
1. Login to app → https://aicraft.onrender.com/login.html
2. Verify OTP, login to dashboard
3. F12 → Console, run:
   const s = await (await fetch('/api/config')).json()
   const a = JSON.parse(Object.entries(localStorage).find(([k])=>k.includes('auth'))?.[1])
   fetch('/api/admin/seed-admin',{method:'POST',headers:{Authorization:'Bearer '+a.access_token}}).then(r=>r.json()).then(console.log)
4. See { "success": true } → Remove ADMIN_EMAIL from Render → Redeploy
5. Visit https://aicraft.onrender.com/admin.html → Admin dashboard loads! ✅
```

### 5️⃣ Test (2 min)
```
Admin Panel → Users → "Create User"
Fill form → Click Create
Admin Panel → Users → See new user in list
Check your email for "✅ New User Created" alert from Resend
```

---

## Files to Know

| File | Purpose | Status |
|------|---------|--------|
| `public/admin.html` | Admin dashboard UI | ✅ Ready |
| `public/admin.css` | Admin styles | ✅ Ready |
| `server.js` | 13 routes + Resend + adminMiddleware | ✅ Ready |
| `public/auth.js` | Login tracking hooks | ✅ Ready |
| `public/dashboard.html` | Admin link (for admins only) | ✅ Ready |
| `ADMIN_SQL_MIGRATIONS.md` | SQL to run in Supabase | ✅ Ready |
| `ADMIN_DASHBOARD_DEPLOYMENT.md` | Full deployment guide | ✅ Complete |

---

## Admin Capabilities

✅ View all users + filter/search  
✅ Create users (no OTP needed)  
✅ Disable/Freeze/Re-enable users  
✅ Promote users to admin  
✅ Delete users  
✅ Track all login attempts  
✅ View analytics (signup trends, login success/failure, sectors)  
✅ Security alerts (suspicious logins)  
✅ Audit log (all admin actions)  
✅ Email alerts via Resend  

---

## Verification Checklist

- [ ] All 5 SQL migrations run successfully in Supabase
- [ ] RESEND_API_KEY added to Render env vars
- [ ] ADMIN_EMAIL added to Render env vars (temporarily)
- [ ] `git push origin main` — Render deploying
- [ ] Login & run bootstrap script in console
- [ ] `{ "success": true }` returned
- [ ] ADMIN_EMAIL removed from Render env vars
- [ ] Render redeployed after removing ADMIN_EMAIL
- [ ] `/admin.html` loads without redirect
- [ ] Can view Overview, Users, Login Logs, Analytics, Security, Audit tabs
- [ ] Create user button works
- [ ] Email alert received from Resend

---

## Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| SQL migration fails | Check table doesn't already exist in Supabase |
| Admin link not showing | User not admin (`is_admin=false`) — bootstrap again |
| `/admin.html` redirects | Not authenticated — login first, then visit admin page |
| Email not arriving | Check spam, wait 30s, verify Resend API key in Render |
| Create user fails | Password needs uppercase, number, special char |
| Analytics charts empty | Data appears once users exist — create test user |

---

## Next 24 Hours

1. Deploy (15 min)
2. Test all features (10 min)
3. Invite other admins (5 min each)
4. Monitor `/admin.html` dashboard daily
5. Check email alerts

---

**Questions?** See full guide: `ADMIN_DASHBOARD_DEPLOYMENT.md`

**Ready to go?** Start with Step 1 above! 🚀
