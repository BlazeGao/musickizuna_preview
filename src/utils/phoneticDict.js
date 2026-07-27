import ToJyutping from 'to-jyutping'
import { pinyin } from 'pinyin-pro'

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

export function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
