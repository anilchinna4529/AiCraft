# AICraft v1.2 — Authentication System Testing & Deployment Guide

## 🧪 LOCAL TESTING CHECKLIST

### Prerequisites
- Node.js installed
- `.env` file configured with Supabase credentials
- Supabase project with email OTP enabled
- A test email address (Gmail, Outlook, etc.)

### Step 1: Start Local Server
```bash
cd AICraft
npm start
# Server runs on http://localhost:3000
```

### Step 2: Test Signup Flow
1. Visit `http://localhost:3000/signup.html`
2. Fill in:
   - Full Name: `Test User`
   - Email: Your real email address
   - Password: `TestPassword123!`
   - Confirm: `TestPassword123!`
3. Click "Create Account"
4. **Expected Result**: Redirects to `/verify.html`, OTP email sent to inbox

### Step 3: Test OTP Verification
1. Check your email inbox (may take 10-30 seconds)
2. Copy the 6-digit code from the email
3. On `/verify.html`:
   - Paste code (auto-fills 6 digits)
   - OR enter manually with auto-focus between fields
4. Click "Verify Email"
5. **Expected Result**: Redirects to `/login.html?verified=1` with success toast

### Step 4: Test Failed Login (Before Verification)
1. Open private/incognito browser window
2. Visit `http://localhost:3000/login.html`
3. Try logging in with the unverified email
4. **Expected Result**: Error message "Please verify your email before logging in."

### Step 5: Test Successful Login
1. Go to `/login.html`
2. Enter verified email + password
3. Click "Sign In"
4. **Expected Result**: Redirects to `/dashboard.html` with user profile displayed

### Step 6: Test Protected Dashboard
1. Try accessing `/dashboard.html` directly without logging in (open new tab)
2. **Expected Result**: Redirects to `/login.html`
3. Log in again → Dashboard loads with stats

### Step 7: Test Logout
1. On dashboard, click "Logout" button
2. **Expected Result**: Session cleared, redirected to `/login.html`

### Step 8: Test Forgot Password
1. Go to `/login.html`
2. Click "Forgot password?"
3. Enter email address
4. Click "Send Reset Link"
5. **Expected Result**: Modal shows success, email sent
6. Check inbox for password reset link
7. Click link → Redirects to `/reset-password.html`
8. Enter new password + confirm
9. Click "Update Password"
10. **Expected Result**: Redirects to `/login.html`, can login with new password

### Step 9: Test Resend OTP
1. Go to `/signup.html` → Sign up with new email
2. Redirected to `/verify.html`
3. Click "Resend Code" button
4. **Expected Result**: Timer starts at 60s, button disabled
5. After 60s, button re-enables
6. Click again → New OTP sent

### Step 10: Test Mobile Responsive
1. Open browser DevTools (F12)
2. Toggle Device Toolbar (mobile view)
3. Test all auth pages on mobile
4. Sidebar should collapse on dashboard
5. **Expected Result**: All pages responsive, buttons clickable

---

## 🚀 DEPLOYMENT TO RENDER CHECKLIST

### Pre-Deployment Setup

#### 1. **Supabase Configuration** (DO THIS FIRST)
- [ ] Go to Supabase Dashboard → Auth → Providers → Email
- [ ] Toggle **"Confirm email"** to ON
- [ ] Go to Auth → Email Templates → Confirm signup
- [ ] Update template to use `{{ .Token }}` (6-digit OTP code)
  - Subject: `Your AICraft verification code`
  - Body: `Your verification code is: {{ .Token }}`

#### 2. **Environment Variables Setup**
In Render Dashboard, add these to your web service settings:

```
SUPABASE_URL=https://ztvjekrysqraofwamewf.supabase.co
SUPABASE_ANON_KEY=sb_publishable_Vwr0JQpU657teKIfDbTUrQ_qp_Gb0qa
SUPABASE_SERVICE_ROLE_KEY=[get from Supabase Dashboard → Settings → API]
SITE_URL=https://your-app.onrender.com
NODE_ENV=production
PORT=3000
```

#### 3. **Git Preparation**
```bash
# Make sure .env is NOT in git history
git status  # Should NOT show .env

# Commit all changes
git add .
git commit -m "feat: add authentication system v1.2 with OTP verification and protected dashboard"

# Push to GitHub
git push origin main
```

#### 4. **Render Deployment**
1. Log in to [render.com](https://render.com)
2. Click "New" → "Web Service"
3. Connect your GitHub repo
4. Configure:
   - **Name**: aicraft
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Region**: Choose closest to you
5. Add environment variables (from Step 2)
6. Click "Deploy"

#### 5. **Post-Deployment Testing**
```bash
# Test API endpoints
curl https://your-app.onrender.com/api/config
curl https://your-app.onrender.com/api

# Test auth flows in browser
https://your-app.onrender.com/signup.html
https://your-app.onrender.com/login.html
https://your-app.onrender.com/dashboard.html
```

---

## 🔧 TROUBLESHOOTING

### "OTP not received"
- **Check**: Supabase email template is configured with `{{ .Token }}`
- **Check**: Email address not already verified
- **Check**: Check spam/junk folder
- **Fix**: Wait 30 seconds, try resending code

### "Email not confirmed" error on login
- **Cause**: User hasn't verified OTP yet
- **Fix**: Redirect to `/verify.html` to complete verification

### CORS errors in browser console
- **Cause**: SITE_URL not set in environment
- **Fix**: Add `SITE_URL=https://your-app.onrender.com` to Render environment
- **Local Dev**: CORS automatically allows localhost:3000

### "Invalid or expired reset link"
- **Cause**: Reset token in URL is invalid/expired (tokens expire in 1 hour)
- **Fix**: Request new password reset from `/login.html`

### Dashboard shows "loading" stats forever
- **Cause**: `/api/stats` returning error
- **Fix**: Verify Supabase database connection and tables exist
- **Check**: `curl https://your-app.onrender.com/api/stats`

---

## 📊 MONITORING

### Health Check Endpoint
```bash
curl https://your-app.onrender.com/api
# Returns: version, timestamp, available endpoints
```

### View Logs
**Render Dashboard:**
1. Select your web service
2. Go to "Logs" tab
3. View real-time server logs

**Local:**
```bash
npm start
# Shows all requests and errors
```

---

## 🔒 SECURITY CHECKLIST

- [ ] `.env` in `.gitignore` (credentials not committed)
- [ ] HTTPS enabled on Render (automatic)
- [ ] SITE_URL set to production domain
- [ ] SUPABASE_SERVICE_ROLE_KEY not in frontend code
- [ ] Email OTP configured in Supabase
- [ ] "Confirm email" requirement enabled
- [ ] Password reset redirects to valid SITE_URL
- [ ] Rate limiting on OTP resend (3×/10min)

---

## 📝 API ENDPOINTS (For Custom Integration)

### Config Endpoint
```
GET /api/config
Response: { supabaseUrl, supabaseAnonKey }
```

### Resend OTP
```
POST /api/auth/resend-otp
Body: { email }
Rate Limit: 3 per 10 minutes
```

### Reset Password
```
POST /api/auth/reset-password
Body: { email }
Sends email with reset link to /reset-password.html
```

---

## ✅ SUCCESS INDICATORS

- ✅ Sign up → OTP email received within 30 seconds
- ✅ OTP verification → Redirects to login
- ✅ Unverified user blocked from login
- ✅ Password reset email received
- ✅ Dashboard loads only after login
- ✅ Session persists on page refresh
- ✅ Logout clears session
- ✅ Mobile responsive on all pages
- ✅ All pages follow AICraft dark theme
- ✅ Error messages clear and actionable
