import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import Sidebar from './components/Sidebar'
import MusicPlayer from './components/MusicPlayer'
import WorkspaceControls from './components/WorkspaceControls'
import LyricsDisplay from './components/LyricsDisplay'
import FloatingActionMenu from './components/FloatingActionMenu'
import FuriganaExportModal from './components/FuriganaExportModal'
import LandingPage from './components/LandingPage'
import { parseLRC, findCurrentLyricIndex } from './utils/lrcParser'
import { getHistory, addHistoryEntry, removeHistoryEntry, updateEntryLyrics, removeEntryLyrics, reorderHistory } from './utils/historyManager'
import { cacheAudio, getCachedAudio } from './utils/audioCache'
import { generateJyutpingLyrics, generatePinyinLyrics, downloadTextFile } from './utils/phoneticDict'
import { fetchFuriganaBatch, getCachedFurigana, getFuriganaOverrides, setFuriganaOverride, mergeFuriganaOverrides, removeFuriganaOverride, exportFuriganaLRC, fetchRomajiFromReading, fetchRomajiBatch, getLineWords, joinWordsToRomaji, hasAnyLineOverride, parseInlineAnnotations } from './utils/japanesePhonetics'
import { exportFuriganaToPDF } from './utils/pdfExport'
import { useAllWorkspaceSettings } from './utils/workspaceSettings'
import { getBuiltinEntries, isBuiltinMusicName } from './data/builtinSongs'

const DEFAULT_WORKSPACE = () => ({ musicFile: null, musicName: '', lyricsMap: {}, currentIndex: -1 })

