const DB_NAME = "lush-inventory-counter";
const STORE_NAME = "counts";
const ACTIVE_KEY = "active";
let dbPromise;

function database() {
  if (!globalThis.indexedDB) return Promise.reject(new Error("Local storage is unavailable in this browser."));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 2);
      let abandoned = false;
      request.onblocked = () => { abandoned = true; dbPromise = null; reject(new Error("Close other inventory tabs, then reload to finish the update. Your saved data is preserved.")); };
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
        if (!request.result.objectStoreNames.contains("coordinator")) request.result.createObjectStore("coordinator");
      };
      request.onsuccess = () => {
        if (abandoned) { request.result.close(); return; }
        request.result.onversionchange = () => { request.result.close(); dbPromise = null; };
        resolve(request.result);
      };
      request.onerror = () => { dbPromise = null; reject(request.error || new Error("Could not open local storage.")); };
    });
  }
  return dbPromise;
}

async function transact(mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let result;
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error("Local storage operation failed."));
    transaction.onabort = () => reject(transaction.error || new Error("Local storage operation was cancelled."));
    result = action(store);
    if (result && typeof result === "object" && "onsuccess" in result) {
      result.onsuccess = () => { result = result.result ?? null; };
      result.onerror = () => transaction.abort();
    }
  });
}

export async function loadActiveCount() {
  return transact("readonly", (store) => store.get(ACTIVE_KEY));
}

export async function saveActiveCount(count) {
  const copy = structuredClone(count);
  await writeRecords([{ store: STORE_NAME, key: ACTIVE_KEY, value: copy }]);
  return copy;
}

export async function clearActiveCount() {
  await writeRecords([{ store: STORE_NAME, key: ACTIVE_KEY, value: null }]);
}

export function validateCountBackup(value) {
  if (!value || ![1, 2].includes(value.schemaVersion) || typeof value.fileName !== "string" || !Array.isArray(value.products) || !value.products.length) {
    throw new Error("This backup is not a valid Lush Inventory Counter backup.");
  }
  if (value.schemaVersion === 2 && (typeof value.id !== "string" || !value.id.trim())) throw new Error("Invalid count identifier in backup.");
  if (new Set(value.products.map((p) => p?.id)).size !== value.products.length) throw new Error("Duplicate product identifier in backup.");
  for (const field of ["importedAt", "updatedAt", "archivedAt"]) if (value[field] != null) validateTimestamp(value[field]);
  if (value.postingDate != null) parseDate(value.postingDate);
  if (value.events != null) validateEvents(value.events);
  for (const product of value.products) {
    if (!product || typeof product.id !== "string" || typeof product.category !== "string" || typeof product.plu !== "string" || typeof product.description !== "string" || typeof product.onHand !== "number" || !Number.isFinite(product.onHand)) {
      throw new Error("This backup contains an invalid product record.");
    }
    for (const field of ["display", "cupboard", "storeRoom"]) {
      if (typeof product[field] !== "string") throw new Error(`This backup has an invalid ${field} value.`);
    }
    if (value.schemaVersion === 2 && (typeof product.confirmed !== "boolean" || !["untouched", "physical-recount", "carried-forward", "legacy-count"].includes(product.provenance))) throw new Error("Invalid completion or provenance in backup.");
    for (const field of ["department", "unit", "season"]) if (product[field] != null && typeof product[field] !== "string") throw new Error("Invalid product metadata in backup.");
    if (product.cost != null && (typeof product.cost !== "number" || !Number.isFinite(product.cost) || product.cost < 0)) throw new Error("Invalid product cost in backup.");
    if (product.provenance != null && !["untouched", "physical-recount", "carried-forward", "legacy-count"].includes(product.provenance)) throw new Error("Invalid provenance in backup.");
    if (product.countedAt != null) validateTimestamp(product.countedAt);
    if (product.events != null) validateEvents(product.events);
  }
  return value;
}

export function validateTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("Invalid record date in backup.");
  parseDate(value.slice(0, 10));
}
export function validateEvents(events) {
  if (!Array.isArray(events)) throw new Error("Invalid event records in backup.");
  for (const event of events) {
    if (!event || typeof event.action !== "string" || !event.action.trim()) throw new Error("Invalid event record in backup.");
    validateTimestamp(event.at);
    for (const field of ["previous", "values"]) if (event[field] != null && (typeof event[field] !== "object" || Array.isArray(event[field]))) throw new Error("Invalid event values in backup.");
  }
}

let writeQueue = Promise.resolve();
export function readRecord(storeName, key) {
  return database().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(key);
    transaction.oncomplete = () => resolve(request.result ?? null);
    transaction.onerror = () => reject(transaction.error || new Error("Could not read saved data."));
  }));
}

export function writeRecords(records) {
  const copies = structuredClone(records);
  const operation = writeQueue.then(async () => {
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([...new Set(copies.map((entry) => entry.store))], "readwrite");
      let conflict = null;
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(conflict || transaction.error || new Error("Save failed. Existing data was preserved."));
      transaction.onabort = () => reject(conflict || transaction.error || new Error("Save cancelled. Existing data was preserved."));
      try { for (const entry of copies) {
        const store = transaction.objectStore(entry.store);
        if (Object.hasOwn(entry, "expectedCiphertext")) {
          const request = store.get(entry.key);
          request.onsuccess = () => {
            if ((request.result?.ciphertext ?? null) !== entry.expectedCiphertext) { conflict = new Error("Records changed in another tab. Lock and unlock to load the latest records before saving."); transaction.abort(); }
            else { try { store.put(entry.value, entry.key); } catch (error) { conflict = error; transaction.abort(); } }
          };
        } else if (entry.value === null) store.delete(entry.key);
        else store.put(entry.value, entry.key);
      } } catch (error) { conflict = error; transaction.abort(); }
    });
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

export function createBackup(count) {
  validateCountBackup(count);
  return JSON.stringify({ ...count, updatedAt: count.updatedAt || new Date().toISOString() }, null, 2);
}

export async function restoreBackup(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("This backup is not valid JSON.");
  }
  validateCountBackup(parsed);
  await saveActiveCount(parsed);
  return parsed;
}
import { parseDate } from "./expiry-model.js";
