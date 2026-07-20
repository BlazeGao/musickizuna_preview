import { useState, useCallback, useEffect, useRef } from 'react'
import Sidebar from './components/Sidebar'
import MusicPlayer from './components/MusicPlayer'
import LyricsDisplay from './components/LyricsDisplay'
import FloatingActionMenu from './components/FloatingActionMenu'
import { parseLRC, findCurrentLyricIndex } from './utils/lrcParser'
import { getHistory, addHistoryEntry, removeHistoryEntry, updateEntryLyrics, removeEntryLyrics, reorderHistory, SUPPORTED_LANGS, LANG_LABELS } from './utils/historyManager'
import { cacheAudio, getCachedAudio } from './utils/audioCache'

function getDefaultDisplayConfig(lang) {
  const cfg = {}
  for (const l of SUPPORTED_LANGS) {
    cfg[l] = l === lang
  }
  return cfg
}

function getDefaultDisplayOrder(lang) {
  return SUPPORTED_LANGS.filter(l => l !== lang).concat([lang])
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeLang, setActiveLang] = useState('zh')
  const [displayConfig, setDisplayConfig] = useState(() => getDefaultDisplayConfig('zh'))
  const [displayOrder, setDisplayOrder] = useState(() => getDefaultDisplayOrder('zh'))

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

  const workspacesRef = useRef({
    zh: { musicFile: null, musicName: '', lyricsMap: {}, currentIndex: -1, displayConfig: getDefaultDisplayConfig('zh'), displayOrder: getDefaultDisplayOrder('zh') },
    en: { musicFile: null, musicName: '', lyricsMap: {}, currentIndex: -1, displayConfig: getDefaultDisplayConfig('en'), displayOrder: getDefaultDisplayOrder('en') },
  })

  const currentEntry = history.find((e) => e.musicName === musicName) || null

  const enabledLangs = displayOrder.filter(l => displayConfig[l])

  const activeLyrics = (() => {
    for (const lang of enabledLangs) {
      if (lyricsMap[lang]?.length > 0) return lyricsMap[lang]
    }
    return []
  })()

  const handleSwitchLang = useCallback((newLang) => {
    if (newLang === activeLang) return
    if (isPlaying) playerRef.current?.togglePlay()

    workspacesRef.current[activeLang] = {
      musicFile, musicName, lyricsMap, currentIndex, displayConfig, displayOrder,
    }

    const snap = workspacesRef.current[newLang]
    setMusicFile(snap.musicFile)
    setMusicName(snap.musicName)
    setLyricsMap(snap.lyricsMap)
    setCurrentIndex(snap.currentIndex)
    setDisplayConfig(snap.displayConfig)
    setDisplayOrder(snap.displayOrder)
    setHistory(getHistory(newLang))
    setCurrentTime(0)
    repeatTargetRef.current = -1
    singleRepeatRef.current = false
    setSingleRepeat(false)

    setActiveLang(newLang)
  }, [activeLang, musicFile, musicName, lyricsMap, currentIndex, displayConfig, displayOrder, isPlaying])

  const handleToggleDisplayLang = useCallback((lang) => {
    setDisplayConfig(prev => {
      const enabledCount = Object.values(prev).filter(Boolean).length
      if (prev[lang]) {
        if (enabledCount <= 1) return prev
        return { ...prev, [lang]: false }
      }
      return { ...prev, [lang]: true }
    })
  }, [])

  const handleReorderDisplay = useCallback((fromIndex, toIndex) => {
    setDisplayOrder(prev => {
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }, [])

  const handleToggleSingleRepeat = useCallback(() => {
    setSingleRepeat(prev => {
      singleRepeatRef.current = !prev
      if (prev) repeatTargetRef.current = -1
      return !prev
    })
  }, [])

  useEffect(() => {
    repeatTargetRef.current = -1
  }, [lyricsMap])

  const saveHistory = useCallback(() => {
    if (!musicName) return
    const lyrics = {}
    for (const [lang, parsed] of Object.entries(lyricsMap)) {
      const entry = currentEntry
      lyrics[lang] = {
        name: entry?.lyrics?.[lang]?.name || '',
        text: parsed.length > 0 ? (entry?.lyrics?.[lang]?.text || '') : '',
      }
    }
    const updated = addHistoryEntry(activeLang, musicName, '', lyrics)
    setHistory(updated)
  }, [musicName, lyricsMap, activeLang, currentEntry])

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
      setLyricsMap(prev => ({ ...prev, [lang]: parsed }))
    } catch (err) {
      console.error('Failed to load lyrics:', err)
    }
  }, [])

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
      const parsed = parseLRC(text)
      const updated = updateEntryLyrics(activeLang, entry.id, lang, file.name, text)
      setHistory(updated)

      if (entry.musicName === musicName) {
        setLyricsMap(prev => ({ ...prev, [lang]: parsed }))
      }
    } catch (err) {
      console.error('Failed to add lyrics:', err)
    }
  }, [activeLang, musicName])

  const handleRemoveLyricsFromEntry = useCallback((id, lang) => {
    const updated = removeEntryLyrics(activeLang, id, lang)
    setHistory(updated)
    if (currentEntry?.id === id) {
      setLyricsMap(prev => {
        const next = { ...prev }
        delete next[lang]
        return next
      })
    }
  }, [activeLang, currentEntry])

  const handleTimeUpdate = useCallback((time) => {
    setCurrentTime(time)
    if (activeLyrics.length > 0) {
      const idx = findCurrentLyricIndex(activeLyrics, time)

      if (singleRepeatRef.current) {
        if (repeatTargetRef.current < 0 || repeatTargetRef.current >= activeLyrics.length) {
          repeatTargetRef.current = idx
        }
        if (idx !== repeatTargetRef.current) {
          setCurrentIndex(repeatTargetRef.current)
          playerRef.current?.seekTo(activeLyrics[repeatTargetRef.current].time)
          return
        }
      }

      setCurrentIndex(idx)
    } else {
      repeatTargetRef.current = -1
      setCurrentIndex(-1)
    }
  }, [activeLyrics])

  const handleTogglePlay = useCallback(() => {
    playerRef.current?.togglePlay()
  }, [])

  const handlePrevLyric = useCallback(() => {
    if (activeLyrics.length === 0) return
    const target = currentIndex > 0 ? currentIndex - 1 : 0
    if (singleRepeatRef.current) repeatTargetRef.current = target
    playerRef.current?.seekTo(activeLyrics[target].time)
  }, [activeLyrics, currentIndex])

  const handleNextLyric = useCallback(() => {
    if (activeLyrics.length === 0) return
    const target = currentIndex < activeLyrics.length - 1 ? currentIndex + 1 : activeLyrics.length - 1
    if (singleRepeatRef.current) repeatTargetRef.current = target
    playerRef.current?.seekTo(activeLyrics[target].time)
  }, [activeLyrics, currentIndex])

  const handleSeekFromBar = useCallback((time) => {
    if (singleRepeatRef.current && activeLyrics.length > 0) {
      repeatTargetRef.current = findCurrentLyricIndex(activeLyrics, time)
    }
  }, [activeLyrics])

  const handleReorder = useCallback((fromIndex, toIndex) => {
    const updated = reorderHistory(activeLang, fromIndex, toIndex)
    setHistory(updated)
  }, [activeLang])

  const currentLyricsName = (() => {
    if (!currentEntry?.lyrics) return ''
    const names = []
    for (const lang of enabledLangs) {
      if (currentEntry.lyrics[lang]?.name) {
        names.push(currentEntry.lyrics[lang].name)
      }
    }
    return names.length > 0 ? names.join(' + ') : ''
  })()

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
        onReorder={handleReorder}
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
        />

        <MusicPlayer
          ref={playerRef}
          musicFile={musicFile}
          onTimeUpdate={handleTimeUpdate}
          autoPlay={autoPlay}
          onAutoPlayHandled={() => setAutoPlay(false)}
          onPlayingChange={setIsPlaying}
          onSeek={handleSeekFromBar}
          displayConfig={displayConfig}
          displayOrder={displayOrder}
          onToggleLang={handleToggleDisplayLang}
          onReorderDisplay={handleReorderDisplay}
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
