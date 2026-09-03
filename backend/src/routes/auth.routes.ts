import { Router } from "express";
import {
  getMe,
  getRegistrationOptions,
  postLogin,
  postLogout,
  postRegisterStaff,
  postRegisterStudent,
} from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.get("/registration-options", getRegistrationOptions);
router.post("/register/student", postRegisterStudent);
router.post("/register/staff", postRegisterStaff);
router.post("/login", postLogin);
router.post("/logout", postLogout);
router.get("/me", authenticate, getMe);

export default router;
