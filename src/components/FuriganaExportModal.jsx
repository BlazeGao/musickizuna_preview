import { useEffect, useRef, useState, useMemo } from 'react'
import { buildRubySegments } from '../utils/japanesePhonetics'
import { THEME_PRESETS, FONT_COLORS, RUBY_COLORS, DEFAULT_THEME } from '../utils/themePresets'
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
  const [themeKey, setThemeKey] = useState(DEFAULT_THEME)
  const [fontColor, setFontColor] = useState(THEME_PRESETS[DEFAULT_THEME].fontDefault)
  const [rubyColor, setRubyColor] = useState(THEME_PRESETS[DEFAULT_THEME].rubyDefault)

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
      const t = THEME_PRESETS[DEFAULT_THEME]
      setThemeKey(DEFAULT_THEME)
      setFontColor(t.fontDefault)
      setRubyColor(t.rubyDefault)
    }
  }, [open])

  useEffect(() => {
    if (open && view === 'furigana' && furiganaRef.current) {
      furiganaRef.current.scrollTop = 0
    }
  }, [open, view])

  const handleSelectTheme = (key) => {
    setThemeKey(key)
    const t = THEME_PRESETS[key]
    setFontColor(t.fontDefault)
    setRubyColor(t.rubyDefault)
  }

  const handleResetStyle = () => {
    const t = THEME_PRESETS[DEFAULT_THEME]
    setThemeKey(DEFAULT_THEME)
    setFontColor(t.fontDefault)
    setRubyColor(t.rubyDefault)
  }

  const furiganaLines = useMemo(() => {
    if (!jaLyrics || jaLyrics.length === 0) return []
    return jaLyrics.map((line, idx) => ({
      key: idx,
      content: renderFuriganaLine(line.text, furiganaTokens?.[idx] || [], idx, furiganaOverrides || {}),
    }))
  }, [jaLyrics, furiganaTokens, furiganaOverrides])

  if (!open) return null

  const theme = THEME_PRESETS[themeKey]
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
          <>
            <div className="furigana-style-bar">
              <div className="furigana-style-row">
                <span className="furigana-style-label">背景</span>
                <div className="furigana-style-swatches">
                  {Object.entries(THEME_PRESETS).map(([key, t]) => (
                    <button
                      key={key}
                      className={`furigana-bg-swatch${themeKey === key ? ' active' : ''}`}
                      style={{ background: t.bg, color: t.ruby, borderColor: t.ruby }}
                      onClick={() => handleSelectTheme(key)}
                      title={`${t.label} · ${t.desc}`}
                      type="button"
                    >
                      <span className="furigana-bg-swatch-char" style={{ color: t.fontDefault }}>あ</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="furigana-style-row">
                <span className="furigana-style-label">歌词</span>
                <div className="furigana-style-swatches">
                  {FONT_COLORS.map((c) => (
                    <button
                      key={c.value}
                      className={`furigana-color-swatch${fontColor === c.value ? ' active' : ''}`}
                      style={{ background: c.value }}
                      onClick={() => setFontColor(c.value)}
                      title={c.label}
                      type="button"
                    />
                  ))}
                </div>
              </div>
              <div className="furigana-style-row">
                <span className="furigana-style-label">振假名</span>
                <div className="furigana-style-swatches">
                  {RUBY_COLORS.map((c) => (
                    <button
                      key={c.value}
                      className={`furigana-color-swatch${rubyColor === c.value ? ' active' : ''}`}
                      style={{ background: c.value }}
                      onClick={() => setRubyColor(c.value)}
                      title={c.label}
                      type="button"
                    />
                  ))}
                </div>
              </div>
            </div>
            <div
              ref={furiganaRef}
              className="furigana-view-content"
              style={{
                backgroundColor: theme.bg,
                color: fontColor,
                '--furigana-ruby': rubyColor,
              }}
            >
              {furiganaLines.map((line) => (
                <div key={line.key} className="furigana-view-line">
                  {line.content}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="furigana-export-actions">
          {view === 'furigana' ? (
            <button
              className="furigana-style-reset"
              onClick={handleResetStyle}
              type="button"
              title="恢复默认样式"
            >
              ↺ 重置
            </button>
          ) : (
            <span />
          )}
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
