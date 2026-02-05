import { Router } from "express";
import * as availabilityController from "../controllers/availability";

const router = Router();

router.get("/", availabilityController.get);
router.post("/list", availabilityController.listPost);

export default router;
