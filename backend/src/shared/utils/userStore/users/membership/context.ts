import type { OrgRole, Organization, UserAccount } from "../../../../types/Identity";
import type { ProductKeyConfig } from "../../../../types/Products";

export type AttachParams = {
  userId: string;
  orgId: string;
  roles: OrgRole[];
  productAccess?: ProductKeyConfig[];
};

export type ProductList = ProductKeyConfig[];

export type OrgMembership = Organization["members"][number];

export type OrganizationLink = UserAccount["organizations"][number];
