import ToJyutping from 'to-jyutping'
import { pinyin } from 'pinyin-pro'

const API_BASE = 'http://127.0.0.1:5001'

const CACHE_KEY = 'phonetic_cache'
const FURIGANA_CACHE_KEY = 'furigana_cache'
const FURIGANA_OVERRIDES_KEY = 'furigana_overrides'

let cache = {}
let furiganaCache = {}
let furiganaOverridesStore = {}
try {
  const raw = localStorage.getItem(CACHE_KEY)
  if (raw) cache = JSON.parse(raw)
  const rawF = localStorage.getItem(FURIGANA_CACHE_KEY)
  if (rawF) furiganaCache = JSON.parse(rawF)
  const rawO = localStorage.getItem(FURIGANA_OVERRIDES_KEY)
  if (rawO) furiganaOverridesStore = JSON.parse(rawO)
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

function saveFuriganaOverrides() {
  try {
    localStorage.setItem(FURIGANA_OVERRIDES_KEY, JSON.stringify(furiganaOverridesStore))
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

export function getFuriganaOverrides(songName) {
  if (!songName) return {}
  return furiganaOverridesStore[songName] || {}
}

export function setFuriganaOverride(songName, key, reading) {
  if (!songName || !key) return
  if (!furiganaOverridesStore[songName]) furiganaOverridesStore[songName] = {}
  if (reading == null || reading === '') {
    delete furiganaOverridesStore[songName][key]
  } else {
    furiganaOverridesStore[songName][key] = reading
  }
  if (Object.keys(furiganaOverridesStore[songName]).length === 0) {
    delete furiganaOverridesStore[songName]
  }
  saveFuriganaOverrides()
}

export function removeFuriganaOverride(songName, key) {
  if (!songName || !key) return
  if (furiganaOverridesStore[songName]) {
    delete furiganaOverridesStore[songName][key]
    if (Object.keys(furiganaOverridesStore[songName]).length === 0) {
      delete furiganaOverridesStore[songName]
    }
    saveFuriganaOverrides()
  }
}

export function makeOverrideKey(lineIndex, charIndex, scope = 'local') {
  const linePart = scope === 'all' ? '*' : lineIndex
  return `${linePart}-${charIndex}`
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

function isKanjiChar(c) {
  const code = c.charCodeAt(0)
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x20000 && code <= 0x2a6df) ||
    code === 0x3005 ||
    code === 0x3007
  )
}

function isKanaChar(c) {
  const code = c.charCodeAt(0)
  return (
    (code >= 0x3040 && code <= 0x309f) ||
    (code >= 0x30a0 && code <= 0x30ff) ||
    (code >= 0xff66 && code <= 0xff9f)
  )
}

function tokenizeKanjiKana(surface, reading) {
  if (!surface) return []
  if (!reading || surface === reading) {
    return [{ type: 'text', value: surface }]
  }

  const runs = []
  let i = 0
  while (i < surface.length) {
    const c = surface[i]
    let j = i + 1
    if (isKanjiChar(c)) {
      while (j < surface.length && isKanjiChar(surface[j])) j++
      runs.push({ kind: 'kanji', value: surface.slice(i, j) })
    } else if (isKanaChar(c)) {
      while (j < surface.length && isKanaChar(surface[j])) j++
      runs.push({ kind: 'kana', value: surface.slice(i, j) })
    } else {
      while (j < surface.length && !isKanjiChar(surface[j]) && !isKanaChar(surface[j])) j++
      runs.push({ kind: 'other', value: surface.slice(i, j) })
    }
    i = j
  }

  const kanaSpans = []
  let r = 0
  for (const run of runs) {
    if (run.kind !== 'kana') continue
    const idx = reading.indexOf(run.value, r)
    if (idx >= 0) {
      kanaSpans.push({ start: idx, end: idx + run.value.length })
      r = idx + run.value.length
    }
  }

  const segments = []
  let prevEnd = 0
  let spanIdx = 0
  for (const run of runs) {
    if (run.kind === 'kanji') {
      const nextSpan = kanaSpans[spanIdx] || null
      const kanjiReadingEnd = nextSpan ? nextSpan.start : reading.length
      const kanjiReading = reading.slice(prevEnd, kanjiReadingEnd)
      if (nextSpan) {
        prevEnd = nextSpan.end
        spanIdx++
      } else {
        prevEnd = kanjiReadingEnd
      }
      if (kanjiReading) {
        segments.push({ type: 'ruby', value: run.value, reading: kanjiReading })
      } else {
        segments.push({ type: 'text', value: run.value })
      }
    } else {
      segments.push({ type: 'text', value: run.value })
    }
  }

  return segments
}

export function buildRubySegments(text, tokens, lineIndex, overrides) {
  if (!tokens || tokens.length === 0) {
    return [{ type: 'text', value: text, charIndex: 0 }]
  }

  const ov = overrides || {}
  const segments = []
  let cursor = 0

  for (const token of tokens) {
    const surface = token.surface || ''
    const reading = token.reading || ''
    if (!surface) continue

    const idx = text.indexOf(surface, cursor)
    if (idx < 0) continue

    if (idx > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, idx), charIndex: cursor })
    }

    if (reading && KANJI_RE.test(surface)) {
      const sub = tokenizeKanjiKana(surface, reading)
      if (sub.length > 0) {
        let segChar = idx
        for (const s of sub) {
          if (s.type === 'ruby') {
            const localKey = `${lineIndex}-${segChar}`
            const wildKey = `*-${segChar}`
            const overrideReading = ov[localKey] || ov[wildKey]
            segments.push({
              type: 'ruby',
              value: s.value,
              reading: overrideReading || s.reading,
              charIndex: segChar,
              isOverridden: !!overrideReading,
            })
          } else {
            segments.push({ type: 'text', value: s.value, charIndex: segChar })
          }
          segChar += s.value.length
        }
      } else {
        segments.push({ type: 'text', value: surface, charIndex: idx })
      }
    } else {
      segments.push({ type: 'text', value: surface, charIndex: idx })
    }

    cursor = idx + surface.length
  }

  if (cursor < text.length) {
    segments.push({ type: 'text', value: text.slice(cursor), charIndex: cursor })
  }

  return segments
}
