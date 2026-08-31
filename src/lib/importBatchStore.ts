export interface ImportBatchSnapshot {
  batchId: string;
  parsedWorks: unknown[];
  textPlans: unknown[];
  bulkTags: string[];
  publishMode: "publish" | "draft" | "schedule";
  currentStep: number;
  publishResults: unknown[];
  publishProgress: number;
  publishComplete: boolean;
  savedAt: string;
}

const DATABASE_NAME = "inkland-import-workspace";
const DATABASE_VERSION = 1;
const STORE_NAME = "batches";

function openDatabase() {
  if (typeof window === "undefined" || !window.indexedDB) return Promise.resolve<IDBDatabase | null>(null);
  return new Promise<IDBDatabase | null>((resolve) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function loadImportBatch(userId: string) {
  const database = await openDatabase();
  if (!database) return null;
  return new Promise<ImportBatchSnapshot | null>((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(userId);
    request.onsuccess = () => resolve((request.result as ImportBatchSnapshot | undefined) || null);
    request.onerror = () => resolve(null);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  });
}

export async function saveImportBatch(userId: string, snapshot: ImportBatchSnapshot) {
  const database = await openDatabase();
  if (!database) return false;
  return new Promise<boolean>((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(snapshot, userId);
    transaction.oncomplete = () => { database.close(); resolve(true); };
    transaction.onerror = () => { database.close(); resolve(false); };
    transaction.onabort = () => { database.close(); resolve(false); };
  });
}

export async function clearImportBatch(userId: string) {
  const database = await openDatabase();
  if (!database) return false;
  return new Promise<boolean>((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(userId);
    transaction.oncomplete = () => { database.close(); resolve(true); };
    transaction.onerror = () => { database.close(); resolve(false); };
    transaction.onabort = () => { database.close(); resolve(false); };
  });
}
