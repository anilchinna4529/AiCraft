# AICraft v1.3 — SQL Migrations for Admin Dashboard

Run these in **Supabase SQL Editor** in the exact order shown.

---

## Migration 1: Extend `users` table

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_admin       BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS status         TEXT        NOT NULL DEFAULT 'active'
                                           CHECK (status IN ('active','disabled','frozen')),
  ADD COLUMN IF NOT EXISTS last_login_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS login_count    INTEGER     NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_status   ON users(status);
```

---

## Migration 2: Create `login_logs` table

```sql
CREATE TABLE IF NOT EXISTS login_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        REFERENCES users(id) ON DELETE SET NULL,
  email          TEXT        NOT NULL,
  status         TEXT        NOT NULL CHECK (status IN ('success','failed','blocked')),
  ip_address     TEXT,
  user_agent     TEXT,
  failure_reason TEXT,
  metadata       JSONB       DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_logs_email      ON login_logs(email);
CREATE INDEX IF NOT EXISTS idx_login_logs_user_id    ON login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_created_at ON login_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_logs_status     ON login_logs(status);
```

---

## Migration 3: Create `admin_audit_log` table

```sql
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action      TEXT        NOT NULL,
  target_type TEXT,
  target_id   UUID,
  details     JSONB       DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_id   ON admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON admin_audit_log(created_at DESC);
```

---

## Migration 4: RLS (Row Level Security)

```sql
ALTER TABLE login_logs      DISABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log DISABLE ROW LEVEL SECURITY;

REVOKE SELECT ON login_logs      FROM anon, authenticated;
REVOKE SELECT ON admin_audit_log FROM anon, authenticated;

GRANT ALL ON login_logs      TO service_role;
GRANT ALL ON admin_audit_log TO service_role;
```

---

## Migration 5: Analytics SQL Functions

```sql
-- Suspicious logins: 5+ failures in 24h
CREATE OR REPLACE FUNCTION get_suspicious_logins()
RETURNS TABLE(email TEXT, fail_count BIGINT, last_attempt TIMESTAMPTZ) AS $$
  SELECT email, COUNT(*) as fail_count, MAX(created_at) as last_attempt
  FROM login_logs
  WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours'
  GROUP BY email
  HAVING COUNT(*) >= 5
  ORDER BY fail_count DESC;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Signup trend for last N days
CREATE OR REPLACE FUNCTION get_signup_trend(days_back INT DEFAULT 30)
RETURNS TABLE(day DATE, count BIGINT) AS $$
  SELECT DATE(created_at) as day, COUNT(*) as count
  FROM users
  WHERE created_at > NOW() - (days_back || ' days')::INTERVAL
  GROUP BY DATE(created_at)
  ORDER BY day ASC;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Login trend: success vs failed
CREATE OR REPLACE FUNCTION get_login_trend(days_back INT DEFAULT 30)
RETURNS TABLE(day DATE, success_count BIGINT, failed_count BIGINT) AS $$
  SELECT DATE(created_at) as day,
    COUNT(*) FILTER (WHERE status = 'success') as success_count,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_count
  FROM login_logs
  WHERE created_at > NOW() - (days_back || ' days')::INTERVAL
  GROUP BY DATE(created_at)
  ORDER BY day ASC;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Sector distribution
CREATE OR REPLACE FUNCTION get_sector_distribution()
RETURNS TABLE(sector TEXT, count BIGINT) AS $$
  SELECT COALESCE(sector, 'Unknown') as sector, COUNT(*) as count
  FROM users
  GROUP BY sector
  ORDER BY count DESC;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION get_suspicious_logins()    TO anon;
GRANT EXECUTE ON FUNCTION get_signup_trend(INT)      TO anon;
GRANT EXECUTE ON FUNCTION get_login_trend(INT)       TO anon;
GRANT EXECUTE ON FUNCTION get_sector_distribution()  TO anon;
```

---

## ✅ Steps to Run

1. Go to **Supabase Dashboard** → Your Project
2. Click **SQL Editor** (left sidebar)
3. Click **New Query**
4. **Copy each migration above** (one at a time)
5. **Paste into editor** and click **Run**
6. Wait for ✅ success message
7. Move to next migration

**Total time: ~5 minutes**

---

## ✅ Verify Success

After running all migrations, check Supabase:

1. **Table Browser** → `users` → should have 4 new columns
2. **Table Browser** → `login_logs` → new table created
3. **Table Browser** → `admin_audit_log` → new table created
4. **SQL Editor** → Run: `SELECT * FROM get_suspicious_logins();` → should return empty (no failed logins yet)

✅ Once verified, the database is ready for the backend!
