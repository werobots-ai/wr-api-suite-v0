export type OrgRole = "OWNER" | "ADMIN" | "BILLING" | "MEMBER";

export type GlobalRole = "SYSADMIN" | "MASTER_ADMIN";

export interface UsageEntry {
  timestamp: string;
  action: string;
  /** Cost incurred towards OpenAI in dollars */
  tokenCost: number;
  /** Amount billed to the client in dollars */
  billedCost: number;
  /** Number of OpenAI requests contributing to the cost */
  requests: number;
  metadata?: Record<string, unknown>;
}

export interface StoredApiKey {
  id: string;
  encryptedKey: string;
  encryptionIv: string;
  encryptionAuthTag: string;
  keyHash: string;
  lastFour: string;
  lastRotated: string;
  lastAccessed: string | null;
  usage: UsageEntry[];
  createdBy: string;
  createdAt: string;
}

export interface KeySet {
  id: string;
  name: string;
  description: string;
  keys: StoredApiKey[];
  createdBy: string;
  createdAt: string;
  products: ProductKeyConfig[];
}

export interface BillingProfile {
  contactEmail: string;
  contactName?: string;
  /** Placeholder for Stripe integration. */
  stripeCustomerId?: string | null;
  notes?: string;
}

export interface OrgMembership {
  userId: string;
  roles: OrgRole[];
  invitedAt: string;
  joinedAt: string;
  status: "active" | "invited" | "suspended";
  productAccess: ProductKeyConfig[];
  usage: UsageEntry[];
  lastAccessed: string | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  credits: number;
  usage: UsageEntry[];
  keySets: KeySet[];
  members: OrgMembership[];
  billingProfile: BillingProfile;
  createdAt: string;
  createdBy: string;
  isMaster: boolean;
}

export interface UserOrganizationLink {
  orgId: string;
  roles: OrgRole[];
  productAccess: ProductKeyConfig[];
}

export interface UserAccount {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  globalRoles: GlobalRole[];
  organizations: UserOrganizationLink[];
  createdAt: string;
  lastLoginAt?: string;
  status: "active" | "disabled";
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorId: string;
  action: string;
  details?: Record<string, unknown>;
}

export interface IdentityMetadata {
  bootstrapCompletedAt: string | null;
}

export interface IdentityStoreData {
  users: Record<string, UserAccount>;
  organizations: Record<string, Organization>;
  auditLog: AuditLogEntry[];
  metadata: IdentityMetadata;
}
import { ProductKeyConfig } from "./Products";
