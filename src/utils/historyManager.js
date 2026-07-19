const STORAGE_KEY = 'musickizuna_history'

/**
 * Get all history entries from localStorage
 */
export function getHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * Add a new entry to history (dedup by musicName+lyricsName)
 * Moves to top if already exists
 */
export function addHistoryEntry(musicName, musicPath, lyricsName, lyricsPath, lyricsText) {
  const history = getHistory()
  const existing = history.find(
    (e) => e.musicName === musicName && e.lyricsName === lyricsName
  )
  if (existing) {
    history.splice(history.indexOf(existing), 1)
  }
  history.unshift({
    id: Date.now(),
    musicName,
    musicPath,
    lyricsName,
    lyricsPath,
    lyricsText: lyricsText || '',
    lastPlayed: new Date().toISOString(),
  })
  // Keep max 50 entries
  if (history.length > 50) history.length = 50
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  return history
}

/**
 * Remove a history entry by id
 */
export function removeHistoryEntry(id) {
  const history = getHistory().filter((e) => e.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  return history
}

/**
 * Update lyrics info for a specific history entry
 */
export function updateEntryLyrics(id, lyricsName, lyricsText) {
  const history = getHistory()
  const entry = history.find((e) => e.id === id)
  if (entry) {
    entry.lyricsName = lyricsName
    entry.lyricsText = lyricsText
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  }
  return history
}

/**
 * Reorder history by moving entry from one index to another
 */
export function reorderHistory(fromIndex, toIndex) {
  const history = getHistory()
  const [item] = history.splice(fromIndex, 1)
  history.splice(toIndex, 0, item)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  return history
}
