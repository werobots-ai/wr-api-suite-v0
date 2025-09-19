import type {
  GlobalRole,
  Organization,
  OrgMembership,
  UserAccount,
} from "../../../../types/Identity";
import type { ProductKeyConfig } from "../../../../types/Products";
import type { createDefaultKeySet } from "../../apiKeys";

export type CreateParams = {
  organizationName: string;
  ownerEmail: string;
  ownerName: string;
  ownerPassword: string;
  billingEmail?: string;
};

export type CreateOptions = {
  isMaster?: boolean;
  ownerGlobalRoles?: GlobalRole[];
  markBootstrapComplete?: boolean;
};

export type Creation = {
  owner: UserAccount;
  organization: Organization;
  keySet: ReturnType<typeof createDefaultKeySet>;
};

export type CreateResult = {
  organization: Organization;
  owner: UserAccount;
  apiKeys: string[];
};

export type Identifiers = {
  ownerId: string;
  orgId: string;
};

export type DefaultProducts = ProductKeyConfig[];

export type OwnerRoles = OrgMembership["roles"];
