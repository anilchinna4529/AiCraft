// server.js
// AICraft - Main Express Server
// AI Automation Tools Marketplace Backend

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import supabase from "./supabaseClient.js";
import { Resend } from "resend";
import { buildSalesforceRouter } from "./salesforce/routes.js";

// Load environment variables
dotenv.config();

// Fix __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Render / proxied environments — trust the X-Forwarded-* headers
// so req.ip and rate limiting work correctly.
app.set("trust proxy", 1);

// Initialize Resend for email notifications (skip gracefully if key missing)
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// ============================================
// MIDDLEWARE SETUP
// ============================================

// Enable CORS — allow localhost for development; in production accept SITE_URL +
// any comma-separated origins from ALLOWED_ORIGINS. Same-origin requests always work.
const devOrigins = ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000"];
const prodOrigins = [
  process.env.SITE_URL,
  ...(process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
].filter(Boolean);
const corsOrigin = process.env.NODE_ENV === "production"
  ? (origin, cb) => {
      // Allow same-origin / server-to-server (no origin header) and whitelisted origins
      if (!origin || prodOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("CORS: origin not allowed"));
    }
  : devOrigins;
app.use(
  cors({
    origin: corsOrigin,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Parse JSON request bodies
app.use(express.json());

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// Serve static files from /public folder
app.use(express.static(path.join(__dirname, "public")));

// Request logger middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`📡 [${timestamp}] ${req.method} ${req.url}`);
  next();
});

// Lightweight security headers (helmet-equivalent basics, no extra deps)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

// Simple in-memory rate limiter for auth-sensitive routes
const rateBuckets = new Map();
function rateLimit(opts = { windowMs: 60_000, max: 20 }) {
  return (req, res, next) => {
    const key = `${req.ip || req.headers["x-forwarded-for"] || "anon"}:${req.path}`;
    const now = Date.now();
    const entry = rateBuckets.get(key) || { count: 0, reset: now + opts.windowMs };
    if (now > entry.reset) { entry.count = 0; entry.reset = now + opts.windowMs; }
    entry.count++;
    rateBuckets.set(key, entry);
    if (entry.count > opts.max) {
      return res.status(429).json({ success: false, error: "Too many requests. Please slow down." });
    }
    next();
  };
}
const authRateLimit = rateLimit({ windowMs: 60_000, max: 10 });

// Periodically prune expired rate-limit buckets to prevent memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateBuckets.entries()) {
    if (now > entry.reset) rateBuckets.delete(key);
  }
}, 5 * 60_000).unref();

// ============================================
// ROUTE 1: Health Check
// GET /api
// ============================================
app.get("/api", (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: "🤖 AICraft backend is running",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      endpoints: [
        "GET  /api/tools",
        "POST /api/tools",
        "GET  /api/users",
        "POST /api/users",
        "GET  /api/actions",
        "POST /api/actions",
        "GET  /api/sectors",
        "GET  /api/stats",
      ],
    });
  } catch (error) {
    console.error("❌ Health check error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTE 2: GET all AI Tools
// GET /api/tools
// ============================================
app.get("/api/tools", async (req, res) => {
  try {
    const { category, sector, submittedBy, status, limit = 50 } = req.query;

    let query = supabase
      .from("ai_tools")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Math.min(parseInt(limit) || 50, 200));

    // Optional filters
    if (category) query = query.eq("category", category);
    if (sector) query = query.eq("sector", sector);
    if (submittedBy) query = query.eq("submitted_by", submittedBy);

    // Public listing: only approved tools.
    // `submittedBy` (dashboard "my tools") and explicit `status` bypass this filter
    // so users can see their own submissions regardless of moderation state.
    if (!submittedBy && !status) {
      query = query.or("status.eq.approved,status.is.null");
    } else if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.status(200).json({
      success: true,
      count: data.length,
      tools: data,
    });
  } catch (error) {
    console.error("❌ Error fetching tools:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch AI tools",
      details: error.message,
    });
  }
});

// ============================================
// ROUTE 3: CREATE a new AI Tool
// POST /api/tools
// ============================================
app.post("/api/tools", async (req, res) => {
  try {
    const { name, description, category, sector, price, image_url, tool_link } =
      req.body;

    // Validate required fields
    if (!name || !description || !category) {
      return res.status(400).json({
        success: false,
        error: "name, description, and category are required fields",
      });
    }

    const newTool = {
      name: name.trim(),
      description: description.trim(),
      category: category.trim(),
      sector: sector || "General",
      price: price || "Free",
      image_url: image_url || null,
      tool_link: tool_link || null,
      // New user-submitted tools start as pending. Admins approve via dashboard.
      status: "pending",
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("ai_tools")
      .insert([newTool])
      .select();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: "✅ AI Tool created successfully",
      tool: data[0],
    });
  } catch (error) {
    console.error("❌ Error creating tool:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to create AI tool",
      details: error.message,
    });
  }
});

