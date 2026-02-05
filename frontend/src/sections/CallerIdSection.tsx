import { useState } from "react";
import { apiGet } from "../api";

export default function CallerIdSection() {
  const [rawNumber, setRawNumber] = useState("");
  const [res, setRes] = useState<{ data?: unknown; error?: string }>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRes({});
    try {
      const data = await apiGet("/caller-id/normalize", { rawNumber });
      setRes({ data });
    } catch (err) {
      setRes({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div className="section">
      <h3>Caller ID normalize</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <label>rawNumber</label>
          <input value={rawNumber} onChange={(e) => setRawNumber(e.target.value)} placeholder="+1 555-123-4567" required />
        </div>
        <button type="submit">Send GET /caller-id/normalize</button>
      </form>
      {res.data != null && <div className="response success">{JSON.stringify(res.data, null, 2)}</div>}
      {res.error && <div className="response error">{res.error}</div>}
    </div>
  );
}
