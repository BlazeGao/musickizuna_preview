const DB_NAME = 'musickizuna_audio'
const DB_VERSION = 2
const BLOBS_STORE = 'blobs'
const META_STORE = 'meta'

const MAX_TOTAL_BYTES = 200 * 1024 * 1024

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (event) => {
      const db = request.result
      if (event.oldVersion < 1) {
        db.createObjectStore(BLOBS_STORE)
      }
      if (event.oldVersion < 2) {
        db.createObjectStore(META_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function getAllMeta(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly')
    const store = tx.objectStore(META_STORE)
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

function putMeta(db, name, meta) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite')
    tx.objectStore(META_STORE).put(meta, name)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function deleteEntry(db, name) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([BLOBS_STORE, META_STORE], 'readwrite')
    tx.objectStore(BLOBS_STORE).delete(name)
    tx.objectStore(META_STORE).delete(name)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function enforceLimit(db) {
  try {
    const meta = await getAllMeta(db)
    const total = meta.reduce((sum, m) => sum + (m?.size || 0), 0)
    if (total <= MAX_TOTAL_BYTES) return
    const sorted = [...meta].sort((a, b) => (a.lastAccess || 0) - (b.lastAccess || 0))
    for (const m of sorted) {
      if (total <= MAX_TOTAL_BYTES) break
      await deleteEntry(db, m.name)
    }
  } catch {}
}

function isCachedBlob(value) {
  return value instanceof Blob
}

function migrateLegacyBlobs(db) {
  return new Promise((resolve) => {
    const tx = db.transaction([BLOBS_STORE, META_STORE], 'readwrite')
    const blobs = tx.objectStore(BLOBS_STORE)
    const metaStore = tx.objectStore(META_STORE)
    const req = blobs.getAllKeys()
    req.onsuccess = async () => {
      const keys = req.result || []
      for (const key of keys) {
        const getReq = blobs.get(key)
        getReq.onsuccess = async () => {
          const value = getReq.result
          if (isCachedBlob(value)) {
            const blobsMeta = {
              name: key,
              size: value.size || 0,
              lastAccess: Date.now(),
            }
            metaStore.put(blobsMeta, key)
          }
        }
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

export async function cacheAudio(name, blob) {
  const db = await openDB()
  await migrateLegacyBlobs(db).catch(() => {})
  return new Promise((resolve, reject) => {
    const tx = db.transaction([BLOBS_STORE, META_STORE], 'readwrite')
    tx.objectStore(BLOBS_STORE).put(blob, name)
    tx.objectStore(META_STORE).put({ name, size: blob.size || 0, lastAccess: Date.now() }, name)
    tx.oncomplete = async () => {
      await enforceLimit(db)
      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })
}

export async function getCachedAudio(name) {
  const db = await openDB()
  await migrateLegacyBlobs(db).catch(() => {})
  return new Promise((resolve, reject) => {
    const tx = db.transaction([BLOBS_STORE, META_STORE], 'readwrite')
    const req = tx.objectStore(BLOBS_STORE).get(name)
    req.onsuccess = () => {
      const blob = req.result || null
      if (blob) {
        tx.objectStore(META_STORE).put(
          { name, size: blob.size || 0, lastAccess: Date.now() },
          name
        )
      }
      resolve(blob)
    }
    req.onerror = () => reject(req.error)
  })
}