export default function App() {
  const [showLanding, setShowLanding] = useState(() => window.location.hash !== '#player')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeLang, setActiveLang] = useState('zh')

  const { settings: wsSettings, toggleSetting, reorderLyrics } = useAllWorkspaceSettings()

  const [musicFile, setMusicFile] = useState(null)
  const [musicName, setMusicName] = useState('')
  const [lyricsMap, setLyricsMap] = useState({})
  const [furiganaMap, setFuriganaMap] = useState({})
  const [furiganaOverrides, setFuriganaOverrides] = useState({})
  const [overridesVersion, setOverridesVersion] = useState(0)
  const [romajiLines, setRomajiLines] = useState({})
  const [currentIndex, setCurrentIndex] = useState(-1)

  // Each built-in belongs to exactly one workspace (see builtinSongs.js).
  // mergeHistory prepends only that workspace's built-in above the user's
  // localStorage entries. Callers SHOULD pass the target lang explicitly —
  // see handleSwitchLang, where we must use newLang rather than the
  // closure's still-old activeLang.
  const mergeHistory = useCallback(
    (localList, lang) => {
      const target = lang || activeLang
      return [...getBuiltinEntries(target), ...(localList || [])]
    },
    [activeLang]
  )
  const [history, setHistory] = useState(() => mergeHistory(getHistory('zh')))
  const [currentTime, setCurrentTime] = useState(0)
  const [autoPlay, setAutoPlay] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [singleRepeat, setSingleRepeat] = useState(false)
  const [exportModal, setExportModal] = useState(null)

  const playerRef = useRef(null)
  const seekLockRef = useRef(false)
  const singleRepeatRef = useRef(false)
  const repeatTargetRef = useRef(-1)
  const audioUrlRef = useRef(null)
  const activeLangRef = useRef(activeLang)
  const activeLyricsRef = useRef([])

  const workspacesRef = useRef({
    zh: DEFAULT_WORKSPACE(),
    en: DEFAULT_WORKSPACE(),
    yue: DEFAULT_WORKSPACE(),
    ja: DEFAULT_WORKSPACE(),
  })

  const currentEntry = history.find((e) => e.musicName === musicName) || null

  const { displayConfig, displayOrder } = useMemo(() => {
    if (activeLang === 'zh') {
      const cfg = { zh: true, en: false, yue: false, ja: false }
      const order = wsSettings.zh.showPinyin ? ['pinyin', 'zh'] : ['zh']
      return { displayConfig: cfg, displayOrder: order }
    }
    if (activeLang === 'en') {
      const cfg = { zh: wsSettings.en.showChinese, en: wsSettings.en.showEnglish, yue: false, ja: false }
      const order = wsSettings.en.lyricsOrder.filter((l) => cfg[l])
      return { displayConfig: cfg, displayOrder: order }
    }
    if (activeLang === 'yue') {
      const cfg = { zh: true, en: false, yue: wsSettings.yue.showJyutping, ja: false }
      const order = wsSettings.yue.lyricsOrder.filter((l) => cfg[l])
      return { displayConfig: cfg, displayOrder: order }
    }
    if (activeLang === 'ja') {
      const cfg = { zh: wsSettings.ja.showChinese, en: false, yue: false, ja: wsSettings.ja.showJapanese }
      const order = wsSettings.ja.lyricsOrder.filter((l) => cfg[l])
      return { displayConfig: cfg, displayOrder: order }
    }
    return { displayConfig: {}, displayOrder: [] }
  }, [activeLang, wsSettings])

  const enabledLangs = useMemo(
    () => displayOrder.filter((l) => l === 'pinyin' || displayConfig[l]),
    [displayOrder, displayConfig]
  )

  const activeLyrics = useMemo(() => {
    for (const lang of enabledLangs) {
      if (lang === 'pinyin') continue
      if (lyricsMap[lang]?.length > 0) return lyricsMap[lang]
    }
    return []
  }, [enabledLangs, lyricsMap])

  useEffect(() => { activeLyricsRef.current = activeLyrics }, [activeLyrics])

  const pinyinLyrics = useMemo(() => {
    if (activeLang === 'zh' && wsSettings.zh.showPinyin && lyricsMap.zh?.length > 0) {
      return generatePinyinLyrics(lyricsMap.zh)
    }
    return null
  }, [activeLang, wsSettings.zh.showPinyin, lyricsMap.zh])

  const currentLyricsName = useMemo(() => {
    if (!currentEntry?.lyrics) return ''
    const names = []
    for (const lang of enabledLangs) {
      if (lang === 'pinyin') continue
      if (currentEntry.lyrics[lang]?.name) {
        names.push(currentEntry.lyrics[lang].name)
      }
    }
    return names.length > 0 ? names.join(' + ') : ''
  }, [currentEntry, enabledLangs])

  const handleSwitchLang = useCallback((newLang) => {
    if (newLang === activeLang) return
    if (isPlaying) playerRef.current?.togglePlay()

    workspacesRef.current[activeLang] = { musicFile, musicName, lyricsMap, furiganaMap, furiganaOverrides, currentIndex }

    const snap = workspacesRef.current[newLang]
    let nextLyricsMap = { ...snap.lyricsMap }
    let nextFuriganaMap = { ...(snap.furiganaMap || {}) }
    const nextFuriganaOverrides = snap.furiganaOverrides || {}

    if (newLang === 'yue' && !snap.lyricsMap.zh && lyricsMap.zh?.length > 0) {
      nextLyricsMap = { ...nextLyricsMap, zh: lyricsMap.zh }
    } else if (newLang === 'ja' && !snap.lyricsMap.ja && lyricsMap.ja?.length > 0) {
      nextLyricsMap = { ...nextLyricsMap, ja: lyricsMap.ja, zh: lyricsMap.zh || snap.lyricsMap.zh }
    }

    workspacesRef.current[newLang] = { ...snap, lyricsMap: nextLyricsMap, furiganaMap: nextFuriganaMap, furiganaOverrides: nextFuriganaOverrides }

    setMusicFile(snap.musicFile)
    setMusicName(snap.musicName)
    setLyricsMap(nextLyricsMap)
    setFuriganaMap(nextFuriganaMap)
    setFuriganaOverrides(nextFuriganaOverrides)
    setOverridesVersion((v) => v + 1)
    setCurrentIndex(snap.currentIndex)
    setHistory(mergeHistory(getHistory(newLang), newLang))
    setCurrentTime(0)
    repeatTargetRef.current = -1
    singleRepeatRef.current = false
    setSingleRepeat(false)

    setActiveLang(newLang)
  }, [activeLang, musicFile, musicName, lyricsMap, furiganaMap, furiganaOverrides, currentIndex, isPlaying])

  const handleToggleSingleRepeat = useCallback(() => {
    setSingleRepeat((prev) => {
      singleRepeatRef.current = !prev
      if (prev) repeatTargetRef.current = -1
      return !prev
    })
  }, [])

  useEffect(() => {
    activeLangRef.current = activeLang
  }, [activeLang])

  useEffect(() => {
    if (lyricsMap.zh?.length > 0) {
      const jyutpingLyrics = generateJyutpingLyrics(lyricsMap.zh)
      setLyricsMap((prev) => {
        if (JSON.stringify(prev.yue) === JSON.stringify(jyutpingLyrics)) return prev
        return { ...prev, yue: jyutpingLyrics }
      })
    }
  }, [lyricsMap.zh])

  useEffect(() => {
    const jaLyrics = lyricsMap.ja
    if (!jaLyrics || jaLyrics.length === 0) {
      setFuriganaMap((prev) => (Object.keys(prev).length === 0 ? prev : {}))
      return
    }

    const parsedLines = jaLyrics.map((l) => parseInlineAnnotations(l.text))
    const cleanedTexts = parsedLines.map((p) => p.cleanText)
    const hasInline = parsedLines.some((p) => p.annotations.length > 0)

    const allCached = cleanedTexts.every((t) => getCachedFurigana(t) !== null)
    const setTokensAndOverrides = (tokens) => {
      setFuriganaMap({ ja: tokens, cleanedTexts })
      if (hasInline) {
        const existing = musicName ? getFuriganaOverrides(musicName) : {}
        const merged = { ...existing }
        for (let i = 0; i < parsedLines.length; i++) {
          for (const ann of parsedLines[i].annotations) {
            const localKey = `${i}-${ann.charIndex}`
            const charKey = `c-${ann.surface}`
            if (!existing[localKey] && !existing[charKey]) {
              merged[localKey] = { reading: ann.reading, romaji: '', source: 'inline' }
            }
          }
        }
        if (musicName) {
          mergeFuriganaOverrides(musicName, merged)
        }
        setFuriganaOverrides(merged)
        setOverridesVersion((v) => v + 1)
        if (musicName) {
          workspacesRef.current[activeLang] = {
            ...(workspacesRef.current[activeLang] || DEFAULT_WORKSPACE()),
            furiganaOverrides: merged,
          }
        }
      }
    }

    if (allCached) {
      const tokens = cleanedTexts.map((t) => getCachedFurigana(t))
      setTokensAndOverrides(tokens)
      return
    }
    let cancelled = false
    fetchFuriganaBatch(cleanedTexts).then((tokens) => {
      if (cancelled) return
      setTokensAndOverrides(tokens)
    })
    return () => { cancelled = true }
  }, [lyricsMap.ja, musicName, activeLang])

  useEffect(() => {
    if (musicName) {
      setFuriganaOverrides(getFuriganaOverrides(musicName))
      setOverridesVersion((v) => v + 1)
    } else {
      setFuriganaOverrides({})
    }
  }, [musicName])

  useEffect(() => {
    const jaLyrics = lyricsMap.ja
    if (!jaLyrics || jaLyrics.length === 0) {
      setRomajiLines({})
      return
    }
    const tokensList = furiganaMap?.ja || []
    const cleanedTexts = furiganaMap?.cleanedTexts || []
    const ov = furiganaOverrides || {}

    const tasks = []
    for (let i = 0; i < jaLyrics.length; i++) {
      const lineTokens = tokensList[i] || []
      const text = cleanedTexts[i] || jaLyrics[i].text
      const words = getLineWords(text, lineTokens, i, ov)
      if (words.length === 0) continue
      const apiIndices = []
      const apiReadings = []
      for (let j = 0; j < words.length; j++) {
        if (words[j].needsApi) {
          apiIndices.push(j)
          apiReadings.push(words[j].reading)
        }
      }
      const task = (async () => {
        if (apiReadings.length > 0) {
          const romajiList = await fetchRomajiBatch(apiReadings)
          for (let k = 0; k < apiIndices.length; k++) {
            words[apiIndices[k]].romaji = romajiList[k] || ''
          }
        }
        return joinWordsToRomaji(words)
      })()
      tasks.push(task.then((romaji) => ({ i, romaji })))
    }

    let cancelled = false
    Promise.all(tasks).then((results) => {
      if (cancelled) return
      const next = {}
      for (const { i, romaji } of results) {
        next[i] = romaji
      }
      setRomajiLines((prev) => {
        const merged = { ...prev, ...next }
        let changed = false
        for (const k of Object.keys(merged)) {
          if (prev[k] !== merged[k]) { changed = true; break }
        }
        return changed ? merged : prev
      })
    }).catch(() => {})

    return () => { cancelled = true }
  }, [lyricsMap.ja, furiganaMap, furiganaOverrides])

  const handleSaveFuriganaOverride = useCallback(async (lineIndex, charIndex, surface, reading, scope) => {
    if (!musicName) return
    const romaji = await fetchRomajiFromReading(reading)
    const override = { reading, romaji: romaji || '', source: 'user' }
    const local = `${lineIndex}-${charIndex}`
    const charKey = surface ? `c-${surface}` : null
    if (scope === 'all' && charKey) {
      setFuriganaOverride(musicName, local, null)
      setFuriganaOverride(musicName, charKey, override)
    } else {
      if (charKey) setFuriganaOverride(musicName, charKey, null)
      setFuriganaOverride(musicName, local, override)
    }
    const updated = getFuriganaOverrides(musicName)
    setFuriganaOverrides(updated)
    setOverridesVersion((v) => v + 1)
    workspacesRef.current[activeLang] = {
      ...(workspacesRef.current[activeLang] || DEFAULT_WORKSPACE()),
      furiganaOverrides: updated,
    }
  }, [musicName, activeLang])

  const handleRemoveFuriganaOverride = useCallback((lineIndex, charIndex, surface) => {
    if (!musicName) return
    removeFuriganaOverride(musicName, `${lineIndex}-${charIndex}`)
    if (surface) removeFuriganaOverride(musicName, `c-${surface}`)
    const updated = getFuriganaOverrides(musicName)
    setFuriganaOverrides(updated)
    setOverridesVersion((v) => v + 1)
    workspacesRef.current[activeLang] = {
      ...(workspacesRef.current[activeLang] || DEFAULT_WORKSPACE()),
      furiganaOverrides: updated,
    }
  }, [musicName, activeLang])

  const handleExportFuriganaLRC = useCallback(() => {
    if (!musicName) return
    const jaLyrics = lyricsMap.ja || []
    if (jaLyrics.length === 0) return
    const tokens = furiganaMap?.ja || []
    const cleanedTexts = furiganaMap?.cleanedTexts || []
    const lrc = exportFuriganaLRC(jaLyrics, tokens, furiganaOverrides, cleanedTexts)
    if (!lrc) return
    const baseName = musicName.replace(/\.[^/.]+$/, '')
    setExportModal({
      filename: `${baseName}_furigana.txt`,
      pdfFilename: `${baseName}_furigana.pdf`,
      lrcText: lrc,
      lineCount: jaLyrics.length,
    })
  }, [musicName, lyricsMap.ja, furiganaMap, furiganaOverrides])

  const handleDownloadFromModal = useCallback(async (view) => {
    if (!exportModal) return
    if (view === 'lrc') {
      downloadTextFile(exportModal.lrcText, exportModal.filename)
    } else {
      const node = document.querySelector('.furigana-view-content')
      if (!node) return
      try {
        await exportFuriganaToPDF(node, exportModal.pdfFilename)
      } catch (err) {
        console.error('PDF export failed:', err)
        alert('PDF 生成失败: ' + err.message)
        return
      }
    }
    setExportModal(null)
  }, [exportModal])

  const handleCloseExportModal = useCallback(() => {
    setExportModal(null)
  }, [])

  const handleMusicSelect = useCallback((file) => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    const url = URL.createObjectURL(file)
    audioUrlRef.current = url
    cacheAudio(file.name, file).catch(() => {})
    setMusicFile(url)
    setMusicName(file.name)
    setLyricsMap({})
    setFuriganaMap({})
  }, [])

  const handleLyricsSelect = useCallback(async (file, lang = 'zh') => {
    try {
      const text = await file.text()
      const parsed = parseLRC(text)
      if (activeLang === 'yue') {
        const jyutpingLyrics = generateJyutpingLyrics(parsed)
        setLyricsMap((prev) => ({ ...prev, zh: parsed, yue: jyutpingLyrics }))
      } else {
        setLyricsMap((prev) => ({ ...prev, [lang]: parsed }))
      }
    } catch (err) {
      console.error('Failed to load lyrics:', err)
    }
  }, [activeLang])

  useEffect(() => {
    // Skip if a built-in already has this musicName (avoids duplicates and
    // a no-op write to localStorage when the user picks a same-named file).
    // Also skip if the musicName matches a built-in from any workspace —
    // this prevents polluting the new workspace's localStorage when the
    // user switches workspaces while a built-in is playing.
    if (musicName && !history.find((e) => e.musicName === musicName)) {
      if (isBuiltinMusicName(musicName)) return
      const updated = addHistoryEntry(activeLang, musicName, '', {})
      setHistory(mergeHistory(updated))
    }
  }, [musicName, activeLang, history, mergeHistory])

  const loadEntry = useCallback(async (entry, shouldAutoPlay = false) => {
    setMusicName(entry.musicName)

    const parsedMap = {}
    const lyrics = entry.lyrics || {}
    for (const lang of Object.keys(lyrics)) {
      if (lyrics[lang]?.text) {
        parsedMap[lang] = parseLRC(lyrics[lang].text)
      }
    }
    const lang = activeLangRef.current
    if (lang === 'yue' && parsedMap.zh) {
      parsedMap.yue = generateJyutpingLyrics(parsedMap.zh)
    }
    setLyricsMap(parsedMap)
    setCurrentIndex(-1)

    // Built-in entries ship with a static musicPath served from /assets/.
    // Pass it straight to <audio src> — no IndexedDB lookup needed.
    if (entry.musicPath) {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
      setMusicFile(entry.musicPath)
      if (shouldAutoPlay) setAutoPlay(true)
      return
    }

    // User-uploaded entries pull the audio blob from IndexedDB.
    try {
      const blob = await getCachedAudio(entry.musicName)
      if (blob) {
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
        const url = URL.createObjectURL(blob)
        audioUrlRef.current = url
        setMusicFile(url)
        if (shouldAutoPlay) setAutoPlay(true)
      }
    } catch {}
  }, [])

  const handleSelectEntry = useCallback((entry) => {
    loadEntry(entry, false)
  }, [loadEntry])

  const handleDoubleClickEntry = useCallback((entry) => {
    loadEntry(entry, true)
  }, [loadEntry])

  const handleRemoveEntry = useCallback((id) => {
    // Block removal of built-in entries (UI also hides the button).
    if (history.find((e) => e.id === id)?.isBuiltin) return
    const updated = removeHistoryEntry(activeLang, id)
    setHistory(mergeHistory(updated))
  }, [activeLang, history, mergeHistory])

  const handleAddLyricsToEntry = useCallback(async (entry, lang, file) => {
    // Block mutation of built-in entries. They already have their shipped
    // lyrics; if the user wants different ones, they can upload their own.
    if (entry?.isBuiltin) return
    try {
      const text = await file.text()
      const storeLang = activeLang === 'yue' ? 'zh' : lang
      const updated = updateEntryLyrics(activeLang, entry.id, storeLang, file.name, text)
      setHistory(mergeHistory(updated))

      if (entry.musicName === musicName) {
        if (activeLang === 'yue') {
          const parsed = parseLRC(text)
          const jyutpingLyrics = generateJyutpingLyrics(parsed)
          setLyricsMap((prev) => ({ ...prev, zh: parsed, yue: jyutpingLyrics }))
        } else {
          const parsed = parseLRC(text)
          setLyricsMap((prev) => ({ ...prev, [lang]: parsed }))
        }
      }
    } catch (err) {
      console.error('Failed to add lyrics:', err)
    }
  }, [activeLang, musicName, mergeHistory])

  const handleRemoveLyricsFromEntry = useCallback((id, lang) => {
    if (history.find((e) => e.id === id)?.isBuiltin) return
    const updated = removeEntryLyrics(activeLang, id, lang)
    setHistory(mergeHistory(updated))
    if (currentEntry?.id === id) {
      setLyricsMap((prev) => {
        const next = { ...prev }
        delete next[lang]
        return next
      })
    }
  }, [activeLang, currentEntry, history, mergeHistory])

  const handleTimeUpdate = useCallback((time) => {
    setCurrentTime(time)
    const lyrics = activeLyricsRef.current
    if (lyrics.length === 0) {
      repeatTargetRef.current = -1
      setCurrentIndex(-1)
      return
    }
    const idx = findCurrentLyricIndex(lyrics, time)

    if (singleRepeatRef.current) {
      if (repeatTargetRef.current < 0 || repeatTargetRef.current >= lyrics.length) {
        repeatTargetRef.current = idx < 0 ? 0 : idx
      }
      if (idx !== repeatTargetRef.current && !seekLockRef.current) {
        const target = repeatTargetRef.current
        setCurrentIndex(target)
        seekLockRef.current = true
        playerRef.current?.seekTo(lyrics[target]?.time ?? 0)
        window.setTimeout(() => { seekLockRef.current = false }, 200)
        return
      }
    }

    setCurrentIndex(idx < 0 ? -1 : idx)
  }, [])

  const handleTogglePlay = useCallback(() => {
    playerRef.current?.togglePlay()
  }, [])

  const handlePrevLyric = useCallback(() => {
    const lyrics = activeLyricsRef.current
    if (lyrics.length === 0) return
    const cur = currentIndex < 0 ? 0 : currentIndex
    const target = cur > 0 ? cur - 1 : 0
    if (singleRepeatRef.current) repeatTargetRef.current = target
    playerRef.current?.seekTo(lyrics[target].time)
  }, [currentIndex])

  const handleNextLyric = useCallback(() => {
    const lyrics = activeLyricsRef.current
    if (lyrics.length === 0) return
    const cur = currentIndex < 0 ? 0 : currentIndex
    const target = cur < lyrics.length - 1 ? cur + 1 : lyrics.length - 1
    if (singleRepeatRef.current) repeatTargetRef.current = target
    playerRef.current?.seekTo(lyrics[target].time)
  }, [currentIndex])

  const handleSeekFromBar = useCallback((time) => {
    const lyrics = activeLyricsRef.current
    if (singleRepeatRef.current && lyrics.length > 0) {
      repeatTargetRef.current = findCurrentLyricIndex(lyrics, time)
    }
  }, [])

  const handleSeekToLine = useCallback((index) => {
    const lyrics = activeLyricsRef.current
    if (lyrics.length === 0 || index < 0 || index >= lyrics.length) return
    if (singleRepeatRef.current) repeatTargetRef.current = index
    playerRef.current?.seekTo(lyrics[index].time)
  }, [])

  const handleReorderHistory = useCallback((fromIndex, toIndex) => {
    // Built-in entries are pinned to the top — don't let reorders move them
    // or let user entries move past them.
    if (history[fromIndex]?.isBuiltin || history[toIndex]?.isBuiltin) return
    const updated = reorderHistory(activeLang, fromIndex, toIndex)
    setHistory(mergeHistory(updated))
  }, [activeLang, history, mergeHistory])

  const handlePauseMusic = useCallback(() => {
    if (isPlaying) {
      playerRef.current?.togglePlay()
      return true
    }
    return false
  }, [isPlaying])

  const handleResumeMusic = useCallback(() => {
    if (!isPlaying) {
      playerRef.current?.togglePlay()
    }
  }, [isPlaying])

  useEffect(() => {
    const handleHashChange = () => setShowLanding(window.location.hash !== '#player')
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const handleEnterSite = useCallback(() => {
    window.location.hash = 'player'
    setShowLanding(false)
  }, [])

  if (showLanding) {
    return <LandingPage onEnter={handleEnterSite} />
  }

  return (
    <div className="app">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        history={history}
        currentMusicName={musicName}
        activeLang={activeLang}
        onSwitchLang={handleSwitchLang}
        onSelectEntry={handleSelectEntry}
        onDoubleClickEntry={handleDoubleClickEntry}
        onRemoveEntry={handleRemoveEntry}
        onMusicSelect={handleMusicSelect}
        onAddLyricsToEntry={handleAddLyricsToEntry}
        onRemoveLyricsFromEntry={handleRemoveLyricsFromEntry}
        onReorder={handleReorderHistory}
      />

      <main className={`main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="song-info">
          {musicName ? (
            <>
              <h1 className="song-title">{musicName.replace(/\.[^/.]+$/, '')}</h1>
              <p className="song-lyrics-label">{currentLyricsName ? `歌词: ${currentLyricsName}` : '未选择歌词'}</p>
            </>
          ) : (
            <>
              <h1 className="song-title empty">MusicKizuna</h1>
              <p className="song-lyrics-label">选择音乐和歌词开始播放</p>
            </>
          )}
        </div>

        <LyricsDisplay
          lyricsMap={lyricsMap}
          displayConfig={displayConfig}
          displayOrder={displayOrder}
          currentIndex={currentIndex}
          onSeek={handleSeekToLine}
          activeLang={activeLang}
          onPauseMusic={handlePauseMusic}
          onResumeMusic={handleResumeMusic}
          pinyinLyrics={pinyinLyrics}
          furiganaMap={furiganaMap}
          showFurigana={wsSettings.ja.showFurigana}
          furiganaOverrides={furiganaOverrides}
          overridesVersion={overridesVersion}
          romajiLines={romajiLines}
          lyricsOrderJa={wsSettings.ja.lyricsOrder}
          onSaveFuriganaOverride={handleSaveFuriganaOverride}
          onRemoveFuriganaOverride={handleRemoveFuriganaOverride}
        />

        <WorkspaceControls
          activeLang={activeLang}
          settings={wsSettings}
          onToggleSetting={toggleSetting}
          onReorderLyrics={reorderLyrics}
          onExportFuriganaLRC={handleExportFuriganaLRC}
        />

        <MusicPlayer
          ref={playerRef}
          musicFile={musicFile}
          onTimeUpdate={handleTimeUpdate}
          autoPlay={autoPlay}
          onAutoPlayHandled={() => setAutoPlay(false)}
          onPlayingChange={setIsPlaying}
          onSeek={handleSeekFromBar}
        />

        <FloatingActionMenu items={[
          { icon: '▲', label: '上一句', onClick: handlePrevLyric },
          { icon: isPlaying ? '⏸' : '▶', label: isPlaying ? '暂停' : '播放', onClick: handleTogglePlay, active: isPlaying },
          { icon: '🔂', label: singleRepeat ? '关闭单句循环' : '开启单句循环', onClick: handleToggleSingleRepeat, active: singleRepeat },
          { icon: '▼', label: '下一句', onClick: handleNextLyric },
        ]} />
      </main>

      <FuriganaExportModal
        open={!!exportModal}
        filename={exportModal?.filename || ''}
        lrcText={exportModal?.lrcText || ''}
        lineCount={exportModal?.lineCount || 0}
        jaLyrics={lyricsMap.ja || []}
        furiganaTokens={furiganaMap?.ja || []}
        cleanedTexts={furiganaMap?.cleanedTexts || []}
        furiganaOverrides={furiganaOverrides}
        onDownload={handleDownloadFromModal}
        onClose={handleCloseExportModal}
      />
    </div>
  )
}
