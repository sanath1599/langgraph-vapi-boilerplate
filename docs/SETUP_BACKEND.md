# Backend Setup Guide

Comprehensive setup guide for the **Appointment API** (Mock EMR Backend) used by the voice bot and admin frontend.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Node.js (LTS recommended; use `nvm use --lts` if needed) |
| **Language** | TypeScript |
| **Framework** | Express.js |
| **ORM / Database** | Prisma with SQLite |
| **Auth** | JWT (admin), API key (`x-api-key` / `Authorization: Bearer`) for public APIs |
| **Validation** | Zod |
| **Logging** | Winston |
| **Password hashing** | bcrypt |
| **Phone normalization** | libphonenumber-js |

---

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** (or yarn)

Optional: use [nvm](https://github.com/nvm-sh/nvm) and run `nvm use --lts` in the backend directory if Node is not found.

---

## Quick Start

```bash
cd backend
cp example.env .env
# Edit .env: set DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD, JWT_SECRET, etc.
npm install
npx prisma migrate dev
npm run seed
npm run dev
```

The API listens on **port 4000** by default.

---

## Environment Variables

Copy `example.env` to `.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: `4000`) |
| `DATABASE_URL` | Yes | Prisma datasource URL. Default: `file:./data/appointments.db` (SQLite) |
| `LOG_LEVEL` | No | `debug` \| `info` \| `warn` \| `error` (default: `info`) |
| `DEFAULT_COUNTRY` | No | Default country for phone parsing (e.g. `CA`) |
| `DEFAULT_ADMIN_USERNAME` | Yes | Admin login username (used by seed and login) |
| `DEFAULT_ADMIN_PASSWORD` | Yes | Admin login password |
| `JWT_SECRET` | Yes | Secret for signing JWTs (use a long random string in production) |
| `REQUIRE_API_KEY` | No | If `true`, public routes require `x-api-key` (default: `true`) |

Optional logging (see `example.env`):

- `LOG_CONSOLE_LEVEL`, `LOG_FILE_INFO`, `LOG_FILE_DEBUG`, `LOG_FILE_ERROR`, `LOG_FILE_WARN`

---

## Database

- **Provider:** SQLite (file-based; path from `DATABASE_URL`).
- **Migrations:** Prisma. Run `npx prisma migrate dev` for development; `npm run migrate:deploy` for production.
- **Seed:** `npm run seed` creates the default admin user and sample data (organizations, providers, users, availability, etc.).

### Useful commands

```bash
npm run migrate        # prisma migrate dev
npm run migrate:deploy # prisma migrate deploy (production)
npm run seed          # seed database (tsx scripts/seed.ts)
```

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server with hot reload (`tsx watch src/index.ts`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled app (`node dist/index.js`) |
| `npm run migrate` | Run Prisma migrations (dev) |
| `npm run migrate:deploy` | Deploy migrations (production) |
| `npm run seed` | Seed database |

---

## API Overview

- **Admin:** `/admin/*` — JWT required (`Authorization: Bearer <token>`). Login: `POST /admin/login` with `username` and `password`.
- **Public (optional API key):** `/caller-id`, `/users`, `/organizations`, `/providers`, `/availability`, `/appointments`. When `REQUIRE_API_KEY=true`, send `x-api-key: <key>` or `Authorization: Bearer <key>`.

Full API details (auth, request/response, errors): [backend/docs/API.md](../backend/docs/API.md).

---

## Project Structure (high level)

```
backend/
├── prisma/
│   ├── schema.prisma    # Models: User, Organization, Provider, Appointment, AvailabilitySlot, AdminUser, ApiKey, CallerId
│   └── migrations/
├── src/
│   ├── index.ts         # Express app, routes, CORS, error handler
│   ├── config/          # App config from env
│   ├── controllers/     # Request handlers
│   ├── middleware/      # auth (API key, JWT), errorHandler
│   ├── routes/          # admin, callerId, users, organizations, providers, availability, appointments
│   ├── services/        # Business logic
│   ├── types/           # TypeScript types
│   └── utils/           # Helpers (auth, date, phone)
├── scripts/
│   ├── seed.ts          # Database seed
│   └── test-api.sh      # API test script
├── example.env          # Template for .env
└── docs/
    ├── API.md           # Full API documentation
    └── ARCHITECTURE.md  # Architecture overview
```

---

## Troubleshooting

- **Port in use:** Change `PORT` in `.env`.
- **Database errors:** Ensure `DATABASE_URL` is correct and run `npx prisma migrate dev` and `npm run seed`.
- **Admin login fails:** Ensure seed has run and `DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD` match `.env`.
- **401 on public routes:** If `REQUIRE_API_KEY=true`, create an API key via Admin → API Keys and send it as `x-api-key` (or set `REQUIRE_API_KEY=false` for local dev).

For more detail, see [backend/docs/API.md](../backend/docs/API.md) and [backend/docs/ARCHITECTURE.md](../backend/docs/ARCHITECTURE.md).
