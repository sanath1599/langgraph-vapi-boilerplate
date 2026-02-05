# Backend Architecture: Routes → Controllers → Services

Business logic is consolidated in **services**. **Controllers** parse request data, call services, and send responses. **Routes** only wire HTTP methods/paths to controllers (and middleware such as auth).

## Layers

| Layer | Role |
|-------|------|
| **Routes** | Mount middleware (e.g. `requireAdmin`, `requireApiKey`), delegate to controller handlers. No Prisma or business logic. |
| **Controllers** | Parse `req` (query, body, params), validate input, call one or more services, `res.json(...)` or `res.status(...).json(...)`. |
| **Services** | All business logic and data access (Prisma). Reused by both admin and non-admin APIs where applicable. |

## Shared vs admin-only

- **Public (and LLM) APIs** use the same services as admin where it makes sense:
  - **Availability:** `availabilityService.listAvailability()` — used by both `GET /availability` (public) and `GET /admin/availability` (admin).
  - **Providers:** `providerService.listProviders({ forAdmin: false })` for public, `forAdmin: true` for admin (no active filter, full model).
  - **Appointments:** `appointmentService.getAppointment`, `createAppointment`, `patchAppointment`, `listAppointments` — shared; admin adds `listAppointmentsForAdmin` for the admin table shape.
  - **Users:** `userService.createUser`, `patchUser` shared; `listUsersForAdmin` for admin list.
  - **Organizations:** `organizationService.getBookingRules()` used by public; `listOrganizations`, `createOrganization`, `patchOrganization` used by admin.
- **Auth:** `authService.loginAdmin`, `listApiKeys`, `createApiKey` are admin-only.

## File layout

```
src/
  routes/          # route definitions only (method + path → controller)
  controllers/     # request parsing + service calls + response
  services/        # business logic + Prisma
  middleware/
  utils/
  types/
```

## Naming

- **Routes:** `admin.ts`, `availability.ts`, `appointments.ts`, `users.ts`, `organizations.ts`, `providers.ts`, `callerId.ts`.
- **Controllers:** Same name as route or grouped (e.g. `admin.ts` for all admin handlers).
- **Services:** `authService`, `userService`, `appointmentService`, `organizationService`, `providerService`, `availabilityService`.
