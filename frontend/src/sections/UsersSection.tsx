import { useState } from "react";
import { apiGet } from "../api";

export default function UsersSection() {
  const [phone, setPhone] = useState("");
  const [userId, setUserId] = useState("1");
  const [res, setRes] = useState<{ data?: unknown; error?: string }>({});

  async function handleByPhone(e: React.FormEvent) {
    e.preventDefault();
    setRes({});
    try {
      const data = await apiGet("/users/by-phone", { phone });
      setRes({ data });
    } catch (err) {
      setRes({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function handleById(e: React.FormEvent) {
    e.preventDefault();
    setRes({});
    try {
      const data = await apiGet(`/users/${userId}`);
      setRes({ data });
    } catch (err) {
      setRes({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div className="section">
      <h3>Users</h3>
      <form onSubmit={handleByPhone}>
        <div className="form-row">
          <label>By phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555-123-4567" required />
        </div>
        <button type="submit">GET /users/by-phone</button>
      </form>
      <form onSubmit={handleById} style={{ marginTop: "1rem" }}>
        <div className="form-row">
          <label>By ID</label>
          <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="1" />
        </div>
        <button type="submit">GET /users/:userId</button>
      </form>
      {res.data != null && <div className="response success">{JSON.stringify(res.data, null, 2)}</div>}
      {res.error && <div className="response error">{res.error}</div>}
    </div>
  );
}
