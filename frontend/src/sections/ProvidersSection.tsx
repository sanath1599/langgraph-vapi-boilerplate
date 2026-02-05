import { useState } from "react";
import { apiGet } from "../api";

export default function ProvidersSection() {
  const [organizationId, setOrganizationId] = useState("1");
  const [res, setRes] = useState<{ data?: unknown; error?: string }>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRes({});
    try {
      const params: Record<string, string> = {};
      if (organizationId) params.organizationId = organizationId;
      const data = await apiGet("/providers", Object.keys(params).length ? params : undefined);
      setRes({ data });
    } catch (err) {
      setRes({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div className="section">
      <h3>Providers</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <label>organizationId (optional)</label>
          <input value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} placeholder="1" />
        </div>
        <button type="submit">GET /providers</button>
      </form>
      {res.data != null && <div className="response success">{JSON.stringify(res.data, null, 2)}</div>}
      {res.error && <div className="response error">{res.error}</div>}
    </div>
  );
}
