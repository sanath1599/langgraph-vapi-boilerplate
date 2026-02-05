import "express-async-errors";
import express from "express";
import cors from "cors";
import { config } from "./config";
import { logger } from "./logger";
import { errorHandler } from "./middleware/errorHandler";
import { requireApiKey } from "./middleware/auth";
import adminRoutes from "./routes/admin";
import callerIdRoutes from "./routes/callerId";
import usersRoutes from "./routes/users";
import organizationsRoutes from "./routes/organizations";
import providersRoutes from "./routes/providers";
import availabilityRoutes from "./routes/availability";
import appointmentsRoutes from "./routes/appointments";

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Log every request
app.use((req, _res, next) => {
  const method = req.method;
  const path = req.url?.split("?")[0] ?? req.url;
  const query = Object.keys(req.query ?? {}).length ? req.query : undefined;
  const hasBody = req.body && typeof req.body === "object" && Object.keys(req.body).length > 0;
  const msg = [method, path, query ? `query=${JSON.stringify(query)}` : "", hasBody ? `body=${JSON.stringify(req.body)}` : ""].filter(Boolean).join(" ");
  logger.info(msg);
  next();
});

app.use("/admin", adminRoutes);

app.use("/caller-id", requireApiKey, callerIdRoutes);
app.use("/users", requireApiKey, usersRoutes);
app.use("/organizations", requireApiKey, organizationsRoutes);
app.use("/providers", requireApiKey, providersRoutes);
app.use("/availability", requireApiKey, availabilityRoutes);
app.use("/appointments", requireApiKey, appointmentsRoutes);

app.use(errorHandler);

app.listen(config.port, () => {
  logger.info(`Appointment API listening on port ${config.port}`);
});
