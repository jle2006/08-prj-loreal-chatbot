/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");

// Set initial message
chatWindow.innerHTML = `<div class="assistant-msg">👋 Hello! How can I help you today?</div>`;

// Cloudflare Worker URL that proxies OpenAI requests
const WORKER_URL = "https://loreal-chatbot.lejenna737.workers.dev/";

function appendMessage(role, text) {
  const el = document.createElement("div");
  el.className = role === "user" ? "user-msg" : "assistant-msg";
  // Simple text node to avoid injecting HTML
  el.textContent = text;
  chatWindow.appendChild(el);
  // Scroll to bottom
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function setInputDisabled(disabled) {
  userInput.disabled = disabled;
  const btn = document.getElementById("sendBtn");
  if (btn) btn.disabled = disabled;
}

/* Handle form submit */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const text = userInput.value.trim();
  if (!text) return;

  // Show user's message
  appendMessage("user", text);
  userInput.value = "";

  // Show a temporary assistant placeholder
  const loading = document.createElement("div");
  loading.className = "assistant-msg loading";
  loading.textContent = "Thinking...";
  chatWindow.appendChild(loading);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  // Disable input while waiting
  setInputDisabled(true);

  try {
    const body = { messages: [{ role: "user", content: text }] };

    const resp = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Worker responded ${resp.status}: ${txt}`);
    }

    const data = await resp.json();

    // Cloudflare worker (proxy) may return several shapes (string, object, arrays).
    // Normalize into a human-friendly string to avoid showing [object Object].
    function stringifyAssistant(raw) {
      if (raw == null) return "";
      if (typeof raw === "string") return raw;
      if (Array.isArray(raw)) return raw.join("\n");
      if (typeof raw === "object") {
        // Common nested patterns
        if (typeof raw.content === "string") return raw.content;
        if (Array.isArray(raw.parts)) return raw.parts.join("");
        if (raw.message && typeof raw.message === "string") return raw.message;
        // OpenAI chat style: choices[].message.content might itself be an object
        if (raw.choices && Array.isArray(raw.choices)) {
          const first = raw.choices[0];
          const candidate =
            first?.message?.content ?? first?.text ?? first?.message ?? first;
          return stringifyAssistant(candidate);
        }
        // Try some other common keys
        if (raw.error && typeof raw.error === "string") return raw.error;
        if (raw.reply) return stringifyAssistant(raw.reply);
        // Fallback to formatted JSON
        try {
          return JSON.stringify(raw, null, 2);
        } catch (e) {
          return String(raw);
        }
      }
      // Fallback
      return String(raw);
    }

    const assistantRaw =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      data?.error ??
      data;

    const assistantText = stringifyAssistant(assistantRaw);

    // Replace loading with assistant response
    loading.remove();
    appendMessage("assistant", assistantText);
  } catch (err) {
    loading.remove();
    appendMessage("assistant", `Error: ${err.message}`);
    console.error(err);
  } finally {
    setInputDisabled(false);
  }
});
