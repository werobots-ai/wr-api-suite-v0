import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { v4 as uuid } from "uuid";
import {
  IdentityStoreData,
  Organization,
  UserAccount,
  UsageEntry,
  StoredApiKey,
  KeySet,
  OrgRole,
  GlobalRole,
} from "../types/Identity";

const IDENTITY_FILE = path.join(__dirname, "../../../data/identity.json");
const LEGACY_USERS_FILE = path.join(__dirname, "../../../data/users.json");

const KEY_SECRET = process.env.API_KEY_SECRET || "local-dev-secret";
const HASH_SECRET = process.env.API_KEY_HASH_SECRET || KEY_SECRET;

const INTERNAL_ORG_IDS = new Set(
  (process.env.WEROBOTS_INTERNAL_ORG_IDS || process.env.WEROBOTS_INTERNAL_ORG_ID || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0),
);

export interface SafeEntityOptions {
  maskCosts?: boolean;
}

export function isInternalOrg(orgId: string): boolean {
  return INTERNAL_ORG_IDS.has(orgId);
}

export interface UsageTotals {
  totalTokenCost: number;
  totalBilled: number;
  totalRequests: number;
  netRevenue: number;
}

export interface TopUpTotals {
  totalTopUps: number;
  lastTopUpAt: string | null;
  count: number;
}

export interface PlatformOrganizationSummary {
  organization: ReturnType<typeof toSafeOrganization>;
  usage: UsageTotals;
  topUps: TopUpTotals;
  activeMemberCount: number;
  apiKeyCount: number;
}

export interface PlatformOverview {
  organizations: PlatformOrganizationSummary[];
  totals: UsageTotals & {
    totalTopUps: number;
    totalCredits: number;
    organizationCount: number;
    activeMemberCount: number;
    apiKeyCount: number;
  };
}

function deriveEncryptionKey(): Buffer {
  return crypto.createHash("sha256").update(KEY_SECRET).digest();
}

function now(): string {
  return new Date().toISOString();
}

async function ensureDirectory() {
  await fs.mkdir(path.dirname(IDENTITY_FILE), { recursive: true });
}

async function saveIdentity(store: IdentityStoreData): Promise<void> {
  await ensureDirectory();
  await fs.writeFile(IDENTITY_FILE, JSON.stringify(store, null, 2), "utf-8");
}

async function loadIdentity(): Promise<IdentityStoreData> {
  try {
    const raw = await fs.readFile(IDENTITY_FILE, "utf-8");
    return JSON.parse(raw) as IdentityStoreData;
  } catch (err) {
    const store = await migrateLegacyStore();
    if (store) return store;
    const bootstrap = await createBootstrapIdentity();
    await saveIdentity(bootstrap);
    return bootstrap;
  }
}

async function migrateLegacyStore(): Promise<IdentityStoreData | null> {
  try {
    const raw = await fs.readFile(LEGACY_USERS_FILE, "utf-8");
    const legacy = JSON.parse(raw) as Record<string, any>;
    const [legacyUser] = Object.values(legacy) as any[];
    if (!legacyUser) return null;
    const ownerId = uuid();
    const orgId = uuid();
    const created = now();
    const keySets: KeySet[] = (legacyUser.keySets || []).map((set: any) => {
      const keys = (set.keys || []).map((key: any) => {
        const plain = key.key || uuid();
        return createStoredKeyFromPlain(plain, ownerId);
      });
      return {
        id: set.id || uuid(),
        name: set.name || "Default",
        description: set.description || "",
        keys,
        createdAt: created,
        createdBy: ownerId,
      };
    });
    const organization: Organization = {
      id: orgId,
      name: legacyUser.name || "Legacy Organization",
      slug: slugify(legacyUser.name || "Legacy Organization"),
      credits: legacyUser.credits || 0,
      usage: legacyUser.usage || [],
      keySets: keySets.length ? keySets : [createDefaultKeySet(ownerId)],
      members: [
        {
          userId: ownerId,
          roles: ["OWNER", "ADMIN", "BILLING"],
          invitedAt: created,
          joinedAt: created,
          status: "active",
        },
      ],
      billingProfile: {
        contactEmail: `${legacyUser.name || "legacy"}@example.com`,
      },
      createdAt: created,
      createdBy: ownerId,
    };

    const user: UserAccount = {
      id: ownerId,
      email: `${legacyUser.name || "legacy"}@example.com`,
      name: legacyUser.name || "Legacy User",
      passwordHash: createPasswordHash("changeme"),
      globalRoles: [],
      organizations: [{ orgId, roles: ["OWNER", "ADMIN", "BILLING"] }],
      createdAt: created,
      status: "active",
    };

    const store: IdentityStoreData = {
      users: { [ownerId]: user },
      organizations: { [orgId]: organization },
      auditLog: [],
    };

    await saveIdentity(store);
    return store;
  } catch {
    return null;
  }
}

