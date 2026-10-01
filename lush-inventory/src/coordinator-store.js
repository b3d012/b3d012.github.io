import { readRecord, writeRecords, validateCountBackup, validateTimestamp, validateEvents } from "./count-store.js";
import { RESOLUTIONS } from "./history-model.js";
import { INITIAL_PIN } from "./pin-config.js";
import { parseDate, offShelfDate } from "./expiry-model.js";

const ITERATIONS = 250000;
const encode = (bytes) => {
  const data = new Uint8Array(bytes);
  let text = "";
  for (let index = 0; index < data.length; index += 32768) text += String.fromCharCode(...data.subarray(index, index + 32768));
  return btoa(text);
};
const decode = (value) => Uint8Array.from(atob(value), (x) => x.charCodeAt(0));
let session = null;
let epoch = 0;
let queue = Promise.resolve();

export const emptyVault = () => ({ schemaVersion: 1, archives: [], expiryRecords: [], departmentChecks: [], events: [] });
export const loadEnvelope = () => readRecord("coordinator", "vault");
export const saveEnvelope = (value, expectedCiphertext) => writeRecords([{ store: "coordinator", key: "vault", value, ...(expectedCiphertext === undefined ? {} : { expectedCiphertext }) }]);
export const isVaultUnlocked = () => Boolean(session);

export function validateVault(vault) {
  if (!vault || vault.schemaVersion !== 1 || !["archives", "expiryRecords", "departmentChecks", "events"].every((key) => Array.isArray(vault[key]))) throw new Error("Invalid coordinator backup structure.");
  const object = (value) => value && typeof value === "object" && !Array.isArray(value);
  const validateOutcome = (outcome) => {
    if (!object(outcome) || !RESOLUTIONS.some(([key]) => key === outcome.reason) || typeof outcome.note !== "string" || typeof outcome.resolved !== "boolean" || (outcome.declaredQuantity !== null && (typeof outcome.declaredQuantity !== "number" || !Number.isFinite(outcome.declaredQuantity)))) throw new Error("Invalid declared outcome in backup.");
    if (outcome.updatedAt != null) validateTimestamp(outcome.updatedAt);
    if (outcome.seasonalReview != null && typeof outcome.seasonalReview !== "boolean") throw new Error("Invalid seasonal review in backup.");
    if (outcome.links != null) {
      if (!Array.isArray(outcome.links)) throw new Error("Invalid related records in backup.");
      for (const link of outcome.links) {
        if (!object(link) || typeof link.note !== "string" || !Array.isArray(link.references) || link.references.length < 2) throw new Error("Invalid related record in backup.");
        validateTimestamp(link.at);
        for (const ref of link.references) if (!object(ref) || typeof ref.archiveId !== "string" || typeof ref.productId !== "string" || !vault.archives.some((a) => a?.id === ref.archiveId && a?.count?.products?.some((p) => p?.id === ref.productId))) throw new Error("Invalid related record reference in backup.");
      }
    }
  };
  for (const archive of vault.archives) {
    if (!archive || typeof archive.id !== "string" || typeof archive.archivedAt !== "string" || !archive.outcomes || Array.isArray(archive.outcomes) || !Array.isArray(archive.revisions)) throw new Error("Invalid history record in backup.");
    validateCountBackup(archive.count);
    validateTimestamp(archive.archivedAt);
    if (archive.count.id !== archive.id) throw new Error("Invalid history identifier in backup.");
    if (archive.count.postingDate) parseDate(archive.count.postingDate);
    for (const [id, outcome] of Object.entries(archive.outcomes)) {
      if (!archive.count.products.some((row) => row.id === id)) throw new Error("Invalid declared outcome reference in backup.");
      validateOutcome(outcome);
    }
    for (const revision of archive.revisions) {
      if (!object(revision) || !archive.count.products.some((p) => p.id === revision.productId)) throw new Error("Invalid revision record in backup.");
      validateTimestamp(revision.at); validateOutcome(revision.previous); validateOutcome(revision.outcome);
    }
  }
  for (const record of vault.expiryRecords) {
    if (!record || typeof record.id !== "string" || typeof record.plu !== "string" || typeof record.productionDate !== "string" || !Number.isFinite(record.quantity) || record.quantity < 0 || !Array.isArray(record.events)) throw new Error("Invalid OOD record in backup.");
    parseDate(record.productionDate); offShelfDate(record);
    validateTimestamp(record.observedAt); validateEvents(record.events);
    for (const field of ["department", "unit", "description", "location", "batch", "closureReason"]) if (record[field] != null && typeof record[field] !== "string") throw new Error("Invalid OOD metadata in backup.");
    if (record.quantity <= 0 || offShelfDate(record) < record.productionDate) throw new Error("Invalid OOD quantity or date in backup.");
    if (!String(record.department || "").trim() || !String(record.unit || "").trim() || !["active", "closed"].includes(record.status) || (record.status === "closed" && !record.closureReason)) throw new Error("Invalid OOD batch metadata in backup.");
  }
  for (const check of vault.departmentChecks) {
    if (!check || typeof check.department !== "string" || typeof check.date !== "string") throw new Error("Invalid departmental check in backup.");
    parseDate(check.date); parseDate(check.nextDate);
    if (!check.department.trim() || check.nextDate < check.date || typeof check.id !== "string") throw new Error("Invalid departmental check record in backup.");
    validateTimestamp(check.recordedAt);
  }
  for (const key of ["archives", "expiryRecords"]) {
    if (new Set(vault[key].map((row) => row.id)).size !== vault[key].length) throw new Error("Duplicate record identifier in backup.");
  }
  validateEvents(vault.events);
  if (vault.settings != null && (!object(vault.settings) || !Number.isInteger(vault.settings.shelfLifeMonths) || vault.settings.shelfLifeMonths < 1 || vault.settings.shelfLifeMonths > 120)) throw new Error("Invalid shelf-life settings in backup.");
  return vault;
}

