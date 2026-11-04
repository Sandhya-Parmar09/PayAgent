// Tool definitions handed to Gemini (as functionDeclarations), plus the mapping
// from a tool name to the PayPal function that actually runs it.
//
// "gated" tools move money / send things to a real person. We never execute
// them inside the agent loop — the backend intercepts the call and asks the
// user to confirm first. "safe" tools (drafting, reading) run immediately.

import { Type } from "@google/genai";
import {
  createDraftInvoice,
  sendInvoice,
  sendReminder,
  listInvoices,
  getInvoice,
  summarize,
} from "./paypal.js";

// Gemini function declarations.
export const functionDeclarations = [
  {
    name: "create_invoice",
    description:
      "Create a DRAFT PayPal invoice. This does NOT send it and moves no money — it just prepares the invoice so the user can review it. Use this whenever the user wants to bill someone. Ask for any missing required fields first.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        recipientEmail: {
          type: Type.STRING,
          description: "Email address of the person/business being billed.",
        },
        recipientName: {
          type: Type.STRING,
          description: "Full name of the recipient (optional).",
        },
        itemDescription: {
          type: Type.STRING,
          description: "What the invoice is for, e.g. 'October design work'.",
        },
        amount: {
          type: Type.NUMBER,
          description: "The amount to bill, as a number (e.g. 400 or 400.50).",
        },
        currency: {
          type: Type.STRING,
          description: "3-letter currency code. Defaults to USD.",
        },
        dueDays: {
          type: Type.INTEGER,
          description: "How many days from today the invoice is due (optional), e.g. 15.",
        },
        note: {
          type: Type.STRING,
          description: "An optional note shown to the recipient.",
        },
      },
      required: ["recipientEmail", "itemDescription", "amount"],
    },
  },
  {
    name: "send_invoice",
    description:
      "Send an existing DRAFT invoice to its recipient. This is a real action that notifies the recipient, so it requires the user's explicit confirmation.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        invoiceId: { type: Type.STRING, description: "The PayPal invoice id, e.g. INV2-XXXX-...." },
      },
      required: ["invoiceId"],
    },
  },
  {
    name: "send_reminder",
    description:
      "Send a payment reminder for an unpaid invoice. Real action — requires the user's explicit confirmation.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        invoiceId: { type: Type.STRING },
        subject: { type: Type.STRING, description: "Optional reminder subject line." },
        note: { type: Type.STRING, description: "Optional reminder message." },
      },
      required: ["invoiceId"],
    },
  },
  {
    name: "list_invoices",
    description:
      "List the most recent invoices with their status (DRAFT, SENT, PAID, etc.). Use this to answer questions about what's outstanding or overdue.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_invoice",
    description: "Get the full details and current status of a single invoice by id.",
    parameters: {
      type: Type.OBJECT,
      properties: { invoiceId: { type: Type.STRING } },
      required: ["invoiceId"],
    },
  },
];

// Actions that require human confirmation before they run.
export const GATED = new Set(["send_invoice", "send_reminder"]);

// Execute a tool call for real against PayPal.
export async function executeTool(name, input) {
  input = input || {};
  switch (name) {
    case "create_invoice":
      return await createDraftInvoice(input);
    case "send_invoice":
      return await sendInvoice(input);
    case "send_reminder":
      return await sendReminder(input);
    case "list_invoices":
      return await listInvoices(input);
    case "get_invoice":
      return summarize(await getInvoice(input.invoiceId));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// A short, human-readable description of a pending gated action, for the
// confirmation card in the UI.
export function describeAction(name, input) {
  if (name === "send_invoice")
    return `Send invoice ${input.invoiceId} to its recipient`;
  if (name === "send_reminder")
    return `Send a payment reminder for invoice ${input.invoiceId}`;
  return `${name} ${JSON.stringify(input)}`;
}
