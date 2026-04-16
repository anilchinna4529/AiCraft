# 🛡️ AICraft v1.3 — Admin Dashboard Deployment Guide

## Overview
AICraft v1.3 adds a complete admin dashboard system with user management, login tracking, analytics, and security monitoring. This guide walks you through deployment steps.

---

## ✅ What's Been Implemented

### Backend (server.js)
- ✅ **Resend Email Integration** — Admin alerts sent for all critical actions
- ✅ **adminMiddleware** — Role-based access control with ADMIN_EMAIL bootstrap
- ✅ **13 Admin Routes** — Complete REST API for admin operations
- ✅ **Audit Logging** — All admin actions logged to `admin_audit_log` table
- ✅ **Login Tracking** — `POST /api/auth/login-log` endpoint for browser-side tracking

### Frontend
- ✅ **auth.js** — Added `logLoginAttempt()`, `requireAdmin()` helpers + hooks in auth flows
- ✅ **admin.html** — Full 6-tab admin dashboard (Overview, Users, Login Logs, Analytics, Security, Audit)
- ✅ **admin.css** — Complete styling with dark theme integration
- ✅ **dashboard.html** — Admin Panel link (shown only for admin users)

### Database Schema
- ✅ **5 SQL Migrations** documented in `ADMIN_SQL_MIGRATIONS.md`

---

## 🚀 Deployment Steps (In Order)

### Step 1: Run SQL Migrations (Supabase)
**Time: ~5 minutes**

