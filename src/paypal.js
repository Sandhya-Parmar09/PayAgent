// Thin wrapper around the PayPal REST Invoicing API (sandbox by default).
// This is deliberately dependency-free: it uses the global fetch in Node 18+.
// The functions here are what the AI agent's "tools" ultimately call.

import { withRetry } from "./retry.js";

const ENV = process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
const BASE =
  ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

// Cache the OAuth token so we don't re-auth on every call.
let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) return cachedToken;

  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error(
      "Missing PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET. Copy .env.example to .env and fill them in.",
    );
  }

  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await withRetry(
    () =>
      fetch(`${BASE}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      }),
    { label: "PayPal auth" },
  );

  if (!res.ok) {
    throw new Error(`PayPal auth failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + data.expires_in * 1000;
  return cachedToken;
}

// Generic authenticated request helper.
async function ppFetch(path, { method = "GET", body } = {}) {
  const token = await getAccessToken();
  const res = await withRetry(
    () =>
      fetch(`${BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    { label: `PayPal ${method} ${path}` },
  );

  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = json?.details?.[0]?.description || json?.message || text;
    throw new Error(`PayPal ${method} ${path} failed (${res.status}): ${detail}`);
  }
  return json;
}

// Pull the invoice id out of PayPal's "self" href, e.g.
// https://api-m.sandbox.paypal.com/v2/invoicing/invoices/INV2-XXXX-...  ->  INV2-XXXX-...
function idFromHref(href) {
  return href ? href.split("/").pop() : null;
}

function formatAmount(value) {
  return Number(value).toFixed(2);
}

// --- The operations the agent can perform -----------------------------------

// Create a DRAFT invoice. Nothing is sent and no money moves — this is the safe
// "propose" step. Sending is a separate, confirmed action (see sendInvoice).
export async function createDraftInvoice({
  recipientEmail,
  recipientName,
  itemDescription,
  amount,
  currency = process.env.DEFAULT_CURRENCY || "USD",
  dueDays,
  note,
}) {
  const [given, ...rest] = (recipientName || "").trim().split(/\s+/);
  const detail = { currency_code: currency };
  if (note) detail.note = note;
  if (dueDays != null) {
    const due = new Date(Date.now() + Number(dueDays) * 86_400_000);
    detail.payment_term = { due_date: due.toISOString().slice(0, 10) };
  }

  const payload = {
    detail,
    primary_recipients: [
      {
        billing_info: {
          email_address: recipientEmail,
          ...(recipientName
            ? { name: { given_name: given, surname: rest.join(" ") || given } }
            : {}),
        },
      },
    ],
    items: [
      {
        name: itemDescription || "Services",
        quantity: "1",
        unit_amount: { currency_code: currency, value: formatAmount(amount) },
      },
    ],
  };

  const created = await ppFetch("/v2/invoicing/invoices", {
    method: "POST",
    body: payload,
  });
  const id = created.id || idFromHref(created.href);
  const invoice = await getInvoice(id);
  return summarize(invoice);
}

// Send an existing draft invoice to the recipient. This is the real action
// gated behind user confirmation in the app.
export async function sendInvoice({ invoiceId }) {
  await ppFetch(`/v2/invoicing/invoices/${invoiceId}/send`, {
    method: "POST",
    body: { send_to_invoicer: false },
  });
  const invoice = await getInvoice(invoiceId);
  return summarize(invoice);
}

// Send a payment reminder for an unpaid invoice. Also a confirmed action.
export async function sendReminder({ invoiceId, subject, note }) {
  await ppFetch(`/v2/invoicing/invoices/${invoiceId}/remind`, {
    method: "POST",
    body: {
      subject: subject || "Payment reminder",
      note: note || "This is a friendly reminder that your invoice is due.",
    },
  });
  const invoice = await getInvoice(invoiceId);
  return summarize(invoice);
}

export async function listInvoices({ pageSize = 20 } = {}) {
  const data = await ppFetch(
    `/v2/invoicing/invoices?page_size=${pageSize}&total_required=true`,
  );
  return (data.items || []).map(summarize);
}

export async function getInvoice(invoiceId) {
  if (typeof invoiceId === "object" && invoiceId) invoiceId = invoiceId.invoiceId;
  const invoice = await ppFetch(`/v2/invoicing/invoices/${invoiceId}`);
  return invoice; // raw; callers that want a summary call summarize()
}

// Turn a raw PayPal invoice into a compact, UI- and model-friendly shape.
export function summarize(invoice) {
  const recipient = invoice?.primary_recipients?.[0]?.billing_info || {};
  const amt =
    invoice?.amount ||
    invoice?.detail?.total_amount ||
    invoice?.items?.[0]?.unit_amount ||
    {};
  return {
    id: invoice.id,
    status: invoice.status, // DRAFT | SENT | PAID | MARKED_AS_PAID | UNPAID | ...
    recipientEmail: recipient.email_address || null,
    recipientName:
      [recipient?.name?.given_name, recipient?.name?.surname]
        .filter(Boolean)
        .join(" ") || null,
    description: invoice?.items?.[0]?.name || null,
    amount: amt.value || null,
    currency: amt.currency_code || invoice?.detail?.currency_code || null,
    dueDate: invoice?.detail?.payment_term?.due_date || null,
    invoiceNumber: invoice?.detail?.invoice_number || null,
  };
}

export const paypalMeta = { env: ENV, base: BASE };
