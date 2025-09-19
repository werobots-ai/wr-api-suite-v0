import { UserAccount, UserOrganizationLink } from "../../types/Identity";
import { normalizeProductConfigs } from "./productConfig";

type UserMap = Record<string, UserAccount> | null | undefined;

type UserLinks = UserOrganizationLink[] | null | undefined;

function normalizeUserOrganizations(links: UserLinks): UserOrganizationLink[] {
  return (links ?? []).map((link) => ({
    ...link,
    roles: Array.isArray(link.roles) ? link.roles : [],
    productAccess: normalizeProductConfigs(link.productAccess, {
      ensureDocument: true,
    }),
  }));
}

export function normalizeUsers(users: UserMap): Record<string, UserAccount> {
  return Object.fromEntries(
    Object.entries(users ?? {}).map(([id, user]) => [
      id,
      {
        ...user,
        organizations: normalizeUserOrganizations(user.organizations),
      },
    ]),
  );
}
