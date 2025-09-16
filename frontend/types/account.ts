export type OrgRole = "OWNER" | "ADMIN" | "BILLING" | "MEMBER";

export type UsageEntry = {
  timestamp: string;
  action: string;
  tokenCost: number;
  billedCost: number;
  requests: number;
  metadata?: Record<string, unknown>;
};

export type SafeApiKey = {
  id: string;
  maskedKey: string;
  lastFour: string;
  lastRotated: string;
  usage: UsageEntry[];
  createdAt: string;
  createdBy: string;
};

export type SafeKeySet = {
  id: string;
  name: string;
  description: string;
  keys: SafeApiKey[];
  createdAt: string;
  createdBy: string;
};

export type BillingProfile = {
  contactEmail: string;
  contactName?: string;
  stripeCustomerId?: string | null;
  notes?: string;
};

export type OrgMember = {
  userId: string;
  roles: OrgRole[];
  invitedAt: string;
  joinedAt: string;
  status: "active" | "invited" | "suspended";
};

export type SafeOrganization = {
  id: string;
  name: string;
  slug: string;
  credits: number;
  usage: UsageEntry[];
  keySets: SafeKeySet[];
  billingProfile: BillingProfile;
  members: OrgMember[];
  createdAt: string;
  createdBy: string;
};

export type SafeUser = {
  id: string;
  email: string;
  name: string;
  globalRoles: string[];
  organizations: { orgId: string; roles: OrgRole[] }[];
  createdAt: string;
  lastLoginAt?: string;
  status: "active" | "disabled";
};

export type AccountPermissions = {
  manageBilling: boolean;
  manageKeys: boolean;
  manageUsers: boolean;
};

export type UsageTotals = {
  totalTokenCost: number;
  totalBilled: number;
  totalRequests: number;
  netRevenue: number;
};

export type TopUpTotals = {
  totalTopUps: number;
  lastTopUpAt: string | null;
  count: number;
};

export type PlatformOrganization = {
  organization: SafeOrganization;
  usage: UsageTotals;
  topUps: TopUpTotals;
  activeMemberCount: number;
  apiKeyCount: number;
};

export type PlatformOverview = {
  organizations: PlatformOrganization[];
  totals: UsageTotals & {
    totalTopUps: number;
    totalCredits: number;
    organizationCount: number;
    activeMemberCount: number;
    apiKeyCount: number;
  };
};
