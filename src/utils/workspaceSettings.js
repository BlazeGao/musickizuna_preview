import { useState, useCallback } from 'react'

export const WORKSPACE_DEFAULTS = {
  zh: { showPinyin: false },
  en: { showChinese: true, showEnglish: true, lyricsOrder: ['en', 'zh'] },
  yue: { showJyutping: true, lyricsOrder: ['yue', 'zh'] },
  ja: {
    showChinese: true,
    showJapanese: true,
    showFurigana: true,
    lyricsOrder: ['ja', 'zh'],
  },
}

const TOGGLE_LANG_OF = {
  showChinese: 'zh',
  showEnglish: 'en',
  showJyutping: 'yue',
  showJapanese: 'ja',
}

const VISIBLE_KEYS = {
  zh: null,
  en: ['showChinese', 'showEnglish'],
  yue: ['showJyutping'],
  ja: ['showChinese', 'showJapanese'],
}

export function applySettingToggle(settings, lang, key) {
  if (!settings || settings[key] === undefined) return settings
  const next = { ...settings, [key]: !settings[key] }

  if (VISIBLE_KEYS[lang]) {
    const visibleKeys = VISIBLE_KEYS[lang]
    if (visibleKeys.includes(key)) {
      const hasVisible = visibleKeys.some((k) => next[k])
      if (!hasVisible) return settings
      const langCode = TOGGLE_LANG_OF[key]
      if (!next[key]) {
        next.lyricsOrder = next.lyricsOrder.filter((l) => l !== langCode)
      } else if (!next.lyricsOrder.includes(langCode)) {
        next.lyricsOrder = [...next.lyricsOrder, langCode]
      }
    }
  }

  if (lang === 'yue' && key === 'showJyutping') {
    if (!next.showJyutping) {
      next.lyricsOrder = next.lyricsOrder.filter((l) => l !== 'yue')
    } else if (!next.lyricsOrder.includes('yue')) {
      next.lyricsOrder = ['yue', ...next.lyricsOrder]
    }
  }

  return next
}

export function applyLyricsReorder(settings, fromIndex, toIndex) {
  if (!settings?.lyricsOrder) return settings
  const next = [...settings.lyricsOrder]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return { ...settings, lyricsOrder: next }
}

export function useAllWorkspaceSettings() {
  const [settings, setSettings] = useState(() => ({
    zh: { ...WORKSPACE_DEFAULTS.zh },
    en: { ...WORKSPACE_DEFAULTS.en },
    yue: { ...WORKSPACE_DEFAULTS.yue },
    ja: { ...WORKSPACE_DEFAULTS.ja },
  }))

  const toggleSetting = useCallback((lang, key) => {
    setSettings((prev) => ({ ...prev, [lang]: applySettingToggle(prev[lang], lang, key) }))
  }, [])

  const reorderLyrics = useCallback((lang, fromIndex, toIndex) => {
    setSettings((prev) => ({ ...prev, [lang]: applyLyricsReorder(prev[lang], fromIndex, toIndex) }))
  }, [])

  return { settings, toggleSetting, reorderLyrics }
}