// server.js
// AICraft - Main Express Server
// AI Automation Tools Marketplace Backend

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import supabase from "./supabaseClient.js";

// Load environment variables
dotenv.config();

// Fix __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE SETUP
// ============================================

// Enable CORS for all origins
app.use(
  cors({
    origin: process.env.SITE_URL,
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
