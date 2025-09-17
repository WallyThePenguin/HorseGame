// src/chatbridge.js
(function () {
  let ws,
    tries = 0;
  const MAX = 60000;

  function jitter(n) {
    return n + Math.floor(Math.random() * 500);
  }
  function backoff() {
    return Math.min(1000 * Math.pow(2, tries++), MAX);
  }

  function connect() {
    ws = new WebSocket("ws://localhost:4001");
    ws.onopen = () => {
      tries = 0;
      console.log("[bridge] connected");
    };
    ws.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data);
        if (d.type === "chat") {
          window.dispatchEvent(new CustomEvent("pfc-chat", { detail: { user: d.user, text: d.text } }));
        }
      } catch {}
    };
    ws.onclose = () => setTimeout(connect, jitter(backoff()));
    ws.onerror = () => {
      try {
        ws.close();
      } catch {}
    };
  }
  connect();
})();
