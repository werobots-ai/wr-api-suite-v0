import type { UserAccount } from "../../../types/Identity";
import { loadIdentity } from "../persistence";

export async function getUsersForOrganization(
  orgId: string,
): Promise<UserAccount[]> {
  const store = await loadIdentity();
  const organization = store.organizations[orgId];
  if (!organization) return [];
  return organization.members
    .map((member) => store.users[member.userId])
    .filter((user): user is UserAccount => Boolean(user));
}

export async function getUser(userId: string): Promise<UserAccount | null> {
  const store = await loadIdentity();
  return store.users[userId] || null;
}

export async function getUserByEmail(
  email: string,
): Promise<UserAccount | null> {
  const store = await loadIdentity();
  const normalized = email.toLowerCase();
  return (
    Object.values(store.users).find(
      (user) => user.email.toLowerCase() === normalized,
    ) || null
  );
}
