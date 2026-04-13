// supabaseClient.js
// Reusable Supabase client for AICraft backend

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

// Validate environment variables
// Accepts SUPABASE_ANON_KEY (Render/standard) or SUPABASE_KEY (legacy local)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Missing required environment variables:");
  if (!SUPABASE_URL) console.error("   - SUPABASE_URL is not set");
  if (!SUPABASE_KEY) console.error("   - SUPABASE_ANON_KEY (or SUPABASE_KEY) is not set");
  process.exit(1);
}

// Validate that SUPABASE_URL is a proper HTTPS URL before calling createClient.
// A non-empty placeholder like "your_supabase_project_url_here" passes the
// truthiness check above but will throw inside createClient, making the root
// cause harder to diagnose on Render.
if (!SUPABASE_URL.startsWith("https://")) {
  console.error(
    `❌ SUPABASE_URL is not a valid HTTPS URL: "${SUPABASE_URL}"\n` +
    "   It must start with https:// — e.g. https://<project-id>.supabase.co"
  );
  process.exit(1);
}

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

console.log("✅ Supabase client initialized successfully");

export default supabase;
