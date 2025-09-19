import type { OrgRole, UserAccount } from "../../../../types/Identity";
import type { ProductKeyConfig } from "../../../../types/Products";

export type OrgUserParams = {
  orgId: string;
  email: string;
  name: string;
  roles: OrgRole[];
  password?: string;
  productAccess?: ProductKeyConfig[];
};

export type OrgUserResult = {
  user: UserAccount;
  isNewUser: boolean;
  generatedPassword?: string;
};
