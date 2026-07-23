import { useState, useRef, useCallback, memo } from 'react'
import './MusicPlayer.css'

const LANG_LABELS = {
  en: '英文歌词',
  zh: '中文歌词',
  yue: '粤拼歌词',
  ja: '日文歌词',
}

function WorkspaceControls({ activeLang, settings, onToggleSetting, onReorderLyrics }) {
  const dragIndexRef = useRef(null)
  const dragOverIndexRef = useRef(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)

  const handleDragStart = useCallback((e, index) => {
    dragIndexRef.current = index
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }, [])

  const handleDragOver = useCallback((e, index) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverIndexRef.current !== index) {
      dragOverIndexRef.current = index
      setDragOverIdx(index)
    }
  }, [])

  const handleDrop = useCallback((e, toIndex) => {
    e.preventDefault()
    const fromIndex = dragIndexRef.current
    if (fromIndex !== null && fromIndex !== toIndex) {
      onReorderLyrics?.(activeLang, fromIndex, toIndex)
    }
    dragIndexRef.current = null
    dragOverIndexRef.current = null
    setDragOverIdx(null)
  }, [activeLang, onReorderLyrics])

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null
    dragOverIndexRef.current = null
    setDragOverIdx(null)
  }, [])

  const renderOrderGroup = (order) => (
    <div className="order-group">
      <span className="order-label">显示顺序:</span>
      {order.map((lang, index) => (
        <button
          key={`${lang}-${index}`}
          className={`order-btn draggable-btn${dragOverIdx === index ? ' drag-over' : ''}`}
          draggable
          onDragStart={(e) => handleDragStart(e, index)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDrop={(e) => handleDrop(e, index)}
          onDragEnd={handleDragEnd}
          title="拖拽调整歌词行顺序"
        >
          <span className="drag-handle">⣿</span>
          <span>{LANG_LABELS[lang] || lang}</span>
        </button>
      ))}
    </div>
  )

  if (activeLang === 'zh') {
    return (
      <div className="workspace-controls zh-controls">
        <button
          className={`toggle-btn${settings.zh.showPinyin ? ' active' : ''}`}
          onClick={() => onToggleSetting('zh', 'showPinyin')}
          title="显示/隐藏普通话拼音标注"
        >
          显示拼音
        </button>
      </div>
    )
  }

  if (activeLang === 'en') {
    return (
      <div className="workspace-controls en-controls">
        <div className="toggle-group">
          <button
            className={`toggle-btn${settings.en.showChinese ? ' active' : ''}`}
            onClick={() => onToggleSetting('en', 'showChinese')}
            title="显示/隐藏中文歌词"
          >
            中文歌词
          </button>
          <button
            className={`toggle-btn${settings.en.showEnglish ? ' active' : ''}`}
            onClick={() => onToggleSetting('en', 'showEnglish')}
            title="显示/隐藏英文歌词"
          >
            英文歌词
          </button>
        </div>
        {renderOrderGroup(settings.en.lyricsOrder)}
      </div>
    )
  }

  if (activeLang === 'yue') {
    return (
      <div className="workspace-controls yue-controls">
        <button
          className={`toggle-btn${settings.yue.showJyutping ? ' active' : ''}`}
          onClick={() => onToggleSetting('yue', 'showJyutping')}
          title="显示/隐藏粤拼标注"
        >
          显示粤拼
        </button>
        {renderOrderGroup(settings.yue.lyricsOrder)}
      </div>
    )
  }

  if (activeLang === 'ja') {
    return (
      <div className="workspace-controls ja-controls">
        <div className="toggle-group">
          <button
            className={`toggle-btn${settings.ja.showJapanese ? ' active' : ''}`}
            onClick={() => onToggleSetting('ja', 'showJapanese')}
            title="显示/隐藏日文歌词"
          >
            日文歌词
          </button>
          <button
            className={`toggle-btn${settings.ja.showChinese ? ' active' : ''}`}
            onClick={() => onToggleSetting('ja', 'showChinese')}
            title="显示/隐藏中文翻译"
          >
            中文翻译
          </button>
        </div>
        {renderOrderGroup(settings.ja.lyricsOrder)}
      </div>
    )
  }

  return null
}

export default memo(WorkspaceControls)