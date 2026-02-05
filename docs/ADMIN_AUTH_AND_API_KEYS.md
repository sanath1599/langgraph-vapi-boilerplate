# Admin Authentication and API Keys – Feature Documentation

## Overview

This feature adds username/password authentication for the admin UI, an admin API (JWT-protected), and API key authentication for the public/LLM-facing routes. It also introduces an admin dashboard (ShadCN, light/dark theme) and API key management.

---

## API Details

### 1. Admin login

**Endpoint:** `POST /admin/login`

**Request**

- Content-Type: `application/json`
- Body:
  - `username` (string, required)
  - `password` (string, required)

**Success (200)**

```json
{ "token": "<JWT string>" }
```

**Failure**

- **400** – Validation (e.g. missing username/password)
  - Body: `{ "error": "VALIDATION", "message": "username and password are required" }`
- **401** – Invalid credentials
  - Body: `{ "error": "UNAUTHORIZED", "message": "Invalid username or password" }`

---

### 2. Admin endpoints (require JWT)

All of the following require header: `Authorization: Bearer <token>`.

**Failure without/invalid token:** 401. Body: `{ "error": "UNAUTHORIZED", "message": "..." }`

| Method | Path | Description |
|--------|------|-------------|
| GET | /admin/users | List all users |
| GET | /admin/organizations | List all organizations |
| GET | /admin/appointments | List appointments. Query: `fromDate`, `toDate` (default today to today+7), optional `userId` |
| GET | /admin/users/:userId/appointments | List appointments for user. Query: `fromDate`, `toDate` |
| GET | /admin/api-keys | List API keys (masked) |
| POST | /admin/api-keys | Create API key. Body: `{ "name"?: string }`. Returns `{ "id", "apiKey", "name" }` (raw key only once) |

**Success:** 200 (201 for POST /admin/api-keys). Response bodies are JSON arrays or objects as documented in [backend/docs/API.md](../backend/docs/API.md).

---

### 3. API key–protected routes (public / LLM)

When `REQUIRE_API_KEY` is `true`, these routes require header: `x-api-key: <key>` (or `Authorization: Bearer <key>`):

- /caller-id/*
- /users/*
- /organizations/*
- /providers/*
- /availability/*
- /appointments/*

**Success:** Normal 200/201 and response body.

**Failure**

- **401** – Missing or invalid API key
  - Body: `{ "error": "UNAUTHORIZED", "message": "Missing x-api-key or Authorization header" }` or `"Invalid API key"`

When `REQUIRE_API_KEY=false`, the API key check is skipped (e.g. local dev).

---

## Environment variables

### Backend (`.env`)

- `DEFAULT_ADMIN_USERNAME` – Default admin username (used by seed and login).
- `DEFAULT_ADMIN_PASSWORD` – Default admin password (used by seed and login).
- `JWT_SECRET` – Secret for signing JWTs (use a long random string in production).
- `REQUIRE_API_KEY` – If `false`, API key middleware is skipped; otherwise public routes require `x-api-key`.

### Custom LLM (`langgraph-customllm-vapi/.env`)

- `APPOINTMENT_API_KEY` or `MOCK_API_KEY` – Sent as `x-api-key` when calling the backend (required when backend has `REQUIRE_API_KEY=true`).

---

## Frontend

- **Login:** POST `/admin/login` with `username`/`password`; store JWT (e.g. in localStorage); send as `Authorization: Bearer <token>` on all admin API requests.
- **Protected routes:** All routes except `/login` require a valid token; otherwise redirect to `/login`.
- **Pages:** Dashboard, Users, Organizations, Appointments (date range + optional user filter), API Keys (list + create), Chat.
- **Theme:** Light/dark mode via ThemeProvider and class `dark` on document root.

---

## Database

- **AdminUser:** `id`, `username` (unique), `passwordHash`, `createdAt`, `updatedAt`.
- **ApiKey:** `id`, `keyHash` (unique), `name` (optional), `createdAt`, `lastUsedAt`. Only the hash of the key is stored; the raw key is returned once on create.

---

## Testing

1. Run backend seed: `npm run seed` (creates default admin from env).
2. Login: `POST /admin/login` with default username/password → 200 and `token`.
3. Admin route without token: `GET /admin/users` → 401.
4. Admin route with token: `GET /admin/users` with `Authorization: Bearer <token>` → 200.
5. Create API key: `POST /admin/api-keys` with admin JWT, body `{ "name": "test" }` → 201 and `apiKey` in response.
6. Public route without key (when `REQUIRE_API_KEY=true`): `GET /users/1` → 401.
7. Public route with key: `GET /users/1` with `x-api-key: <key>` → 200.
