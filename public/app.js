// Front-end logic for PayAgent — chat, confirmation flow, and live dashboard.

const sessionId =
  localStorage.getItem("payagent-session") ||
  (() => {
    const id = "s-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("payagent-session", id);
    return id;
  })();

const messagesEl = document.getElementById("messages");
const pendingEl = document.getElementById("pending");
const invoicesEl = document.getElementById("invoices");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send-btn");
const currencyEl = document.getElementById("currency");

// Remember the chosen default currency across visits.
currencyEl.value = localStorage.getItem("payagent-currency") || "USD";
currencyEl.addEventListener("change", () =>
  localStorage.setItem("payagent-currency", currencyEl.value),
);

// ---------- helpers ----------
function initials(nameOrEmail) {
  if (!nameOrEmail) return "??";
  const s = String(nameOrEmail);
  if (s.includes("@")) return s.slice(0, 2).toUpperCase();
  const parts = s.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || parts[0]?.[1] || "")).toUpperCase();
}

function money(value, currency) {
  const n = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(n);
  } catch {
    return `${currency || ""} ${n.toFixed(2)}`;
  }
}

function isOverdue(inv) {
  const unpaid = ["SENT", "UNPAID"].includes(inv.status);
  return unpaid && inv.dueDate && new Date(inv.dueDate) < new Date(new Date().toDateString());
}

