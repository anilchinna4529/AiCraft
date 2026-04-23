// auth.js — AICraft Authentication System
// Browser-side Supabase client + auth helper functions
// Uses anon key (public/publishable key) — safe for frontend

// Load Supabase SDK lazily with CDN fallback so auth.js always loads
// even when the primary CDN is blocked (corporate firewalls, slow networks).
let _createClient = null
const CDN_PRIMARY  = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
const CDN_FALLBACK = 'https://esm.sh/@supabase/supabase-js@2'

async function loadSupabaseSDK() {
  if (_createClient) return _createClient
  try {
    const mod = await import(/* webpackIgnore: true */ CDN_PRIMARY)
    _createClient = mod.createClient
  } catch (e1) {
    console.warn('⚠️ Primary Supabase CDN failed, trying fallback…', e1.message)
    try {
      const mod = await import(/* webpackIgnore: true */ CDN_FALLBACK)
      _createClient = mod.createClient
    } catch (e2) {
      console.error('❌ Could not load Supabase SDK from any CDN:', e2)
      throw new Error(
        'Could not load the authentication library. Please check your internet connection and refresh the page.'
      )
    }
  }
  return _createClient
}

// Get config from backend API or use fallback
let supabaseUrl = ''
let supabaseAnonKey = ''

// Initialize on first call
async function initSupabase() {
  if (!supabaseUrl || !supabaseAnonKey) {
    let response
    try {
      response = await fetch('/api/config')
    } catch (error) {
      console.error('❌ Network error fetching /api/config:', error)
      throw new Error('Cannot reach the AICraft server. Check your internet connection and try again.')
    }
    let config = {}
    try { config = await response.json() } catch { /* non-JSON */ }
    if (!response.ok || !config.supabaseUrl || !config.supabaseAnonKey) {
      console.error('❌ /api/config returned invalid payload:', response.status, config)
      throw new Error(
        config.error ||
        'Authentication is not configured on the server. Please contact support (SUPABASE_URL / SUPABASE_ANON_KEY missing).'
      )
    }
    supabaseUrl = config.supabaseUrl
    supabaseAnonKey = config.supabaseAnonKey
  }
}

let supabase = null

async function getSupabaseClient() {
  if (!supabase) {
    await initSupabase()
    const createClient = await loadSupabaseSDK()
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
    // Sync the access token into localStorage under a stable key so the
    // premium features (favorites, reviews, profile) can send it as a
    // Bearer token to the Express backend.
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) localStorage.setItem('aicraft_token', session.access_token)
    } catch (_) {}
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        localStorage.setItem('aicraft_token', session.access_token)
      } else {
        localStorage.removeItem('aicraft_token')
      }
    })
  }
  return supabase
}

// ============================================
// HELPER: Mask email for display
// ============================================
export function maskEmail(email) {
  const [local, domain] = email.split('@')
  const masked = local.charAt(0) + '*'.repeat(local.length - 2) + local.charAt(local.length - 1)
  return `${masked}@${domain}`
}

// ============================================
// HELPER: Get current user session
// ============================================
export async function getCurrentUser() {
  const sb = await getSupabaseClient()
  const { data: { user }, error } = await sb.auth.getUser()
  if (error) {
    console.warn('⚠️ No active session:', error.message)
    return null
  }
  return user
}

// ============================================
// HELPER: Log login attempt to backend
// ============================================
export async function logLoginAttempt(email, status, failureReason = null, userId = null) {
  try {
    // Fire-and-forget: don't wait for response
    fetch('/api/auth/login-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, status, failure_reason: failureReason, user_id: userId })
    }).catch(err => console.warn('⚠️ Login log submission failed:', err))
  } catch (error) {
    console.warn('⚠️ Could not submit login log:', error)
  }
}

// ============================================
// HELPER: Require authentication (redirect if not logged in)
// ============================================
export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) {
    console.warn('⚠️ User not authenticated. Redirecting to login...')
    window.location.href = '/login.html'
    return null
  }
  return user
}

