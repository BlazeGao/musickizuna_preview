import { useEffect, useRef, useState, useMemo } from 'react'
import { buildRubySegments } from '../utils/phoneticDict'
import './FuriganaExportModal.css'

function renderFuriganaLine(text, tokens, lineIndex, overrides) {
  const segments = buildRubySegments(text, tokens, lineIndex, overrides)
  return segments.map((seg, i) => {
    if (seg.type === 'ruby') {
      return (
        <ruby key={i} className={seg.isOverridden ? 'overridden' : ''}>
          {seg.value}<rt>{seg.reading}</rt>
        </ruby>
      )
    }
    return <span key={i}>{seg.value}</span>
  })
}

export default function FuriganaExportModal({ open, filename, lrcText, lineCount, jaLyrics, furiganaTokens, furiganaOverrides, onDownload, onClose }) {
  const textareaRef = useRef(null)
  const furiganaRef = useRef(null)
  const [view, setView] = useState('lrc')

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.scrollTop = 0
    }
    if (open) {
      setView('lrc')
    }
  }, [open])

  useEffect(() => {
    if (open && view === 'furigana' && furiganaRef.current) {
      furiganaRef.current.scrollTop = 0
    }
  }, [open, view])

  const furiganaLines = useMemo(() => {
    if (!jaLyrics || jaLyrics.length === 0) return []
    return jaLyrics.map((line, idx) => ({
      key: idx,
      content: renderFuriganaLine(line.text, furiganaTokens?.[idx] || [], idx, furiganaOverrides || {}),
    }))
  }, [jaLyrics, furiganaTokens, furiganaOverrides])

  if (!open) return null

  const handleDownloadClick = () => {
    onDownload?.(view)
  }

  return (
    <div className="furigana-export-overlay" onClick={onClose}>
      <div
        className="furigana-export-modal"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="furigana-export-header">
          <div className="furigana-export-title-block">
            <span className="furigana-export-title">歌词预览</span>
            <span className="furigana-export-filename">{filename}</span>
          </div>
          <button className="furigana-export-close" onClick={onClose} title="关闭">×</button>
        </div>

        <div className="furigana-export-stats">
          共 <strong>{lineCount}</strong> 行 · 共 <strong>{lrcText.length}</strong> 字符
        </div>

        {view === 'lrc' ? (
          <textarea
            ref={textareaRef}
            className="furigana-export-textarea"
            value={lrcText}
            readOnly
            spellCheck={false}
            onClick={(e) => e.target.select()}
          />
        ) : (
          <div ref={furiganaRef} className="furigana-view-content">
            {furiganaLines.map((line) => (
              <div key={line.key} className="furigana-view-line">
                {line.content}
              </div>
            ))}
          </div>
        )}

        <div className="furigana-export-actions">
          <div className="furigana-view-toggle" role="tablist">
            <button
              className={`furigana-view-toggle-btn${view === 'lrc' ? ' active' : ''}`}
              onClick={() => setView('lrc')}
              role="tab"
              aria-selected={view === 'lrc'}
              type="button"
            >
              <span className="furigana-view-toggle-icon">📝</span>
              <span>LRC 视图</span>
            </button>
            <button
              className={`furigana-view-toggle-btn${view === 'furigana' ? ' active' : ''}`}
              onClick={() => setView('furigana')}
              role="tab"
              aria-selected={view === 'furigana'}
              type="button"
            >
              <span className="furigana-view-toggle-icon">あ</span>
              <span>振假名视图</span>
            </button>
          </div>
          <div className="furigana-export-actions-right">
            <button
              className="furigana-export-btn furigana-export-btn-secondary"
              onClick={onClose}
            >
              取消
            </button>
            <button
              className="furigana-export-btn furigana-export-btn-primary"
              onClick={handleDownloadClick}
              disabled={!lrcText}
            >
              <span>📥</span>
              <span>{view === 'lrc' ? '下载' : '下载 PDF'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
