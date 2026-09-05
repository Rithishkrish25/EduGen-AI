import { CookieOptions, NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import {
  ConflictError,
  findUserByEmail,
  findUserById,
  registerStaff,
  registerStudent,
  toSafeProfile,
} from "../services/auth.service";
import {
  getDepartmentById,
  listDepartments,
} from "../services/department.service";
import { listActiveSemestersForCurrentYear } from "../services/semester.service";
import { signAuthToken } from "../utils/jwt";
import { verifyPassword } from "../utils/password";
import {
  isNonEmptyString,
  isPositiveInteger,
  isUuid,
  isValidEmail,
} from "../utils/validation";

const MIN_PASSWORD_LENGTH = 8;
const COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
  };
}

export async function postRegisterStudent(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const {
      fullName,
      email,
      password,
      departmentId,
      year,
      semester,
      registerNumber,
    } = req.body ?? {};

    if (!isNonEmptyString(fullName)) {
      res
        .status(400)
        .json({ success: false, message: "Full name is required" });
      return;
    }

    if (!isValidEmail(email)) {
      res
        .status(400)
        .json({ success: false, message: "A valid email is required" });
      return;
    }

    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
      return;
    }

    if (!isUuid(departmentId)) {
      res.status(400).json({
        success: false,
        message: "A valid department is required",
      });
      return;
    }

    if (!isPositiveInteger(year)) {
      res.status(400).json({
        success: false,
        message: "A valid year is required",
      });
      return;
    }

    if (!isPositiveInteger(semester)) {
      res.status(400).json({
        success: false,
        message: "A valid semester is required",
      });
      return;
    }

    if (!isNonEmptyString(registerNumber)) {
      res.status(400).json({
        success: false,
        message: "Register number is required",
      });
      return;
    }

    const department = await getDepartmentById(departmentId);

    if (!department) {
      res.status(400).json({
        success: false,
        message: "Selected department was not found",
      });
      return;
    }

    const validSemesters = await listActiveSemestersForCurrentYear();

    if (!validSemesters.some((s) => s.semester_number === semester)) {
      res.status(400).json({
        success: false,
        message: "Selected semester is not currently valid",
      });
      return;
    }

    const user = await registerStudent({
      fullName,
      email,
      password,
      departmentId: department.id,
      departmentName: department.name,
      year,
      semester,
      registerNumber,
    });

    res.status(201).json({
      success: true,
      user,
    });
  } catch (error) {
    if (error instanceof ConflictError) {
      res.status(409).json({
        success: false,
        message: error.message,
      });
      return;
    }

    next(error);
  }
}

export async function postRegisterStaff(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const {
      fullName,
      email,
      password,
      departmentId,
      employeeId,
    } = req.body ?? {};

    if (!isNonEmptyString(fullName)) {
      res
        .status(400)
        .json({ success: false, message: "Full name is required" });
      return;
    }

    if (!isValidEmail(email)) {
      res
        .status(400)
        .json({ success: false, message: "A valid email is required" });
      return;
    }

    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
      return;
    }

    if (!isUuid(departmentId)) {
      res.status(400).json({
        success: false,
        message: "A valid department is required",
      });
      return;
    }

    if (!isNonEmptyString(employeeId)) {
      res.status(400).json({
        success: false,
        message: "Employee ID is required",
      });
      return;
    }

    const department = await getDepartmentById(departmentId);

    if (!department) {
      res.status(400).json({
        success: false,
        message: "Selected department was not found",
      });
      return;
    }

    const user = await registerStaff({
      fullName,
      email,
      password,
      departmentId: department.id,
      departmentName: department.name,
      employeeId,
    });

    res.status(201).json({
      success: true,
      user,
      message:
        "Registration submitted. Your account requires Admin approval before you can sign in.",
    });
  } catch (error) {
    if (error instanceof ConflictError) {
      res.status(409).json({
        success: false,
        message: error.message,
      });
      return;
    }

    next(error);
  }
}

export async function postLogin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { email, password } = req.body ?? {};

    if (!isValidEmail(email) || typeof password !== "string" || !password) {
      res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
      return;
    }

    const user = await findUserByEmail(email);

    if (!user) {
      res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
      return;
    }

    const passwordMatches = await verifyPassword(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
      return;
    }

    if (!user.is_active) {
      res.status(401).json({
        success: false,
        message:
          user.role === "staff"
            ? "Your Staff account is awaiting Admin approval."
            : "This account has been deactivated",
      });
      return;
    }

    const token = signAuthToken(user.id);

    res.cookie(env.cookieName, token, {
      ...baseCookieOptions(),
      maxAge: COOKIE_MAX_AGE_MS,
    });

    res.json({
      success: true,
      user: toSafeProfile(user),
    });
  } catch (error) {
    next(error);
  }
}

export function postLogout(_req: Request, res: Response) {
  res.clearCookie(env.cookieName, baseCookieOptions());

  res.json({
    success: true,
    message: "Logged out successfully",
  });
}

export async function getMe(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
      return;
    }

    const user = await findUserById(req.user.id);

    if (!user || !user.is_active) {
      res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
      return;
    }

    res.json({
      success: true,
      user: toSafeProfile(user),
    });
  } catch (error) {
    next(error);
  }
}

export async function getRegistrationOptions(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const [departmentsResult, semesters] = await Promise.all([
      listDepartments({
        isActive: true,
        page: 1,
        limit: 200,
        offset: 0,
      }),
      listActiveSemestersForCurrentYear(),
    ]);

    res.json({
      success: true,
      departments: departmentsResult.items.map((department) => ({
        id: department.id,
        name: department.name,
        code: department.code,
      })),
      semesters: semesters.map((semester) => ({
        id: semester.id,
        semesterNumber: semester.semester_number,
        name: semester.name,
      })),
    });
  } catch (error) {
    next(error);
  }
}