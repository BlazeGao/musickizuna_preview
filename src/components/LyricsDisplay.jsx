import { useEffect, useRef } from 'react'
import './LyricsDisplay.css'

export default function LyricsDisplay({ lyricsMap, displayConfig, displayOrder, currentIndex }) {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || currentIndex < 0) return

    const activeLine = container.querySelector('.lyric-line.active, .lyric-line-group.active')
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

  const hasAnyLyrics = Object.keys(lyricsMap).some((lang) => lyricsMap[lang]?.length > 0)

  if (!hasAnyLyrics) {
    return (
      <div className="lyrics-display">
        <div className="lyrics-empty">请在侧边栏选择歌词文件</div>
      </div>
    )
  }

  const enabledLangs = displayOrder.filter(l => displayConfig[l])

  if (enabledLangs.length > 1) {
    const primaryLang = enabledLangs[0]
    const secondaryLang = enabledLangs[1]
    const primaryLyrics = lyricsMap[primaryLang] || []
    const secondaryLyrics = lyricsMap[secondaryLang] || []
    const hasBoth = primaryLyrics.length > 0 && secondaryLyrics.length > 0

    if (!hasBoth) {
      const lyrics = primaryLyrics.length > 0 ? primaryLyrics : secondaryLyrics
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

    return (
      <div className="lyrics-display" ref={containerRef}>
        <div className="lyrics-content">
          {primaryLyrics.map((line, index) => (
            <div
              key={index}
              className={`lyric-line-group ${index === currentIndex ? 'active' : ''}`}
            >
              <div className="lyric-sub-line">
                <span className="lyric-text">{line.text}</span>
              </div>
              <div className="lyric-sub-line">
                <span className="lyric-text">{secondaryLyrics[index]?.text || ''}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const activeLang = enabledLangs[0] || 'zh'
  const lyrics = lyricsMap[activeLang] || []

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
