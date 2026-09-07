/**
 * Device-scoped pseudonymous identifier shared by Form Center history and the
 * risk assessment store.
 *
 * This is an INTERIM identity until real authentication lands. The server hashes
 * this value into `scope_hash`; it is the handle used to find records again.
 *
 * Important: the key is generated once and never rotated. Clearing browser data
 * loses ACCESS to existing records — it never deletes them server-side, and the
 * server has no expiry job for risk assessments. Replacing this with an
 * `owner_id` based lookup is additive (see docs/risk-row-domain-unification.md).
 */

const SCOPE_STORAGE_KEY = "risk-guard:form-history:scope-key:v1";
const SCOPE_KEY_LENGTH = 32;
const MIN_SCOPE_KEY_LENGTH = 16;

function randomString(length: number) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let index = 0; index < length; index += 1) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars[randomIndex];
  }
  return result;
}

function createScopeKey() {
  const seed = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${randomString(12)}`;
  return `rg_scope_${seed.replace(/[^a-zA-Z0-9_-]/g, "")}_${randomString(SCOPE_KEY_LENGTH)}`;
}

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage;
}

export async function getScopeKey() {
  const storage = getStorage();
  if (!storage) {
    throw new Error("FORM_HISTORY_SCOPE_UNAVAILABLE");
  }

  const existing = storage.getItem(SCOPE_STORAGE_KEY);
  if (existing && existing.trim().length >= MIN_SCOPE_KEY_LENGTH) {
    return existing.trim();
  }

  const generated = createScopeKey();
  storage.setItem(SCOPE_STORAGE_KEY, generated);
  return generated;
}
