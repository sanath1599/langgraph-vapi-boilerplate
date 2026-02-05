import { Router } from "express";
import * as organizationsController from "../controllers/organizations";

const router = Router();

router.post("/booking-rules", organizationsController.getBookingRulesPost);
router.get("/:orgId/booking-rules", organizationsController.getBookingRules);

export default router;
