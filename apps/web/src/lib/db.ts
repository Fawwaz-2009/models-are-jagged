import type { AssetRecord, CreationRecord } from "./types.ts";

const DB_NAME = "models-are-jagged";
const DB_VERSION = 1;
const CREATIONS = "creations";
const ASSETS = "assets";

let opening: Promise<IDBDatabase> | null = null;

const open = (): Promise<IDBDatabase> => {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CREATIONS)) {
        db.createObjectStore(CREATIONS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(ASSETS)) {
        const assets = db.createObjectStore(ASSETS, { keyPath: "id" });
        assets.createIndex("creationId", "creationId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local storage."));
  });
  return opening;
};

const transaction = async <T>(store: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => Promise<T> | T): Promise<T> => {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const objectStore = tx.objectStore(store);
    let result: T;
    try {
      result = work(objectStore) as T;
    } catch (error) {
      reject(error);
      return;
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error("Local storage transaction failed."));
    tx.onabort = () => reject(tx.error ?? new Error("Local storage transaction aborted."));
  });
};

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local storage request failed."));
  });

export const loadAll = async (): Promise<{ creations: CreationRecord[]; assets: AssetRecord[] }> => {
  const db = await open();
  const [creations, assets] = await Promise.all([
    requestResult(db.transaction(CREATIONS, "readonly").objectStore(CREATIONS).getAll() as IDBRequest<CreationRecord[]>),
    requestResult(db.transaction(ASSETS, "readonly").objectStore(ASSETS).getAll() as IDBRequest<AssetRecord[]>),
  ]);
  return { creations, assets };
};

export const saveCreation = (creation: CreationRecord): Promise<void> =>
  transaction(CREATIONS, "readwrite", (store) => {
    store.put(creation);
  });

export const saveAsset = (asset: AssetRecord): Promise<void> =>
  transaction(ASSETS, "readwrite", (store) => {
    store.put(asset);
  });

export const deleteCreationRow = (id: string): Promise<void> =>
  transaction(CREATIONS, "readwrite", (store) => {
    store.delete(id);
  });

export const deleteAssetRows = (ids: readonly string[]): Promise<void> =>
  transaction(ASSETS, "readwrite", (store) => {
    for (const id of ids) store.delete(id);
  });

export const clearAllRows = async (): Promise<void> => {
  const db = await open();
  await Promise.all([
    new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CREATIONS, "readwrite");
      tx.objectStore(CREATIONS).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not clear creations."));
    }),
    new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ASSETS, "readwrite");
      tx.objectStore(ASSETS).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not clear assets."));
    }),
  ]);
};
