import { useState, useRef, useCallback, useEffect } from 'react'
import './FloatingActionMenu.css'

const DRAG_THRESHOLD = 4
const VIEWPORT_GAP = 12

const ICONS = {
  '▲': '/assets/button_icon/arrow_up.png',
  '▼': '/assets/button_icon/arrow_down.png',
  '⏸': '/assets/button_icon/pause.png',
  '▶': '/assets/button_icon/play.png',
  '🔂': '/assets/button_icon/recycle_open.png',
}

export default function FloatingActionMenu({ items = [] }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ bottom: 96, right: 32 })
  const menuRef = useRef(null)
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startLeft: 0, startTop: 0, width: 0, height: 0, moved: false })

  const clampToViewport = useCallback((left, top, width, height) => {
    const maxLeft = Math.max(VIEWPORT_GAP, window.innerWidth - width - VIEWPORT_GAP)
    const maxTop = Math.max(VIEWPORT_GAP, window.innerHeight - height - VIEWPORT_GAP)
    const nextLeft = Math.min(Math.max(left, VIEWPORT_GAP), maxLeft)
    const nextTop = Math.min(Math.max(top, VIEWPORT_GAP), maxTop)
    return {
      bottom: window.innerHeight - nextTop - height,
      right: window.innerWidth - nextLeft - width,
    }
  }, [])

  useEffect(() => {
    const handleResize = () => {
      const rect = menuRef.current?.getBoundingClientRect()
      if (!rect) return
      setPos(clampToViewport(rect.left, rect.top, rect.width, rect.height))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [clampToViewport])

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const rect = menuRef.current?.getBoundingClientRect()
      if (rect) setPos(clampToViewport(rect.left, rect.top, rect.width, rect.height))
    })
    return () => cancelAnimationFrame(frame)
  }, [open, clampToViewport])

  const handlePointerDown = useCallback((e) => {
    if (e.button && e.button !== 0) return
    const rect = menuRef.current?.getBoundingClientRect()
    if (!rect) return
    const d = dragRef.current
    d.dragging = true
    d.moved = false
    d.startX = e.clientX
    d.startY = e.clientY
    d.startLeft = rect.left
    d.startTop = rect.top
    d.width = rect.width
    d.height = rect.height

    const onMove = (ev) => {
      if (!d.dragging) return
      const dx = ev.clientX - d.startX
      const dy = ev.clientY - d.startY
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) d.moved = true
      setPos(clampToViewport(d.startLeft + dx, d.startTop + dy, d.width, d.height))
    }

    const onUp = () => {
      d.dragging = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [])

  const handleToggle = useCallback(() => {
    if (dragRef.current.moved) return
    setOpen(o => !o)
  }, [])

  return (
    <div ref={menuRef} className={`fab-menu ${open ? 'open' : ''}`} style={{ bottom: pos.bottom, right: pos.right }}>
      {items.map((item, i) => {
        const iconSrc = item.icon === '🔂' && !item.active
          ? '/assets/button_icon/recycle_close.png'
          : ICONS[item.icon]
        return (
          <button
            key={i}
            className={`fab-item${item.active ? ' active' : ''}`}
            title={item.label}
            onClick={(e) => { e.stopPropagation(); item.onClick?.() }}
          >
            {iconSrc ? <img src={iconSrc} alt="" draggable="false" /> : item.icon}
          </button>
        )
      })}
      <button
        className="fab-toggle"
        onPointerDown={handlePointerDown}
        onClick={handleToggle}
      >
        <img
          src={open ? '/assets/button_icon/kanban_A.png' : '/assets/button_icon/kanban_B.png'}
          alt={open ? '收起操作菜单' : '展开操作菜单'}
          draggable="false"
        />
      </button>
    </div>
  )
}