// ============================================
// ROUTE 4: GET all Users
// GET /api/users
// ============================================
app.get("/api/users", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, role, sector, created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.status(200).json({
      success: true,
      count: data.length,
      users: data,
    });
  } catch (error) {
    console.error("❌ Error fetching users:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch users",
      details: error.message,
    });
  }
});

// ============================================
// ROUTE 5: CREATE a new User
// POST /api/users
// ============================================
app.post("/api/users", async (req, res) => {
  try {
    const { name, email, role, sector } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: "name and email are required fields",
      });
    }

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .single();

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: "User with this email already exists",
      });
    }

    const newUser = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: role || "user",
      sector: sector || "General",
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("users")
      .insert([newUser])
      .select();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: "✅ User created successfully",
      user: data[0],
    });
  } catch (error) {
    console.error("❌ Error creating user:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to create user",
      details: error.message,
    });
  }
});

// ============================================
// ROUTE 6: LOG User Action
// POST /api/actions
// ============================================
app.post("/api/actions", async (req, res) => {
  try {
    const { user_id, tool_id, action_type, metadata } = req.body;

    if (!action_type) {
      return res.status(400).json({
        success: false,
        error: "action_type is required",
      });
    }

    const newAction = {
      user_id: user_id || null,
      tool_id: tool_id || null,
      action_type: action_type.trim(),
      metadata: metadata || {},
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("actions")
      .insert([newAction])
      .select();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: "✅ Action logged successfully",
      action: data[0],
    });
  } catch (error) {
    console.error("❌ Error logging action:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to log action",
      details: error.message,
    });
  }
});

// ============================================
// ROUTE 7: GET all Actions
// GET /api/actions
// ============================================
app.get("/api/actions", async (req, res) => {
  try {
    const { limit = 100 } = req.query;

    const { data, error } = await supabase
      .from("actions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    res.status(200).json({
      success: true,
      count: data.length,
      actions: data,
    });
  } catch (error) {
    console.error("❌ Error fetching actions:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch actions",
      details: error.message,
    });
  }
});

// ============================================
// ROUTE 8: GET Sectors
// GET /api/sectors
// ============================================
app.get("/api/sectors", async (req, res) => {
  try {
    const sectors = [
      {
        id: 1,
        name: "Healthcare",
        icon: "🏥",
        description: "AI tools for medical diagnosis & patient care",
      },
      {
        id: 2,
        name: "Finance",
        icon: "💰",
        description: "Automated trading, fraud detection & analysis",
      },
      {
        id: 3,
        name: "Education",
        icon: "🎓",
        description: "Personalized learning & smart tutoring systems",
      },
      {
        id: 4,
        name: "E-Commerce",
        icon: "🛒",
        description: "Product recommendations & customer support AI",
      },
      {
        id: 5,
        name: "Manufacturing",
        icon: "🏭",
        description: "Predictive maintenance & quality control AI",
      },
      {
        id: 6,
        name: "Marketing",
        icon: "📢",
        description: "AI-powered campaigns & content automation",
      },
      {
        id: 7,
        name: "Legal",
        icon: "⚖️",
        description: "Document analysis & legal research automation",
      },
      {
        id: 8,
        name: "Real Estate",
        icon: "🏠",
        description: "Property valuation & market prediction AI",
      },
    ];

    res.status(200).json({
      success: true,
      count: sectors.length,
      sectors,
    });
  } catch (error) {
    console.error("❌ Error fetching sectors:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTE 9: Platform Statistics
// GET /api/stats
// ============================================
app.get("/api/stats", async (req, res) => {
  try {
    const [toolsResult, usersResult, actionsResult] = await Promise.all([
      supabase.from("ai_tools").select("id", { count: "exact" }),
      supabase.from("users").select("id", { count: "exact" }),
      supabase.from("actions").select("id", { count: "exact" }),
    ]);

    res.status(200).json({
      success: true,
      stats: {
        total_tools: toolsResult.count || 0,
        total_users: usersResult.count || 0,
        total_actions: actionsResult.count || 0,
        sectors_covered: 8,
        uptime: process.uptime().toFixed(0) + "s",
      },
    });
  } catch (error) {
    console.error("❌ Error fetching stats:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// AUTH MIDDLEWARE: Validate JWT Bearer token
// ============================================
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "Unauthorized: Missing token" });
    }

    const token = authHeader.slice(7); // Remove "Bearer " prefix
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ success: false, error: "Unauthorized: Invalid token" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("❌ Auth middleware error:", error.message);
    res.status(401).json({ success: false, error: "Unauthorized" });
  }
};

// ============================================
// ROUTE: Get Supabase Config (public)
// GET /api/config
// ============================================
app.get("/api/config", (req, res) => {
  try {
    const url = process.env.SUPABASE_URL;
    const anon = process.env.SUPABASE_ANON_KEY;
    if (!url || !anon) {
      console.error("❌ /api/config: SUPABASE_URL or SUPABASE_ANON_KEY missing on the server.");
      return res.status(500).json({
        success: false,
        error: "Server is missing Supabase configuration (SUPABASE_URL / SUPABASE_ANON_KEY).",
      });
    }
    res.status(200).json({
      success: true,
      supabaseUrl: url,
      supabaseAnonKey: anon,
    });
  } catch (error) {
    console.error("❌ Config error:", error.message);
    res.status(500).json({ success: false, error: "Failed to fetch config" });
  }
});

// ============================================
// ROUTE: Resend OTP Email
// POST /api/auth/resend-otp
// ============================================
const otpAttempts = new Map(); // Rate limiting: { email: { count, timestamp } }
app.post("/api/auth/resend-otp", authRateLimit, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: "Email is required" });
    }

    // Rate limiting: max 3 attempts per 10 minutes
    const now = Date.now();
    const limitWindow = 10 * 60 * 1000; // 10 minutes
    const entry = otpAttempts.get(email) || { count: 0, timestamp: now };

    if (now - entry.timestamp < limitWindow && entry.count >= 3) {
      return res.status(429).json({
        success: false,
        error: "Too many requests. Please try again later.",
      });
    }

    // Reset count if outside window
    if (now - entry.timestamp >= limitWindow) {
      entry.count = 0;
      entry.timestamp = now;
    }

    entry.count++;
    otpAttempts.set(email, entry);

    // Resend OTP via Supabase
    const { data, error } = await supabase.auth.resend({
      type: "signup",
      email: email.toLowerCase(),
    });

    if (error) {
      console.error("❌ Resend OTP error:", error.message);
      return res.status(400).json({
        success: false,
        error: error.message || "Failed to resend OTP",
      });
    }

    res.status(200).json({
      success: true,
      message: "✅ OTP resent successfully",
    });
  } catch (error) {
    console.error("❌ Resend OTP error:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to resend OTP",
      details: error.message,
    });
  }
});

