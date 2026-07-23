const API_BASE = 'http://127.0.0.1:5001'

const DB_NAME = 'musickizuna_tts'
const DB_VERSION = 1
const STORE_NAME = 'audio'

let currentAudio = null

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function getCachedBlob(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

async function setCachedBlob(key, blob) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(blob, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function fetchTTSFromServer(text) {
  const resp = await fetch(`${API_BASE}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error || `TTS request failed: ${resp.status}`)
  }

  return await resp.blob()
}

export async function readLyric(text, playbackRate = 1) {
  stopCurrentAudio()

  const cacheKey = text
  let blob = await getCachedBlob(cacheKey)

  if (!blob) {
    blob = await fetchTTSFromServer(text)
    setCachedBlob(cacheKey, blob).catch(() => {})
  }

  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  audio.playbackRate = playbackRate
  currentAudio = audio

  return new Promise((resolve, reject) => {
    audio.onended = () => {
      URL.revokeObjectURL(url)
      if (currentAudio === audio) currentAudio = null
      resolve()
    }
    audio.onerror = (e) => {
      URL.revokeObjectURL(url)
      if (currentAudio === audio) currentAudio = null
      reject(e)
    }
    audio.play().catch(reject)
  })
}

export function stopCurrentAudio() {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    currentAudio = null
  }
}

export function isPlaying() {
  return currentAudio !== null && !currentAudio.paused
}
