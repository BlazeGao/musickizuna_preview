import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { LANG_LABELS } from '../utils/historyManager'
import './MusicPlayer.css'

const MusicPlayer = forwardRef(function MusicPlayer({
  musicFile,
  onTimeUpdate,
  autoPlay,
  onAutoPlayHandled,
  onPlayingChange,
  onSeek,
  displayConfig = {},
  displayOrder = [],
  onToggleLang,
  onReorderDisplay,
}, ref) {
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const dragIndexRef = useRef(null)
  const dragOverIndexRef = useRef(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)

  const syncPlaying = useCallback((val) => {
    setIsPlaying(val)
    onPlayingChange?.(val)
  }, [onPlayingChange])

  useImperativeHandle(ref, () => ({
    togglePlay() {
      const audio = audioRef.current
      if (!audio) return
      if (audio.paused) audio.play(); else audio.pause()
      syncPlaying(!audio.paused)
    },
    seekTo(time) {
      const audio = audioRef.current
      if (!audio) return
      audio.currentTime = time
      setCurrentTime(time)
    },
    get isPlaying() { return !audioRef.current?.paused },
    get currentTime() { return audioRef.current?.currentTime ?? 0 },
  }))

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
      onTimeUpdate?.(audio.currentTime)
    }
    const handleLoadedMetadata = () => setDuration(audio.duration)
    const handleEnded = () => syncPlaying(false)
    const handlePlay = () => syncPlaying(true)
    const handlePause = () => syncPlaying(false)

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
    }
  }, [musicFile, onTimeUpdate])

  useEffect(() => {
    const audio = audioRef.current
    if (audio && musicFile) {
      audio.load()
      syncPlaying(false)
      setCurrentTime(0)
    }
  }, [musicFile])

  useEffect(() => {
    if (autoPlay && musicFile) {
      const audio = audioRef.current
      if (audio) {
        const onCanPlay = () => {
          audio.removeEventListener('canplay', onCanPlay)
          audio.play().then(() => {
            syncPlaying(true)
            onAutoPlayHandled?.()
          }).catch(() => {
            onAutoPlayHandled?.()
          })
        }
        audio.addEventListener('canplay', onCanPlay)
        audio.load()
      } else {
        onAutoPlayHandled?.()
      }
    }
  }, [autoPlay, musicFile, onAutoPlayHandled])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) audio.play(); else audio.pause()
  }, [])

  const handleSeek = (e) => {
    const audio = audioRef.current
    if (!audio) return
    const time = parseFloat(e.target.value)
    audio.currentTime = time
    setCurrentTime(time)
    onSeek?.(time)
  }

  const handleVolume = (e) => {
    const audio = audioRef.current
    if (!audio) return
    const vol = parseFloat(e.target.value)
    audio.volume = vol
    setVolume(vol)
  }

  const formatTime = (t) => {
    const mins = Math.floor(t / 60)
    const secs = Math.floor(t % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleDragStart = (e, index) => {
    dragIndexRef.current = index
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index)
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverIndexRef.current !== index) {
      dragOverIndexRef.current = index
      setDragOverIdx(index)
    }
  }

  const handleDrop = (e, toIndex) => {
    e.preventDefault()
    const fromIndex = dragIndexRef.current
    if (fromIndex !== null && fromIndex !== toIndex) {
      onReorderDisplay?.(fromIndex, toIndex)
    }
    dragIndexRef.current = null
    dragOverIndexRef.current = null
    setDragOverIdx(null)
  }

  const handleDragEnd = () => {
    dragIndexRef.current = null
    dragOverIndexRef.current = null
    setDragOverIdx(null)
  }

  return (
    <div className="music-player">
      <audio ref={audioRef} src={musicFile} preload="auto" />

      <div className="player-options">
        <div className="option-group">
          {displayOrder.map((lang, index) => (
            <button
              key={lang}
              className={`option-btn draggable-btn${displayConfig[lang] ? ' active' : ''}${dragOverIdx === index ? ' drag-over' : ''}`}
              onClick={() => onToggleLang?.(lang)}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              title={`拖拽排序 | 显示/隐藏${LANG_LABELS[lang] || lang}歌词`}
            >
              <span className="drag-handle">⣿</span>
              <span>{LANG_LABELS[lang] || lang}歌词</span>
            </button>
          ))}
        </div>
      </div>

      <div className="player-controls">
        <button className="play-btn" onClick={togglePlay} disabled={!musicFile}>
          {isPlaying ? '⏸' : '▶'}
        </button>

        <div className="time-info">
          <span className="current-time">{formatTime(currentTime)}</span>
          <input
            type="range"
            className="seek-bar"
            min="0"
            max={duration || 0}
            step="0.1"
            value={currentTime}
            onChange={handleSeek}
          />
          <span className="duration">{formatTime(duration)}</span>
        </div>

        <div className="volume-control">
          <span className="volume-icon">🔊</span>
          <input
            type="range"
            className="volume-slider"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleVolume}
          />
        </div>
      </div>
    </div>
  )
})

export default MusicPlayer
