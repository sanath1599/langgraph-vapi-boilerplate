import { getStoredToken } from "./contexts/AuthContext";

const API_BASE = (import.meta.env?.VITE_API_BASE as string) || "";

function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export async function apiGet(
  path: string,
  params?: Record<string, string>
): Promise<unknown> {
  const url = params
    ? `${API_BASE}${path}?${new URLSearchParams(params)}`
    : `${API_BASE}${path}`;
  const res = await fetch(url, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (typeof data.message === "string" && data.message) ||
      (typeof data.error === "string" && data.error !== res.statusText && data.error) ||
      res.statusText;
    const full = res.status === 404 && msg === "Not Found"
      ? "Not found. Check that the backend is running and the URL is correct."
      : msg;
    throw new Error(full);
  }
  return data;
}

export async function apiPost(
  path: string,
  body: unknown
): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (typeof data.message === "string" && data.message) ||
      (typeof data.error === "string" && data.error !== res.statusText && data.error) ||
      res.statusText;
    const full = res.status === 404 && msg === "Not Found"
      ? "Not found. Check that the backend is running and the URL is correct."
      : msg;
    throw new Error(full);
  }
  return data;
}

export async function apiPatch(
  path: string,
  body: unknown
): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (typeof data.message === "string" && data.message) ||
      (typeof data.error === "string" && data.error !== res.statusText && data.error) ||
      res.statusText;
    const full = res.status === 404 && msg === "Not Found"
      ? "Not found. Check that the backend is running and the URL is correct."
      : msg;
    throw new Error(full);
  }
  return data;
}
