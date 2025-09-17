import { IdentityStoreData } from "../../types/Identity";

export async function createBootstrapIdentity(): Promise<IdentityStoreData> {
  return {
    users: {},
    organizations: {},
    auditLog: [],
    metadata: {
      bootstrapCompletedAt: null,
    },
  };
}
