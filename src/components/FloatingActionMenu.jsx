import { useState, useRef, useCallback } from 'react'
import './FloatingActionMenu.css'

const DRAG_THRESHOLD = 4

const ChevronUp = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="18 15 12 9 6 15" />
  </svg>
)

const ChevronDown = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

const RepeatOneIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 5h14a4 4 0 0 1 0 8h-1" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 19H7a4 4 0 0 1 0-8h1" />
    <text x="12" y="14.5" textAnchor="middle" fill="currentColor" stroke="none" fontSize="8" fontWeight="700" fontFamily="sans-serif">1</text>
  </svg>
)

const PlayIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="6 3 20 12 6 21" />
  </svg>
)

const PauseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <rect x="5" y="3" width="4" height="18" rx="1" />
    <rect x="15" y="3" width="4" height="18" rx="1" />
  </svg>
)

const ICONS = { '▲': ChevronUp, '▼': ChevronDown, '⏸': PauseIcon, '▶': PlayIcon, '🔂': RepeatOneIcon }

export default function FloatingActionMenu({ items = [] }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ bottom: 32, right: 32 })
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startBottom: 0, startRight: 0, moved: false })

  const handlePointerDown = useCallback((e) => {
    if (e.button && e.button !== 0) return
    const d = dragRef.current
    d.dragging = true
    d.moved = false
    d.startX = e.clientX
    d.startY = e.clientY
    d.startBottom = pos.bottom
    d.startRight = pos.right

    const onMove = (ev) => {
      if (!d.dragging) return
      const dx = ev.clientX - d.startX
      const dy = d.startY - ev.clientY
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) d.moved = true
      setPos({ bottom: Math.max(0, d.startBottom + dy), right: Math.max(0, d.startRight - dx) })
    }

    const onUp = () => {
      d.dragging = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [pos])

  const handleToggle = useCallback(() => {
    if (dragRef.current.moved) return
    setOpen(o => !o)
  }, [])

  return (
    <div className={`fab-menu ${open ? 'open' : ''}`} style={{ bottom: pos.bottom, right: pos.right }}>
      {items.map((item, i) => {
        const Icon = ICONS[item.icon]
        return (
          <button
            key={i}
            className={`fab-item${item.active ? ' active' : ''}`}
            title={item.label}
            onClick={(e) => { e.stopPropagation(); item.onClick?.() }}
          >
            {Icon ? <Icon /> : item.icon}
          </button>
        )
      })}
      <button
        className="fab-toggle"
        onPointerDown={handlePointerDown}
        onClick={handleToggle}
      >
        {open ? '×' : '+'}
      </button>
    </div>
  )
}
