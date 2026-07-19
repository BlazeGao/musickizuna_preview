import { useRef, useState, useCallback } from 'react'
import { reorderHistory } from '../utils/historyManager'
import NowPlaying from './NowPlaying'
import './Sidebar.css'

export default function Sidebar({
  isOpen,
  onToggle,
  history,
  currentMusicName,
  onSelectEntry,
  onDoubleClickEntry,
  onRemoveEntry,
  onMusicSelect,
  onAddLyricsToEntry,
  onReorder,
}) {
  const musicInputRef = useRef(null)
  const [dragIndex, setDragIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)

  const handleMusicChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      onMusicSelect(file)
    }
    e.target.value = ''
  }

  const handleDragStart = useCallback((e, index) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((e, index) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }, [])

  const handleDrop = useCallback((e, toIndex) => {
    e.preventDefault()
    if (dragIndex !== null && dragIndex !== toIndex) {
      onReorder(dragIndex, toIndex)
    }
    setDragIndex(null)
    setDragOverIndex(null)
  }, [dragIndex, onReorder])

  const handleDragEnd = useCallback(() => {
    setDragIndex(null)
    setDragOverIndex(null)
  }, [])

  return (
    <>
      <div className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2 className="sidebar-title">MusicKizuna</h2>
        </div>

        <div className="sidebar-history">
          <h3 className="history-title">历史播放</h3>
          {history.length === 0 ? (
            <div className="history-empty">暂无历史记录</div>
          ) : (
            <ul className="history-list" onDragEnd={handleDragEnd}>
              {history.map((entry, index) => (
                <NowPlaying
                  key={entry.id}
                  entry={entry}
                  isPlaying={entry.musicName === currentMusicName}
                  onSelect={onSelectEntry}
                  onDoubleClick={onDoubleClickEntry}
                  onRemove={onRemoveEntry}
                  onAddLyrics={onAddLyricsToEntry}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="sidebar-bottom">
          <button
            className="file-select-btn music-btn"
            onClick={() => musicInputRef.current?.click()}
          >
            🎵 选择音乐文件
          </button>
          <input
            ref={musicInputRef}
            type="file"
            accept="audio/*"
            onChange={handleMusicChange}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      <button className={`sidebar-toggle ${isOpen ? 'open' : ''}`} onClick={onToggle}>
        {isOpen ? '‹' : '›'}
      </button>
    </>
  )
}
