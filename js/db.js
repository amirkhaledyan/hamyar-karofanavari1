const DB_NAME = 'hamyar-karofanavari-v1';
const DB_VERSION = 1;
export const STORES = ['meta','schools','classes','students','sessions','attendance','assessments','content','media','approvals','audit','favorites'];

let dbPromise;
export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          const opts = name === 'meta' ? { keyPath: 'key' } : { keyPath: 'id' };
          const store = db.createObjectStore(name, opts);
          if (name === 'classes') store.createIndex('schoolId', 'schoolId', { unique: false });
          if (name === 'students') store.createIndex('classId', 'classId', { unique: false });
          if (name === 'assessments') {
            store.createIndex('studentId', 'studentId', { unique: false });
            store.createIndex('classId', 'classId', { unique: false });
            store.createIndex('createdAt', 'createdAt', { unique: false });
          }
          if (name === 'content') {
            store.createIndex('status', 'status', { unique: false });
            store.createIndex('authorId', 'authorId', { unique: false });
            store.createIndex('createdAt', 'createdAt', { unique: false });
          }
          if (name === 'media') store.createIndex('contentId', 'contentId', { unique: false });
          if (name === 'approvals') store.createIndex('contentId', 'contentId', { unique: false });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

export async function put(storeName, value) {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).put(value);
  await txDone(tx);
  return value;
}

export async function bulkPut(storeName, values) {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  for (const value of values) store.put(value);
  await txDone(tx);
  return values;
}

export async function get(storeName, key) {
  const db = await openDb();
  return await new Promise((resolve, reject) => {
    const req = db.transaction(storeName).objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(storeName) {
  const db = await openDb();
  return await new Promise((resolve, reject) => {
    const req = db.transaction(storeName).objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllByIndex(storeName, indexName, key) {
  const db = await openDb();
  return await new Promise((resolve, reject) => {
    const index = db.transaction(storeName).objectStore(storeName).index(indexName);
    const req = index.getAll(key);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function remove(storeName, key) {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).delete(key);
  await txDone(tx);
}

export async function clear(storeName) {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).clear();
  await txDone(tx);
}

export async function clearAll() {
  const db = await openDb();
  const tx = db.transaction(STORES, 'readwrite');
  for (const name of STORES) tx.objectStore(name).clear();
  await txDone(tx);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] || 'application/octet-stream';
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function exportDatabase({ includeMedia = false, selectedContentId = null } = {}) {
  const payload = { format: 'hamyar-karofanavari', version: 1, exportedAt: new Date().toISOString(), stores: {} };
  for (const name of STORES) {
    let records = await getAll(name);
    if (selectedContentId) {
      if (name === 'content') records = records.filter(r => r.id === selectedContentId);
      else if (name === 'media' || name === 'approvals') records = records.filter(r => r.contentId === selectedContentId);
      else if (!['meta','audit'].includes(name)) records = [];
    }
    if (name === 'media') {
      if (!includeMedia) records = records.map(({ blob, ...rest }) => ({ ...rest, omitted: true }));
      else {
        const converted = [];
        for (const record of records) converted.push({ ...record, blob: record.blob ? await blobToDataUrl(record.blob) : null });
        records = converted;
      }
    }
    payload.stores[name] = records;
  }
  return payload;
}

export async function importDatabase(payload, { mode = 'merge' } = {}) {
  if (!payload || payload.format !== 'hamyar-karofanavari' || !payload.stores) throw new Error('فایل پشتیبان معتبر نیست.');
  if (mode === 'replace') await clearAll();
  for (const name of STORES) {
    const records = Array.isArray(payload.stores[name]) ? payload.stores[name] : [];
    if (name === 'media') {
      for (const record of records) {
        if (typeof record.blob === 'string' && record.blob.startsWith('data:')) record.blob = dataUrlToBlob(record.blob);
      }
    }
    if (records.length) await bulkPut(name, records);
  }
}

export async function storageInfo() {
  if (!navigator.storage?.estimate) return { usage: 0, quota: 0, persisted: false };
  const estimate = await navigator.storage.estimate();
  const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
  return { usage: estimate.usage || 0, quota: estimate.quota || 0, persisted };
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  return await navigator.storage.persist();
}
