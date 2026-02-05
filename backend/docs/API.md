# API Documentation

## Admin authentication (JWT)

Admin UI and admin endpoints use username/password login. On success you receive a JWT to send as `Authorization: Bearer <token>`.

### POST /admin/login

**Request**

- Body (JSON): `{ "username": string, "password": string }`

**Success (200)**

- Body: `{ "token": string }`

**Failure**

- 400: Validation error (e.g. missing username or password). Body: `{ "error": "VALIDATION", "message": "..." }`
- 401: Invalid credentials. Body: `{ "error": "UNAUTHORIZED", "message": "Invalid username or password" }`

---

## Admin endpoints (require JWT)

All admin routes except `POST /admin/login` require the header:

- `Authorization: Bearer <token>`

**Failure without/invalid token:** 401. Body: `{ "error": "UNAUTHORIZED", "message": "..." }`

| Method | Path | Description |
|--------|------|-------------|
| GET | /admin/users | List all users |
| POST | /admin/users | Create user. Body: firstName, lastName, dob, gender, phone, email?, etc. (same as public create) |
| PATCH | /admin/users/:userId | Update user. Body: partial (firstName?, lastName?, dob?, gender?, email?, status?, phone?) |
| GET | /admin/organizations | List all organizations |
| POST | /admin/organizations | Create organization. Body: name, timezone?, acceptingBookings?, minDaysInAdvance?, maxDaysInAdvance?, workingHours?, allowedVisitTypes? |
| PATCH | /admin/organizations/:id | Update organization. Body: partial (name?, timezone?, etc.) |
| GET | /admin/providers | List providers. Query: organizationId (optional) |
| GET | /admin/availability | Search available slots (admin). Query: organizationId (required), fromDate, toDate (YYYY-MM-DD), providerId?, visitType? |
| GET | /admin/appointments | List appointments (query: fromDate, toDate, userId optional). Default range: today to today+7 days |
| GET | /admin/appointments/:appointmentId | Get one appointment |
| POST | /admin/appointments | Create appointment. Body: userId, organizationId, providerId, visitType, start, end (or slotId), reason?, channel? |
| PATCH | /admin/appointments/:appointmentId | Reschedule. Body: newStart?, newEnd? (ISO), or newSlotId? |
| GET | /admin/users/:userId/appointments | List appointments for a user (query: fromDate, toDate) |
| GET | /admin/api-keys | List API keys (masked; never returns raw key) |
| POST | /admin/api-keys | Create API key. Body: `{ "name"?: string }`. Returns `{ "id", "apiKey", "name" }` — raw key only in this response |

**Success:** 200 (or 201 for POST /admin/api-keys). Response body varies by endpoint.

**Failure:** 401 if token missing/invalid; 400 for validation errors.

---

## API key authentication (public / LLM routes)

When `REQUIRE_API_KEY` is `true` in the backend env, the following routes require an API key:

- /caller-id/*
- /users/*
- /organizations/*
- /providers/*
- /availability/*
- /appointments/*

**Header:** `x-api-key: <your-api-key>`  
Alternatively: `Authorization: Bearer <your-api-key>` (same value as the API key).

**Success:** Normal 200/201 response.

**Failure**

- 401: Missing or invalid API key. Body: `{ "error": "UNAUTHORIZED", "message": "Missing x-api-key or Authorization header" }` or `"Invalid API key"`.

When `REQUIRE_API_KEY=false` (e.g. local dev), the API key check is skipped and these routes work without a key.

---

## API key lifecycle

1. **Create:** Call `POST /admin/api-keys` with admin JWT. Body may include optional `"name"`. Response includes `apiKey` (plain) — store it securely; it is not returned again.
2. **Use:** Send the key as `x-api-key` (or `Authorization: Bearer <key>`) on requests to the public/LLM routes above.
3. **List:** `GET /admin/api-keys` returns id, name, createdAt, lastUsedAt (never the raw key).
