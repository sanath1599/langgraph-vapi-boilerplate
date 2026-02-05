# Frontend Setup Guide

Comprehensive setup guide for the **Admin Dashboard** (Mock EMR Frontend) used to manage organizations, providers, users, appointments, availability, caller ID, and the chatbot.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Runtime / Build** | Node.js (LTS recommended), Vite |
| **Language** | TypeScript |
| **UI Framework** | React 18 |
| **Routing** | React Router v7 |
| **Styling** | Tailwind CSS |
| **Components** | Radix UI (Dialog, Dropdown, Label, Popover, Slot, Tabs) |
| **Utilities** | class-variance-authority, clsx, tailwind-merge |
| **Icons** | Lucide React |
| **Env** | dotenv (Vite env: `VITE_*`) |

---

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** (or yarn)

Optional: use [nvm](https://github.com/nvm-sh/nvm) and run `nvm use --lts` in the frontend directory if Node is not found.

---

## Quick Start

```bash
cd frontend
cp .env.example .env
# Edit .env: VITE_API_BASE, VITE_DEFAULT_CALLER, VITE_LLM_SERVER_URL (optional)
npm install
npm run dev
```

The app runs on **port 5173**. Ensure the **backend** is running on **port 4000** so the `/api` proxy works.

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE` | Yes | Backend API base. Use `/api` in dev (Vite proxies to backend). In production set full URL (e.g. `https://api.example.com`) |
| `VITE_DEFAULT_CALLER` | No | Default caller phone for Chat (e.g. `+15855652555`) |
| `VITE_LLM_SERVER_URL` | No | Custom LLM server URL for Chat (e.g. `http://localhost:6065`) |

**Note:** Only variables prefixed with `VITE_` are exposed to the client.

---

## Development Proxy

The Vite dev server proxies `/api` to the backend so that:

- Frontend routes (e.g. `/appointments`, `/users`) are not proxied; reload works correctly.
- API calls from the app go to `VITE_API_BASE` (e.g. `/api`) and are forwarded to `http://localhost:4000`.

Configuration is in `vite.config.ts`:

```ts
proxy: {
  "/api": {
    target: "http://localhost:4000",
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ""),
  },
},
```

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server (port 5173) |
| `npm run build` | TypeScript check + Vite build → `dist/` |
| `npm run preview` | Serve production build locally |

---

## Main Features

- **Auth:** Login with admin username/password (JWT). Default credentials come from backend env (e.g. `admin` / `admin123` after seed).
- **Pages:** Dashboard, Users (with “View appointments”), Organizations, Appointments (date range), API Keys, Chat (scheduling assistant).
- **Theme:** Light/dark mode (ShadCN-style theming).
- **Protected routes:** Authenticated users only; unauthenticated users are redirected to Login.

---

## Project Structure (high level)

```
frontend/
├── public/           # Static assets (e.g. logos)
├── src/
│   ├── main.tsx      # Entry, React root
│   ├── App.tsx       # Routes and layout
│   ├── api.ts        # API client (base URL from env)
│   ├── index.css     # Global + Tailwind
│   ├── components/   # Layout, ProtectedRoute, ThemeProvider, ui/*
│   ├── contexts/     # AuthContext
│   ├── lib/          # utils (cn, etc.)
│   ├── pages/        # Login, Dashboard, Users, Organizations, Appointments, ApiKeys, Chat
│   └── sections/     # Per-page sections (e.g. AppointmentsSection, ChatbotSection)
├── index.html
├── vite.config.ts    # React plugin, /api proxy
├── tailwind.config.js
├── postcss.config.js
└── .env.example
```

---

## Build and Checks

After making changes, run a full build and fix any errors:

```bash
npm run build
```

Use `nvm use --lts` if the build fails with “Node not found”.

---

## Troubleshooting

- **API calls fail / 404:** Ensure backend is running on port 4000 and `VITE_API_BASE` is `/api` in dev.
- **Login fails:** Use the same credentials as backend (e.g. from backend `DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD` after seed).
- **Blank page / white screen:** Check browser console and ensure env vars are set; rebuild with `npm run build`.

For API contract and auth details, see [backend/docs/API.md](../backend/docs/API.md).
