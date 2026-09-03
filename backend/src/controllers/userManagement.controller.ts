import { NextFunction, Request, Response } from "express";
import { findUserById } from "../services/auth.service";
import { listAuditLogsForUser, recordAudit } from "../services/audit.service";
import {
  getUserActivitySummary,
  listUsers,
  RoleChangeInput,
  setUserActiveStatus,
  setUserRole,
  toAdminSafeProfile,
  UserListFilters,
} from "../services/userManagement.service";
import { handleKnownError, NotFoundError } from "../utils/errors";
import { parsePagination } from "../utils/pagination";
import {
  isBoolean,
  isNonEmptyString,
  isPositiveInteger,
  isUuid,
  isValidUserRole,
} from "../utils/validation";

export async function listUsersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const query = req.query as Record<string, unknown>;
    const filters: UserListFilters = {};

    if (isValidUserRole(query.role)) filters.role = query.role;
    if (typeof query.department === "string" && query.department.trim()) {
      filters.department = query.department.trim();
    }
    if (query.isActive === "true") filters.isActive = true;
    if (query.isActive === "false") filters.isActive = false;
    if (typeof query.search === "string" && query.search.trim()) {
      filters.search = query.search.trim();
    }

    const pagination = parsePagination(query);
    const result = await listUsers(filters, pagination);
    res.json({ success: true, ...result });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function getUserHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.params;
    if (!isUuid(userId)) {
      res.status(400).json({ success: false, message: "Invalid user id" });
      return;
    }

    const user = await findUserById(userId);
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    res.json({ success: true, user: toAdminSafeProfile(user) });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function setUserStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.params;
    if (!isUuid(userId)) {
      res.status(400).json({ success: false, message: "Invalid user id" });
      return;
    }

    const { isActive } = req.body ?? {};
    if (!isBoolean(isActive)) {
      res.status(400).json({ success: false, message: "isActive must be true or false" });
      return;
    }

    const existing = await findUserById(userId);
    if (!existing) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    const updated = await setUserActiveStatus(userId, isActive);

    await recordAudit({
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: isActive ? "user_activated" : "user_deactivated",
      entityType: "user",
      entityId: userId,
      summary: `${isActive ? "Activated" : "Deactivated"} account for ${existing.full_name} (${existing.email})`,
    });

    res.json({ success: true, user: toAdminSafeProfile(updated) });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

function validateRoleChangeInput(body: unknown): RoleChangeInput | string {
  const { role, department, year, semester, registerNumber, employeeId } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (!isValidUserRole(role)) {
    return "A valid role (admin, staff, student) is required";
  }

  if (role === "student") {
    if (!isNonEmptyString(department)) return "Department is required for student accounts";
    if (!isPositiveInteger(year)) return "Year is required for student accounts";
    if (!isPositiveInteger(semester)) return "Semester is required for student accounts";
    if (!isNonEmptyString(registerNumber)) {
      return "Register number is required for student accounts";
    }
    return { role, department, year, semester, registerNumber };
  }

  if (role === "staff") {
    if (!isNonEmptyString(department)) return "Department is required for staff accounts";
    if (!isNonEmptyString(employeeId)) return "Employee ID is required for staff accounts";
    return { role, department, employeeId };
  }

  return { role, department: typeof department === "string" ? department : null };
}

export async function setUserRoleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.params;
    if (!isUuid(userId)) {
      res.status(400).json({ success: false, message: "Invalid user id" });
      return;
    }

    const existing = await findUserById(userId);
    if (!existing) {
      throw new NotFoundError("User not found");
    }

    const validated = validateRoleChangeInput(req.body);
    if (typeof validated === "string") {
      res.status(400).json({ success: false, message: validated });
      return;
    }

    if (validated.role === "admin" && !existing.is_active) {
      res.status(400).json({
        success: false,
        message: "Cannot assign the admin role to an inactive account. Activate the account first.",
      });
      return;
    }

    const updated = await setUserRole(userId, validated);

    await recordAudit({
      actorUserId: req.user!.id,
      actorRole: req.user!.role,
      action: "user_role_changed",
      entityType: "user",
      entityId: userId,
      summary: `Changed role of ${existing.full_name} (${existing.email}) from ${existing.role} to ${validated.role}`,
      metadata: { previousRole: existing.role, newRole: validated.role },
    });

    res.json({ success: true, user: toAdminSafeProfile(updated) });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}

export async function getUserActivityHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.params;
    if (!isUuid(userId)) {
      res.status(400).json({ success: false, message: "Invalid user id" });
      return;
    }

    const user = await findUserById(userId);
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    const [activity, recentAuditEvents] = await Promise.all([
      getUserActivitySummary(userId),
      listAuditLogsForUser(userId, 10),
    ]);

    res.json({
      success: true,
      user: toAdminSafeProfile(user),
      activity,
      recentAuditEvents,
    });
  } catch (error) {
    handleKnownError(error, res, next);
  }
}
