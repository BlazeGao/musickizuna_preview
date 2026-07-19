import { useRef } from 'react'
import './NowPlaying.css'

export default function NowPlaying({
  entry,
  isPlaying,
  onSelect,
  onDoubleClick,
  onRemove,
  onAddLyrics,
  onDragStart,
  onDragOver,
  onDrop,
}) {
  const lyricsInputRef = useRef(null)

  const handleLyricsChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      onAddLyrics(entry, file)
    }
    e.target.value = ''
  }

  return (
    <li
      className={`now-playing-item ${isPlaying ? 'playing' : ''}`}
      draggable
      onDragStart={(e) => onDragStart(e)}
      onDragOver={(e) => onDragOver(e)}
      onDrop={(e) => onDrop(e)}
    >
      <div
        className="now-playing-card"
        onClick={() => onSelect(entry)}
        onDoubleClick={() => onDoubleClick(entry)}
      >
        <div className="now-playing-header">
          {isPlaying && <span className="playing-indicator" />}
          <span className="now-playing-music">{entry.musicName}</span>
        </div>

        {entry.lyricsName ? (
          <span className="now-playing-lyrics">{entry.lyricsName}</span>
        ) : (
          <button
            className="now-playing-add-btn"
            onClick={(e) => {
              e.stopPropagation()
              lyricsInputRef.current?.click()
            }}
          >
            + 添加歌词
          </button>
        )}

        <input
          ref={lyricsInputRef}
          type="file"
          accept=".txt,.lrc"
          onChange={handleLyricsChange}
          style={{ display: 'none' }}
        />
      </div>

      <button
        className="now-playing-remove"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(entry.id)
        }}
      >
        ×
      </button>
    </li>
  )
}