1. Open [Supabase Dashboard](https://supabase.com) → Your Project
2. Click **SQL Editor** (left sidebar)
3. Click **New Query**
4. Copy **all 5 migrations** from `ADMIN_SQL_MIGRATIONS.md` one at a time:
   - Migration 1: Extend `users` table
   - Migration 2: Create `login_logs` table
   - Migration 3: Create `admin_audit_log` table
   - Migration 4: RLS policies (disable on sensitive tables)
   - Migration 5: SQL functions (analytics + security)

5. For each migration:
   - Paste into editor
   - Click **Run**
   - Wait for ✅ success message
   - Move to next migration

**✅ Verify Success:**
- Table Browser → `users` → should have 4 new columns: `is_admin`, `status`, `last_login_at`, `login_count`
- Table Browser → `login_logs` → new table with 8 columns
- Table Browser → `admin_audit_log` → new table with 6 columns
- SQL Editor → Run: `SELECT * FROM get_suspicious_logins();` → should return empty (no alerts yet)

---

### Step 2: Set Environment Variables (Render)
**Time: ~2 minutes**

Add these to your Render Web Service settings:

```
RESEND_API_KEY=re_3JjR1pgq_7YBG6wai4Vpz4orb5WYgpqkJ
ADMIN_EMAIL=your-email@example.com
```

**For bootstrap only (one-time use):**
- Add `ADMIN_EMAIL` temporarily to enable the `/api/admin/seed-admin` endpoint
- After confirming your account is now admin (Step 4), remove `ADMIN_EMAIL` and redeploy
- This ensures no one else can bootstrap admin access

**Complete env vars should include:**
```
SUPABASE_URL=https://ztvjekrysqraofwamewf.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
SITE_URL=https://aicraft.onrender.com
NODE_ENV=production
PORT=3000
RESEND_API_KEY=re_3JjR1pgq_7YBG6wai4Vpz4orb5WYgpqkJ
ADMIN_EMAIL=majjiga.anil@cognizant.com  # Use your email
```

---

### Step 3: Deploy to Render
**Time: ~10 minutes**

```bash
# From your AICraft project directory
git add .
git commit -m "feat: add admin dashboard v1.3 with Resend email integration"
git push origin main
```

Render will auto-deploy. Watch logs on Render Dashboard:
- Go to your Web Service → **Logs** tab
- Look for: `✅ Server listening on port 3000`
- Check for any errors in startup

---

### Step 4: Bootstrap First Admin (One-Time Setup)
**Time: ~2 minutes**

1. Open your app and login normally: `https://aicraft.onrender.com/login.html`
   - Use your email address
   - Verify with OTP
   - Login to dashboard

2. Open browser **Developer Console** (F12 → Console tab)

3. Run this bootstrap script:
   ```javascript
   const session = await (await fetch('/api/config')).json();
   const auth = JSON.parse(Object.entries(localStorage).find(([k]) => k.includes('auth'))?.[1] || '{}');
   const token = auth.access_token;
   
   const response = await fetch('/api/admin/seed-admin', {
     method: 'POST',
     headers: { 'Authorization': `Bearer ${token}` }
   });
   
   console.log(await response.json());
   ```

4. **Expected Output:**
   ```json
   { "success": true, "message": "Admin access granted" }
   ```

5. If success:
   - **Remove `ADMIN_EMAIL` from Render environment variables**
   - Redeploy: `git push` (Render will auto-redeploy)
   - Navigate to `/admin.html` → Admin dashboard loads!

6. If error:
   - Ensure `ADMIN_EMAIL` matches your login email exactly
   - Check Render logs for details

---

### Step 5: Test Admin Dashboard
**Time: ~10 minutes**

1. **Overview Tab**
   - Should show 6 stat cards (Total Users, Active, Disabled, Frozen, Admin, Suspicious Logins)
   - Recent Admin Actions table (empty if first time)

2. **Users Tab**
   - Lists all users with status and role badges
   - Try search/filter
   - Click "Create User" → modal opens
   - Create a test user (no OTP needed for admin-created users)

3. **Login Logs Tab**
   - Shows all login attempts (success/failed/blocked)
   - Filter by email, status, or date
   - Should see your recent login

4. **Analytics Tab**
   - 4 quick stats cards
   - 3 Chart.js charts:
     - Signup Trend (line chart)
     - Login Activity (bar chart: success vs failed)
     - User Distribution by Sector (doughnut chart)

5. **Security Tab**
   - Shows suspicious logins (5+ failures in 24h) — should be empty
   - Lists of Disabled & Frozen users — should be empty
   - "Re-enable" / "Unfreeze" buttons work

6. **Audit Log Tab**
   - Shows all admin actions with timestamps
   - Filter by admin email or action
   - Should see "Admin access granted" from bootstrap

---

### Step 6: Configure Email Alerts (Optional but Recommended)
**Time: ~5 minutes**

Resend is already integrated — admin alerts are sent automatically. To verify:

1. **Trigger a test email** by creating a user from Admin Panel:
   - Admin Users Tab → "Create User"
   - Fill form (name, email, password, sector)
   - Click "Create User"

2. **Check your email** for:
   - Subject: `✅ New User Created`
   - Contains user details and admin audit link
   - Sent immediately (fire-and-forget pattern — never blocks the operation)

3. **Alert Types Sent:**
   - ✅ User Created — `Subject: ✅ New User Created`
   - 🚫 User Disabled — `Subject: 🚫 User Disabled`
   - ❄️ User Frozen — `Subject: ❄️ User Frozen`
   - 👑 Promoted to Admin — `Subject: 👑 Promoted to Admin`
   - 🗑️ User Deleted — `Subject: 🗑️ User Deleted`

4. **If emails not arriving:**
   - Check Render logs: `tail -f logs.txt | grep Resend`
   - Verify `RESEND_API_KEY` is set and valid
   - Check Resend Dashboard: https://resend.com/domains
   - May take 10-30 seconds to arrive

---

## 📊 Admin Capabilities Summary

### User Management
| Feature | How to Use |
|---------|-----------|
| **View all users** | Admin → Users tab |
| **Create user** | Admin → Users → "Create User" button → Fill modal |
| **Disable user** | Admin → Users → Edit → Status: Disabled |
| **Freeze user** | Admin → Users → Edit → Status: Frozen |
| **Re-enable user** | Admin → Users → Edit → Status: Active |
| **Delete user** | Admin → Users → "Delete" button (confirmation required) |
| **Promote admin** | Admin → Users → Edit → Check "Make Admin" |

### Monitoring & Analytics
| Feature | Location |
|---------|----------|
| **View all logins** | Admin → Login Logs tab |
| **Filter logins** | By email, status (success/failed/blocked), date |
| **User signup trends** | Admin → Analytics → Line chart |
| **Login success/failure rate** | Admin → Analytics → Bar chart |
| **Users by sector** | Admin → Analytics → Doughnut chart |
| **Suspicious activity** | Admin → Security → Red alert banner (5+ failures/24h) |

### Audit Trail
| Feature | Location |
|---------|----------|
| **View admin actions** | Admin → Audit Log tab or Overview → Recent Actions |
| **Search audit log** | By admin email or action type |
| **Timestamp tracking** | Every action logged with exact timestamp |

---

## 🔒 Security Checklist

Before going to production, verify:

- [ ] `.env` is in `.gitignore` (secrets not committed)
- [ ] `RESEND_API_KEY` is in Render env vars (not in code)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is in Render env vars (not in code)
- [ ] `ADMIN_EMAIL` has been **removed** after bootstrap
- [ ] HTTPS enabled on Render (automatic)
- [ ] RLS policies active on `login_logs` and `admin_audit_log` (no public access)
- [ ] Only users with `is_admin=true` can access `/admin.html`
- [ ] All admin actions logged to `admin_audit_log`
- [ ] Login attempts tracked in `login_logs`

---

## 🧪 Local Testing (Before Production)

To test locally before deploying:

```bash
# 1. Start server
npm start

# 2. Signup & verify at http://localhost:3000/signup.html
# 3. Bootstrap admin in console (use same script as Step 4)
# 4. Visit http://localhost:3000/admin.html
# 5. Test all features (create user, disable, etc.)
# 6. Check browser Network tab to verify API calls working
# 7. Check Render logs for email sends (if deployed)
```

---

## 🐛 Troubleshooting

### Admin Dashboard Shows "Unauthorized" or Redirects
- **Cause:** You're not an admin user
- **Fix:** Ensure `is_admin=true` in Supabase users table for your user ID
- **Check:** Run in Supabase SQL: `SELECT id, email, is_admin FROM users WHERE email = 'your@email.com';`

### Create User Doesn't Work
- **Cause:** Invalid input or API error
- **Fix:** Check browser console (F12) for error message
- **Common:** Password too weak (needs uppercase, number, special char)

### Login Logs Not Appearing
- **Cause:** Logs not being recorded
- **Fix:** Check `POST /api/auth/login-log` in Network tab during login
- **Verify:** Supabase → Table Browser → `login_logs` should have entries

### Analytics Charts Show No Data
- **Cause:** Signup/login data not populated yet
- **Fix:** Data will appear once users exist and logins occur
- **Test:** Create a user from Admin panel, this logs an action

### Email Alerts Not Arriving
- **Cause:** Resend key invalid or email blocked
- **Fix:** 
  1. Check Resend API key is valid: https://resend.com/api-keys
  2. Check Render logs: `RESEND_API_KEY` should be set
  3. Wait 10-30 seconds (email sending is async)
  4. Check spam folder
  5. Verify recipient email is correct

### SQL Migrations Fail
- **Cause:** Already applied or syntax error
- **Fix:** 
  1. Check Supabase → Table Browser (table may already exist)
  2. Copy migration text exactly from `ADMIN_SQL_MIGRATIONS.md`
  3. Ensure "Confirm email" is ON in Supabase Auth settings

---

## 📋 Files Modified/Created

### New Files
- ✅ `public/admin.html` — Admin dashboard (6 tabs, 500+ lines)
- ✅ `public/admin.css` — Admin styles (600+ lines)
- ✅ `ADMIN_SQL_MIGRATIONS.md` — SQL migration scripts
- ✅ `ADMIN_DASHBOARD_DEPLOYMENT.md` — This file

### Modified Files
- ✅ `server.js` — +300 lines (Resend, adminMiddleware, 13 routes, audit logging)
- ✅ `public/auth.js` — +60 lines (logLoginAttempt, requireAdmin, auth hooks)
- ✅ `public/dashboard.html` — +8 lines (Admin Panel link + check logic)

---

## 🎯 Next Steps (After Deployment)

1. **Monitor Admin Panel**
   - Familiarize yourself with all 6 tabs
   - Test disabling/re-enabling users
   - Watch email alerts arrive

2. **Invite Other Admins** (if needed)
   - Create user from Admin panel
   - Edit user → Check "Make Admin"
   - That user now has admin access at `/admin.html`

3. **Configure Business Logic** (optional)
   - Set user status policies (when to disable/freeze)
   - Monitor suspicious login alerts
   - Archive old audit logs quarterly

4. **Set Up Monitoring** (optional)
   - Monitor Render logs daily
   - Set up Resend alert rules
   - Track admin actions for compliance

---

## 📞 Support

If you encounter issues:

1. Check the **Troubleshooting** section above
2. Check Render logs: Dashboard → Logs tab
3. Check browser console: F12 → Console tab
4. Check Supabase logs: Dashboard → Logs
5. Verify all env vars are set correctly

---

## 📊 Version Info

| Component | Version | Status |
|-----------|---------|--------|
| AICraft | v1.3 | ✅ Complete |
| Admin Dashboard | v1.0 | ✅ Complete |
| Email Integration | Resend | ✅ Complete |
| Database Schema | 5 migrations | ✅ Ready |

**Deployed:** 2026-04-16  
**Last Updated:** 2026-04-16

---

**Ready to deploy? Follow Step 1 above and you'll be live in 15 minutes!** 🚀
