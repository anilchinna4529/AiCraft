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

// Load environment variables
dotenv.config();

// Fix __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Resend for email notifications
const resend = new Resend(process.env.RESEND_API_KEY);

// ============================================
// MIDDLEWARE SETUP
// ============================================

// Enable CORS — allow localhost for development, restrict to SITE_URL in production
const corsOrigin = process.env.NODE_ENV === 'production' ? process.env.SITE_URL : ['http://localhost:3000', 'http://localhost:5173'];
app.use(
  cors({
    origin: corsOrigin,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
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
    const { category, sector, limit = 50 } = req.query;

    let query = supabase
      .from("ai_tools")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(parseInt(limit));

    // Optional filters
    if (category) query = query.eq("category", category);
    if (sector) query = query.eq("sector", sector);

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
    res.status(200).json({
      success: true,
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
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
app.post("/api/auth/resend-otp", async (req, res) => {
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
app.post("/api/auth/reset-password", async (req, res) => {
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
  if (!process.env.RESEND_API_KEY || adminEmails.length === 0) return;
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
app.post("/api/auth/login-log", async (req, res) => {
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
          login_count: supabase.raw("login_count + 1"),
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
// CATCH ALL: Serve frontend for unknown routes
// ============================================
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ============================================
// GLOBAL ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
  console.error("💥 Unhandled Error:", err.stack);
  res.status(500).json({
    success: false,
    error: "Internal Server Error",
    message: err.message,
  });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log("\n");
  console.log("╔════════════════════════════════════════╗");
  console.log("║     🤖 AICraft Server Started          ║");
  console.log("╠════════════════════════════════════════╣");
  console.log(`║  🌐 URL:  http://localhost:${PORT}         ║`);
  console.log(`║  📦 Mode: ${process.env.NODE_ENV || "development"}               ║`);
  console.log("║  ✅ Supabase: Connected                ║");
  console.log("╚════════════════════════════════════════╝");
  console.log("\n📡 API Endpoints Ready:");
  console.log("  GET  → /api/tools");
  console.log("  POST → /api/tools");
  console.log("  GET  → /api/users");
  console.log("  POST → /api/users");
  console.log("  GET  → /api/actions");
  console.log("  POST → /api/actions");
  console.log("  GET  → /api/sectors");
  console.log("  GET  → /api/stats\n");
});

export default app;
