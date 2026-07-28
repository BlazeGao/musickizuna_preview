import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import './MusicPlayer.css'

const SPEED_OPTIONS = [1.2, 1, 0.8, 0.5]

const MusicPlayer = forwardRef(function MusicPlayer({
  musicFile,
  onTimeUpdate,
  autoPlay,
  onAutoPlayHandled,
  onPlayingChange,
  onSeek,
}, ref) {
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const speedMenuRef = useRef(null)

  const onTimeUpdateRef = useRef(onTimeUpdate)
  const onPlayingChangeRef = useRef(onPlayingChange)
  useEffect(() => { onTimeUpdateRef.current = onTimeUpdate }, [onTimeUpdate])
  useEffect(() => { onPlayingChangeRef.current = onPlayingChange }, [onPlayingChange])

  const syncPlaying = useCallback((val) => {
    setIsPlaying(val)
    onPlayingChangeRef.current?.(val)
  }, [])

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
      const apply = () => {
        try {
          audio.currentTime = time
          setCurrentTime(time)
        } catch {}
      }
      if (audio.readyState >= 1) {
        apply()
      } else {
        const onReady = () => {
          audio.removeEventListener('loadedmetadata', onReady)
          apply()
        }
        audio.addEventListener('loadedmetadata', onReady)
      }
    },
    get isPlaying() { return !audioRef.current?.paused },
    get currentTime() { return audioRef.current?.currentTime ?? 0 },
    get playbackRate() { return audioRef.current?.playbackRate ?? 1 },
  }))

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
      onTimeUpdateRef.current?.(audio.currentTime)
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
  }, [musicFile, syncPlaying])

  useEffect(() => {
    const audio = audioRef.current
    if (audio && musicFile) {
      audio.load()
      syncPlaying(false)
      setCurrentTime(0)
    }
  }, [musicFile, syncPlaying])

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
  }, [autoPlay, musicFile, onAutoPlayHandled, syncPlaying])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) audio.play(); else audio.pause()
  }, [])

  const handleSeek = useCallback((e) => {
    const audio = audioRef.current
    if (!audio) return
    const time = parseFloat(e.target.value)
    if (audio.readyState >= 1) {
      try { audio.currentTime = time } catch {}
    }
    setCurrentTime(time)
    onSeek?.(time)
  }, [onSeek])

  const handleVolume = useCallback((e) => {
    const audio = audioRef.current
    if (!audio) return
    const vol = parseFloat(e.target.value)
    audio.volume = vol
    setVolume(vol)
  }, [])

  const handlePlaybackRate = useCallback((rate) => {
    const audio = audioRef.current
    if (audio) audio.playbackRate = rate
    setPlaybackRate(rate)
    setShowSpeedMenu(false)
  }, [])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target)) {
        setShowSpeedMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const formatTime = (t) => {
    const mins = Math.floor(t / 60)
    const secs = Math.floor(t % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="music-player">
      <audio ref={audioRef} src={musicFile} preload="auto" />
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

        <div className="speed-control" ref={speedMenuRef}>
          <button
            className={`speed-btn${playbackRate !== 1 ? ' active' : ''}`}
            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
            title="播放倍速"
          >
            {playbackRate}x
          </button>
          {showSpeedMenu && (
            <div className="speed-menu">
              {SPEED_OPTIONS.map((rate) => (
                <button
                  key={rate}
                  className={`speed-option${playbackRate === rate ? ' selected' : ''}`}
                  onClick={() => handlePlaybackRate(rate)}
                >
                  {rate}x
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

export default MusicPlayer