const API_BASE = 'http://127.0.0.1:5001'

const CACHE_KEY = 'phonetic_cache'

let cache = {}
try {
  const raw = localStorage.getItem(CACHE_KEY)
  if (raw) cache = JSON.parse(raw)
} catch {}

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {}
}

export async function fetchPhonetic(word) {
  const key = word.toLowerCase()
  if (key in cache) return cache[key]

  try {
    const res = await fetch(`${API_BASE}/api/phonetic?word=${encodeURIComponent(key)}`)
    if (!res.ok) {
      cache[key] = null
      saveCache()
      return null
    }
    const data = await res.json()
    const ipa = data.phonetic || null
    cache[key] = ipa
    saveCache()
    return ipa
  } catch {
    return null
  }
}
