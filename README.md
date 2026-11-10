# PayAgent

An AI invoicing assistant built on PayPal and Google Gemini. You tell it who to
bill in plain English, and it creates, sends, tracks, and chases PayPal invoices
for you.

## Live demo

**https://payagent-m37p.onrender.com**

Open the link and start chatting. No setup needed. It runs on the PayPal sandbox,
so no real money moves.

> Hosted on Render's free tier. If it has been idle, the first load can take up
> to a minute to wake up, then it is fast.

## Why I built this

AI is changing almost every field, but when I looked at online payments I didn't
see much of it reaching everyday users. I'm Sandhya, and I built PayAgent to bring
AI into payments in a way that actually helps people: anyone can handle their
invoicing just by typing a sentence, instead of clicking through forms.

## What it does

PayPal is at the core of the project, and Gemini is the layer that lets you talk
to it:

- **Create invoices by chatting.** Say "Invoice sam@acme.com $400 for October
  design work, due in 15 days" and it prepares a real PayPal draft invoice.
- **Send with one click.** Drafting is automatic. Sending an invoice or a
  reminder always asks for your confirmation first, so nothing goes out by
  accident.
- **Track payments.** Ask "what's unpaid?" or "who's overdue?" and it reads live
  status straight from PayPal.
- **Mark invoices paid.** Record a payment when a client pays, so you can follow
  an invoice all the way from draft to paid.
- **Live dashboard.** A side panel shows every invoice with its amount, recipient,
  due date, and status (draft, sent, paid), plus totals for outstanding and paid.

It is agentic commerce: the AI does not just talk about payments, it acts on
PayPal for you, with a human confirmation step before any money action.

## How it works

```
You -> Web UI -> /api/chat -> Agent loop (Gemini)
                                  Gemini decides which PayPal action to take
                                        |
                        safe actions    |    gated actions (ask first)
                        create_invoice   \   send_invoice
                        list_invoices     \  send_reminder
                        get_invoice        \ mark_paid
                                        |
                              PayPal Invoicing API (sandbox)
```

- `src/agent.js` runs the Gemini function-calling loop and the confirmation gate.
- `src/paypal.js` holds the PayPal REST calls (auth, create, send, remind, record payment, list, get).
- `src/tools.js` defines the tools Gemini can use and which ones need confirmation.
- `src/server.js` is the Express API and serves the web UI.
- `public/` is the chat and dashboard front-end (plain HTML, CSS, JS).

## Run it yourself

### Prerequisites
- Node.js 18 or newer
- A free PayPal Developer account: https://developer.paypal.com/
- A free Google Gemini API key: https://aistudio.google.com/apikey

### 1. PayPal sandbox credentials
1. Sign in to the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/).
2. Under Apps & Credentials, Sandbox tab, open (or create) a REST app and copy the
   Client ID and Secret.
3. Under Testing Tools, Sandbox Accounts, note a Business account (the sender) and
   a Personal account email (a test recipient). These come with fake balances.

### 2. Configure
```bash
cp .env.example .env
# then edit .env and add your PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET,
# and GEMINI_API_KEY
```

### 3. Install and start
```bash
npm install
npm start
```
Open http://localhost:3000. Visit http://localhost:3000/api/health to confirm your
keys are detected.

### Run with Docker (optional)
```bash
docker compose up --build
```

## Things to try

1. `Invoice <a sandbox personal email> $250 for logo design, due in 7 days` creates a draft.
2. `Send it`, then confirm, and the status changes to sent.
3. Click **Mark paid** on a sent invoice, or say `mark it paid`, to complete the cycle.
4. `What invoices are unpaid?` lists them from PayPal.

You can verify invoices independently by signing in to the sandbox business
account at https://www.sandbox.paypal.com/.

## Configuration

| Variable | Required | Description |
|---|---|---|
| `PAYPAL_CLIENT_ID` | yes | Sandbox REST app client id |
| `PAYPAL_CLIENT_SECRET` | yes | Sandbox REST app secret |
| `PAYPAL_ENV` | no | `sandbox` (default) or `live` |
| `GEMINI_API_KEY` | yes | Google Gemini API key |
| `GEMINI_MODEL` | no | Defaults to `gemini-flash-lite-latest` |
| `DEFAULT_CURRENCY` | no | Default invoice currency (defaults to USD) |
| `PORT` | no | Defaults to `3000` |

## Notes

- Everything runs on the PayPal sandbox, so no real money moves.
- Conversation history is kept in memory per session and resets on restart.
- PayPal supports many invoice currencies (USD, EUR, GBP, AUD, CAD, SGD). It does
  not support INR, and the app will tell you so if you ask for it.

## License

[MIT](./LICENSE)
