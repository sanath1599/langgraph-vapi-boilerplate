import dotenv from "dotenv";

dotenv.config();

function envBool(key: string): boolean {
  const v = process.env[key];
  return v === "true" || v === "1" || v === "yes";
}

export const config = {
  port: parseInt(process.env.PORT ?? "4000", 10),
  databaseUrl: process.env.DATABASE_URL ?? "file:./data/appointments.db",
  logLevel: process.env.LOG_LEVEL ?? "info",
  defaultCountry: (process.env.DEFAULT_COUNTRY ?? "CA") as string,
  defaultAdminUsername: process.env.DEFAULT_ADMIN_USERNAME ?? "admin",
  defaultAdminPassword: process.env.DEFAULT_ADMIN_PASSWORD ?? "admin123",
  jwtSecret: process.env.JWT_SECRET ?? "change-me-in-production",
  requireApiKey: process.env.REQUIRE_API_KEY !== "false",
  logging: {
    /** Minimum level for the logger (debug, info, warn, error). */
    level: process.env.LOG_LEVEL ?? "info",
    /** Console transport level: info and error (info captures info, warn, error). */
    consoleLevel: (process.env.LOG_CONSOLE_LEVEL ?? "info") as "info" | "error" | "debug" | "warn",
    /** Enable file logging per level via LOG_FILE_INFO, LOG_FILE_DEBUG, LOG_FILE_ERROR, LOG_FILE_WARN. */
    file: {
      info: envBool("LOG_FILE_INFO"),
      debug: envBool("LOG_FILE_DEBUG"),
      error: envBool("LOG_FILE_ERROR"),
      warn: envBool("LOG_FILE_WARN"),
    },
  },
  mock: {
    randomFailPct: parseInt(process.env.MOCK_RANDOM_FAIL_PCT ?? "0", 10),
    rejectLastnamePattern: process.env.MOCK_REJECT_LASTNAME_PATTERN ?? "",
    noBookingsFriday: process.env.MOCK_NO_BOOKINGS_FRIDAY === "true",
  },
};
