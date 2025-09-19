import { now } from "../../time";
import type { IdentityStoreData } from "../../../../types/Identity";
import type { CreateOptions, Creation } from "./types";

export function persistCreation(
  store: IdentityStoreData,
  creation: Creation,
  options: CreateOptions,
): void {
  store.users[creation.owner.id] = creation.owner;
  store.organizations[creation.organization.id] = creation.organization;
  if (options.markBootstrapComplete) {
    store.metadata.bootstrapCompletedAt = now();
  }
}
