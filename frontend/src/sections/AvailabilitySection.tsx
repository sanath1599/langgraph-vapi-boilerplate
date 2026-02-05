import { useState } from "react";
import { apiGet } from "../api";

export default function AvailabilitySection() {
  const [organizationId, setOrganizationId] = useState("1");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [res, setRes] = useState<{ data?: unknown; error?: string }>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRes({});
    try {
      const params: Record<string, string> = { organizationId };
      if (fromDate) params.fromDate = new Date(fromDate).toISOString();
      if (toDate) params.toDate = new Date(toDate).toISOString();
      const data = await apiGet("/availability", params);
      setRes({ data });
    } catch (err) {
      setRes({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  const fromDefault = new Date();
  fromDefault.setDate(fromDefault.getDate() + 1);
  const toDefault = new Date();
  toDefault.setDate(toDefault.getDate() + 14);

  return (
    <div className="section">
      <h3>Availability</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <label>organizationId</label>
          <input value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} placeholder="1" required />
        </div>
        <div className="form-row">
          <label>fromDate</label>
          <input type="datetime-local" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="form-row">
          <label>toDate</label>
          <input type="datetime-local" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <button type="submit">GET /availability</button>
      </form>
      {res.data != null && <div className="response success">{JSON.stringify(res.data, null, 2)}</div>}
      {res.error && <div className="response error">{res.error}</div>}
    </div>
  );
}
