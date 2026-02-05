import { useState } from "react";
import { apiGet, apiPost } from "../api";

export default function AppointmentsSection() {
  const [userId, setUserId] = useState("1");
  const [appointmentId, setAppointmentId] = useState("1");
  const [res, setRes] = useState<{ data?: unknown; error?: string }>({});

  const previewBody = JSON.stringify(
    { userId: 1, providerId: 1, visitType: "follow_up", desiredTime: new Date().toISOString() },
    null,
    2
  );
  const createBody = JSON.stringify(
    {
      userId: 1,
      organizationId: 1,
      providerId: 1,
      slotId: 1,
      visitType: "follow_up",
      reason: "Checkup",
      channel: "web",
    },
    null,
    2
  );

  async function list() {
    setRes({});
    try {
      const data = await apiGet("/appointments", { userId, status: "upcoming" });
      setRes({ data });
    } catch (err) {
      setRes({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function getOne() {
    setRes({});
    try {
      const data = await apiGet(`/appointments/${appointmentId}`);
      setRes({ data });
    } catch (err) {
      setRes({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function preview() {
    setRes({});
    try {
      const body = JSON.parse(previewBody);
      const data = await apiPost("/appointments/preview", body);
      setRes({ data });
    } catch (err) {
      setRes({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function create() {
    setRes({});
    try {
      const body = JSON.parse(createBody);
      const data = await apiPost("/appointments", body);
      setRes({ data });
    } catch (err) {
      setRes({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function cancelOptions() {
    setRes({});
    try {
      const data = await apiPost("/appointments/cancel-options", { userId: parseInt(userId, 10) });
      setRes({ data });
    } catch (err) {
      setRes({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function cancel() {
    setRes({});
    try {
      const data = await apiPost(`/appointments/${appointmentId}/cancel`, { confirmed: true, cancellationReason: "Testing" });
      setRes({ data });
    } catch (err) {
      setRes({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div className="section">
      <h3>Appointments</h3>
      <div className="form-row">
        <label>userId</label>
        <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="1" />
        <button type="button" onClick={list}>
          GET /appointments
        </button>
        <button type="button" onClick={cancelOptions}>
          POST /appointments/cancel-options
        </button>
      </div>
      <div className="form-row">
        <label>appointmentId</label>
        <input value={appointmentId} onChange={(e) => setAppointmentId(e.target.value)} placeholder="1" />
        <button type="button" onClick={getOne}>
          GET /appointments/:id
        </button>
      </div>
      <div style={{ marginTop: "1rem" }}>
        <button type="button" onClick={preview}>
          POST /appointments/preview
        </button>
        <span style={{ marginLeft: "0.5rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
          (uses userId:1, providerId:1, visitType:follow_up, desiredTime:now)
        </span>
      </div>
      <div style={{ marginTop: "0.75rem" }}>
        <button type="button" onClick={create}>
          POST /appointments
        </button>
        <span style={{ marginLeft: "0.5rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
          (uses userId:1, organizationId:1, providerId:1, slotId:1)
        </span>
      </div>
      <div style={{ marginTop: "0.75rem" }}>
        <button type="button" onClick={cancel}>
          POST /appointments/:id/cancel
        </button>
      </div>
      {res.data != null && <div className="response success">{JSON.stringify(res.data, null, 2)}</div>}
      {res.error && <div className="response error">{res.error}</div>}
    </div>
  );
}
