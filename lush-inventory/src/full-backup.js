import { validateActiveCount } from "./count-store.js";
import { validateEnvelope, decryptEnvelope, replaceVaultRecords } from "./coordinator-store.js";

const validated = new WeakMap();
export function createFullBackup(activeCount, envelope) {
  if (activeCount) validateActiveCount(activeCount);
  if (envelope) validateEnvelope(envelope);
  return JSON.stringify({ app: "lush-stock-coordinator", backupVersion: 1, createdAt: new Date().toISOString(), activeCount, envelope }, null, 2);
}
export async function validateFullBackup(json, pin) {
  let parsed;
  try { parsed = JSON.parse(json); } catch { throw new Error("This backup is not valid JSON."); }
  if (!parsed || parsed.app !== "lush-stock-coordinator" || parsed.backupVersion !== 1 || !Object.hasOwn(parsed, "activeCount") || !Object.hasOwn(parsed, "envelope")) throw new Error("Unsupported full backup format.");
  if (parsed.activeCount !== null) validateActiveCount(parsed.activeCount);
  const vault = parsed.envelope === null ? null : (await decryptEnvelope(parsed.envelope, pin)).vault;
  const result = { activeCount: parsed.activeCount, envelope: parsed.envelope };
  validated.set(result, structuredClone({ ...result, oodShelfDefault: vault?.settings?.shelfLifeMonths ?? 7 }));
  return result;
}
export async function replaceFullState(state) {
  const safe = validated.get(state);
  if (!safe) throw new Error("Validate the backup before replacing saved data.");
  await replaceVaultRecords([{ store: "counts", key: "active", value: safe.activeCount }, { store: "counts", key: "oodShelfDefault", value: safe.oodShelfDefault }, { store: "coordinator", key: "vault", value: safe.envelope }]);
  validated.delete(state);
}
