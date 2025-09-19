import type { UserAccount } from "../../../types/Identity";
import { cloneProductConfig } from "../../../types/Products";

export function toSafeUser(user: UserAccount) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    globalRoles: user.globalRoles,
    organizations: user.organizations.map((link) => ({
      ...link,
      productAccess: link.productAccess.map((config) =>
        cloneProductConfig(config),
      ),
    })),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    status: user.status,
  };
}
