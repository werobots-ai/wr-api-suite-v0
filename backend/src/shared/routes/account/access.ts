import type { OrgRole } from "../../types/Identity";
import type { toSafeOrganization } from "../../utils/userStore";

type SafeOrganizationResponse = ReturnType<typeof toSafeOrganization>;

export function assertPermission(
  roles: OrgRole[],
  allowed: OrgRole[],
): boolean {
  return allowed.some((role) => roles.includes(role));
}

function hasPrivilegedAccess(roles: OrgRole[]): boolean {
  return assertPermission(roles, ["OWNER", "ADMIN", "BILLING"]);
}

export function sanitizeOrganizationForRoles(
  organization: SafeOrganizationResponse,
  roles: OrgRole[],
  options: { isSysAdmin?: boolean } = {},
): SafeOrganizationResponse {
  const { isSysAdmin = false } = options;
  if (isSysAdmin || hasPrivilegedAccess(roles)) {
    return organization;
  }
  return {
    ...organization,
    credits: 0,
    usage: [],
    keySets: [],
    members: [],
    billingProfile: {
      contactEmail: "",
      stripeCustomerId: null,
    },
  };
}
