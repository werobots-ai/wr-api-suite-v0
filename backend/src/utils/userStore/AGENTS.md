# Agent Guidelines for `backend/src/utils/userStore`

- This folder intentionally splits the identity-store logic into focused modules
  (persistence, users, organizations, keys, summaries, etc.). When extending the
  identity store, place new helpers in the module that best matches their
  responsibility instead of growing a single large file.
- Re-export public helpers through `index.ts` so existing imports keep working.
  If you add a new public API, wire it up in `index.ts` and keep the surface area
  backward compatible.
- Prefer reusing the shared utilities in this folder (`time.ts`, `passwords.ts`,
  `apiKeys.ts`, `safeEntities.ts`) rather than duplicating logic (e.g., hashing,
  slug generation, masking, or safe entity transforms).
