const DB_NAME = "lush-inventory-counter";
const STORE_NAME = "counts";
const ACTIVE_KEY = "active";
let dbPromise;

function database() {
  if (!globalThis.indexedDB) return Promise.reject(new Error("Local storage is unavailable in this browser."));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open local storage."));
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
  await transact("readwrite", (store) => store.put(copy, ACTIVE_KEY));
  return copy;
}

export async function clearActiveCount() {
  await transact("readwrite", (store) => store.delete(ACTIVE_KEY));
}

export function validateCountBackup(value) {
  if (!value || value.schemaVersion !== 1 || typeof value.fileName !== "string" || !Array.isArray(value.products) || !value.products.length) {
    throw new Error("This backup is not a valid Lush Inventory Counter backup.");
  }
  for (const product of value.products) {
    if (!product || typeof product.id !== "string" || typeof product.category !== "string" || typeof product.plu !== "string" || typeof product.description !== "string" || !Number.isFinite(Number(product.onHand))) {
      throw new Error("This backup contains an invalid product record.");
    }
    for (const field of ["display", "cupboard", "storeRoom"]) {
      if (typeof product[field] !== "string") throw new Error(`This backup has an invalid ${field} value.`);
    }
  }
  return value;
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