async function createBootstrapIdentity(): Promise<IdentityStoreData> {
  const orgId = uuid();
  const ownerId = uuid();
  const sysAdminId = uuid();
  const created = now();

  const owner: UserAccount = {
    id: ownerId,
    email: "owner@example.com",
    name: "Default Org Owner",
    passwordHash: createPasswordHash("owner"),
    globalRoles: [],
    organizations: [{ orgId, roles: ["OWNER", "ADMIN", "BILLING"] }],
    createdAt: created,
    status: "active",
  };

  const sysAdmin: UserAccount = {
    id: sysAdminId,
    email: "sysadmin@werobots.dev",
    name: "WR SysAdmin",
    passwordHash: createPasswordHash("sysadmin"),
    globalRoles: ["SYSADMIN"],
    organizations: [],
    createdAt: created,
    status: "active",
  };

  const organization: Organization = {
    id: orgId,
    name: "Default Organization",
    slug: slugify("Default Organization"),
    credits: 0,
    usage: [],
    keySets: [createDefaultKeySet(ownerId)],
    members: [
      {
        userId: ownerId,
        roles: ["OWNER", "ADMIN", "BILLING"],
        invitedAt: created,
        joinedAt: created,
        status: "active",
      },
    ],
    billingProfile: {
      contactEmail: "billing@example.com",
      contactName: "Default Billing Contact",
    },
    createdAt: created,
    createdBy: ownerId,
  };

  return {
    users: {
      [ownerId]: owner,
      [sysAdminId]: sysAdmin,
    },
    organizations: {
      [orgId]: organization,
    },
    auditLog: [],
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function maskFromLastFour(lastFour: string): string {
  return `**** **** **** ${lastFour}`;
}

function hashApiKey(key: string): string {
  return crypto.createHmac("sha256", HASH_SECRET).update(key).digest("hex");
}

function encryptValue(value: string): {
  encrypted: string;
  iv: string;
  authTag: string;
} {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

function decryptValue(
  encrypted: string,
  iv: string,
  authTag: string,
): string {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    deriveEncryptionKey(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf-8");
}

function createStoredKeyFromPlain(key: string, actorId: string): StoredApiKey {
  const { encrypted, iv, authTag } = encryptValue(key);
  const timestamp = now();
  return {
    id: uuid(),
    encryptedKey: encrypted,
    encryptionIv: iv,
    encryptionAuthTag: authTag,
    keyHash: hashApiKey(key),
    lastFour: key.slice(-4),
    lastRotated: timestamp,
    lastAccessed: null,
    usage: [],
    createdAt: timestamp,
    createdBy: actorId,
  };
}

function createDefaultKeySet(actorId: string): KeySet {
  const createdAt = now();
  const keyA = createStoredKeyFromPlain(generatePlainApiKey(), actorId);
  const keyB = createStoredKeyFromPlain(generatePlainApiKey(), actorId);
  return {
    id: uuid(),
    name: "Default",
    description: "Initial key set",
    keys: [keyA, keyB],
    createdAt,
    createdBy: actorId,
  };
}

export function generatePlainApiKey(): string {
  const random = crypto.randomBytes(24).toString("hex");
  return `wr_${random}`;
}

export function createPasswordHash(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [saltHex, hashHex] = storedHash.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const hash = Buffer.from(hashHex, "hex");
  const derived = crypto.scryptSync(password, salt, hash.length);
  return crypto.timingSafeEqual(hash, derived);
}

export async function getIdentityStore(): Promise<IdentityStoreData> {
  return loadIdentity();
}

export async function getOrganizations(): Promise<Organization[]> {
  const store = await loadIdentity();
  return Object.values(store.organizations);
}

export async function getOrganization(orgId: string): Promise<Organization | null> {
  const store = await loadIdentity();
  return store.organizations[orgId] || null;
}

export async function getUsersForOrganization(orgId: string): Promise<UserAccount[]> {
  const store = await loadIdentity();
  const org = store.organizations[orgId];
  if (!org) return [];
  return org.members
    .map((member) => store.users[member.userId])
    .filter((u): u is UserAccount => Boolean(u));
}

export async function getUser(userId: string): Promise<UserAccount | null> {
  const store = await loadIdentity();
  return store.users[userId] || null;
}

export async function getUserByEmail(email: string): Promise<UserAccount | null> {
  const store = await loadIdentity();
  return (
    Object.values(store.users).find(
      (u) => u.email.toLowerCase() === email.toLowerCase(),
    ) || null
  );
}

export async function createUserAccount(params: {
  email: string;
  name: string;
  password: string;
  globalRoles?: GlobalRole[];
}): Promise<UserAccount> {
  const store = await loadIdentity();
  const id = uuid();
  const user: UserAccount = {
    id,
    email: params.email,
    name: params.name,
    passwordHash: createPasswordHash(params.password),
    globalRoles: params.globalRoles || [],
    organizations: [],
    createdAt: now(),
    status: "active",
  };
  store.users[id] = user;
  await saveIdentity(store);
  return user;
}

export async function updateUserLastLogin(userId: string): Promise<void> {
  const store = await loadIdentity();
  const user = store.users[userId];
  if (!user) return;
  user.lastLoginAt = now();
  await saveIdentity(store);
}

export async function createOrganizationWithOwner(params: {
  organizationName: string;
  ownerEmail: string;
  ownerName: string;
  ownerPassword: string;
  billingEmail?: string;
}): Promise<{ organization: Organization; owner: UserAccount; apiKeys: string[] }>
{
  const store = await loadIdentity();
  const existing = await getUserByEmail(params.ownerEmail);
  if (existing) {
    throw new Error("User with this email already exists");
  }

  const orgId = uuid();
  const ownerId = uuid();
  const created = now();

  const keySet = createDefaultKeySet(ownerId);

  const owner: UserAccount = {
    id: ownerId,
    email: params.ownerEmail,
    name: params.ownerName,
    passwordHash: createPasswordHash(params.ownerPassword),
    globalRoles: [],
    organizations: [{ orgId, roles: ["OWNER", "ADMIN", "BILLING"] }],
    createdAt: created,
    status: "active",
  };

  const organization: Organization = {
    id: orgId,
    name: params.organizationName,
    slug: slugify(params.organizationName),
    credits: 0,
    usage: [],
    keySets: [keySet],
    members: [
      {
        userId: ownerId,
        roles: ["OWNER", "ADMIN", "BILLING"],
        invitedAt: created,
        joinedAt: created,
        status: "active",
      },
    ],
    billingProfile: {
      contactEmail: params.billingEmail || params.ownerEmail,
      contactName: params.ownerName,
    },
    createdAt: created,
    createdBy: ownerId,
  };

  store.users[ownerId] = owner;
  store.organizations[orgId] = organization;
  await saveIdentity(store);

  const apiKeys = keySet.keys.map((key) => decryptValue(
    key.encryptedKey,
    key.encryptionIv,
    key.encryptionAuthTag,
  ));

  return { organization, owner, apiKeys };
}

export async function attachUserToOrganization(params: {
  userId: string;
  orgId: string;
  roles: OrgRole[];
}): Promise<void> {
  const store = await loadIdentity();
  const user = store.users[params.userId];
  const org = store.organizations[params.orgId];
  if (!user || !org) throw new Error("User or organization not found");

  if (!user.organizations.some((o) => o.orgId === params.orgId)) {
    user.organizations.push({ orgId: params.orgId, roles: params.roles });
  } else {
    user.organizations = user.organizations.map((o) =>
      o.orgId === params.orgId ? { orgId: params.orgId, roles: params.roles } : o,
    );
  }

  const membership = org.members.find((m) => m.userId === params.userId);
  if (membership) {
    membership.roles = params.roles;
    membership.status = "active";
  } else {
    org.members.push({
      userId: params.userId,
      roles: params.roles,
      invitedAt: now(),
      joinedAt: now(),
      status: "active",
    });
  }

  await saveIdentity(store);
}

export async function createOrUpdateOrgUser(params: {
  orgId: string;
  email: string;
  name: string;
  roles: OrgRole[];
  password?: string;
}): Promise<{ user: UserAccount; isNewUser: boolean; generatedPassword?: string }>
{
  const store = await loadIdentity();
  const org = store.organizations[params.orgId];
  if (!org) throw new Error("Organization not found");

  let user = Object.values(store.users).find(
    (u) => u.email.toLowerCase() === params.email.toLowerCase(),
  );
  let generatedPassword: string | undefined;
  let isNewUser = false;
  if (!user) {
    const password = params.password || crypto.randomBytes(8).toString("hex");
    generatedPassword = params.password ? undefined : password;
    user = {
      id: uuid(),
      email: params.email,
      name: params.name,
      passwordHash: createPasswordHash(password),
      globalRoles: [],
      organizations: [],
      createdAt: now(),
      status: "active",
    };
    store.users[user.id] = user;
    isNewUser = true;
  } else {
    user.name = params.name;
    if (params.password) {
      user.passwordHash = createPasswordHash(params.password);
    }
  }

  if (!user.organizations.some((o) => o.orgId === params.orgId)) {
    user.organizations.push({ orgId: params.orgId, roles: params.roles });
  } else {
    user.organizations = user.organizations.map((o) =>
      o.orgId === params.orgId ? { orgId: params.orgId, roles: params.roles } : o,
    );
  }

  const membership = org.members.find((m) => m.userId === user.id);
  if (membership) {
    membership.roles = params.roles;
    membership.status = "active";
  } else {
    org.members.push({
      userId: user.id,
      roles: params.roles,
      invitedAt: now(),
      joinedAt: now(),
      status: "active",
    });
  }

  await saveIdentity(store);

  return { user, isNewUser, generatedPassword };
}

export async function topUpOrganization(
  orgId: string,
  amount: number,
): Promise<Organization> {
  const store = await loadIdentity();
  const org = store.organizations[orgId];
  if (!org) throw new Error("Organization not found");
  org.credits += amount;
  const entry: UsageEntry = {
    timestamp: now(),
    action: "topup",
    tokenCost: 0,
    billedCost: -amount,
    requests: 0,
  };
  org.usage.push(entry);
  await saveIdentity(store);
  return org;
}

export async function recordUsage(params: {
  orgId: string;
  tokenCost: number;
  billedCost: number;
  action: string;
  requests?: number;
  keySetId?: string;
  keyId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const store = await loadIdentity();
  const org = store.organizations[params.orgId];
  if (!org) throw new Error("Organization not found");
  org.credits -= params.billedCost;
  const entry: UsageEntry = {
    timestamp: now(),
    action: params.action,
    tokenCost: params.tokenCost,
    billedCost: params.billedCost,
    requests: params.requests ?? 0,
    metadata: params.metadata,
  };
  org.usage.push(entry);

  if (params.keySetId && params.keyId) {
    const keySet = org.keySets.find((ks) => ks.id === params.keySetId);
    const key = keySet?.keys.find((k) => k.id === params.keyId);
    if (key) {
      key.usage.push(entry);
      key.lastAccessed = entry.timestamp;
    }
  }

  await saveIdentity(store);
}

export function maskKey(lastFour: string): string {
  return maskFromLastFour(lastFour);
}

function toSafeUsageEntry(entry: UsageEntry, options: SafeEntityOptions = {}) {
  return {
    ...entry,
    tokenCost: options.maskCosts ? null : entry.tokenCost,
  };
}

export function toSafeKey(set: StoredApiKey, options: SafeEntityOptions = {}) {
  return {
    id: set.id,
    maskedKey: maskFromLastFour(set.lastFour),
    lastFour: set.lastFour,
    lastRotated: set.lastRotated,
    lastAccessed: set.lastAccessed ?? null,
    usage: set.usage.map((entry) => toSafeUsageEntry(entry, options)),
    createdAt: set.createdAt,
    createdBy: set.createdBy,
  };
}

export function toSafeKeySet(set: KeySet, options: SafeEntityOptions = {}) {
  return {
    id: set.id,
    name: set.name,
    description: set.description,
    createdAt: set.createdAt,
    createdBy: set.createdBy,
    keys: set.keys.map((key) => toSafeKey(key, options)),
  };
}

export function toSafeOrganization(org: Organization, options: SafeEntityOptions = {}) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    credits: org.credits,
    usage: org.usage.map((entry) => toSafeUsageEntry(entry, options)),
    keySets: org.keySets.map((set) => toSafeKeySet(set, options)),
    billingProfile: org.billingProfile,
    members: org.members,
    createdAt: org.createdAt,
    createdBy: org.createdBy,
  };
}

export function toSafeUser(user: UserAccount) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    globalRoles: user.globalRoles,
    organizations: user.organizations,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    status: user.status,
  };
}

function isTopUp(entry: UsageEntry): boolean {
  return entry.action === "topup";
}

export function summarizeUsageEntries(entries: UsageEntry[]): UsageTotals {
  const usageEntries = entries.filter((entry) => !isTopUp(entry));
  const totals = usageEntries.reduce(
    (acc, entry) => {
      acc.totalTokenCost += entry.tokenCost;
      acc.totalBilled += entry.billedCost;
      acc.totalRequests += entry.requests;
      return acc;
    },
    { totalTokenCost: 0, totalBilled: 0, totalRequests: 0 },
  );
  return {
    ...totals,
    netRevenue: totals.totalBilled - totals.totalTokenCost,
  };
}

export function summarizeTopUps(entries: UsageEntry[]): TopUpTotals {
  const topUps = entries.filter(isTopUp);
  if (topUps.length === 0) {
    return { totalTopUps: 0, lastTopUpAt: null, count: 0 };
  }
  const summary = topUps.reduce(
    (acc, entry) => {
      const amount = Math.abs(entry.billedCost);
      acc.totalTopUps += amount;
      acc.count += 1;
      if (!acc.lastTopUpAt || entry.timestamp > acc.lastTopUpAt) {
        acc.lastTopUpAt = entry.timestamp;
      }
      return acc;
    },
    { totalTopUps: 0, lastTopUpAt: null as string | null, count: 0 },
  );
  return summary;
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const store = await loadIdentity();
  const organizations = Object.values(store.organizations);
  const summaries: PlatformOrganizationSummary[] = organizations.map((org) => {
    const usage = summarizeUsageEntries(org.usage);
    const topUps = summarizeTopUps(org.usage);
    const activeMemberCount = org.members.filter((member) => member.status === "active").length;
    const apiKeyCount = org.keySets.reduce((total, set) => total + set.keys.length, 0);
    return {
      organization: toSafeOrganization(org),
      usage,
      topUps,
      activeMemberCount,
      apiKeyCount,
    };
  });

  const totals = summaries.reduce(
    (acc, entry) => {
      acc.totalTokenCost += entry.usage.totalTokenCost;
      acc.totalBilled += entry.usage.totalBilled;
      acc.totalRequests += entry.usage.totalRequests;
      acc.netRevenue += entry.usage.netRevenue;
      acc.totalTopUps += entry.topUps.totalTopUps;
      acc.totalCredits += entry.organization.credits;
      acc.organizationCount += 1;
      acc.activeMemberCount += entry.activeMemberCount;
      acc.apiKeyCount += entry.apiKeyCount;
      return acc;
    },
    {
      totalTokenCost: 0,
      totalBilled: 0,
      totalRequests: 0,
      netRevenue: 0,
      totalTopUps: 0,
      totalCredits: 0,
      organizationCount: 0,
      activeMemberCount: 0,
      apiKeyCount: 0,
    },
  );

  return { organizations: summaries, totals };
}

export async function addKeySet(
  orgId: string,
  actorId: string,
  name: string,
  description: string,
  options: SafeEntityOptions = {},
): Promise<{ keySet: ReturnType<typeof toSafeKeySet>; revealedKeys: string[] }>
{
  const store = await loadIdentity();
  const org = store.organizations[orgId];
  if (!org) throw new Error("Organization not found");
  const createdAt = now();
  const keyAPlain = generatePlainApiKey();
  const keyBPlain = generatePlainApiKey();
  const keySet: KeySet = {
    id: uuid(),
    name,
    description,
    keys: [
      createStoredKeyFromPlain(keyAPlain, actorId),
      createStoredKeyFromPlain(keyBPlain, actorId),
    ],
    createdAt,
    createdBy: actorId,
  };
  org.keySets.push(keySet);
  await saveIdentity(store);
  return {
    keySet: toSafeKeySet(keySet, options),
    revealedKeys: [keyAPlain, keyBPlain],
  };
}

export async function removeKeySet(
  orgId: string,
  setId: string,
): Promise<void> {
  const store = await loadIdentity();
  const org = store.organizations[orgId];
  if (!org) throw new Error("Organization not found");
  org.keySets = org.keySets.filter((ks) => ks.id !== setId);
  await saveIdentity(store);
}

export async function rotateApiKey(
  orgId: string,
  setId: string,
  index: number,
  actorId: string,
  options: SafeEntityOptions = {},
): Promise<{ apiKey: string; safeKey: ReturnType<typeof toSafeKey> }>
{
  const store = await loadIdentity();
  const org = store.organizations[orgId];
  if (!org) throw new Error("Organization not found");
  const keySet = org.keySets.find((ks) => ks.id === setId);
  if (!keySet) throw new Error("Key set not found");
  if (index < 0 || index >= keySet.keys.length) {
    throw new Error("Invalid key index");
  }
  const plain = generatePlainApiKey();
  const stored = createStoredKeyFromPlain(plain, actorId);
  keySet.keys[index] = stored;
  await saveIdentity(store);
  return { apiKey: plain, safeKey: toSafeKey(stored, options) };
}

export async function findOrgByApiKey(
  apiKey: string,
  options: { recordAccess?: boolean } = {},
): Promise<{
  organization: Organization;
  keySet: KeySet;
  key: StoredApiKey;
} | null> {
  const store = await loadIdentity();
  const hash = hashApiKey(apiKey);
  for (const org of Object.values(store.organizations)) {
    for (const keySet of org.keySets) {
      const key = keySet.keys.find((k) => k.keyHash === hash);
      if (key) {
        if (options.recordAccess) {
          key.lastAccessed = now();
          await saveIdentity(store);
        }
        return { organization: org, keySet, key };
      }
    }
  }
  return null;
}

export function revealStoredKey(key: StoredApiKey): string {
  return decryptValue(key.encryptedKey, key.encryptionIv, key.encryptionAuthTag);
}
