import type { IdentityStoreData } from "../../../../types/Identity";

export function ensureOwnerIsNew(
  store: IdentityStoreData,
  email: string,
): void {
  const normalized = email.toLowerCase();
  const exists = Object.values(store.users).some(
    (user) => user.email.toLowerCase() === normalized,
  );
  if (exists) {
    throw new Error("User with this email already exists");
  }
}
