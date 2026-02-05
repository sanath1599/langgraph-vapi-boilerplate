import { Router } from "express";
import { requireAdmin } from "../middleware/auth";
import * as adminController from "../controllers/admin";

const router = Router();

router.post("/login", adminController.login);

router.get("/users", requireAdmin, adminController.getUsers);
router.post("/users", requireAdmin, adminController.createUser);
router.patch("/users/:userId", requireAdmin, adminController.patchUser);

router.get("/organizations", requireAdmin, adminController.getOrganizations);
router.post("/organizations", requireAdmin, adminController.createOrganization);
router.patch("/organizations/:id", requireAdmin, adminController.patchOrganization);

router.get("/appointments", requireAdmin, adminController.getAppointments);
router.get("/appointments/:appointmentId", requireAdmin, adminController.getAppointment);
router.post("/appointments", requireAdmin, adminController.createAppointment);
router.patch("/appointments/:appointmentId", requireAdmin, adminController.patchAppointment);

router.get("/providers", requireAdmin, adminController.getProviders);
router.get("/availability", requireAdmin, adminController.getAvailability);

router.get("/users/:userId/appointments", requireAdmin, adminController.getUserAppointments);

router.get("/api-keys", requireAdmin, adminController.getApiKeys);
router.post("/api-keys", requireAdmin, adminController.createApiKey);

export default router;
