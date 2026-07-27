import { useState, useEffect, useRef } from 'react'
import { fetchRomajiFromReading } from '../utils/japanesePhonetics'
import './FuriganaEditPopover.css'

export default function FuriganaEditPopover({ popover, onSave, onRemove, onClose }) {
  const [reading, setReading] = useState(popover.currentReading || '')
  const [romaji, setRomaji] = useState(popover.currentRomaji || '')
  const [scope, setScope] = useState('local')
  const [romajiLoading, setRomajiLoading] = useState(false)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)
  const lastFetchedRef = useRef(popover.currentReading || '')

  useEffect(() => {
    setReading(popover.currentReading || '')
    setRomaji(popover.currentRomaji || '')
    setScope('local')
    lastFetchedRef.current = popover.currentReading || ''
  }, [popover.currentReading, popover.currentRomaji, popover.lineIndex, popover.charIndex])

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [popover.lineIndex, popover.charIndex])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const text = (reading || '').trim()
    if (!text) {
      setRomaji('')
      lastFetchedRef.current = ''
      return
    }
    if (text === lastFetchedRef.current) return
    setRomajiLoading(true)
    debounceRef.current = setTimeout(() => {
      const target = text
      fetchRomajiFromReading(target).then((r) => {
        if (target !== (reading || '').trim()) return
        lastFetchedRef.current = target
        setRomaji(r || '')
        setRomajiLoading(false)
      }).catch(() => {
        setRomajiLoading(false)
      })
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [reading])

  const handleSubmit = (e) => {
    e?.preventDefault?.()
    const trimmed = reading.trim()
    if (!trimmed) return
    onSave(trimmed, romaji, scope, popover.surface)
  }

  const handleReset = () => {
    onRemove(popover.surface)
  }

  return (
    <>
      <div className="furigana-popover-backdrop" onClick={onClose} />
      <div
        className="furigana-popover"
        style={{ top: popover.anchor.top, left: popover.anchor.left }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="furigana-popover-header">
          <span className="furigana-popover-title">修改读音</span>
          <button className="furigana-popover-close" onClick={onClose} title="关闭">×</button>
        </div>

        <div className="furigana-popover-body">
          <div className="furigana-popover-row">
            <span className="furigana-popover-label">汉字:</span>
            <span className="furigana-popover-surface">{popover.surface}</span>
          </div>

          <div className="furigana-popover-row">
            <span className="furigana-popover-label">位置:</span>
            <span className="furigana-popover-pos">
              第 {popover.lineIndex + 1} 行 第 {popover.charIndex + 1} 字
            </span>
          </div>

          <div className="furigana-popover-row">
            <span className="furigana-popover-label">
              {popover.isOverridden ? '当前读音(已修改):' : '当前读音:'}
            </span>
          </div>

          <form onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              className="furigana-popover-input"
              type="text"
              value={reading}
              onChange={(e) => setReading(e.target.value)}
              placeholder="输入读音 (假名)"
              autoComplete="off"
              spellCheck={false}
            />

            <div className="furigana-popover-row furigana-popover-row-romaji">
              <span className="furigana-popover-label">罗马音:</span>
              <span className={`furigana-popover-romaji${romajiLoading ? ' loading' : ''}`}>
                {romaji || (romajiLoading ? '生成中…' : '—')}
              </span>
            </div>

            <div className="furigana-popover-scope">
              <label className={`furigana-scope-option ${scope === 'local' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="furigana-scope"
                  value="local"
                  checked={scope === 'local'}
                  onChange={() => setScope('local')}
                />
                <span>仅本处</span>
              </label>
              <label className={`furigana-scope-option ${scope === 'all' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="furigana-scope"
                  value="all"
                  checked={scope === 'all'}
                  onChange={() => setScope('all')}
                />
                <span>整首歌所有 &ldquo;{popover.surface}&rdquo;</span>
              </label>
            </div>

            <div className="furigana-popover-actions">
              {popover.isOverridden && (
                <button
                  type="button"
                  className="furigana-popover-btn furigana-popover-btn-ghost"
                  onClick={handleReset}
                >
                  重置
                </button>
              )}
              <div className="furigana-popover-actions-right">
                <button
                  type="button"
                  className="furigana-popover-btn furigana-popover-btn-secondary"
                  onClick={onClose}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="furigana-popover-btn furigana-popover-btn-primary"
                  disabled={!reading.trim()}
                >
                  保存
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
