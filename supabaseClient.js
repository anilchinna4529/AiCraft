// supabaseClient.js
// Reusable Supabase client for AICraft backend

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

// Validate environment variables
const SUPABASE_URL = process.env.https://ztvjekrysqraofwamewf.supabase.co;
const SUPABASE_KEY = process.env.sb_publishable_Vwr0JQpU657teKIfDbTUrQ_qp_Gb0qa;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_KEY in .env file");
  process.exit(1);
}

// Create Supabase client with service role key (backend only)
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

console.log("✅ Supabase client initialized successfully");

export default supabase;
