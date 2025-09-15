import fs from "fs/promises";
import path from "path";
import { v4 as uuid } from "uuid";

export interface UsageEntry {
  timestamp: string;
  action: string;
  cost: number;
}

export interface UserData {
  credits: number;
  usage: UsageEntry[];
  apiKeys: { id: string; key: string }[];
}

const USER_FILE = path.join(__dirname, "../../../data/user.json");

async function saveUser(user: UserData): Promise<void> {
  await fs.mkdir(path.dirname(USER_FILE), { recursive: true });
  await fs.writeFile(USER_FILE, JSON.stringify(user, null, 2), "utf-8");
}

export async function loadUser(): Promise<UserData> {
  try {
    const raw = await fs.readFile(USER_FILE, "utf-8");
    const data = JSON.parse(raw) as UserData;
    if (!data.apiKeys || data.apiKeys.length < 2) {
      data.apiKeys = data.apiKeys || [];
      while (data.apiKeys.length < 2) {
        data.apiKeys.push({ id: uuid(), key: uuid() });
      }
      await saveUser(data);
    }
    return data;
  } catch {
    const data: UserData = {
      credits: 0,
      usage: [],
      apiKeys: [
        { id: uuid(), key: uuid() },
        { id: uuid(), key: uuid() },
      ],
    };
    await saveUser(data);
    return data;
  }
}

export async function topUp(amount: number): Promise<UserData> {
  const user = await loadUser();
  user.credits += amount;
  user.usage.push({
    timestamp: new Date().toISOString(),
    action: "topup",
    cost: -amount,
  });
  await saveUser(user);
  return user;
}

export async function deductCredits(cost: number, action: string): Promise<UserData> {
  const user = await loadUser();
  user.credits -= cost;
  user.usage.push({
    timestamp: new Date().toISOString(),
    action,
    cost,
  });
  await saveUser(user);
  return user;
}

export async function rotateApiKey(index: number): Promise<string> {
  const user = await loadUser();
  if (index < 0 || index > 1) {
    throw new Error("Invalid key index");
  }
  user.apiKeys[index] = { id: uuid(), key: uuid() };
  await saveUser(user);
  return user.apiKeys[index].key;
}

export async function getUser(): Promise<UserData> {
  return loadUser();
}