// ============================================
// ROUTE: Reset Password
// POST /api/auth/reset-password
// ============================================
app.post("/api/auth/reset-password", authRateLimit, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: "Email is required" });
    }

    const siteUrl = process.env.SITE_URL || "http://localhost:3000";
    const { data, error } = await supabase.auth.resetPasswordForEmail(
      email.toLowerCase(),
      {
        redirectTo: `${siteUrl}/reset-password.html`,
      }
    );

    if (error) {
      console.error("❌ Reset password error:", error.message);
      return res.status(400).json({
        success: false,
        error: error.message || "Failed to send reset email",
      });
    }

    res.status(200).json({
      success: true,
      message: "✅ Password reset email sent",
    });
  } catch (error) {
    console.error("❌ Reset password error:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to send reset email",
      details: error.message,
    });
  }
});

// ============================================
// ADMIN MIDDLEWARE: Verify user is admin
// ============================================
const adminMiddleware = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  // Bootstrap: allow ADMIN_EMAIL env var (first-run only)
  if (process.env.ADMIN_EMAIL && req.user.email === process.env.ADMIN_EMAIL) {
    req.isAdmin = true;
    return next();
  }

  // Check DB: is_admin = true and status = active
  const { data, error } = await supabase
    .from("users")
    .select("is_admin, status")
    .eq("id", req.user.id)
    .single();

  if (error || !data || !data.is_admin || data.status !== "active") {
    return res.status(403).json({ success: false, error: "Forbidden: Admin access required" });
  }

  req.isAdmin = true;
  next();
};

// ============================================
// HELPER: Send admin notification emails
// ============================================
const sendAdminAlert = async (subject, html, adminEmails = []) => {
  if (!resend || adminEmails.length === 0) return;
  try {
    for (const email of adminEmails) {
      await resend.emails.send({
        from: "admin-alerts@aicraft.co",
        to: email,
        subject,
        html,
      });
    }
  } catch (error) {
    console.error("❌ Failed to send admin alert:", error.message);
  }
};

// ============================================
// HELPER: Get all admin emails
// ============================================
const getAdminEmails = async () => {
  const { data, error } = await supabase
    .from("users")
    .select("email")
    .eq("is_admin", true)
    .eq("status", "active");

  if (error || !data) return [];
  return data.map(u => u.email);
};

