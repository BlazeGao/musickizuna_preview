import { useEffect, useRef } from 'react'
import './LyricsDisplay.css'

export default function LyricsDisplay({ lyrics, currentIndex }) {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || currentIndex < 0) return

    const activeLine = container.querySelector('.lyric-line.active')
    if (activeLine) {
      const containerHeight = container.clientHeight
      const lineTop = activeLine.offsetTop
      const lineHeight = activeLine.offsetHeight
      const scrollTo = lineTop - containerHeight / 2 + lineHeight / 2
      container.scrollTo({
        top: scrollTo,
        behavior: 'smooth',
      })
    }
  }, [currentIndex])

  if (!lyrics || lyrics.length === 0) {
    return (
      <div className="lyrics-display">
        <div className="lyrics-empty">请在侧边栏选择歌词文件</div>
      </div>
    )
  }

  return (
    <div className="lyrics-display" ref={containerRef}>
      <div className="lyrics-content">
        {lyrics.map((line, index) => (
          <div
            key={index}
            className={`lyric-line ${index === currentIndex ? 'active' : ''}`}
          >
            {line.text}
          </div>
        ))}
      </div>
    </div>
  )
}
