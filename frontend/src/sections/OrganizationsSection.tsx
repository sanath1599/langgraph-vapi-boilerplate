import { useState } from "react";
import { apiGet } from "../api";

export default function OrganizationsSection() {
  const [orgId, setOrgId] = useState("1");
  const [res, setRes] = useState<{ data?: unknown; error?: string }>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRes({});
    try {
      const data = await apiGet(`/organizations/${orgId}/booking-rules`);
      setRes({ data });
    } catch (err) {
      setRes({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div className="section">
      <h3>Organization booking rules</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <label>organizationId</label>
          <input value={orgId} onChange={(e) => setOrgId(e.target.value)} placeholder="1" />
        </div>
        <button type="submit">GET /organizations/:orgId/booking-rules</button>
      </form>
      {res.data != null && <div className="response success">{JSON.stringify(res.data, null, 2)}</div>}
      {res.error && <div className="response error">{res.error}</div>}
    </div>
  );
}
