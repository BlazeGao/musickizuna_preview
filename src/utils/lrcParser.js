/**
 * Parse LRC format lyrics text into structured data
 * Format: [mm:ss.xx]lyrics text
 */
export function parseLRC(lrcText) {
  if (!lrcText || !lrcText.trim()) return []

  const text = lrcText.replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/)
  const result = []

  for (const line of lines) {
    const match = line.match(/^\[(\d{1,2}):(\d{2})\.(\d{2,3})\](.*)$/)
    if (match) {
      const minutes = parseInt(match[1], 10)
      const seconds = parseInt(match[2], 10)
      const ms = parseInt(match[3].padEnd(3, '0'), 10)
      const time = minutes * 60 + seconds + ms / 1000
      const lyricsText = match[4].trim()
      if (lyricsText) {
        result.push({ time, text: lyricsText })
      }
    }
  }

  result.sort((a, b) => a.time - b.time)
  return result
}

/**
 * Find the current lyric index based on playback time
 */
export function findCurrentLyricIndex(lyrics, currentTime) {
  for (let i = lyrics.length - 1; i >= 0; i--) {
    if (currentTime >= lyrics[i].time) {
      return i
    }
  }
  return -1
}
