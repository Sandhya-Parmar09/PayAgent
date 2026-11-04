// Express server: serves the web UI and exposes the agent + invoice endpoints.

import "dotenv/config";
import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { runTurn, confirmAction, resetSession } from "./agent.js";
import { listInvoices, paypalMeta } from "./paypal.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "..", "public")));

// Friendly guard so the app fails loudly if the keys aren't set.
function checkConfig() {
  const missing = [];
  if (!process.env.PAYPAL_CLIENT_ID) missing.push("PAYPAL_CLIENT_ID");
  if (!process.env.PAYPAL_CLIENT_SECRET) missing.push("PAYPAL_CLIENT_SECRET");
  if (!process.env.GEMINI_API_KEY) missing.push("GEMINI_API_KEY");
  return missing;
}

app.get("/api/health", (req, res) => {
  res.json({ ok: checkConfig().length === 0, missing: checkConfig(), env: paypalMeta.env });
});

// Turn raw errors into something the user can act on.
function friendlyError(err) {
  const msg = (err?.message || "").toLowerCase();
  if (msg.includes("fetch failed") || msg.includes("network") || msg.includes("timeout")) {
    return "Couldn't reach an external service (Gemini or PayPal). This is usually a temporary network issue — please check your internet connection and try again.";
  }
  if (msg.includes("503") || msg.includes("unavailable") || msg.includes("high demand") || msg.includes("overloaded")) {
    return "The Gemini model is temporarily busy (high demand). This is on Google's side and usually clears in a moment — please try again.";
  }
  if (msg.includes("currency code is not valid")) {
    return "PayPal can't create an invoice in that currency. Try a supported one like USD, EUR, or GBP (PayPal invoicing doesn't support INR).";
  }
  return err.message;
}

// Main chat endpoint — one user turn through the agent.
app.post("/api/chat", async (req, res) => {
  const missing = checkConfig();
  if (missing.length) return res.status(500).json({ error: `Missing env vars: ${missing.join(", ")}` });

  const { sessionId, message, currency } = req.body || {};
  if (!sessionId || !message) return res.status(400).json({ error: "sessionId and message are required" });

  try {
    const result = await runTurn(sessionId, message, { defaultCurrency: currency });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: friendlyError(err) });
  }
});

// Execute a gated action the user has confirmed.
app.post("/api/confirm", async (req, res) => {
  const { sessionId, action } = req.body || {};
  if (!sessionId || !action) return res.status(400).json({ error: "sessionId and action are required" });
  try {
    const result = await confirmAction(sessionId, action);
    res.json({ result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: friendlyError(err) });
  }
});

// Invoice dashboard data.
app.get("/api/invoices", async (req, res) => {
  try {
    res.json({ invoices: await listInvoices({}) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/reset", (req, res) => {
  const { sessionId } = req.body || {};
  if (sessionId) resetSession(sessionId);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const missing = checkConfig();
  console.log(`\n  PayAgent running on http://localhost:${PORT}  (PayPal ${paypalMeta.env})`);
  if (missing.length) {
    console.log(`  ⚠  Missing env vars: ${missing.join(", ")} — copy .env.example to .env and fill them in.\n`);
  } else {
    console.log("");
  }
});
