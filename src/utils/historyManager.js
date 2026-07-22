export const LANG_LABELS = { zh: '普通话', en: 'English', yue: '粤语', ja: '日本語', ko: '한국어' }

export const SUPPORTED_LANGS = ['zh', 'en', 'yue']

function getStorageKey(lang) {
  return `musickizuna_history_${lang}`
}

const OLD_STORAGE_KEY = 'musickizuna_history'

function migrateOldHistory() {
  const old = localStorage.getItem(OLD_STORAGE_KEY)
  if (!old) return
  try {
    const entries = JSON.parse(old)
    const byLang = { zh: [], en: [], yue: [] }
    for (const raw of entries) {
      const migrated = migrateOldEntry(raw)
      const langs = Object.keys(migrated.lyrics || {})
      if (langs.length > 0) {
        for (const lang of langs) {
          if (byLang[lang]) byLang[lang].push(migrated)
        }
      } else {
        byLang.zh.push(migrated)
      }
    }
    for (const [lang, list] of Object.entries(byLang)) {
      if (list.length > 0) {
        localStorage.setItem(getStorageKey(lang), JSON.stringify(list))
      }
    }
    localStorage.removeItem(OLD_STORAGE_KEY)
  } catch {}
}

function migrateOldEntry(entry) {
  if (entry.lyrics && typeof entry.lyrics === 'object' && Object.keys(entry.lyrics).length > 0) {
    const migrated = {}
    for (const [lang, val] of Object.entries(entry.lyrics)) {
      migrated[lang] = { name: val.name || '', text: val.text || '' }
    }
    return {
      id: entry.id || Date.now(),
      musicName: entry.musicName || '',
      musicPath: entry.musicPath || '',
      lyrics: migrated,
      lastPlayed: entry.lastPlayed || new Date().toISOString(),
    }
  }
  const lyrics = {}
  if (entry.lyricsText || entry.lyricsName) {
    lyrics.zh = { name: entry.lyricsName || '', text: entry.lyricsText || '' }
  }
  return {
    id: entry.id || Date.now(),
    musicName: entry.musicName || '',
    musicPath: entry.musicPath || '',
    lyrics,
    lastPlayed: entry.lastPlayed || new Date().toISOString(),
  }
}

function migrateFlatEntries() {
  for (const lang of SUPPORTED_LANGS) {
    const raw = localStorage.getItem(getStorageKey(lang))
    if (!raw) continue
    try {
      const entries = JSON.parse(raw)
      let changed = false
      for (const entry of entries) {
        if (entry.lyricsName !== undefined && !entry.lyrics) {
          entry.lyrics = { [lang]: { name: entry.lyricsName || '', text: entry.lyricsText || '' } }
          delete entry.lyricsName
          delete entry.lyricsText
          changed = true
        }
      }
      if (changed) {
        localStorage.setItem(getStorageKey(lang), JSON.stringify(entries))
      }
    } catch {}
  }
}

let migrated = false

function ensureMigration() {
  if (!migrated) {
    migrateOldHistory()
    migrateFlatEntries()
    migrated = true
  }
}

export function getHistory(lang) {
  ensureMigration()
  try {
    const raw = localStorage.getItem(getStorageKey(lang))
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function addHistoryEntry(lang, musicName, musicPath, lyricsMap) {
  const history = getHistory(lang)
  const existing = history.find((e) => e.musicName === musicName)
  if (existing) {
    history.splice(history.indexOf(existing), 1)
  }
  history.unshift({
    id: Date.now(),
    musicName,
    musicPath,
    lyrics: lyricsMap || {},
    lastPlayed: new Date().toISOString(),
  })
  if (history.length > 50) history.length = 50
  localStorage.setItem(getStorageKey(lang), JSON.stringify(history))
  return history
}

export function removeHistoryEntry(lang, id) {
  const history = getHistory(lang).filter((e) => e.id !== id)
  localStorage.setItem(getStorageKey(lang), JSON.stringify(history))
  return history
}

export function updateEntryLyrics(lang, id, lyricsLang, lyricsName, lyricsText) {
  const history = getHistory(lang)
  const entry = history.find((e) => e.id === id)
  if (entry) {
    if (!entry.lyrics) entry.lyrics = {}
    entry.lyrics[lyricsLang] = { name: lyricsName, text: lyricsText }
    localStorage.setItem(getStorageKey(lang), JSON.stringify(history))
  }
  return history
}

export function removeEntryLyrics(lang, id, lyricsLang) {
  const history = getHistory(lang)
  const entry = history.find((e) => e.id === id)
  if (entry && entry.lyrics) {
    delete entry.lyrics[lyricsLang]
    localStorage.setItem(getStorageKey(lang), JSON.stringify(history))
  }
  return history
}

export function reorderHistory(lang, fromIndex, toIndex) {
  const history = getHistory(lang)
  const [item] = history.splice(fromIndex, 1)
  history.splice(toIndex, 0, item)
  localStorage.setItem(getStorageKey(lang), JSON.stringify(history))
  return history
}
