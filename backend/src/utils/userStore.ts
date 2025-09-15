import fs from "fs/promises";
import path from "path";
import { v4 as uuid } from "uuid";

export interface UsageEntry {
  timestamp: string;
  action: string;
  cost: number;
}

export interface ApiKey {
  id: string;
  key: string;
  lastRotated: string;
  usage: UsageEntry[];
}

export interface KeySet {
  id: string;
  name: string;
  description: string;
  keys: ApiKey[]; // always two keys
}

export interface UserData {
  id: string;
  name: string;
  credits: number;
  usage: UsageEntry[];
  keySets: KeySet[];
}

const USERS_FILE = path.join(__dirname, "../../../data/users.json");
const DEFAULT_USER_ID = "default";

async function saveUsers(users: Record<string, UserData>): Promise<void> {
  await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
}

async function loadUsers(): Promise<Record<string, UserData>> {
  try {
    const raw = await fs.readFile(USERS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    const now = new Date().toISOString();
    const defaultUser: UserData = {
      id: DEFAULT_USER_ID,
      name: "Default User",
      credits: 0,
      usage: [],
      keySets: [
        {
          id: uuid(),
          name: "Default",
          description: "",
          keys: [
            { id: uuid(), key: uuid(), lastRotated: now, usage: [] },
            { id: uuid(), key: uuid(), lastRotated: now, usage: [] },
          ],
        },
      ],
    };
    const users = { [DEFAULT_USER_ID]: defaultUser };
    await saveUsers(users);
    return users;
  }
}

export async function getUsers(): Promise<UserData[]> {
  const users = await loadUsers();
  return Object.values(users);
}

export async function getUser(
  userId: string = DEFAULT_USER_ID,
): Promise<UserData> {
  const users = await loadUsers();
  let user = users[userId];
  if (!user) {
    const now = new Date().toISOString();
    user = {
      id: userId,
      name: userId,
      credits: 0,
      usage: [],
      keySets: [
        {
          id: uuid(),
          name: "Default",
          description: "",
          keys: [
            { id: uuid(), key: uuid(), lastRotated: now, usage: [] },
            { id: uuid(), key: uuid(), lastRotated: now, usage: [] },
          ],
        },
      ],
    };
    users[userId] = user;
    await saveUsers(users);
  }
  return user;
}

export async function topUp(
  amount: number,
  userId: string = DEFAULT_USER_ID,
): Promise<UserData> {
  const users = await loadUsers();
  const user = await getUser(userId);
  user.credits += amount;
  const entry: UsageEntry = {
    timestamp: new Date().toISOString(),
    action: "topup",
    cost: -amount,
  };
  user.usage.push(entry);
  users[userId] = user;
  await saveUsers(users);
  return user;
}

export async function deductCredits(
  cost: number,
  action: string,
  userId: string = DEFAULT_USER_ID,
  keySetId?: string,
  keyId?: string,
): Promise<UserData> {
  const users = await loadUsers();
  const user = await getUser(userId);
  user.credits -= cost;
  const entry: UsageEntry = {
    timestamp: new Date().toISOString(),
    action,
    cost,
  };
  user.usage.push(entry);

  if (keySetId && keyId) {
    const ks = user.keySets.find((k) => k.id === keySetId);
    const key = ks?.keys.find((k) => k.id === keyId);
    if (key) {
      key.usage.push(entry);
    }
  }

  users[userId] = user;
  await saveUsers(users);
  return user;
}

export async function addKeySet(
  name: string,
  description: string,
  userId: string = DEFAULT_USER_ID,
): Promise<KeySet> {
  const users = await loadUsers();
  const user = await getUser(userId);
  const now = new Date().toISOString();
  const keySet: KeySet = {
    id: uuid(),
    name,
    description,
    keys: [
      { id: uuid(), key: uuid(), lastRotated: now, usage: [] },
      { id: uuid(), key: uuid(), lastRotated: now, usage: [] },
    ],
  };
  user.keySets.push(keySet);
  users[userId] = user;
  await saveUsers(users);
  return keySet;
}

export async function removeKeySet(
  setId: string,
  userId: string = DEFAULT_USER_ID,
): Promise<void> {
  const users = await loadUsers();
  const user = await getUser(userId);
  user.keySets = user.keySets.filter((ks) => ks.id !== setId);
  users[userId] = user;
  await saveUsers(users);
}

export async function rotateApiKey(
  setId: string,
  index: number,
  userId: string = DEFAULT_USER_ID,
): Promise<string> {
  const users = await loadUsers();
  const user = await getUser(userId);
  const keySet = user.keySets.find((ks) => ks.id === setId);
  if (!keySet) throw new Error("Key set not found");
  if (index < 0 || index > 1) throw new Error("Invalid key index");
  const newKey = { id: uuid(), key: uuid(), lastRotated: new Date().toISOString(), usage: [] };
  keySet.keys[index] = newKey;
  users[userId] = user;
  await saveUsers(users);
  return newKey.key;
}

export async function maskKey(key: string): Promise<string> {
  return key.replace(/.(?=.{4})/g, "*");
}