// ============================================
// HELPER: Require admin role (redirect if not admin)
// ============================================
export async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user) {
    console.warn('⚠️ Not authenticated. Redirecting to login...')
    window.location.href = '/login.html'
    return null
  }

  try {
    const sb = await getSupabaseClient()
    const { data, error } = await sb
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (error || !data?.is_admin) {
      console.warn('⚠️ Not an admin. Redirecting to dashboard...')
      window.location.href = '/dashboard.html'
      return null
    }

    return user
  } catch (error) {
    console.error('❌ Admin check failed:', error)
    window.location.href = '/dashboard.html'
    return null
  }
}

// ============================================
// HELPER: Redirect if already authenticated
// ============================================
export async function redirectIfAuthed() {
  const user = await getCurrentUser()
  if (user) {
    console.log('✅ User already authenticated. Redirecting to dashboard...')
    window.location.href = '/dashboard.html'
    return true
  }
  return false
}

// ============================================
// AUTH: Sign up with email + password
// ============================================
export async function signUp(email, password, fullName) {
  const sb = await getSupabaseClient()
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  })

  if (error) {
    console.error('❌ Signup error:', error.message)
    throw error
  }

  // Store pending email in sessionStorage for OTP verification
  sessionStorage.setItem('pending_email', email)
  console.log('✅ Signup successful. OTP sent to email.')
  return data
}

// ============================================
// AUTH: Verify OTP email code
// ============================================
export async function verifyOTP(email, otp) {
  const sb = await getSupabaseClient()
  const { data, error } = await sb.auth.verifyOtp({
    email,
    token: otp,
    type: 'signup',
  })

  if (error) {
    console.error('❌ OTP verification error:', error.message)
    throw error
  }

  sessionStorage.removeItem('pending_email')
  console.log('✅ Email verified successfully.')

  // Log successful verification
  if (data?.user?.id) {
    logLoginAttempt(email, 'success', null, data.user.id)
  }

  return data
}

// ============================================
// AUTH: Login with email + password
// ============================================
export async function signIn(email, password) {
  const sb = await getSupabaseClient()
  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    console.error('❌ Login error:', error.message)
    // Log failed login attempt
    let reason = error.message
    if (error.message.includes('email not confirmed') || error.message.includes('Email not confirmed')) {
      reason = 'Email not confirmed'
      logLoginAttempt(email, 'failed', reason)
      const customError = new Error('Email not confirmed')
      customError.code = 'EMAIL_NOT_CONFIRMED'
      throw customError
    }
    logLoginAttempt(email, 'failed', reason)
    throw error
  }

  console.log('✅ Login successful.')
  // Log successful login
  if (data?.user?.id) {
    logLoginAttempt(email, 'success', null, data.user.id)
  }

  return data
}

// ============================================
// AUTH: Resend OTP to email
// ============================================
export async function resendOTP(email) {
  const sb = await getSupabaseClient()
  const { data, error } = await sb.auth.resend({
    type: 'signup',
    email,
  })

  if (error) {
    console.error('❌ Resend OTP error:', error.message)
    throw error
  }

  console.log('✅ OTP resent to email.')
  return data
}

// ============================================
// AUTH: Request password reset
// ============================================
export async function resetPassword(email) {
  const sb = await getSupabaseClient()
  const siteUrl = window.location.origin
  const { data, error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/reset-password.html`,
  })

  if (error) {
    console.error('❌ Password reset error:', error.message)
    throw error
  }

  console.log('✅ Password reset email sent.')
  return data
}

// ============================================
// AUTH: Logout
// ============================================
export async function logout() {
  const sb = await getSupabaseClient()
  const { error } = await sb.auth.signOut()

  if (error) {
    console.error('❌ Logout error:', error.message)
    throw error
  }

  sessionStorage.removeItem('pending_email')
  console.log('✅ Logged out successfully.')
  window.location.href = '/login.html'
}

// ============================================
// Export Supabase client getter
// ============================================
export { getSupabaseClient }

console.log('✅ auth.js loaded successfully')
