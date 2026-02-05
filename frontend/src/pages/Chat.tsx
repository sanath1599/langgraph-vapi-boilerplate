import { useState, useRef, useEffect } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Alert, AlertDescription } from "../components/ui/alert";


type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

const DEFAULT_LLM_URL = import.meta.env.VITE_LLM_SERVER_URL || "http://localhost:6000";
const DEFAULT_CALLER = import.meta.env.VITE_DEFAULT_CALLER || "+15855652555";

function generateCallId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [callId, setCallId] = useState(() => generateCallId());
  const [customerNumber, setCustomerNumber] = useState(DEFAULT_CALLER);
  const [llmServerUrl, setLlmServerUrl] = useState(DEFAULT_LLM_URL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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

  function startNewChat() {
    setMessages([]);
    setCallId(generateCallId());
    setError(null);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground mb-2">Chat</h1>
      <p className="text-muted-foreground mb-6">
        Scheduling assistant. Backend (port 4000) and LLM server (port 6000) must be running.
      </p>
      <Card>
        <CardHeader className="pb-4">
          <CardTitle>Scheduling Assistant</CardTitle>
          <CardDescription>VAPI / OpenAI format. Call ID: {callId}</CardDescription>
          <div className="flex flex-wrap gap-4 pt-2">
            <div className="space-y-2 flex-1 min-w-[200px]">
              <Label htmlFor="llmUrl">LLM server</Label>
              <Input
                id="llmUrl"
                type="url"
                value={llmServerUrl}
                onChange={(e) => setLlmServerUrl(e.target.value)}
                placeholder="http://localhost:6000"
              />
            </div>
            <div className="space-y-2 w-[180px]">
              <Label htmlFor="caller">Caller #</Label>
              <Input
                id="caller"
                type="text"
                value={customerNumber}
                onChange={(e) => setCustomerNumber(e.target.value)}
                placeholder="+14086221882"
              />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={startNewChat} className="text-foreground">
                New chat
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="rounded-lg border border-border bg-muted/30 min-h-[200px] max-h-[400px] overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <p className="text-muted-foreground text-sm text-center py-8">
                Send a message to start (e.g. &quot;Hello&quot; or &quot;I want to book an appointment&quot;).
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex flex-col max-w-[85%] ${m.role === "user" ? "ml-auto" : ""}`}
              >
                <span className="text-xs text-muted-foreground capitalize">{m.role}</span>
                <div
                  className={
                    m.role === "user"
                      ? "rounded-lg px-3 py-2 bg-primary text-primary-foreground"
                      : "rounded-lg px-3 py-2 bg-muted border border-border text-foreground"
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex flex-col max-w-[85%]">
                <span className="text-xs text-muted-foreground">assistant</span>
                <div className="rounded-lg px-3 py-2 bg-muted border border-border text-muted-foreground">
                  …
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
          >
            <Input
              ref={messageInputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              disabled={loading}
              className="flex-1"
            />
            <Button type="submit" disabled={loading || !input.trim()} className="bg-primary text-primary-foreground">
              Send
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
