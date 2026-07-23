import ToJyutping from 'to-jyutping'
import { pinyin } from 'pinyin-pro'

const API_BASE = 'http://127.0.0.1:5001'

const CACHE_KEY = 'phonetic_cache'
const FURIGANA_CACHE_KEY = 'furigana_cache'

let cache = {}
let furiganaCache = {}
try {
  const raw = localStorage.getItem(CACHE_KEY)
  if (raw) cache = JSON.parse(raw)
  const rawF = localStorage.getItem(FURIGANA_CACHE_KEY)
  if (rawF) furiganaCache = JSON.parse(rawF)
} catch {}

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {}
}

function saveFuriganaCache() {
  try {
    localStorage.setItem(FURIGANA_CACHE_KEY, JSON.stringify(furiganaCache))
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

export function generateJyutpingLyrics(zhLyrics) {
  return zhLyrics.map(line => ({
    time: line.time,
    text: ToJyutping.getJyutpingText(line.text),
  }))
}

export function generatePinyinLyrics(zhLyrics) {
  return zhLyrics.map(line => ({
    time: line.time,
    text: pinyin(line.text, { toneType: 'symbol' }),
  }))
}

export function getCachedFurigana(text) {
  if (text in furiganaCache) return furiganaCache[text]
  return null
}

export async function fetchFuriganaBatch(texts) {
  const results = new Array(texts.length).fill(null)
  const pending = []
  const pendingIdx = []

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i]
    if (text in furiganaCache) {
      results[i] = furiganaCache[text]
    } else {
      pending.push(text)
      pendingIdx.push(i)
    }
  }

  if (pending.length === 0) return results

  try {
    const res = await fetch(`${API_BASE}/api/furigana/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: pending }),
    })
    if (!res.ok) return results
    const data = await res.json()
    const fetched = data.results || []
    for (let j = 0; j < pending.length; j++) {
      const tokens = fetched[j] || []
      const text = pending[j]
      furiganaCache[text] = tokens
      results[pendingIdx[j]] = tokens
    }
    saveFuriganaCache()
  } catch {
    for (const idx of pendingIdx) results[idx] = []
  }
  return results
}

const KANJI_RE = /[㐀-鿿豈-﫿぀-ヿ㇀-ㇿ]/

export function buildRubySegments(text, tokens) {
  if (!tokens || tokens.length === 0) {
    return [{ type: 'text', value: text }]
  }

  const segments = []
  let cursor = 0

  for (const token of tokens) {
    const surface = token.surface || ''
    const reading = token.reading || ''
    if (!surface) continue

    const idx = text.indexOf(surface, cursor)
    if (idx < 0) continue

    if (idx > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, idx) })
    }

    const needsRuby = reading && (surface !== reading || KANJI_RE.test(surface))
    if (needsRuby) {
      segments.push({ type: 'ruby', value: surface, reading })
    } else {
      segments.push({ type: 'text', value: surface })
    }

    cursor = idx + surface.length
  }

  if (cursor < text.length) {
    segments.push({ type: 'text', value: text.slice(cursor) })
  }

  return segments
}
