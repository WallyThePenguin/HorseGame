// chat-bridge.js
const { PumpChatClient } = require("pump-chat-client"); // embeddable client
const WebSocket = require("ws");

// ---- config ----
const roomId = process.env.pump_fun_token || process.env.PUMP_FUN_TOKEN;
if (!roomId) {
  console.error("Set pump_fun_token env var");
  process.exit(1);
}
const PORT = Number(process.env.CHAT_BRIDGE_PORT || 4001);

// ---- browser WS bridge ----
const wss = new WebSocket.Server({ port: PORT });
const clients = new Set();
wss.on("connection", (ws) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
  ws.send(JSON.stringify({ type: "hello", ok: true }));
});
setInterval(() => {
  for (const ws of clients)
    try {
      ws.ping();
    } catch {}
}, 25000);

const broadcast = (o) => {
  const s = JSON.stringify(o);
  for (const c of clients)
    try {
      c.send(s);
    } catch {}
};

// ---- Pump.fun client with auto-retry ----
let chat;
let retry = 0;
const MAX_RETRY_MS = 60_000;

function connectChat() {
  chat = new PumpChatClient({
    roomId,
    username: "bridge",
    messageHistoryLimit: 100,
  });

  chat.on("connected", () => {
    retry = 0;
    console.log("[Pump] connected");
  });

  chat.on("disconnected", () => {
    console.log("[Pump] disconnected");
    scheduleReconnect();
  });

  chat.on("error", (e) => {
    console.log("[Pump] error:", e?.message || e);
    scheduleReconnect();
  });

  chat.on("message", async (m) => {
    const user = m.username || "guest";
    const text = (m.message || "").trim();
    broadcast({ type: "chat", user, text });

    // bets: !bet <1..8> <amount>
    const parts = text.split(/\s+/);
    if (parts[0]?.toLowerCase() !== "!bet") return;
    let horse = (parseInt(parts[1], 10) || 1) - 1;
    horse = Math.max(0, Math.min(7, horse));
    const amount = Math.max(1, Math.floor(+parts[2] || 0));
    if (!Number.isFinite(amount) || amount <= 0) return;

    try {
      const res = await fetch("http://localhost:4000/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, horse, amount }),
      });
      if (!res.ok) console.warn("[Bet API] non-OK:", res.status, await res.text().catch(() => ""));
    } catch (e) {
      console.warn("[Bet API] error:", e?.message || e);
    }
  });

  chat.connect();
}

function scheduleReconnect() {
  if (chat)
    try {
      chat.disconnect();
    } catch {}
  const delay = Math.min(1000 * 2 ** retry, MAX_RETRY_MS); // exponential backoff
  retry++;
  setTimeout(connectChat, delay);
}

connectChat();
console.log(`Chat bridge WS on ws://localhost:${PORT} (room ${roomId})`);
