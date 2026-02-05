import { Router } from "express";
import * as usersController from "../controllers/users";

const router = Router();
router.get("/by-phone", usersController.byPhone);
router.post("/by-phone", usersController.byPhonePost);
router.get("/search", usersController.search);
router.post("/search", usersController.searchPost);
router.post("/get-by-id", usersController.getByIdPost);
router.get("/:userId", usersController.getById);
router.post("/", usersController.create);
router.post("/:userId/validate-registration", usersController.validateRegistration);
router.patch("/:userId", usersController.patch);
export default router;
