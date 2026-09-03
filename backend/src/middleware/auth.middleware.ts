import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { findUserById } from "../services/auth.service";
import { UserRole } from "../types";
import { verifyAuthToken } from "../utils/jwt";

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const token = req.cookies?.[env.cookieName];

    if (!token) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const payload = verifyAuthToken(token);
    const user = await findUserById(payload.sub);

    if (!user || !user.is_active) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    req.user = { id: user.id, role: user.role };
    next();
  } catch {
    res.status(401).json({ success: false, message: "Authentication required" });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: "You do not have access to this resource",
      });
      return;
    }

    next();
  };
}
