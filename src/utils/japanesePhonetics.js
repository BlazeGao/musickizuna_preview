const API_BASE = 'http://127.0.0.1:5001'

const FURIGANA_CACHE_KEY = 'furigana_cache_v2'
const FURIGANA_OVERRIDES_KEY = 'furigana_overrides'

let furiganaCache = {}
let furiganaOverridesStore = {}
try {
  const rawF = localStorage.getItem(FURIGANA_CACHE_KEY)
  if (rawF) furiganaCache = JSON.parse(rawF)
  const rawO = localStorage.getItem(FURIGANA_OVERRIDES_KEY)
  if (rawO) furiganaOverridesStore = JSON.parse(rawO)
} catch {}

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

export function getCachedFurigana(text) {
  if (text in furiganaCache) return furiganaCache[text]
  return null
}

export function getFuriganaOverrides(songName) {
  if (!songName) return {}
  return furiganaOverridesStore[songName] || {}
}

export function setFuriganaOverride(songName, key, override) {
  if (!songName || !key) return
  if (!furiganaOverridesStore[songName]) furiganaOverridesStore[songName] = {}
  if (override == null) {
    delete furiganaOverridesStore[songName][key]
  } else {
    const source = override.source || 'user'
    furiganaOverridesStore[songName][key] = {
      reading: override.reading,
      romaji: override.romaji || '',
      source,
    }
  }
  if (Object.keys(furiganaOverridesStore[songName]).length === 0) {
    delete furiganaOverridesStore[songName]
  }
  saveFuriganaOverrides()
}

export function mergeFuriganaOverrides(songName, overridesMap) {
  if (!songName || !overridesMap) return
  if (!furiganaOverridesStore[songName]) furiganaOverridesStore[songName] = {}
  for (const [key, override] of Object.entries(overridesMap)) {
    if (override == null) {
      delete furiganaOverridesStore[songName][key]
    } else {
      const source = override.source || 'user'
      furiganaOverridesStore[songName][key] = {
        reading: override.reading,
        romaji: override.romaji || '',
        source,
      }
    }
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

export function makeOverrideKey(lineIndex, charIndex, surface, scope = 'local') {
  if (scope === 'all' && surface) return `c-${surface}`
  return `${lineIndex}-${charIndex}`
}

function formatLRCTime(time) {
  const mins = Math.floor(time / 60)
  const secs = time % 60
  return `${String(mins).padStart(2, '0')}:${secs.toFixed(2).padStart(5, '0')}`
}

export function exportFuriganaLRC(jaLyrics, furiganaTokens, overrides, cleanedTexts) {
  if (!jaLyrics || jaLyrics.length === 0) return ''
  const out = []
  for (let i = 0; i < jaLyrics.length; i++) {
    const line = jaLyrics[i]
    const tokens = (furiganaTokens && furiganaTokens[i]) || []
    const text = (cleanedTexts && cleanedTexts[i]) || line.text
    const segments = buildRubySegments(text, tokens, i, overrides || {})
    const lineText = segments.map((seg) => {
      if (seg.type === 'ruby') return `${seg.value}(${seg.reading})`
      return seg.value
    }).join('')
    out.push(`[${formatLRCTime(line.time)}]${lineText}`)
  }
  return out.join('\n') + '\n'
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

export async function fetchRomajiFromReading(reading) {
  const text = (reading || '').trim()
  if (!text) return ''
  try {
    const res = await fetch(`${API_BASE}/api/romaji/from-reading`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reading: text }),
    })
    if (!res.ok) return ''
    const data = await res.json()
    return data.romaji || ''
  } catch {
    return ''
  }
}

