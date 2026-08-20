import type { MembershipRole } from "./tokens.js";
import { forbidden } from "../lib/errors.js";

const roleLevel: Record<MembershipRole, number> = {
  VIEWER: 1,
  MEMBER: 2,
  ADMIN: 3,
  OWNER: 4,
};

export function hasMinimumRole(actual: MembershipRole, required: MembershipRole) {
  return roleLevel[actual] >= roleLevel[required];
}

export function requireRole(actual: MembershipRole, required: MembershipRole) {
  if (!hasMinimumRole(actual, required)) {
    throw forbidden();
  }
}
