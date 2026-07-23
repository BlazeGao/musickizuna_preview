import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchPhonetic } from '../utils/phoneticDict'
import { readLyric, stopCurrentAudio } from '../utils/cantoneseTTS'
import './LyricsDisplay.css'

function tokenize(text) {
  const tokens = []
  const re = /([A-Za-z']+)/g
  let lastIndex = 0
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      tokens.push({ type: 'sep', value: text.slice(lastIndex, m.index) })
    }
    tokens.push({ type: 'word', value: m[1] })
    lastIndex = re.lastIndex
  }
  if (lastIndex < text.length) {
    tokens.push({ type: 'sep', value: text.slice(lastIndex) })
  }
  return tokens
}

export default function LyricsDisplay({ lyricsMap, displayConfig, displayOrder, currentIndex, onSeek, activeLang, onPauseMusic, onResumeMusic }) {
  const containerRef = useRef(null)
  const [selectedWords, setSelectedWords] = useState(new Map())
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const [ttsLoading, setTtsLoading] = useState(null)

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

  useEffect(() => {
    setSelectedWords(new Map())
  }, [lyricsMap])

  const handleWordDoubleClick = useCallback((word) => {
    const key = word.toLowerCase()
    setSelectedWords(prev => {
      const next = new Map(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.set(key, null)
        fetchPhonetic(key).then(ipa => {
          if (ipa) {
            setSelectedWords(p => {
              const n = new Map(p)
              n.set(key, ipa)
              return n
            })
          }
        })
      }
      return next
    })
  }, [])

  const handleReadLyric = useCallback(async (text, playbackRate = 1) => {
    setTtsLoading(true)
    const wasPlaying = onPauseMusic ? onPauseMusic() : false
    try {
      await readLyric(text, playbackRate)
    } catch (err) {
      console.error('TTS error:', err)
    } finally {
      setTtsLoading(false)
      if (wasPlaying && onResumeMusic) onResumeMusic()
    }
  }, [onPauseMusic, onResumeMusic])

  const handleStopTTS = useCallback(() => {
    stopCurrentAudio()
    setTtsLoading(false)
  }, [])

  const renderTTSButtons = (lineIndex, text) => {
    if (activeLang !== 'yue') return null
    if (hoveredIndex !== lineIndex) return null

    return (
      <span className="tts-btn-group">
        {ttsLoading ? (
          <button className="tts-btn tts-btn-loading" onClick={handleStopTTS} title="停止朗读">
            停止
          </button>
        ) : (
          <>
            <button className="tts-btn" onClick={() => handleReadLyric(text, 1)} title="朗读">
              朗读
            </button>
            <button className="tts-btn" onClick={() => handleReadLyric(text, 0.8)} title="慢速朗读">
              慢速朗读
            </button>
          </>
        )}
      </span>
    )
  }

  const renderLineText = (text) => {
    const tokens = tokenize(text)
    return tokens.map((token, i) => {
      if (token.type === 'sep') return <span key={i}>{token.value}</span>
      const key = token.value.toLowerCase()
      const phonetic = selectedWords.get(key)
      const onDblClick = () => handleWordDoubleClick(token.value)
      if (phonetic) {
        return (
          <ruby key={i} className="lyric-word annotated" onDoubleClick={onDblClick}>
            {token.value}<rt>{phonetic}</rt>
          </ruby>
        )
      }
      return (
        <span key={i} className="lyric-word" onDoubleClick={onDblClick}>
          {token.value}
        </span>
      )
    })
  }

  const hasAnyLyrics = Object.keys(lyricsMap).some((lang) => lyricsMap[lang]?.length > 0)

  if (!hasAnyLyrics) {
    return (
      <div className="lyrics-display">
        <div className="lyrics-empty">请在侧边栏选择歌词文件</div>
      </div>
    )
  }

  const enabledLangs = displayOrder.filter(l => displayConfig[l])
  const hasJyutping = enabledLangs.includes('yue')

  if (hasJyutping) {
    const zhLyrics = lyricsMap.zh || []
    const jyutpingLyrics = lyricsMap.yue || []
    const enLyrics = enabledLangs.includes('en') ? (lyricsMap.en || []) : []
    const hasZh = zhLyrics.length > 0
    const hasJp = jyutpingLyrics.length > 0

    if (!hasZh && !hasJp) {
      const fallback = enLyrics.length > 0 ? enLyrics : zhLyrics
      if (fallback.length === 0) {
        return (
          <div className="lyrics-display" ref={containerRef}>
            <div className="lyrics-empty">请在侧边栏选择歌词文件</div>
          </div>
        )
      }
      return (
        <div className="lyrics-display" ref={containerRef}>
          <div className="lyrics-content">
            {fallback.map((line, index) => (
              <div
                key={index}
                className={`lyric-line ${index === currentIndex ? 'active' : ''}`}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <span className="lyric-line-inner">
                  {onSeek && index !== currentIndex && (
                    <button className="lyric-seek-btn" onClick={() => onSeek(index)} title="跳转到此句">▶</button>
                  )}
                  <span className="lyric-text">{renderLineText(line.text)}</span>
                  {renderTTSButtons(index, line.text)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )
    }

    return (
      <div className="lyrics-display" ref={containerRef}>
        <div className="lyrics-content">
          {zhLyrics.map((line, index) => (
            <div
              key={index}
              className={`lyric-line-group ${index === currentIndex ? 'active' : ''}`}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <span className="lyric-line-inner">
                {onSeek && index !== currentIndex && (
                  <button className="lyric-seek-btn" onClick={() => onSeek(index)} title="跳转到此句">▶</button>
                )}
                <span className="lyric-group-lines">
                  <div className="lyric-sub-line">
                    <span className="lyric-text">{renderLineText(line.text)}</span>
                  </div>
                  {hasJp && (
                    <div className="lyric-sub-line jyutping-line">
                      <span className="lyric-text">{jyutpingLyrics[index]?.text || ''}</span>
                    </div>
                  )}
                  {enLyrics.length > 0 && (
                    <div className="lyric-sub-line">
                      <span className="lyric-text">{enLyrics[index]?.text || ''}</span>
                    </div>
                  )}
                </span>
                {renderTTSButtons(index, line.text)}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

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
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <span className="lyric-line-inner">
                  {onSeek && index !== currentIndex && (
                    <button className="lyric-seek-btn" onClick={() => onSeek(index)} title="跳转到此句">▶</button>
                  )}
                  <span className="lyric-text">{renderLineText(line.text)}</span>
                  {renderTTSButtons(index, line.text)}
                </span>
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
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <span className="lyric-line-inner">
                {onSeek && index !== currentIndex && (
                  <button className="lyric-seek-btn" onClick={() => onSeek(index)} title="跳转到此句">▶</button>
                )}
                <span className="lyric-group-lines">
                  <div className="lyric-sub-line">
                    <span className="lyric-text">{renderLineText(line.text)}</span>
                  </div>
                  <div className="lyric-sub-line">
                    <span className="lyric-text">{secondaryLyrics[index]?.text || ''}</span>
                  </div>
                </span>
                {renderTTSButtons(index, line.text)}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const singleLang = enabledLangs[0] || 'zh'
  const lyrics = lyricsMap[singleLang] || []

  return (
    <div className="lyrics-display" ref={containerRef}>
      <div className="lyrics-content">
        {lyrics.map((line, index) => (
          <div
            key={index}
            className={`lyric-line ${index === currentIndex ? 'active' : ''}`}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <span className="lyric-line-inner">
              {onSeek && index !== currentIndex && (
                <button className="lyric-seek-btn" onClick={() => onSeek(index)} title="跳转到此句">▶</button>
              )}
              <span className="lyric-text">{renderLineText(line.text)}</span>
              {renderTTSButtons(index, line.text)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
