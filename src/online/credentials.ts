function accessDatabase<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("manipulation-detector-credentials", 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore("keys");
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const transaction = db.transaction("keys", mode);
      const request = operation(transaction.objectStore("keys"));
      transaction.oncomplete = () => {
        db.close();
        resolve(request.result);
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error);
      };
    };
  });
}

// This database belongs to the extension origin. X content scripts use the X origin.
export async function readGroqKey(): Promise<string | undefined> {
  const value: unknown = await accessDatabase("readonly", (store) =>
    store.get("groq"),
  );
  return typeof value === "string" ? value : undefined;
}

export async function writeGroqKey(value?: string): Promise<void> {
  if (value)
    await accessDatabase("readwrite", (store) => store.put(value, "groq"));
  else await accessDatabase("readwrite", (store) => store.delete("groq"));
}