export async function fetchRomajiBatch(readings) {
  const list = (readings || []).map((r) => (r || '').trim())
  if (list.length === 0) return []
  try {
    const res = await fetch(`${API_BASE}/api/romaji/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ readings: list }),
    })
    if (!res.ok) return new Array(list.length).fill('')
    const data = await res.json()
    return data.romaji || new Array(list.length).fill('')
  } catch {
    return new Array(list.length).fill('')
  }
}

const INLINE_ANNOTATION_RE = /([\u4e00-\u9fff\u3400-\u4dbf\u3005\u3007㐀-鿿豈-﫿]+)([（(])([ぁ-ゟゖ-ヿ]+)([）)])/g

export function parseInlineAnnotations(text) {
  if (!text) return { cleanText: '', annotations: [] }

  const annotations = []
  let cleanText = ''
  let originalIdx = 0
  let match

  INLINE_ANNOTATION_RE.lastIndex = 0
  while ((match = INLINE_ANNOTATION_RE.exec(text)) !== null) {
    const matchStart = match.index
    const matchEnd = matchStart + match[0].length

    if (matchStart > originalIdx) {
      cleanText += text.slice(originalIdx, matchStart)
    }

    const surface = match[1]
    const reading = match[3]
    const charIndex = cleanText.length
    cleanText += surface
    annotations.push({ surface, reading, charIndex })

    originalIdx = matchEnd
  }

  if (originalIdx < text.length) {
    cleanText += text.slice(originalIdx)
  }

  return { cleanText, annotations }
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
      runs.push({ kind: 'kanji', value: surface.slice(i, j), surfaceStart: i })
    } else if (isKanaChar(c)) {
      while (j < surface.length && isKanaChar(surface[j])) j++
      runs.push({ kind: 'kana', value: surface.slice(i, j), surfaceStart: i })
    } else {
      while (j < surface.length && !isKanjiChar(surface[j]) && !isKanaChar(surface[j])) j++
      runs.push({ kind: 'other', value: surface.slice(i, j), surfaceStart: i })
    }
    i = j
  }

  const kanaRunInfo = []
  let r = 0
  for (let k = 0; k < runs.length; k++) {
    if (runs[k].kind !== 'kana') continue
    const idx = reading.indexOf(runs[k].value, r)
    if (idx >= 0) {
      kanaRunInfo.push({ runIdx: k, start: idx, end: idx + runs[k].value.length })
      r = idx + runs[k].value.length
    }
  }

  const segments = []
  for (let k = 0; k < runs.length; k++) {
    const run = runs[k]
    if (run.kind === 'kanji') {
      let beforeSpan = null
      let afterSpan = null
      for (const info of kanaRunInfo) {
        if (info.runIdx < k) beforeSpan = info
        else if (info.runIdx > k) { afterSpan = info; break }
      }
      let readingStart = beforeSpan ? beforeSpan.end : 0
      while (readingStart < reading.length) {
        const c = reading[readingStart]
        if (isKanaChar(c) || isKanjiChar(c)) break
        readingStart++
      }
      let readingEnd = afterSpan ? afterSpan.start : reading.length
      while (readingEnd > readingStart) {
        const c = reading[readingEnd - 1]
        if (isKanaChar(c) || isKanjiChar(c)) break
        readingEnd--
      }
      const kanjiReading = reading.slice(readingStart, readingEnd)
      if (kanjiReading) {
        segments.push({ type: 'ruby', value: run.value, reading: kanjiReading, charIndex: run.surfaceStart })
      } else {
        segments.push({ type: 'text', value: run.value, charIndex: run.surfaceStart })
      }
    } else {
      segments.push({ type: 'text', value: run.value, charIndex: run.surfaceStart })
    }
  }

  return segments
}

export function getLineWords(text, tokens, lineIndex, overrides) {
  if (!text || !tokens || tokens.length === 0) return []
  const ov = overrides || {}
  const words = []
  let nextWordId = 0
  let currentWordId = -1
  let lastSegmentKind = null
  let cursor = 0

  for (const token of tokens) {
    const surface = token.surface || ''
    if (!surface) continue
    const idx = text.indexOf(surface, cursor)
    if (idx < 0) continue
    const reading = token.reading || ''

    if (reading && KANJI_RE.test(surface)) {
      const sub = tokenizeKanjiKana(surface, reading)
      let subChar = idx
      for (const s of sub) {
        if (s.type === 'ruby') {
          currentWordId = nextWordId++
          lastSegmentKind = 'kanji'
          const localKey = `${lineIndex}-${subChar}`
          const charKey = `c-${s.value}`
          const ovr = ov[localKey] || ov[charKey]
          const isUserOverride = !!(ovr && ovr.source === 'user')
          words.push({
            wordId: currentWordId,
            isKanji: true,
            surface: s.value,
            reading: ovr ? ovr.reading : s.reading,
            romaji: ovr ? (ovr.romaji || '') : '',
            isOverridden: isUserOverride,
            needsApi: !ovr || !ovr.romaji,
          })
        } else if (s.value && s.value.length > 0 && isKanaChar(s.value[0])) {
          if (lastSegmentKind !== 'kanji') {
            currentWordId = nextWordId++
          }
          lastSegmentKind = 'kana'
          words.push({
            wordId: currentWordId,
            isKanji: false,
            surface: s.value,
            reading: s.value,
            romaji: '',
            isOverridden: false,
            needsApi: true,
          })
        } else {
          lastSegmentKind = null
        }
        subChar += s.value.length
      }
    } else if (surface.length > 0 && isKanaChar(surface[0])) {
      currentWordId = nextWordId++
      lastSegmentKind = 'kana'
      words.push({
        wordId: currentWordId,
        isKanji: false,
        surface,
        reading: surface,
        romaji: '',
        isOverridden: false,
        needsApi: true,
      })
    } else {
      lastSegmentKind = null
    }
    cursor = idx + surface.length
  }
  return words
}

export function joinWordsToRomaji(words) {
  if (!words || words.length === 0) return ''
  const wordMap = new Map()
  for (const w of words) {
    const wid = w.wordId ?? 0
    if (!wordMap.has(wid)) wordMap.set(wid, [])
    wordMap.get(wid).push(w.romaji || '')
  }
  const sortedWords = [...wordMap.entries()].sort((a, b) => a[0] - b[0])
  return sortedWords
    .map(([, parts]) => parts.join(''))
    .filter(Boolean)
    .join(' ')
}

export function hasAnyLineOverride(tokens, lineIndex, text, overrides) {
  if (!tokens || !overrides || !text) return false
  const ov = overrides
  const localPrefix = `${lineIndex}-`
  for (const key of Object.keys(ov)) {
    if (key.startsWith(localPrefix)) return true
    if (key.startsWith('c-')) {
      const surface = key.slice(2)
      if (text.includes(surface)) return true
    }
  }
  return false
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
            const charKey = `c-${s.value}`
            const override = ov[localKey] || ov[charKey]
            const isUserOverride = !!(override && override.source === 'user')
            const effectiveReading = override ? override.reading : s.reading
            const effectiveRomaji = override ? override.romaji : ''
            segments.push({
              type: 'ruby',
              value: s.value,
              reading: effectiveReading,
              romaji: effectiveRomaji,
              charIndex: segChar,
              isOverridden: isUserOverride,
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
