import { Router } from "express";
import * as providersController from "../controllers/providers";

const router = Router();

router.get("/", providersController.get);
router.post("/list", providersController.listPost);

export default router;