// ============================================
// ROUTE: Log login attempt (PUBLIC)
// POST /api/auth/login-log
// ============================================
app.post("/api/auth/login-log", authRateLimit, async (req, res) => {
  try {
    const { email, status, failure_reason, user_id } = req.body;

    if (!email || !status) {
      return res.status(400).json({ success: false, error: "email and status required" });
    }

    await supabase.from("login_logs").insert([{
      email: email.toLowerCase().trim(),
      user_id: user_id || null,
      status,
      failure_reason: failure_reason || null,
      ip_address: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      user_agent: req.headers["user-agent"] || null,
      metadata: {},
    }]);

    // Update user's last login if successful
    if (status === "success" && user_id) {
      await supabase
        .from("users")
        .update({
          last_login_at: new Date().toISOString(),
        })
        .eq("id", user_id);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("❌ Login log error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTE: Bootstrap admin (one-time setup)
// POST /api/admin/seed-admin
// ============================================
app.post("/api/admin/seed-admin", authMiddleware, async (req, res) => {
  try {
    // Only allow via ADMIN_EMAIL env var
    if (!process.env.ADMIN_EMAIL || req.user.email !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    // Promote user to admin
    const { error } = await supabase
      .from("users")
      .update({ is_admin: true })
      .eq("email", req.user.email);

    if (error) throw error;

    res.json({ success: true, message: "Admin account promoted" });
  } catch (error) {
    console.error("❌ Seed admin error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTE: Get platform stats
// GET /api/admin/stats
// ============================================
app.get("/api/admin/stats", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [toolsResult, usersResult, actionsResult] = await Promise.all([
      supabase.from("ai_tools").select("id", { count: "exact" }),
      supabase.from("users").select("id", { count: "exact" }),
      supabase.from("actions").select("id", { count: "exact" }),
    ]);

    res.json({
      success: true,
      stats: {
        total_tools: toolsResult.count || 0,
        total_users: usersResult.count || 0,
        total_actions: actionsResult.count || 0,
        admin_count: (await supabase.from("users").select("id", { count: "exact" }).eq("is_admin", true)).count || 0,
      },
    });
  } catch (error) {
    console.error("❌ Stats error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTE: List all users with pagination
// GET /api/admin/users?page=1&limit=20&search=&status=active&sector=
// ============================================
app.get("/api/admin/users", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status, sector } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase
      .from("users")
      .select("id,name,email,role,sector,is_admin,status,last_login_at,login_count,created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    if (status) query = query.eq("status", status);
    if (sector) query = query.eq("sector", sector);

    const { data, count, error } = await query;
    if (error) throw error;

    res.json({
      success: true,
      users: data,
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error("❌ List users error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTE: Get single user with login history
// GET /api/admin/users/:id
// ============================================
app.get("/api/admin/users/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .single();

    if (userError || !user) return res.status(404).json({ success: false, error: "User not found" });

    const { data: logins, error: logError } = await supabase
      .from("login_logs")
      .select("*")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (logError) throw logError;

    res.json({ success: true, user, recentLogins: logins || [] });
  } catch (error) {
    console.error("❌ Get user error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTE: Create user (admin-initiated, no OTP)
// POST /api/admin/users
// ============================================
app.post("/api/admin/users", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, email, password, role = "user", sector = "General" } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: "name, email, password required" });
    }

    // Create Supabase auth user with password
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true, // Skip OTP
    });

    if (authError) throw authError;

    // Create user record in DB
    const { data: dbUser, error: dbError } = await supabase
      .from("users")
      .insert([{
        id: authUser.user.id,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        role,
        sector,
        status: "active",
      }])
      .select()
      .single();

    if (dbError) throw dbError;

    // Log to audit trail
    await supabase.from("admin_audit_log").insert([{
      admin_id: req.user.id,
      action: "user.create",
      target_type: "user",
      target_id: dbUser.id,
      details: { name, email, role, sector },
    }]);

    // Send admin alert
    const adminEmails = await getAdminEmails();
    await sendAdminAlert(
      `✅ New User Created: ${email}`,
      `<h2>User Created</h2><p><strong>${email}</strong> created by <strong>${req.user.email}</strong><br/>Role: ${role}<br/>Sector: ${sector}</p>`,
      adminEmails
    );

    res.status(201).json({ success: true, user: dbUser });
  } catch (error) {
    console.error("❌ Create user error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTE: Update user status (active/disabled/frozen)
// PATCH /api/admin/users/:id/status
// ============================================
app.patch("/api/admin/users/:id/status", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["active", "disabled", "frozen"].includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status" });
    }

    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select("email, status")
      .eq("id", id)
      .single();

    if (fetchError || !user) return res.status(404).json({ success: false, error: "User not found" });

    // Update status
    const { error: updateError } = await supabase
      .from("users")
      .update({ status })
      .eq("id", id);

    if (updateError) throw updateError;

    // Log to audit trail
    await supabase.from("admin_audit_log").insert([{
      admin_id: req.user.id,
      action: "user.status_change",
      target_type: "user",
      target_id: id,
      details: { previous_status: user.status, new_status: status },
    }]);

    // Send alert email
    const adminEmails = await getAdminEmails();
    const statusLabel = { active: "✅ Activated", disabled: "🚫 Disabled", frozen: "❄️ Frozen" }[status];
    await sendAdminAlert(
      `${statusLabel}: ${user.email}`,
      `<h2>User Status Changed</h2><p><strong>${user.email}</strong> is now <strong>${status}</strong> (changed by ${req.user.email})</p>`,
      adminEmails
    );

    res.json({ success: true, message: `User status changed to ${status}` });
  } catch (error) {
    console.error("❌ Update status error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTE: Toggle admin role
// PATCH /api/admin/users/:id/role
// ============================================
app.patch("/api/admin/users/:id/role", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_admin } = req.body;

    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select("email, is_admin")
      .eq("id", id)
      .single();

    if (fetchError || !user) return res.status(404).json({ success: false, error: "User not found" });

    const { error: updateError } = await supabase
      .from("users")
      .update({ is_admin })
      .eq("id", id);

    if (updateError) throw updateError;

    // Log to audit trail
    await supabase.from("admin_audit_log").insert([{
      admin_id: req.user.id,
      action: is_admin ? "user.promote_admin" : "user.demote_admin",
      target_type: "user",
      target_id: id,
      details: { email: user.email },
    }]);

    // Send alert email
    const adminEmails = await getAdminEmails();
    const action = is_admin ? "👑 Promoted to Admin" : "📝 Demoted to User";
    await sendAdminAlert(
      `${action}: ${user.email}`,
      `<h2>Admin Role Changed</h2><p><strong>${user.email}</strong> is now a <strong>${is_admin ? "Admin" : "User"}</strong> (changed by ${req.user.email})</p>`,
      adminEmails
    );

    res.json({ success: true, message: is_admin ? "User promoted to admin" : "User demoted to user" });
  } catch (error) {
    console.error("❌ Update role error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTE: Delete user
// DELETE /api/admin/users/:id
// ============================================
app.delete("/api/admin/users/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select("email")
      .eq("id", id)
      .single();

    if (fetchError || !user) return res.status(404).json({ success: false, error: "User not found" });

    const { error: deleteError } = await supabase.from("users").delete().eq("id", id);
    if (deleteError) throw deleteError;

    // Log to audit trail
    await supabase.from("admin_audit_log").insert([{
      admin_id: req.user.id,
      action: "user.delete",
      target_type: "user",
      target_id: id,
      details: { email: user.email },
    }]);

    // Send alert email
    const adminEmails = await getAdminEmails();
    await sendAdminAlert(
      `🗑️ User Deleted: ${user.email}`,
      `<h2>User Deleted</h2><p><strong>${user.email}</strong> was deleted by ${req.user.email}</p>`,
      adminEmails
    );

    res.json({ success: true, message: "User deleted" });
  } catch (error) {
    console.error("❌ Delete user error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTE: Get login logs with pagination
// GET /api/admin/login-logs?page=1&limit=50&email=&status=&days=7
// ============================================
app.get("/api/admin/login-logs", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50, email, status, days = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const since = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from("login_logs")
      .select("*", { count: "exact" })
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (email) query = query.ilike("email", `%${email}%`);
    if (status) query = query.eq("status", status);

    const { data, count, error } = await query;
    if (error) throw error;

    res.json({ success: true, logs: data, total: count, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error("❌ Login logs error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTE: Get analytics data
// GET /api/admin/analytics?days=30
// ============================================
app.get("/api/admin/analytics", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { days = 30 } = req.query;

    // Get signup trend
    const { data: signupTrend, error: signupError } = await supabase.rpc("get_signup_trend", { days_back: parseInt(days) });
    if (signupError) throw signupError;

    // Get login trend
    const { data: loginTrend, error: loginError } = await supabase.rpc("get_login_trend", { days_back: parseInt(days) });
    if (loginError) throw loginError;

    // Get sector distribution
    const { data: sectors, error: sectorError } = await supabase.rpc("get_sector_distribution");
    if (sectorError) throw sectorError;

    res.json({
      success: true,
      signupTrend: signupTrend || [],
      loginTrend: loginTrend || [],
      sectors: sectors || [],
    });
  } catch (error) {
    console.error("❌ Analytics error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTE: Get security alerts
// GET /api/admin/security/alerts
// ============================================
app.get("/api/admin/security/alerts", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { data: suspicious, error } = await supabase.rpc("get_suspicious_logins");
    if (error) throw error;

    res.json({ success: true, alerts: suspicious || [] });
  } catch (error) {
    console.error("❌ Security alerts error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTE: Get admin audit log
// GET /api/admin/audit?page=1&limit=50
// ============================================
app.get("/api/admin/audit", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { data, count, error } = await supabase
      .from("admin_audit_log")
      .select("*, users(name, email)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (error) throw error;

    res.json({ success: true, audit: data, total: count, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error("❌ Audit log error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// PREMIUM FEATURES: Single tool, favorites, reviews, profile
// ============================================

// GET /api/tools/:id - single tool with aggregate rating
app.get("/api/tools/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { data: tool, error } = await supabase
      .from("ai_tools")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !tool) {
      return res.status(404).json({ success: false, error: "Tool not found" });
    }

    // Aggregate rating (if tool_ratings view exists)
    let rating = { review_count: 0, avg_rating: 0 };
    try {
      const { data: r } = await supabase
        .from("tool_ratings")
        .select("review_count, avg_rating")
        .eq("tool_id", id)
        .single();
      if (r) rating = r;
    } catch (_) { /* view may not exist yet */ }

    res.json({ success: true, tool: { ...tool, ...rating } });
  } catch (error) {
    console.error("❌ Error fetching tool:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/favorites - list current user's favorites
app.get("/api/favorites", authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("favorites")
      .select("tool_id, created_at, ai_tools(*)")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ success: true, favorites: data || [] });
  } catch (error) {
    console.error("❌ Favorites list error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/favorites { tool_id } - add favorite
app.post("/api/favorites", authMiddleware, async (req, res) => {
  try {
    const { tool_id } = req.body;
    if (!tool_id) return res.status(400).json({ success: false, error: "tool_id is required" });

    const { data, error } = await supabase
      .from("favorites")
      .insert([{ user_id: req.user.id, tool_id }])
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return res.status(200).json({ success: true, message: "Already favorited", favorite: null });
      }
      throw error;
    }
    res.status(201).json({ success: true, favorite: data });
  } catch (error) {
    console.error("❌ Favorite add error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/favorites/:toolId
app.delete("/api/favorites/:toolId", authMiddleware, async (req, res) => {
  try {
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("user_id", req.user.id)
      .eq("tool_id", req.params.toolId);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error("❌ Favorite delete error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/tools/:id/reviews
app.get("/api/tools/:id/reviews", async (req, res) => {
  try {
    const { data: reviews, error } = await supabase
      .from("reviews")
      .select("id, rating, comment, created_at, user_id")
      .eq("tool_id", req.params.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    // Hydrate user display info from public.users (no FK join — fetch in batch)
    const userIds = [...new Set((reviews || []).map(r => r.user_id).filter(Boolean))];
    let usersById = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, name, avatar_url")
        .in("id", userIds);
      if (users) usersById = Object.fromEntries(users.map(u => [u.id, u]));
    }
    const hydrated = (reviews || []).map(r => ({
      ...r,
      users: usersById[r.user_id] || null,
    }));
    res.json({ success: true, reviews: hydrated });
  } catch (error) {
    console.error("❌ Reviews list error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/tools/:id/reviews { rating, comment }
app.post("/api/tools/:id/reviews", authMiddleware, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const ratingNum = parseInt(rating, 10);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ success: false, error: "rating must be 1..5" });
    }
    if (comment && String(comment).length > 2000) {
      return res.status(400).json({ success: false, error: "comment too long" });
    }

    // Upsert: one review per user per tool
    const { data, error } = await supabase
      .from("reviews")
      .upsert(
        [{
          user_id: req.user.id,
          tool_id: req.params.id,
          rating: ratingNum,
          comment: comment ? String(comment).trim() : null,
        }],
        { onConflict: "user_id,tool_id" }
      )
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, review: data });
  } catch (error) {
    console.error("❌ Review save error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/tools/:id/reviews (delete current user's review)
app.delete("/api/tools/:id/reviews", authMiddleware, async (req, res) => {
  try {
    const { error } = await supabase
      .from("reviews")
      .delete()
      .eq("user_id", req.user.id)
      .eq("tool_id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error("❌ Review delete error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/reviews/mine - current user's reviews (with tool name)
app.get("/api/reviews/mine", authMiddleware, async (req, res) => {
  try {
    const { data: reviews, error } = await supabase
      .from("reviews")
      .select("id, tool_id, rating, comment, created_at")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    // Batch-hydrate tool names
    const toolIds = [...new Set((reviews || []).map(r => r.tool_id).filter(Boolean))];
    let toolsById = {};
    if (toolIds.length > 0) {
      const { data: tools } = await supabase
        .from("ai_tools")
        .select("id, name")
        .in("id", toolIds);
      if (tools) toolsById = Object.fromEntries(tools.map(t => [t.id, t.name]));
    }
    const hydrated = (reviews || []).map(r => ({
      ...r,
      tool_name: toolsById[r.tool_id] || null,
    }));
    res.json({ success: true, reviews: hydrated });
  } catch (error) {
    console.error("❌ My reviews error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/profile - current user's profile
app.get("/api/profile", authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, role, sector, avatar_url, bio, website, twitter, linkedin, created_at, is_admin")
      .eq("id", req.user.id)
      .single();

    if (error) {
      // If user row doesn't exist yet, return minimal profile
      return res.json({
        success: true,
        profile: { id: req.user.id, email: req.user.email, name: null, avatar_url: null, bio: null }
      });
    }
    res.json({ success: true, profile: data });
  } catch (error) {
    console.error("❌ Profile get error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/profile { name, bio, website, twitter, linkedin, avatar_url, sector }
app.put("/api/profile", authMiddleware, async (req, res) => {
  try {
    const allowed = ["name", "bio", "website", "twitter", "linkedin", "avatar_url", "sector"];
    const update = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) update[k] = req.body[k];
    }
    if (update.bio && String(update.bio).length > 500) {
      return res.status(400).json({ success: false, error: "bio too long (max 500)" });
    }
    if (update.website && !/^https?:\/\//i.test(update.website)) {
      return res.status(400).json({ success: false, error: "website must start with http(s)://" });
    }

    const { data, error } = await supabase
      .from("users")
      .update(update)
      .eq("id", req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, profile: data });
  } catch (error) {
    console.error("❌ Profile update error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/auth/welcome-email { email, name } - send welcome email after signup
app.post("/api/auth/welcome-email", authRateLimit, async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email) return res.status(400).json({ success: false, error: "email required" });
    if (!resend) {
      return res.json({ success: true, skipped: "RESEND_API_KEY not configured" });
    }

    const siteUrl = process.env.SITE_URL || "http://localhost:3000";
    const displayName = (name && String(name).trim()) || "there";

    await resend.emails.send({
      from: process.env.FROM_EMAIL || "welcome@aicraft.co",
      to: email,
      subject: "Welcome to AICraft 🚀",
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#06060b;color:#fff;border-radius:20px">
          <h1 style="font-size:28px;background:linear-gradient(135deg,#7c6cff,#18e0ff);-webkit-background-clip:text;background-clip:text;color:transparent">Welcome, ${displayName}!</h1>
          <p style="color:#a5a5b8;line-height:1.6">Thanks for joining AICraft — the marketplace for AI automation tools across every sector.</p>
          <p style="color:#a5a5b8;line-height:1.6">Here's what you can do next:</p>
          <ul style="color:#a5a5b8;line-height:1.8">
            <li>Browse 50+ curated AI tools</li>
            <li>Favorite the ones you love</li>
            <li>Share reviews with the community</li>
            <li>Submit your own tool to reach thousands of users</li>
          </ul>
          <a href="${siteUrl}/dashboard.html" style="display:inline-block;margin-top:16px;padding:12px 24px;background:linear-gradient(135deg,#7c6cff,#18e0ff);color:#fff;border-radius:12px;text-decoration:none;font-weight:600">Go to Dashboard</a>
          <p style="color:#6f6f85;font-size:12px;margin-top:32px">— The AICraft Team</p>
        </div>
      `,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("❌ Welcome email error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ADMIN: Review moderation
// GET    /api/admin/reviews              — list recent reviews
// DELETE /api/admin/reviews/:id          — delete a review (moderation)
// ============================================
app.get("/api/admin/reviews", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const { data: reviews, error } = await supabase
      .from("reviews")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    // Hydrate tool names + user emails in batch
    const toolIds = [...new Set(reviews.map((r) => r.tool_id))];
    const userIds = [...new Set(reviews.map((r) => r.user_id))];

    const [{ data: tools }, { data: users }] = await Promise.all([
      toolIds.length
        ? supabase.from("ai_tools").select("id, name").in("id", toolIds)
        : Promise.resolve({ data: [] }),
      userIds.length
        ? supabase.from("users").select("id, email, name").in("id", userIds)
        : Promise.resolve({ data: [] }),
    ]);

    const toolMap = Object.fromEntries((tools || []).map((t) => [t.id, t.name]));
    const userMap = Object.fromEntries((users || []).map((u) => [u.id, u]));

    const enriched = reviews.map((r) => ({
      ...r,
      tool_name: toolMap[r.tool_id] || "Unknown",
      user_email: userMap[r.user_id]?.email || null,
      user_name: userMap[r.user_id]?.name || null,
    }));

    res.json({ success: true, count: enriched.length, reviews: enriched });
  } catch (error) {
    console.error("❌ Admin reviews error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete("/api/admin/reviews/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { error } = await supabase.from("reviews").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error("❌ Admin delete review error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ADMIN: Tool approval workflow
// GET  /api/admin/tools?status=pending|approved|rejected
// PUT  /api/admin/tools/:id  { status, rejection_reason? }
// ============================================
app.get("/api/admin/tools", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    let q = supabase.from("ai_tools").select("*").order("created_at", { ascending: false });
    if (status) q = q.eq("status", status);
    const { data, error } = await q.limit(200);
    if (error) throw error;
    res.json({ success: true, count: data.length, tools: data });
  } catch (error) {
    console.error("❌ Admin tools list error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put("/api/admin/tools/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, rejection_reason, featured } = req.body;
    const update = {};
    if (status) {
      if (!["pending", "approved", "rejected"].includes(status)) {
        return res.status(400).json({ success: false, error: "Invalid status" });
      }
      update.status = status;
    }
    if (rejection_reason !== undefined) update.rejection_reason = rejection_reason;
    if (featured !== undefined) update.featured = !!featured;

    const { data, error } = await supabase
      .from("ai_tools")
      .update(update)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, tool: data });
  } catch (error) {
    console.error("❌ Admin tool update error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// STRIPE CHECKOUT (PHASE 2 STUB)
// Returns a 501 until STRIPE_SECRET_KEY is configured.
// When ready, swap in real Stripe integration.
// ============================================
app.post("/api/checkout/session", authMiddleware, async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(501).json({
      success: false,
      error: "Payments coming soon",
      message: "Stripe is not configured yet. Phase 2 feature.",
    });
  }
  // TODO: implement Stripe checkout session creation
  return res.status(501).json({ success: false, error: "Not implemented" });
});

// ============================================
// SALESFORCE DEVELOPER TOOLKIT
// Mount before catch-all. Routes exposed at /api/salesforce/*
// Uses the same Supabase authMiddleware + per-user rateLimit.
// ============================================
app.use(
  "/api/salesforce",
  buildSalesforceRouter({ authMiddleware, rateLimit })
);

// ============================================
// CATCH ALL
//   - Unknown /api routes → JSON 404
//   - Anything else → serve index.html (client-side routing fallback)
// Uses a regex to stay compatible with Express 4 + 5.
// ============================================
app.use("/api", (req, res) => {
  res.status(404).json({ success: false, error: "Endpoint not found", path: req.originalUrl });
});

app.use((req, res) => {
  // Only serve the 404 page for missing GETs that look like pages.
  // Everything else gets a plain 404.
  if (req.method !== "GET") return res.status(404).send("Not Found");
  res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
});

// ============================================
// GLOBAL ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
  console.error("💥 Unhandled Error:", err.stack);
  if (err && err.message && err.message.startsWith("CORS:")) {
    return res.status(403).json({ success: false, error: err.message });
  }
  res.status(500).json({
    success: false,
    error: "Internal Server Error",
    message: err.message,
  });
});

// ============================================
// START SERVER
// ============================================
// Bind to 0.0.0.0 so Render / Docker / any PaaS can route traffic in.
const server = app.listen(PORT, "0.0.0.0", () => {
  const sbUrlOk = !!process.env.SUPABASE_URL;
  const sbAnonOk = !!process.env.SUPABASE_ANON_KEY;
  const sbSvcOk = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║     🤖 AICraft Server Started          ║");
  console.log("╠════════════════════════════════════════╣");
  console.log(`║  🌐 Port:  ${String(PORT).padEnd(28)}║`);
  console.log(`║  📦 Mode:  ${String(process.env.NODE_ENV || "development").padEnd(28)}║`);
  console.log(`║  ✉️  Email: ${String(resend ? "enabled" : "disabled").padEnd(28)}║`);
  console.log(`║  🔑 Supabase URL: ${(sbUrlOk ? "ok" : "MISSING").padEnd(21)}║`);
  console.log(`║  🔑 Anon key:     ${(sbAnonOk ? "ok" : "MISSING").padEnd(21)}║`);
  console.log(`║  🔑 Service key:  ${(sbSvcOk ? "ok" : "MISSING").padEnd(21)}║`);
  console.log("╚════════════════════════════════════════╝\n");
  if (!sbUrlOk || !sbAnonOk) {
    console.error("⚠️  Signup/login will FAIL until SUPABASE_URL and SUPABASE_ANON_KEY are set in .env");
  }
});

// Graceful shutdown for PaaS signals
const shutdown = (signal) => {
  console.log(`\n🛑 ${signal} received — shutting down gracefully…`);
  server.close(() => {
    console.log("✅ HTTP server closed");
    process.exit(0);
  });
  // Hard exit after 10s if close hangs
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default app;
