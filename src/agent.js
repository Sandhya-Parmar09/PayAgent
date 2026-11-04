// The AI agent: it runs a manual function-calling loop with Google Gemini.
// Gemini decides which PayPal action to take; the backend executes safe actions
// immediately and defers "gated" (money/send) actions to user confirmation.

import { GoogleGenAI } from "@google/genai";
import { functionDeclarations, GATED, executeTool, describeAction } from "./tools.js";
import { withRetry } from "./retry.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
const MAX_ITERATIONS = 6;

const SYSTEM_PROMPT = `You are PayAgent, an AI invoicing assistant for freelancers and small businesses. You help the user bill clients and track payments using their PayPal account (sandbox).

How you work:
- When the user wants to bill someone, use create_invoice to prepare a DRAFT. Drafting is safe and moves no money. If a required field is missing (recipient email, what it's for, or the amount), ask one short clarifying question instead of guessing.
- Never send an invoice or a reminder on your own. When the user asks to send, call send_invoice / send_reminder — the app will ask the user to confirm before it actually goes out. After requesting such an action, tell the user it is ready and waiting for their confirmation.
- Use list_invoices / get_invoice to answer questions about what's outstanding, paid, or overdue.
- Currencies: PayPal invoicing supports many currencies (USD, EUR, GBP, AUD, CAD, SGD, JPY and more). Pass the currency the user asks for. However, PayPal does NOT support INR (Indian Rupee) or a few other currencies for invoicing — if the user asks for an unsupported currency, briefly explain PayPal can't invoice in it and offer a supported one like USD or EUR.
- Be concise and friendly. Confirm amounts and recipients clearly. Never invent invoice ids, statuses, or amounts — only state what the tools return.`;

const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "AUD", "CAD", "SGD"];

// sessions: Map<sessionId, Content[]>  (Gemini conversation history)
const sessions = new Map();

function getHistory(sessionId) {
  if (!sessions.has(sessionId)) sessions.set(sessionId, []);
  return sessions.get(sessionId);
}

// Run one user turn. Returns { reply, pendingActions, invoicesChanged }.
export async function runTurn(sessionId, userMessage, { defaultCurrency } = {}) {
  const currency = SUPPORTED_CURRENCIES.includes(defaultCurrency) ? defaultCurrency : "USD";

  // Build the per-turn config so the model knows the chosen default currency.
  const config = {
    systemInstruction:
      SYSTEM_PROMPT +
      `\n\nThe user's selected default currency is ${currency}. Use it for new invoices unless the user explicitly names a different currency.`,
    tools: [{ functionDeclarations }],
  };

  const contents = getHistory(sessionId);
  contents.push({ role: "user", parts: [{ text: userMessage }] });

  const replyParts = [];
  const pendingActions = [];
  let invoicesChanged = false;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await withRetry(
      () => ai.models.generateContent({ model: MODEL, contents, config }),
      { label: "gemini generateContent" },
    );

    const modelContent = response.candidates?.[0]?.content;
    if (!modelContent) break;

    // Preserve the model's turn (text and/or functionCall parts) in history.
    contents.push(modelContent);

    for (const part of modelContent.parts || []) {
      if (part.text && part.text.trim()) replyParts.push(part.text);
    }

    const calls = response.functionCalls || [];
    if (calls.length === 0) break;

    const responseParts = [];
    for (const call of calls) {
      const input = call.args || {};
      if (GATED.has(call.name)) {
        // Do NOT execute. Record it for the UI and tell Gemini it's pending.
        pendingActions.push({
          tool: call.name,
          input,
          description: describeAction(call.name, input),
        });
        responseParts.push({
          functionResponse: {
            name: call.name,
            response: {
              result:
                "NOT EXECUTED. This action requires explicit user confirmation. A confirmation prompt has been shown to the user; do not retry it automatically.",
            },
          },
        });
      } else {
        try {
          // If the model didn't specify a currency, use the user's chosen default.
          if (call.name === "create_invoice" && !input.currency) input.currency = currency;
          const result = await executeTool(call.name, input);
          if (call.name === "create_invoice") invoicesChanged = true;
          responseParts.push({
            functionResponse: { name: call.name, response: { result } },
          });
        } catch (err) {
          responseParts.push({
            functionResponse: { name: call.name, response: { error: err.message } },
          });
        }
      }
    }

    contents.push({ role: "user", parts: responseParts });
  }

  return {
    reply: replyParts.join("\n\n").trim() || "(no response)",
    pendingActions,
    invoicesChanged,
  };
}

// Called after the user clicks "Confirm" on a gated action. Executes it for
// real, then records the outcome in the conversation so the agent stays aware.
export async function confirmAction(sessionId, action) {
  const result = await executeTool(action.tool, action.input);
  const contents = getHistory(sessionId);
  contents.push({
    role: "user",
    parts: [
      {
        text: `[Confirmed by user] The action "${action.tool}" was executed. Result: ${JSON.stringify(result)}`,
      },
    ],
  });
  return result;
}

export function resetSession(sessionId) {
  sessions.delete(sessionId);
}
