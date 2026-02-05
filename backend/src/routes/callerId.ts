import { Router } from "express";
import * as callerIdController from "../controllers/callerId";

const router = Router();
router.get("/normalize", callerIdController.normalize);
router.post("/normalize", callerIdController.normalizePost);
export default router;
