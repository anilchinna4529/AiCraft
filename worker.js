// worker.js
// AICraft Background Worker
// Simulates AI processing and monitors the platform

import supabase from "./supabaseClient.js";
import dotenv from "dotenv";

dotenv.config();

const WORKER_INTERVAL = 10000; // 10 seconds
let workerCycle = 0;

// ============================================
// DISPLAY WORKER BANNER
// ============================================
function displayBanner() {
  console.log("\n");
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   🔧 AICraft Background Worker Started   ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log("║  ⏱️  Interval: Every 10 seconds           ║");
  console.log("║  🤖 Task: Monitor AI Tools Platform      ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log("");
}

// ============================================
// FETCH AND LOG AI TOOLS
// ============================================
async function monitorAITools() {
  try {
    const { data: tools, error, count } = await supabase
      .from("ai_tools")
      .select("*", { count: "exact" });

    if (error) throw error;

    const totalTools = tools?.length || 0;

    console.log(`\n📊 [Cycle #${workerCycle}] AI Tools Monitor:`);
    console.log(`   🛠️  Total Tools in Database: ${totalTools}`);

    if (tools && tools.length > 0) {
      // Group tools by sector
      const bySector = tools.reduce((acc, tool) => {
        const sector = tool.sector || "General";
        acc[sector] = (acc[sector] || 0) + 1;
        return acc;
      }, {});

      console.log("   📂 Tools by Sector:");
      Object.entries(bySector).forEach(([sector, count]) => {
        console.log(`      → ${sector}: ${count} tool(s)`);
      });

      // Group by category
      const byCategory = tools.reduce((acc, tool) => {
        const category = tool.category || "Uncategorized";
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {});

      console.log("   🏷️  Tools by Category:");
      Object.entries(byCategory).forEach(([cat, count]) => {
        console.log(`      → ${cat}: ${count} tool(s)`);
      });
    } else {
      console.log("   ⚠️  No tools found in database yet");
      console.log("   💡 Add tools via POST /api/tools");
    }

    return totalTools;
  } catch (error) {
    console.error("   ❌ Error monitoring tools:", error.message);
    return 0;
  }
}

// ============================================
// FETCH AND LOG USERS
// ============================================
async function monitorUsers() {
  try {
    const { data: users, error } = await supabase
      .from("users")
      .select("id, name, sector, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) throw error;

    console.log(`\n   👥 Recent Users: ${users?.length || 0} (last 5)`);

    if (users && users.length > 0) {
      users.forEach((user) => {
        console.log(`      → ${user.name} | Sector: ${user.sector || "N/A"}`);
      });
    }
  } catch (error) {
    console.error("   ❌ Error monitoring users:", error.message);
  }
}

// ============================================
// SIMULATE AI PROCESSING
// ============================================
async function simulateAIProcessing(toolCount) {
  const tasks = [
    "Analyzing tool performance metrics...",
    "Running AI model validation checks...",
    "Updating recommendation engine...",
    "Processing user behavior patterns...",
    "Optimizing search algorithms...",
    "Syncing cross-sector data pipelines...",
    "Refreshing AI tool rankings...",
    "Scanning for new automation opportunities...",
  ];

  const randomTask = tasks[Math.floor(Math.random() * tasks.length)];
  console.log(`\n   🤖 AI Processing: ${randomTask}`);
  console.log(`   💡 Processing ${toolCount} tools across all sectors`);

  // Simulate processing time
  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log("   ✅ Processing cycle complete");
}

// ============================================
// LOG SYSTEM HEALTH
// ============================================
function logSystemHealth() {
  const memUsage = process.memoryUsage();
  const memMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
  const uptime = process.uptime().toFixed(0);

  console.log("\n   💻 System Health:");
  console.log(`      → Memory Used: ${memMB} MB`);
  console.log(`      → Worker Uptime: ${uptime}s`);
  console.log(`      → Node Version: ${process.version}`);
  console.log(`      → Timestamp: ${new Date().toLocaleString()}`);
}

// ============================================
// MAIN WORKER CYCLE
// ============================================
async function runWorkerCycle() {
  workerCycle++;

  console.log("\n" + "═".repeat(50));
  console.log(`🔄 WORKER CYCLE #${workerCycle} | ${new Date().toISOString()}`);
  console.log("═".repeat(50));

  try {
    // Step 1: Monitor AI Tools
    const toolCount = await monitorAITools();

    // Step 2: Monitor Users
    await monitorUsers();

    // Step 3: Simulate AI Processing
    await simulateAIProcessing(toolCount);

    // Step 4: Log System Health
    logSystemHealth();

    console.log(`\n⏭️  Next cycle in 10 seconds...\n`);
  } catch (error) {
    console.error("💥 Worker cycle failed:", error.message);
  }
}

// ============================================
// START WORKER
// ============================================
displayBanner();

// Run immediately on start
runWorkerCycle();

// Then run every 10 seconds
const workerTimer = setInterval(runWorkerCycle, WORKER_INTERVAL);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\n🛑 Worker shutting down gracefully...");
  clearInterval(workerTimer);
  console.log(`✅ Worker completed ${workerCycle} cycles. Goodbye!\n`);
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error.message);
});