// ---------- chat ----------
function addMessage(role, html, isHTML = false) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role}`;

  const avatar = document.createElement("div");
  avatar.className = `avatar ${role === "agent" ? "agent-avatar" : "user-avatar"}`;
  avatar.textContent = role === "agent" ? "PA" : "YOU";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (isHTML) bubble.innerHTML = html;
  else bubble.textContent = html;

  wrap.append(avatar, bubble);
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bubble;
}

function showTyping() {
  const bubble = addMessage("agent", '<div class="typing"><span></span><span></span><span></span></div>', true);
  return bubble;
}

function renderPending(actions) {
  pendingEl.innerHTML = "";
  if (!actions || !actions.length) {
    pendingEl.classList.add("hidden");
    return;
  }
  const action = actions[0];
  pendingEl.classList.remove("hidden");

  const h = document.createElement("h4");
  h.innerHTML = "⚠ Confirmation required";
  const desc = document.createElement("div");
  desc.className = "action-desc";
  desc.textContent = action.description;

  const row = document.createElement("div");
  row.className = "actions";
  const confirm = document.createElement("button");
  confirm.className = "confirm";
  confirm.textContent = "✓ Confirm & send";
  const cancel = document.createElement("button");
  cancel.className = "cancel";
  cancel.textContent = "Cancel";

  confirm.onclick = async () => {
    confirm.disabled = cancel.disabled = true;
    confirm.textContent = "Working…";
    try {
      const res = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, action }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      addMessage("agent", `✅ Done — ${action.description.toLowerCase()}. Status: ${data.result.status}.`);
      pendingEl.classList.add("hidden");
      loadInvoices();
    } catch (err) {
      addMessage("agent", `⚠ ${err.message}`);
      confirm.disabled = cancel.disabled = false;
      confirm.textContent = "✓ Confirm & send";
    }
  };
  cancel.onclick = () => {
    pendingEl.classList.add("hidden");
    addMessage("agent", "Okay, I've cancelled that. Nothing was sent.");
  };

  row.append(confirm, cancel);
  pendingEl.append(h, desc, row);
}

async function sendMessage(text) {
  hideStarters();
  addMessage("user", text);
  const typing = showTyping();
  sendBtn.disabled = true;
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message: text, currency: currencyEl.value }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    typing.textContent = data.reply;
    renderPending(data.pendingActions);
    if (data.invoicesChanged) loadInvoices();
  } catch (err) {
    typing.textContent = `⚠ ${err.message}`;
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  sendMessage(text);
});

// Starter example cards shown on first load — send the example, then hide them.
const startersEl = document.getElementById("starters");
if (startersEl) {
  startersEl.addEventListener("click", (e) => {
    const card = e.target.closest(".starter");
    if (!card) return;
    sendMessage(card.dataset.send);
  });
}
function hideStarters() {
  if (startersEl) startersEl.style.display = "none";
}

// Quick-action chips: either fill the input or send immediately.
document.getElementById("chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  if (chip.dataset.send) {
    sendMessage(chip.dataset.send);
  } else if (chip.dataset.fill) {
    input.value = chip.dataset.fill;
    input.focus();
  }
});

// ---------- dashboard ----------
function renderStats(list) {
  const cur = list[0]?.currency || "USD";
  let outstanding = 0, paid = 0, overdue = 0;
  for (const inv of list) {
    const amt = Number(inv.amount || 0);
    if (["SENT", "UNPAID"].includes(inv.status)) outstanding += amt;
    if (["PAID", "MARKED_AS_PAID"].includes(inv.status)) paid += amt;
    if (isOverdue(inv)) overdue += 1;
  }
  document.getElementById("stat-outstanding").textContent = money(outstanding, cur);
  document.getElementById("stat-paid").textContent = money(paid, cur);
  document.getElementById("stat-overdue").textContent = String(overdue);
}

async function loadInvoices() {
  try {
    const res = await fetch("/api/invoices");
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const list = data.invoices || [];
    renderStats(list);

    if (!list.length) {
      invoicesEl.innerHTML =
        '<div class="empty"><div class="empty-icon">🧾</div><p>No invoices yet.<br><span>Create one from the chat to see it here.</span></p></div>';
      return;
    }
    invoicesEl.innerHTML = "";
    for (const inv of list) {
      const overdue = isOverdue(inv);
      const statusLabel = overdue ? "OVERDUE" : inv.status;
      const statusClass = overdue ? "overdue-badge" : inv.status;
      const card = document.createElement("div");
      card.className = "invoice";
      card.innerHTML = `
        <div class="row1">
          <div class="inv-avatar">${initials(inv.recipientName || inv.recipientEmail)}</div>
          <div class="inv-main">
            <div class="inv-who">${inv.recipientName || inv.recipientEmail || "Unknown recipient"}</div>
            <div class="inv-desc">${inv.description || "PayPal invoice"}</div>
          </div>
          <div class="inv-amount">${money(inv.amount, inv.currency)}</div>
        </div>
        <div class="inv-foot">
          <span class="inv-meta inv-id">#${inv.invoiceNumber || (inv.id || "").slice(0, 12)}${inv.dueDate ? " · due " + inv.dueDate : ""}</span>
          <span class="foot-right">
            ${inv.status === "DRAFT" ? `<button class="card-send" data-id="${inv.id}" data-who="${(inv.recipientName || inv.recipientEmail || "").replace(/"/g, "")}">Send ▸</button>` : ""}
            ${["SENT", "UNPAID"].includes(inv.status) ? `<button class="card-paid" data-id="${inv.id}">Mark paid</button>` : ""}
            <span class="status ${statusClass}">${statusLabel}</span>
          </span>
        </div>`;
      invoicesEl.appendChild(card);
    }
  } catch (err) {
    invoicesEl.innerHTML = `<div class="empty"><p>${err.message}</p></div>`;
  }
}

document.getElementById("refresh").onclick = loadInvoices;

// Dashboard card actions: send a draft, or mark a sent invoice as paid.
invoicesEl.addEventListener("click", async (e) => {
  const sendBtn = e.target.closest(".card-send");
  const paidBtn = e.target.closest(".card-paid");
  const btn = sendBtn || paidBtn;
  if (!btn) return;

  const id = btn.dataset.id;
  const tool = sendBtn ? "send_invoice" : "mark_paid";
  const who = btn.dataset.who;
  const label = btn.textContent;

  const prompt = sendBtn
    ? `Send this invoice${who ? " to " + who : ""}? The recipient will be notified.`
    : "Mark this invoice as paid? This records a payment against it.";
  if (!window.confirm(prompt)) return;

  btn.disabled = true;
  btn.textContent = "Working…";
  try {
    const res = await fetch("/api/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, action: { tool, input: { invoiceId: id } } }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const msg = sendBtn ? `✅ Invoice sent${who ? " to " + who : ""}.` : "✅ Marked as paid.";
    addMessage("agent", `${msg} Status: ${data.result.status}.`);
    loadInvoices();
  } catch (err) {
    addMessage("agent", `⚠ ${err.message}`);
    btn.disabled = false;
    btn.textContent = label;
  }
});

// ---------- health / connection ----------
fetch("/api/health")
  .then((r) => r.json())
  .then((d) => {
    document.getElementById("env-badge").textContent = d.env || "sandbox";
    const dot = document.getElementById("conn-dot");
    dot.classList.add(d.ok ? "online" : "offline");
    dot.title = d.ok ? "Connected" : "Missing config: " + (d.missing || []).join(", ");
  })
  .catch(() => document.getElementById("conn-dot").classList.add("offline"));

loadInvoices();
