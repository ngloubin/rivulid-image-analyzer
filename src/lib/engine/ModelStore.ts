import type { CachedModel } from "./types";

export interface ModelRepository {
  get(): Promise<CachedModel | null>;
  put(model: CachedModel): Promise<void>;
  clear(): Promise<void>;
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB não está disponível."));
      return;
    }
    const request = indexedDB.open("rivu-models", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("models");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Falha ao abrir o armazenamento local."));
    request.onblocked = () =>
      reject(new Error("Feche outra aba antiga do aplicativo para atualizar o armazenamento."));
  });
}
async function transact<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("models", mode),
      request = operation(transaction.objectStore("models"));
    transaction.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    transaction.onerror = transaction.onabort = () => {
      db.close();
      reject(transaction.error ?? request.error ?? new Error("Falha no armazenamento local."));
    };
  });
}
export const modelStore: ModelRepository = {
  async get() {
    return (
      ((await transact("readonly", (store) => store.get("active"))) as CachedModel | undefined) ??
      null
    );
  },
  async put(model) {
    await transact("readwrite", (store) => store.put(model, "active"));
  },
  async clear() {
    await transact("readwrite", (store) => store.delete("active"));
  },
};
