import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import Sidebar from './components/Sidebar'
import MusicPlayer from './components/MusicPlayer'
import WorkspaceControls from './components/WorkspaceControls'
import LyricsDisplay from './components/LyricsDisplay'
import FloatingActionMenu from './components/FloatingActionMenu'
import { parseLRC, findCurrentLyricIndex } from './utils/lrcParser'
import { getHistory, addHistoryEntry, removeHistoryEntry, updateEntryLyrics, removeEntryLyrics, reorderHistory } from './utils/historyManager'
import { cacheAudio, getCachedAudio } from './utils/audioCache'
import { generateJyutpingLyrics, generatePinyinLyrics } from './utils/phoneticDict'
import { useAllWorkspaceSettings } from './utils/workspaceSettings'

const DEFAULT_WORKSPACE = () => ({ musicFile: null, musicName: '', lyricsMap: {}, currentIndex: -1 })

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeLang, setActiveLang] = useState('zh')

  const { settings: wsSettings, toggleSetting, reorderLyrics } = useAllWorkspaceSettings()

  const [musicFile, setMusicFile] = useState(null)
  const [musicName, setMusicName] = useState('')
  const [lyricsMap, setLyricsMap] = useState({})
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [history, setHistory] = useState(() => getHistory('zh'))
  const [currentTime, setCurrentTime] = useState(0)
  const [autoPlay, setAutoPlay] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [singleRepeat, setSingleRepeat] = useState(false)

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

    workspacesRef.current[activeLang] = { musicFile, musicName, lyricsMap, currentIndex }

    const snap = workspacesRef.current[newLang]
    let nextLyricsMap = { ...snap.lyricsMap }

    if (newLang === 'yue' && !snap.lyricsMap.zh && lyricsMap.zh?.length > 0) {
      nextLyricsMap = { ...nextLyricsMap, zh: lyricsMap.zh }
    } else if (newLang === 'ja' && !snap.lyricsMap.ja && lyricsMap.ja?.length > 0) {
      nextLyricsMap = { ...nextLyricsMap, ja: lyricsMap.ja, zh: lyricsMap.zh || snap.lyricsMap.zh }
    }

    workspacesRef.current[newLang] = { ...snap, lyricsMap: nextLyricsMap }

    setMusicFile(snap.musicFile)
    setMusicName(snap.musicName)
    setLyricsMap(nextLyricsMap)
    setCurrentIndex(snap.currentIndex)
    setHistory(getHistory(newLang))
    setCurrentTime(0)
    repeatTargetRef.current = -1
    singleRepeatRef.current = false
    setSingleRepeat(false)

    setActiveLang(newLang)
  }, [activeLang, musicFile, musicName, lyricsMap, currentIndex, isPlaying])

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

  const handleMusicSelect = useCallback((file) => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    const url = URL.createObjectURL(file)
    audioUrlRef.current = url
    cacheAudio(file.name, file).catch(() => {})
    setMusicFile(url)
    setMusicName(file.name)
    setLyricsMap({})
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
    if (musicName && !history.find((e) => e.musicName === musicName)) {
      const updated = addHistoryEntry(activeLang, musicName, '', {})
      setHistory(updated)
    }
  }, [musicName, activeLang])

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
    const updated = removeHistoryEntry(activeLang, id)
    setHistory(updated)
  }, [activeLang])

  const handleAddLyricsToEntry = useCallback(async (entry, lang, file) => {
    try {
      const text = await file.text()
      const storeLang = activeLang === 'yue' ? 'zh' : lang
      const updated = updateEntryLyrics(activeLang, entry.id, storeLang, file.name, text)
      setHistory(updated)

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
  }, [activeLang, musicName])

  const handleRemoveLyricsFromEntry = useCallback((id, lang) => {
    const updated = removeEntryLyrics(activeLang, id, lang)
    setHistory(updated)
    if (currentEntry?.id === id) {
      setLyricsMap((prev) => {
        const next = { ...prev }
        delete next[lang]
        return next
      })
    }
  }, [activeLang, currentEntry])

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
    const updated = reorderHistory(activeLang, fromIndex, toIndex)
    setHistory(updated)
  }, [activeLang])

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

        <WorkspaceControls
          activeLang={activeLang}
          settings={wsSettings}
          onToggleSetting={toggleSetting}
          onReorderLyrics={reorderLyrics}
        />

        <FloatingActionMenu items={[
          { icon: '▼', label: '下一句', onClick: handleNextLyric },
          { icon: isPlaying ? '⏸' : '▶', label: isPlaying ? '暂停' : '播放', onClick: handleTogglePlay, active: isPlaying },
          { icon: '🔂', label: singleRepeat ? '关闭单句循环' : '开启单句循环', onClick: handleToggleSingleRepeat, active: singleRepeat },
          { icon: '▲', label: '上一句', onClick: handlePrevLyric },
        ]} />
      </main>
    </div>
  )
}