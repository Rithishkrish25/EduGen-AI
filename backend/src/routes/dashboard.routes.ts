import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.middleware";

const router = Router();

router.get(
  "/student/dashboard",
  authenticate,
  requireRole("student"),
  (_req, res) => {
    res.json({
      success: true,
      message: "Welcome to the student dashboard",
    });
  }
);

router.get(
  "/staff/dashboard",
  authenticate,
  requireRole("staff"),
  (_req, res) => {
    res.json({
      success: true,
      message: "Welcome to the staff dashboard",
    });
  }
);

router.get(
  "/admin/dashboard",
  authenticate,
  requireRole("admin"),
  (_req, res) => {
    res.json({
      success: true,
      message: "Welcome to the admin dashboard",
    });
  }
);

export default router;
