# PayAgent — AI Invoicing & Payments Agent

**PayPal AI Hackathon entry.** PayAgent is a conversational AI agent that lets
freelancers and small businesses **create, send, track, and chase invoices in
plain English**. You talk to it; it does the PayPal work for you.

> _"Invoice sam@example.com $400 for October design work, due in 15 days."_
> → PayAgent prepares a real PayPal invoice, shows it to you, and sends it on one click.

It combines **two technologies, with PayPal at the core**:

- **PayPal Developer Platform** (Invoicing API, sandbox) — the agent creates,
  sends, reminds, and reads real invoices.
- **Google Gemini** — an LLM with function-calling drives those PayPal actions
  from natural language.

This is **agentic commerce**: the AI genuinely *acts* on PayPal, rather than
just talking about it — with a human-confirmation gate before anything is sent.

---

## ✨ What it does

- **Create invoices by chatting.** The agent extracts the recipient, amount,
  description, and due date, and creates a real PayPal **draft** invoice.
- **Human-in-the-loop sending.** Drafting is automatic and safe; **sending** an
  invoice or a **reminder** always requires an explicit one-click confirmation.
- **Track status.** Ask "what's unpaid?" or "did Acme pay?" and the agent reads
  live invoice status from PayPal.
- **Live dashboard.** A side panel lists every invoice with its status
  (DRAFT / SENT / PAID).

---

## 🏗 How it works

```
You ──▶ Web UI ──▶ /api/chat ──▶ Agent loop (Gemini)
                                      │  Gemini decides which PayPal action to take
                                      ▼
                        ┌─────────────────────────────┐
         safe action    │  create_invoice (draft)     │  ── runs immediately
         (no money)     │  list_invoices / get_invoice│
                        ├─────────────────────────────┤
         gated action   │  send_invoice               │  ── paused for your
         (real/sends)   │  send_reminder              │     confirmation first
                        └──────────────┬──────────────┘
                                       ▼
                              PayPal Invoicing API (sandbox)
```

- `src/agent.js` — runs the Gemini function-calling loop and the confirmation gate.
- `src/paypal.js` — PayPal REST Invoicing calls (OAuth + create/send/remind/list/get).
- `src/tools.js` — the tool definitions Gemini sees, and which ones are "gated".
- `src/server.js` — Express API + static web UI.
- `public/` — the chat + dashboard front-end.

---

## 🚀 Run it locally (for judges)

### 1. Prerequisites
- **Node.js 18+**
- A free **PayPal Developer** account — https://developer.paypal.com/
- A **Google Gemini API key** — https://aistudio.google.com/apikey (free)

### 2. Get PayPal sandbox credentials
1. Log in to the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/).
2. Under **Apps & Credentials → Sandbox**, create (or open) a REST app.
3. Copy the **Client ID** and **Secret**.
4. Under **Testing Tools → Sandbox Accounts**, note a sandbox **Business**
   account (the invoice sender) and a **Personal** account email (a test
   recipient you can invoice). PayPal gives these fake balances for testing.

### 3. Configure
```bash
cp .env.example .env
# then edit .env and paste in your PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET,
# and GEMINI_API_KEY
```

### 4. Install & start
```bash
npm install
npm start
```
Open **http://localhost:3000**.

> Visit **http://localhost:3000/api/health** to confirm your keys are detected.

---

## 🧪 Try these

1. `Invoice <your-sandbox-personal-email> $250 for logo design, due in 7 days`
   → a draft appears in the dashboard.
2. `Send it` → a **confirmation card** appears; click **Confirm** → status flips to **SENT**.
3. `What invoices are unpaid?` → the agent lists them from PayPal.
4. `Send a reminder for that invoice` → confirm → reminder goes out.

You can verify the invoices independently by logging into the PayPal sandbox
business account at https://www.sandbox.paypal.com/.

---

## 🔑 Test credentials for judging

To run the project you need your **own** free sandbox + Gemini keys (above) —
no paid account required, everything runs in PayPal's free sandbox. If this repo
is submitted with pre-filled test keys, they will be listed here:

```
(Add sandbox client id/secret + a throwaway Gemini key here before submitting,
 OR leave judges to use their own free keys per the steps above.)
```

---

## ⚙️ Configuration reference

| Variable | Required | Description |
|---|---|---|
| `PAYPAL_CLIENT_ID` | yes | Sandbox REST app client id |
| `PAYPAL_CLIENT_SECRET` | yes | Sandbox REST app secret |
| `PAYPAL_ENV` | no | `sandbox` (default) or `live` |
| `GEMINI_API_KEY` | yes | Google Gemini API key |
| `GEMINI_MODEL` | no | Defaults to `gemini-flash-lite-latest` |
| `PORT` | no | Defaults to `3000` |

---

## 📝 Notes & limitations

- Uses PayPal's **sandbox** — no real money moves.
- Conversation state is in-memory per session (resets on server restart).
- Default currency is **USD**; a sandbox business account's supported currencies
  apply. You can ask the agent for another currency (e.g. "in EUR").
- Built for the PayPal AI Hackathon. The PayPal integration is central: every
  invoice action is a real PayPal API call.

## 📄 License

[MIT](./LICENSE) — open source.
