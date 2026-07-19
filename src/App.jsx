import { useState, useCallback, useEffect, useRef } from 'react'
import Sidebar from './components/Sidebar'
import MusicPlayer from './components/MusicPlayer'
import LyricsDisplay from './components/LyricsDisplay'
import FloatingActionMenu from './components/FloatingActionMenu'
import { parseLRC, findCurrentLyricIndex } from './utils/lrcParser'
import { getHistory, addHistoryEntry, removeHistoryEntry, updateEntryLyrics, reorderHistory } from './utils/historyManager'
import { cacheAudio, getCachedAudio } from './utils/audioCache'

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [musicFile, setMusicFile] = useState(null)
  const [musicName, setMusicName] = useState('')
  const [lyrics, setLyrics] = useState([])
  const [lyricsName, setLyricsName] = useState('')
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [history, setHistory] = useState(() => getHistory())
  const [currentTime, setCurrentTime] = useState(0)
  const [autoPlay, setAutoPlay] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [singleRepeat, setSingleRepeat] = useState(false)
  const lyricsTextRef = useRef('')
  const playerRef = useRef(null)
  const seekLockRef = useRef(false)
  const singleRepeatRef = useRef(false)
  const repeatTargetRef = useRef(-1)

  const handleToggleSingleRepeat = useCallback(() => {
    setSingleRepeat(prev => {
      singleRepeatRef.current = !prev
      if (prev) repeatTargetRef.current = -1
      return !prev
    })
  }, [])

  useEffect(() => {
    repeatTargetRef.current = -1
  }, [lyrics])

  const saveHistory = useCallback((mName, lName, lText) => {
    const updated = addHistoryEntry(mName, '', lName, '', lText)
    setHistory(updated)
  }, [])

  const handleMusicSelect = useCallback((file) => {
    const url = URL.createObjectURL(file)
    cacheAudio(file.name, file).catch(() => {})
    setMusicFile(url)
    setMusicName(file.name)
    setLyrics([])
    setLyricsName('')
    lyricsTextRef.current = ''
  }, [])

  const handleLyricsSelect = useCallback(async (file) => {
    try {
      const text = await file.text()
      const parsed = parseLRC(text)
      lyricsTextRef.current = text
      setLyrics(parsed)
      setLyricsName(file.name)
    } catch (err) {
      console.error('Failed to load lyrics:', err)
    }
  }, [])

  useEffect(() => {
    if (musicName) {
      saveHistory(musicName, lyricsName || '', lyricsTextRef.current || '')
    }
  }, [musicName, lyricsName, saveHistory])

  const handleSelectEntry = useCallback((entry) => {
    setMusicName(entry.musicName)
    setLyricsName(entry.lyricsName)
    setCurrentIndex(-1)

    if (entry.lyricsText) {
      lyricsTextRef.current = entry.lyricsText
      const parsed = parseLRC(entry.lyricsText)
      setLyrics(parsed)
    } else {
      setLyrics([])
    }
  }, [])

  const handleDoubleClickEntry = useCallback(async (entry) => {
    setMusicName(entry.musicName)
    setLyricsName(entry.lyricsName)
    setCurrentIndex(-1)

    if (entry.lyricsText) {
      lyricsTextRef.current = entry.lyricsText
      const parsed = parseLRC(entry.lyricsText)
      setLyrics(parsed)
    } else {
      lyricsTextRef.current = ''
      setLyrics([])
    }

    try {
      const blob = await getCachedAudio(entry.musicName)
      if (blob) {
        const url = URL.createObjectURL(blob)
        setMusicFile(url)
        setAutoPlay(true)
      }
    } catch {}
  }, [])

  const handleRemoveEntry = useCallback((id) => {
    const updated = removeHistoryEntry(id)
    setHistory(updated)
  }, [])

  const handleAddLyricsToEntry = useCallback(async (entry, file) => {
    try {
      const text = await file.text()
      const parsed = parseLRC(text)
      const updated = updateEntryLyrics(entry.id, file.name, text)
      setHistory(updated)

      if (entry.musicName === musicName) {
        lyricsTextRef.current = text
        setLyrics(parsed)
        setLyricsName(file.name)
      }
    } catch (err) {
      console.error('Failed to add lyrics:', err)
    }
  }, [musicName])

  const handleTimeUpdate = useCallback((time) => {
    setCurrentTime(time)
    if (lyrics.length > 0) {
      const idx = findCurrentLyricIndex(lyrics, time)

      if (singleRepeatRef.current) {
        if (repeatTargetRef.current < 0 || repeatTargetRef.current >= lyrics.length) {
          repeatTargetRef.current = idx
        }
        if (idx !== repeatTargetRef.current) {
          setCurrentIndex(repeatTargetRef.current)
          playerRef.current?.seekTo(lyrics[repeatTargetRef.current].time)
          return
        }
      }

      setCurrentIndex(idx)
    } else {
      repeatTargetRef.current = -1
      setCurrentIndex(-1)
    }
  }, [lyrics])

  const handleTogglePlay = useCallback(() => {
    playerRef.current?.togglePlay()
  }, [])

  const handlePrevLyric = useCallback(() => {
    if (lyrics.length === 0) return
    const target = currentIndex > 0 ? currentIndex - 1 : 0
    if (singleRepeatRef.current) repeatTargetRef.current = target
    playerRef.current?.seekTo(lyrics[target].time)
  }, [lyrics, currentIndex])

  const handleNextLyric = useCallback(() => {
    if (lyrics.length === 0) return
    const target = currentIndex < lyrics.length - 1 ? currentIndex + 1 : lyrics.length - 1
    if (singleRepeatRef.current) repeatTargetRef.current = target
    playerRef.current?.seekTo(lyrics[target].time)
  }, [lyrics, currentIndex])

  const handleSeekFromBar = useCallback((time) => {
    if (singleRepeatRef.current && lyrics.length > 0) {
      repeatTargetRef.current = findCurrentLyricIndex(lyrics, time)
    }
  }, [lyrics])

  const handleReorder = useCallback((fromIndex, toIndex) => {
    const updated = reorderHistory(fromIndex, toIndex)
    setHistory(updated)
  }, [])

  return (
    <div className="app">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        history={history}
        currentMusicName={musicName}
        onSelectEntry={handleSelectEntry}
        onDoubleClickEntry={handleDoubleClickEntry}
        onRemoveEntry={handleRemoveEntry}
        onMusicSelect={handleMusicSelect}
        onAddLyricsToEntry={handleAddLyricsToEntry}
        onReorder={handleReorder}
      />

      <main className={`main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="song-info">
          {musicName ? (
            <>
              <h1 className="song-title">{musicName.replace(/\.[^/.]+$/, '')}</h1>
              <p className="song-lyrics-label">{lyricsName ? `歌词: ${lyricsName}` : '未选择歌词'}</p>
            </>
          ) : (
            <>
              <h1 className="song-title empty">MusicKizuna</h1>
              <p className="song-lyrics-label">选择音乐和歌词开始播放</p>
            </>
          )}
        </div>

        <LyricsDisplay lyrics={lyrics} currentIndex={currentIndex} />

        <MusicPlayer ref={playerRef} musicFile={musicFile} onTimeUpdate={handleTimeUpdate} autoPlay={autoPlay} onAutoPlayHandled={() => setAutoPlay(false)} onPlayingChange={setIsPlaying} onSeek={handleSeekFromBar} />

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
