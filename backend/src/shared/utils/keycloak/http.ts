type FetchArgs = Parameters<typeof fetch>;

let fetchOverride: typeof fetch | null = null;

export function setKeycloakFetchOverride(override: typeof fetch | null): void {
  fetchOverride = override;
}

export function keycloakFetch(...args: FetchArgs): ReturnType<typeof fetch> {
  const impl = fetchOverride ?? fetch;
  return impl(...args);
}
