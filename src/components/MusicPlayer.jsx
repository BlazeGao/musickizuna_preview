import { useState, useRef, useEffect, useCallback } from 'react'
import './MusicPlayer.css'

export default function MusicPlayer({ musicFile, onTimeUpdate, autoPlay, onAutoPlayHandled }) {
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
      onTimeUpdate?.(audio.currentTime)
    }
    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
    }
    const handleEnded = () => {
      setIsPlaying(false)
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [musicFile, onTimeUpdate])

  useEffect(() => {
    const audio = audioRef.current
    if (audio && musicFile) {
      audio.load()
      setIsPlaying(false)
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
            setIsPlaying(true)
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
    if (isPlaying) {
      audio.pause()
    } else {
      audio.play()
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying])

  const handleSeek = (e) => {
    const audio = audioRef.current
    if (!audio) return
    const time = parseFloat(e.target.value)
    audio.currentTime = time
    setCurrentTime(time)
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
      </div>
    </div>
  )
}
