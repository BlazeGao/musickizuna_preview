import { useRef, useState, useCallback } from 'react'
import { LANG_LABELS, SUPPORTED_LANGS } from '../utils/historyManager'
import NowPlaying from './NowPlaying'
import './Sidebar.css'

export default function Sidebar({
  isOpen,
  onToggle,
  history,
  currentMusicName,
  activeLang,
  onSwitchLang,
  onSelectEntry,
  onDoubleClickEntry,
  onRemoveEntry,
  onMusicSelect,
  onAddLyricsToEntry,
  onRemoveLyricsFromEntry,
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
    if (history[index]?.isBuiltin) {
      e.preventDefault()
      return
    }
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }, [history])

  const handleDragOver = useCallback((e, index) => {
    // Don't allow dropping onto a built-in (built-ins are pinned at the top).
    if (history[index]?.isBuiltin) {
      e.dataTransfer.dropEffect = 'none'
      return
    }
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }, [history])

  const handleDrop = useCallback((e, toIndex) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === toIndex) {
      setDragIndex(null)
      setDragOverIndex(null)
      return
    }
    if (history[toIndex]?.isBuiltin || history[dragIndex]?.isBuiltin) {
      setDragIndex(null)
      setDragOverIndex(null)
      return
    }
    onReorder(dragIndex, toIndex)
    setDragIndex(null)
    setDragOverIndex(null)
  }, [dragIndex, history, onReorder])

  const handleDragEnd = useCallback(() => {
    setDragIndex(null)
    setDragOverIndex(null)
  }, [])

  return (
    <>
      <div className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2 className="sidebar-title">MusicKizuna</h2>
          <div className="lang-switcher">
            {SUPPORTED_LANGS.map((lang) => (
              <button
                key={lang}
                className={`lang-btn ${activeLang === lang ? 'active' : ''}`}
                onClick={() => onSwitchLang(lang)}
              >
                {LANG_LABELS[lang] || lang}
              </button>
            ))}
          </div>
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
                  activeLang={activeLang}
                  onSelect={onSelectEntry}
                  onDoubleClick={onDoubleClickEntry}
                  onRemove={onRemoveEntry}
                  onAddLyrics={onAddLyricsToEntry}
                  onRemoveLyrics={onRemoveLyricsFromEntry}
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
