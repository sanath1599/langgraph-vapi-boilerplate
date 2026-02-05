import { useState, useRef } from "react";

export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

export type SavedChat = {
  version: number;
  callId: string;
  customerNumber: string;
  llmServerUrl: string;
  messages: ChatMessage[];
  savedAt: string;
};

const DEFAULT_LLM_URL = "http://localhost:6000";
const DEFAULT_CALLER = "+14086221882";

function generateCallId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function ChatbotSection() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [callId, setCallId] = useState(() => generateCallId());
  const [customerNumber, setCustomerNumber] = useState(DEFAULT_CALLER);
  const [llmServerUrl, setLlmServerUrl] = useState(DEFAULT_LLM_URL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedUserQueries, setLoadedUserQueries] = useState<string[]>([]);
  const [loadedQueryIndex, setLoadedQueryIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  async function sendMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || loading) return;

    const newMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const body = {
        model: "default",
        messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        call: { id: callId },
        customer: { number: customerNumber || undefined },
        metadata: {
          rawCallerPhone: customerNumber || undefined,
          vapiCallId: callId,
        },
      };

      const res = await fetch(`${llmServerUrl.replace(/\/$/, "")}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errMsg = (data as { error?: { message?: string } }).error?.message ?? res.statusText ?? "Request failed";
        throw new Error(errMsg);
      }

      const assistantContent =
        (data as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ?? "";
      setMessages((prev) => [...prev, { role: "assistant", content: assistantContent }]);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      setError(errMsg);
      setMessages((prev) => [...prev.slice(0, -1)]);
    } finally {
      setLoading(false);
    }
  }

  function handleSave() {
    const saved: SavedChat = {
      version: 1,
      callId,
      customerNumber,
      llmServerUrl,
      messages,
      savedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(saved, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-${callId.slice(0, 20)}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleLoadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const parsed = JSON.parse(text) as SavedChat;
        if (!Array.isArray(parsed.messages)) throw new Error("Invalid chat file: missing messages array");
        const userQueries = parsed.messages
          .filter((m) => m.role === "user")
          .map((m) => (typeof m.content === "string" ? m.content : "").trim())
          .filter(Boolean);
        setLoadedUserQueries(userQueries);
        setLoadedQueryIndex(0);
        if (parsed.customerNumber != null) setCustomerNumber(parsed.customerNumber);
        if (parsed.llmServerUrl) setLlmServerUrl(parsed.llmServerUrl);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid JSON chat file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleNextQuery() {
    if (loadedQueryIndex >= loadedUserQueries.length) return;
    const next = loadedUserQueries[loadedQueryIndex];
    setInput(next);
    setLoadedQueryIndex((prev) => prev + 1);
    messageInputRef.current?.focus();
  }

  function startNewChat() {
    setMessages([]);
    setCallId(generateCallId());
    setError(null);
    setLoadedUserQueries([]);
    setLoadedQueryIndex(0);
  }

  return (
    <div className="section chat-section">
      <h3>Scheduling Assistant (VAPI / OpenAI format)</h3>
      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1rem" }}>
        Sends requests to the custom LLM server (same format as VAPI: messages, call id, customer number). Backend
        (port 4000) and LLM server (port 6000) must be running.
      </p>

      <div className="form-row" style={{ marginBottom: "1rem" }}>
        <label style={{ flex: "0 0 90px" }}>LLM server</label>
        <input
          type="url"
          value={llmServerUrl}
          onChange={(e) => setLlmServerUrl(e.target.value)}
          placeholder="http://localhost:6000"
          style={{ flex: 1, minWidth: 200 }}
        />
        <label style={{ flex: "0 0 80px" }}>Caller #</label>
        <input
          type="text"
          value={customerNumber}
          onChange={(e) => setCustomerNumber(e.target.value)}
          placeholder="+14086221882"
          style={{ width: 160 }}
        />
      </div>
      <div className="form-row" style={{ marginBottom: "0.5rem" }}>
        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Call ID: {callId}</span>
        <div style={{ display: "flex", gap: "0.5rem", marginLeft: "auto" }}>
          <button type="button" onClick={startNewChat}>
            New chat
          </button>
          <button type="button" onClick={handleSave} disabled={messages.length === 0}>
            Save to JSON
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Load from JSON
          </button>
          {loadedUserQueries.length > 0 && (
            <button
              type="button"
              onClick={handleNextQuery}
              disabled={loadedQueryIndex >= loadedUserQueries.length}
              title={
                loadedQueryIndex < loadedUserQueries.length
                  ? `Next: ${loadedUserQueries[loadedQueryIndex].slice(0, 40)}...`
                  : "No more loaded queries"
              }
            >
              Next ({loadedQueryIndex + 1}/{loadedUserQueries.length})
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleLoadFile}
            style={{ display: "none" }}
          />
        </div>
      </div>

      {error && (
        <div className="response error" style={{ marginTop: "0.5rem" }}>
          {error}
        </div>
      )}

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-placeholder">Send a message to start (e.g. &quot;Hello&quot; or &quot;I want to book an appointment&quot;).</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble ${m.role}`}>
            <span className="chat-role">{m.role}</span>
            <div className="chat-content">{m.content}</div>
          </div>
        ))}
        {loading && (
          <div className="chat-bubble assistant">
            <span className="chat-role">assistant</span>
            <div className="chat-content">…</div>
          </div>
        )}
      </div>

      <form
        className="chat-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
      >
        <input
          ref={messageInputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={loading}
          className="chat-input"
        />
        <button type="submit" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
