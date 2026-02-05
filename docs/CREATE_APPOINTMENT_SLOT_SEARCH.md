# Create Appointment – Slot Search & Provider List

This document describes the Create Appointment flow in the Admin UI: searching for available slots by date range, selecting a slot, and creating an appointment. It also covers provider listing and API integration.

## Overview

- **Providers** are listed in the Create appointment dialog after an organization is selected. They are loaded when the dialog opens (for the default organization) and when the organization dropdown changes (via `GET /admin/providers`).
- **Slot search** allows filtering by start/end date, optional provider, and visit type. Results are shown as a list; selecting a slot fills provider, start, and end and uses `slotId` when creating the appointment.

## Backend

### GET /admin/availability

Searches for available (unbooked) slots. Requires admin JWT.

**Request**

- **Headers:** `Authorization: Bearer <token>`
- **Query parameters:**
  - `organizationId` (required): number
  - `fromDate` (required): date string `YYYY-MM-DD`
  - `toDate` (required): date string `YYYY-MM-DD`
  - `providerId` (optional): number
  - `visitType` (optional): string

**Success (200)**

- Body: array of slots:
  - `slotId`: number
  - `providerId`: number
  - `start`: ISO datetime string
  - `end`: ISO datetime string

**Failure**

- **400:** Validation error (e.g. missing `organizationId`, invalid or missing `fromDate`/`toDate`). Body: `{ "error": "VALIDATION", "message": "..." }`
- **401:** Missing or invalid JWT. Body: `{ "error": "UNAUTHORIZED", "message": "..." }`

### GET /admin/providers

Lists providers, optionally filtered by organization. Used to populate the provider dropdown in the Create appointment dialog.

**Request**

- **Headers:** `Authorization: Bearer <token>`
- **Query parameters:** `organizationId` (optional): number

**Success (200)**

- Body: array of `{ id, name, organizationId, specialty?, language?, gender?, active? }`

**Failure**

- **401:** Missing or invalid JWT.

### POST /admin/appointments

Creates an appointment. Accepts either a selected slot (`slotId`) or explicit `start`/`end` (ISO datetimes).

**Request**

- **Headers:** `Authorization: Bearer <token>`
- **Body (JSON):**
  - `userId`, `organizationId`, `providerId`, `visitType`: required
  - Either:
    - `slotId`: number (slot from availability), or
    - `start` and `end`: ISO datetime strings
  - `reason` (optional), `channel` (optional)

**Success (201)**

- Body: `{ "appointmentId", "start", "end", "status" }`

**Failure**

- **400:** Validation error (e.g. missing required fields, or neither slotId nor start+end). Body: `{ "error": "VALIDATION", "message": "..." }`
- **401:** Missing or invalid JWT.

## Frontend (Create appointment dialog)

1. **Open dialog:** User, organization, and providers for the default org are loaded. Provider list updates when organization changes.
2. **Search slots:** User sets “From” and “To” dates (and optionally provider and visit type), then clicks “Search slots”. The app calls `GET /admin/availability` and shows the list of slots.
3. **Select slot:** User clicks a slot. Form is updated with that slot’s `providerId`, start, end, and `slotId`.
4. **Create:** On submit, if `slotId` is set the app sends `slotId` (and `providerId`); otherwise it sends `start` and `end` as ISO strings.

## Seeding

Providers and availability slots are created by the backend seed script (`backend/scripts/seed.ts`). Run `npm run seed` (or equivalent) so that organizations have providers and availability slots for testing slot search and creation.
