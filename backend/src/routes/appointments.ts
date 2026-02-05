import { Router } from "express";
import * as appointmentsController from "../controllers/appointments";

const router = Router();
router.post("/preview", appointmentsController.preview);
router.post("/cancel-options", appointmentsController.cancelOptions);
router.post("/", appointmentsController.create);
router.get("/", appointmentsController.list);
router.post("/list", appointmentsController.listPost);
router.post("/get-by-id", appointmentsController.getByIdPost);
router.get("/:appointmentId", appointmentsController.getById);
router.post("/:appointmentId/reschedule-options", appointmentsController.rescheduleOptions);
router.patch("/:appointmentId", appointmentsController.patch);
router.post("/:appointmentId/cancel", appointmentsController.cancel);
export default router;
