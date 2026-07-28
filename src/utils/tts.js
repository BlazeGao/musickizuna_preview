const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

const DB_NAME = 'musickizuna_tts'
const DB_VERSION = 2
const STORE_NAME = 'audio'
const CACHE_VERSION = 'v2-qwen3-tts-flash'
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const CACHE_MAX_BYTES = 100 * 1024 * 1024
const CACHE_MAX_ENTRIES = 500

let currentPlayback = null

function normalizeText(text) {
  return text.replace(/\r\n?/g, '\n').trim()
}

async function makeClientCacheKey(text, lang) {
  const material = `${CACHE_VERSION}\n${lang}\n${normalizeText(text)}`
  if (!globalThis.crypto?.subtle) return material
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(material))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function deleteCacheKeys(keys) {
  if (keys.length === 0) return
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    keys.forEach(key => store.delete(key))
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

async function getCachedBlob(key) {
  const db = await openDB()
  const record = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  }).finally(() => db.close())

  const now = Date.now()
  if (
    !record ||
    record.cacheVersion !== CACHE_VERSION ||
    !(record.blob instanceof Blob) ||
    !Number.isFinite(record.lastAccessAt) ||
    now - record.lastAccessAt > CACHE_TTL_MS
  ) {
    if (record) deleteCacheKeys([key]).catch(() => {})
    return null
  }

  setCachedBlob(key, record.blob, record.cosKey).catch(() => {})
  return record.blob
}

async function setCachedBlob(key, blob, cosKey = null) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put({
      blob,
      cosKey,
      cacheVersion: CACHE_VERSION,
      createdAt: Date.now(),
      lastAccessAt: Date.now(),
      size: blob.size,
    }, key)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

export async function cleanupTTSCache() {
  const db = await openDB()
  const entries = await new Promise((resolve, reject) => {
    const result = []
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(result)
        return
      }
      result.push({ key: cursor.key, record: cursor.value })
      cursor.continue()
    }
    request.onerror = () => reject(request.error)
  }).finally(() => db.close())

  const now = Date.now()
  const toDelete = []
  const valid = []

  for (const entry of entries) {
    const { record } = entry
    if (
      !record ||
      record.cacheVersion !== CACHE_VERSION ||
      !(record.blob instanceof Blob) ||
      !Number.isFinite(record.lastAccessAt) ||
      now - record.lastAccessAt > CACHE_TTL_MS
    ) {
      toDelete.push(entry.key)
    } else {
      valid.push({
        ...entry,
        size: Number(record.size) || record.blob.size,
        lastAccessAt: Number(record.lastAccessAt) || 0,
      })
    }
  }

  valid.sort((a, b) => b.lastAccessAt - a.lastAccessAt)
  let retainedBytes = 0
  let retainedEntries = 0
  for (const entry of valid) {
    if (
      retainedEntries >= CACHE_MAX_ENTRIES ||
      retainedBytes + entry.size > CACHE_MAX_BYTES
    ) {
      toDelete.push(entry.key)
    } else {
      retainedEntries += 1
      retainedBytes += entry.size
    }
  }

  await deleteCacheKeys(toDelete)
}

async function requestTTSDescriptor(text, lang) {
  const response = await fetch(`${API_BASE}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, lang }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || `TTS request failed: ${response.status}`)
  }

  const descriptor = await response.json()
  if (!descriptor.audioUrl || !descriptor.cacheKey) {
    throw new Error('TTS server returned an invalid response')
  }
  return descriptor
}

async function fetchTTSFromServer(text, lang) {
  let lastError
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = await requestTTSDescriptor(text, lang)
      const response = await fetch(descriptor.audioUrl)
      if (!response.ok) throw new Error(`COS audio download failed: ${response.status}`)
      return { blob: await response.blob(), cosKey: descriptor.cacheKey }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

export async function readLyric(text, playbackRate = 1, lang = 'zh') {
  stopCurrentAudio()

  const normalizedText = normalizeText(text)
  const cacheKey = await makeClientCacheKey(normalizedText, lang)
  let blob = await getCachedBlob(cacheKey).catch(() => null)

  if (!blob) {
    const result = await fetchTTSFromServer(normalizedText, lang)
    blob = result.blob
    try {
      await setCachedBlob(cacheKey, blob, result.cosKey)
      cleanupTTSCache().catch(() => {})
    } catch (error) {
      if (error?.name === 'QuotaExceededError') {
        await cleanupTTSCache().catch(() => {})
        await setCachedBlob(cacheKey, blob, result.cosKey).catch(() => {})
      }
    }
  }

  const objectUrl = URL.createObjectURL(blob)
  const audio = new Audio(objectUrl)
  audio.playbackRate = playbackRate

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error = null) => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(objectUrl)
      if (currentPlayback?.audio === audio) currentPlayback = null
      if (error) reject(error)
      else resolve()
    }

    currentPlayback = { audio, finish }
    audio.onended = () => finish()
    audio.onerror = () => finish(new Error('Audio playback failed'))
    audio.play().catch(error => finish(error))
  })
}

export function stopCurrentAudio() {
  if (!currentPlayback) return
  const { audio, finish } = currentPlayback
  audio.pause()
  audio.currentTime = 0
  finish()
}

export function isPlaying() {
  return currentPlayback !== null && !currentPlayback.audio.paused
}

cleanupTTSCache().catch(() => {})
