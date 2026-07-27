/**
 * Built-in songs shipped with the app. Each built-in belongs to exactly one
 * workspace (`targetLang`); it only appears in that workspace's history list.
 * Lyrics are inlined at build time via Vite's `?raw` imports, while the MP3
 * audio files are served statically from /assets/ (Vite's public/ directory).
 *
 * The Cantonese song's lyrics are stored under the `zh` key because the file
 * is written in Chinese characters (Cantonese text). The yue workspace
 * auto-generates jyutping from this text via `generateJyutpingLyrics`.
 */

// `?raw` returns the file contents as a string at build time.
import intlZhLrc from './lyrics/intl_zh.lrc?raw'
import intlYueLrc from './lyrics/intl_yue.lrc?raw'
import intlEnLrc from './lyrics/intl_en_en.lrc?raw'
import intlEnZhLrc from './lyrics/intl_en_zh.lrc?raw'
import intlJaLrc from './lyrics/intl_ja_jp.lrc?raw'
import intlJaZhLrc from './lyrics/intl_ja_zh.lrc?raw'

export const BUILTIN_SONGS = [
  {
    id: 'builtin-intl-zh',
    targetLang: 'zh',
    musicName: '国际歌 - 中央乐团合唱队.mp3',
    musicPath: '/assets/intl_zh.mp3',
    isBuiltin: true,
    lyrics: {
      zh: { name: '国际歌.lrc', text: intlZhLrc },
    },
  },
  {
    id: 'builtin-intl-yue',
    targetLang: 'yue',
    musicName: '国际歌粤语版.mp3',
    musicPath: '/assets/intl_yue.mp3',
    isBuiltin: true,
    // Stored under `zh` because the LRC is written in Chinese characters
    // (Cantonese). The yue workspace generates jyutping automatically.
    lyrics: {
      zh: { name: '国际歌粤语版.lrc', text: intlYueLrc },
    },
  },
  {
    id: 'builtin-intl-en',
    targetLang: 'en',
    musicName: 'The Internationale.mp3',
    musicPath: '/assets/intl_en.mp3',
    isBuiltin: true,
    lyrics: {
      en: { name: 'The Internationale_en.lrc', text: intlEnLrc },
      zh: { name: 'The Internationale_zh.lrc', text: intlEnZhLrc },
    },
  },
  {
    id: 'builtin-intl-ja',
    targetLang: 'ja',
    musicName: 'インターナショナル（国際歌）.mp3',
    musicPath: '/assets/intl_ja.mp3',
    isBuiltin: true,
    lyrics: {
      ja: { name: 'インターナショナル(国際歌)_jp.lrc', text: intlJaLrc },
      zh: { name: 'インターナショナル(国際歌)_zh.lrc', text: intlJaZhLrc },
    },
  },
]

/**
 * Returns the built-in entry (if any) that belongs to the given workspace.
 * Each built-in is pinned to one workspace, so this returns 0 or 1 entries.
 * Lyrics are deep-cloned so per-workspace mutations don't leak across calls.
 */
export function getBuiltinEntries(lang) {
  if (!lang) return []
  return BUILTIN_SONGS
    .filter((s) => s.targetLang === lang)
    .map((s) => ({
      id: s.id,
      musicName: s.musicName,
      musicPath: s.musicPath,
      isBuiltin: true,
      targetLang: s.targetLang,
      lyrics: Object.fromEntries(
        Object.entries(s.lyrics).map(([l, val]) => [l, { name: val.name, text: val.text }])
      ),
      lastPlayed: null,
    }))
}

/**
 * Returns true if the given musicName matches any built-in. Used by App.jsx
 * to skip auto-adding built-ins to per-workspace localStorage (which would
 * create duplicates if a user plays a built-in then switches workspaces).
 */
export function isBuiltinMusicName(musicName) {
  if (!musicName) return false
  return BUILTIN_SONGS.some((s) => s.musicName === musicName)
}