async function pinBits(pin, salt, iterations = ITERATIONS) {
  if (!/^\d{4}$/.test(pin)) throw new Error("Enter your four-digit PIN.");
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", salt: decode(salt), iterations, hash: "SHA-256" }, material, 256);
}
async function aesKey(pin, salt, iterations) {
  return crypto.subtle.importKey("raw", await pinBits(pin, salt, iterations), "AES-GCM", false, ["encrypt", "decrypt"]);
}
export function validateEnvelope(envelope) {
  if (!envelope || envelope.schemaVersion !== 1 || envelope.iterations !== ITERATIONS || typeof envelope.salt !== "string" || typeof envelope.iv !== "string" || typeof envelope.ciphertext !== "string") throw new Error("Unsupported or invalid encrypted backup.");
  if (decode(envelope.salt).length !== 16 || decode(envelope.iv).length !== 12 || decode(envelope.ciphertext).length < 16) throw new Error("Invalid encrypted backup.");
  return envelope;
}
export async function decryptEnvelope(envelope, pin) {
  validateEnvelope(envelope);
  const key = await aesKey(pin, envelope.salt, envelope.iterations);
  let bytes;
  try { bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(envelope.iv) }, key, decode(envelope.ciphertext)); }
  catch { throw new Error("Incorrect PIN or damaged backup. Your saved records have not changed."); }
  return { vault: validateVault(JSON.parse(new TextDecoder().decode(bytes))), key };
}
async function encryptVault(vault, key, salt) {
  validateVault(vault);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(vault));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { schemaVersion: 1, iterations: ITERATIONS, salt, iv: encode(iv), ciphertext: encode(ciphertext) };
}

export async function unlockVault(pin) {
  const started = ++epoch;
  session = null;
  const envelope = await loadEnvelope();
  let vault, key, salt;
  if (envelope) {
    ({ vault, key } = await decryptEnvelope(envelope, pin));
    salt = envelope.salt;
  } else {
    const verifier = encode(await crypto.subtle.digest("SHA-256", await pinBits(pin, INITIAL_PIN.salt)));
    if (verifier !== INITIAL_PIN.verifier) throw new Error("Incorrect PIN.");
    salt = encode(crypto.getRandomValues(new Uint8Array(16)));
    key = await aesKey(pin, salt, ITERATIONS);
    vault = emptyVault();
  }
  if (started !== epoch) throw new Error("Unlock cancelled. Please enter your PIN again.");
  session = { key, salt, vault, epoch: started, ciphertext: envelope?.ciphertext ?? null };
  if (!envelope) await saveVault(vault);
  return structuredClone(vault);
}
export function lockVault() { epoch += 1; session = null; }

export function saveVault(vault, activeCount) {
  if (!session) return Promise.reject(new Error("Coordinator is locked. Unlock before saving."));
  const captured = session;
  const candidate = structuredClone(validateVault(vault));
  const publicCount = activeCount === undefined ? undefined : structuredClone(validateCountBackup(activeCount));
  const operation = queue.then(async () => {
    if (epoch !== captured.epoch) throw new Error("Coordinator is locked. Unlock before saving.");
    const envelope = await encryptVault(candidate, captured.key, captured.salt);
    if (epoch !== captured.epoch) throw new Error("Coordinator locked before save. Please unlock and retry.");
    await writeRecords([{ store: "coordinator", key: "vault", value: envelope, expectedCiphertext: captured.ciphertext }, ...(publicCount === undefined ? [] : [{ store: "counts", key: "active", value: publicCount }])]);
    if (epoch !== captured.epoch) throw new Error("Coordinator locked. Unlock to load your saved record.");
    session.vault = candidate;
    session.ciphertext = envelope.ciphertext;
    return structuredClone(candidate);
  });
  queue = operation.catch(() => {});
  return operation;
}
export async function changePin(oldPin, newPin) {
  if (!session) throw new Error("Unlock before changing your PIN.");
  await queue;
  const started = epoch;
  const current = await loadEnvelope();
  const { vault } = await decryptEnvelope(current, oldPin);
  const salt = encode(crypto.getRandomValues(new Uint8Array(16)));
  const key = await aesKey(newPin, salt, ITERATIONS);
  const envelope = await encryptVault(vault, key, salt);
  if (epoch !== started) throw new Error("Coordinator is locked. Retry the PIN change after unlocking.");
  await saveEnvelope(envelope, current.ciphertext);
  if (epoch !== started) throw new Error("Coordinator locked. Unlock using your new PIN.");
  session = { key, salt, vault, epoch: started, ciphertext: envelope.ciphertext };
  return structuredClone(vault);
}
