// Minimal IndexedDB key-value helper. Shared by popup and options pages.
// Used to persist the FileSystemDirectoryHandle chosen as the root folder
// (chrome.storage cannot hold a FileSystemDirectoryHandle; IndexedDB can).

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('pr-comment-extractor', 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('kv')) {
        req.result.createObjectStore('kv');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly');
    const req = tx.objectStore('kv').get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
