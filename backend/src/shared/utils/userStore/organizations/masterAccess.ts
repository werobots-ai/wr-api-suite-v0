import { loadIdentity } from "../persistence";

export async function userHasMasterOrgAccess(
  userId: string,
): Promise<boolean> {
  const store = await loadIdentity();
  return Object.values(store.organizations).some((organization) =>
    organization.isMaster
      ? organization.members.some(
          (member) =>
            member.userId === userId &&
            member.status === "active" &&
            member.roles.includes("OWNER"),
        )
      : false,
  );
}
