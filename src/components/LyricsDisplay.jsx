import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { fetchPhonetic } from '../utils/phoneticDict'
import { readLyric, stopCurrentAudio } from '../utils/tts'
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

const lineKey = (line, index) => `${line?.time ?? 0}-${index}`

const LyricLine = memo(function LyricLine({ line, index, isActive, ttsLang, onHover, onLeave, onSeek, onReadLyric, onStopTTS, ttsLoading, renderLineText, showTts, seekEnabled }) {
  return (
    <div
      className={`lyric-line ${isActive ? 'active' : ''}`}
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onLeave()}
    >
      <span className="lyric-line-inner">
        {seekEnabled && onSeek && !isActive && (
          <button className="lyric-seek-btn" onClick={() => onSeek(index)} title="跳转到此句">▶</button>
        )}
        <span className="lyric-text">{renderLineText(line.text)}</span>
        {showTts && renderTTSButtons(index, line.text, ttsLoading, onReadLyric, onStopTTS)}
      </span>
    </div>
  )
})

const LyricLineGroup = memo(function LyricLineGroup({ line, index, isActive, onHover, onLeave, onSeek, seekEnabled, subLines, showTts, ttsText, onReadLyric, onStopTTS, ttsLoading }) {
  return (
    <div
      className={`lyric-line-group ${isActive ? 'active' : ''}`}
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onLeave()}
    >
      <span className="lyric-line-inner">
        {seekEnabled && onSeek && !isActive && (
          <button className="lyric-seek-btn" onClick={() => onSeek(index)} title="跳转到此句">▶</button>
        )}
        <span className="lyric-group-lines">
          {subLines.map((s, i) => (
            <div key={i} className={`lyric-sub-line ${s.className || ''}`}>
              <span className="lyric-text">{s.content}</span>
            </div>
          ))}
        </span>
        {showTts && renderTTSButtons(index, ttsText, ttsLoading, onReadLyric, onStopTTS)}
      </span>
    </div>
  )
})

function renderTTSButtons(lineIndex, text, ttsLoading, onReadLyric, onStopTTS) {
  return (
    <span className="tts-btn-group">
      {ttsLoading ? (
        <button className="tts-btn tts-btn-loading" onClick={onStopTTS} title="停止朗读">
          停止
        </button>
      ) : (
        <>
          <button className="tts-btn" onClick={() => onReadLyric(text, 1)} title="朗读">
            朗读
          </button>
          <button className="tts-btn" onClick={() => onReadLyric(text, 0.8)} title="慢速朗读">
            慢速朗读
          </button>
        </>
      )}
    </span>
  )
}

export default function LyricsDisplay({ lyricsMap, displayConfig, displayOrder, currentIndex, onSeek, activeLang, onPauseMusic, onResumeMusic, pinyinLyrics }) {
  const containerRef = useRef(null)
  const [selectedWords, setSelectedWords] = useState(new Map())
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const [ttsLoading, setTtsLoading] = useState(null)

  const ttsLang = 'zh'
  const showTts = activeLang === 'yue'

  useEffect(() => {
    const container = containerRef.current
    if (!container || currentIndex < 0) return

    const activeLine = container.querySelector('.lyric-line.active, .lyric-line-group.active')
    if (activeLine) {
      const containerHeight = container.clientHeight
      const lineTop = activeLine.offsetTop
      const lineHeight = activeLine.offsetHeight
      const scrollTo = lineTop - containerHeight / 2 + lineHeight / 2
      container.scrollTo({ top: scrollTo, behavior: 'smooth' })
    }
  }, [currentIndex])

  useEffect(() => {
    setSelectedWords(new Map())
  }, [lyricsMap])

  const handleWordDoubleClick = useCallback((word) => {
    const key = word.toLowerCase()
    setSelectedWords((prev) => {
      const next = new Map(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.set(key, null)
        fetchPhonetic(key).then((ipa) => {
          if (ipa) {
            setSelectedWords((p) => {
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
      await readLyric(text, playbackRate, ttsLang)
    } catch (err) {
      console.error('TTS error:', err)
    } finally {
      setTtsLoading(false)
      if (wasPlaying && onResumeMusic) onResumeMusic()
    }
  }, [onPauseMusic, onResumeMusic, ttsLang])

  const handleStopTTS = useCallback(() => {
    stopCurrentAudio()
    setTtsLoading(false)
  }, [])

  const renderLineText = useCallback((text) => {
    const tokens = tokenize(text)
    return tokens.map((token, i) => {
      if (token.type === 'sep') return <span key={`s${i}`}>{token.value}</span>
      const key = token.value.toLowerCase()
      const phonetic = selectedWords.get(key)
      const onDblClick = () => handleWordDoubleClick(token.value)
      if (phonetic) {
        return (
          <ruby key={`w${i}`} className="lyric-word annotated" onDoubleClick={onDblClick}>
            {token.value}<rt>{phonetic}</rt>
          </ruby>
        )
      }
      return (
        <span key={`w${i}`} className="lyric-word" onDoubleClick={onDblClick}>
          {token.value}
        </span>
      )
    })
  }, [selectedWords, handleWordDoubleClick])

  const hoverOn = useCallback((i) => setHoveredIndex(i), [])
  const hoverOff = useCallback(() => setHoveredIndex(null), [])

  const useTtsForLine = useCallback((index, text) => {
    if (!showTts) return null
    if (hoveredIndex !== index) return null
    return renderTTSButtons(index, text, ttsLoading, handleReadLyric, handleStopTTS)
  }, [showTts, hoveredIndex, ttsLoading, handleReadLyric, handleStopTTS])

  const hasAnyLyrics = Object.keys(lyricsMap).some((lang) => lyricsMap[lang]?.length > 0)

  if (!hasAnyLyrics) {
    return (
      <div className="lyrics-display">
        <div className="lyrics-empty">请在侧边栏选择歌词文件</div>
      </div>
    )
  }

  const enabledLangs = displayOrder.filter((l) => l === 'pinyin' || displayConfig[l])
  const hasJyutping = enabledLangs.includes('yue')
  const hasPinyin = enabledLangs.includes('pinyin')
  const hasJapanese = enabledLangs.includes('ja')

  const renderEmpty = (key) => (
    <div className="lyrics-display" ref={containerRef} key={key}>
      <div className="lyrics-empty">请在侧边栏选择歌词文件</div>
    </div>
  )

  if (hasJyutping) {
    const zhLyrics = lyricsMap.zh || []
    const jyutpingLyrics = lyricsMap.yue || []
    const enLyrics = enabledLangs.includes('en') ? (lyricsMap.en || []) : []
    const hasZh = zhLyrics.length > 0
    const hasJp = jyutpingLyrics.length > 0

    if (!hasZh && !hasJp) {
      const fallback = enLyrics.length > 0 ? enLyrics : zhLyrics
      if (fallback.length === 0) return renderEmpty('jyutping-empty')
      return (
        <div className="lyrics-display" ref={containerRef}>
          <div className="lyrics-content">
            {fallback.map((line, index) => (
              <LyricLine
                key={lineKey(line, index)}
                line={line}
                index={index}
                isActive={index === currentIndex}
                onHover={hoverOn}
                onLeave={hoverOff}
                onSeek={onSeek}
                seekEnabled
                showTts={showTts}
                ttsLoading={ttsLoading && hoveredIndex === index}
                onReadLyric={handleReadLyric}
                onStopTTS={handleStopTTS}
                renderLineText={renderLineText}
              />
            ))}
          </div>
        </div>
      )
    }

    return (
      <div className="lyrics-display" ref={containerRef}>
        <div className="lyrics-content">
          {zhLyrics.map((line, index) => (
            <LyricLineGroup
              key={lineKey(line, index)}
              line={line}
              index={index}
              isActive={index === currentIndex}
              onHover={hoverOn}
              onLeave={hoverOff}
              onSeek={onSeek}
              seekEnabled
              showTts={showTts}
              ttsText={line.text}
              ttsLoading={ttsLoading && hoveredIndex === index}
              onReadLyric={handleReadLyric}
              onStopTTS={handleStopTTS}
              subLines={[
                { content: renderLineText(line.text) },
                ...(hasJp ? [{ className: 'jyutping-line', content: jyutpingLyrics[index]?.text || '' }] : []),
                ...(enLyrics.length > 0 ? [{ content: enLyrics[index]?.text || '' }] : []),
              ]}
            />
          ))}
        </div>
      </div>
    )
  }

  if (hasPinyin && pinyinLyrics) {
    const zhLyrics = lyricsMap.zh || []
    if (zhLyrics.length === 0) return renderEmpty('pinyin-empty')

    const pinyinFirst = enabledLangs.indexOf('pinyin') < enabledLangs.indexOf('zh')

    return (
      <div className="lyrics-display" ref={containerRef}>
        <div className="lyrics-content">
          {zhLyrics.map((line, index) => (
            <LyricLineGroup
              key={lineKey(line, index)}
              line={line}
              index={index}
              isActive={index === currentIndex}
              onHover={hoverOn}
              onLeave={hoverOff}
              onSeek={onSeek}
              seekEnabled
              showTts={false}
              ttsText={line.text}
              ttsLoading={false}
              onReadLyric={handleReadLyric}
              onStopTTS={handleStopTTS}
              subLines={pinyinFirst ? [
                { className: 'pinyin-line', content: pinyinLyrics[index]?.text || '' },
                { content: renderLineText(line.text) },
              ] : [
                { content: renderLineText(line.text) },
                { className: 'pinyin-line', content: pinyinLyrics[index]?.text || '' },
              ]}
            />
          ))}
        </div>
      </div>
    )
  }

  if (hasJapanese) {
    const jaLyrics = lyricsMap.ja || []
    const zhLyrics = enabledLangs.includes('zh') ? (lyricsMap.zh || []) : []
    const hasZh = zhLyrics.length > 0

    if (jaLyrics.length === 0 && zhLyrics.length === 0) return renderEmpty('ja-empty')

    const primaryLyrics = jaLyrics.length > 0 ? jaLyrics : zhLyrics

    return (
      <div className="lyrics-display" ref={containerRef}>
        <div className="lyrics-content">
          {primaryLyrics.map((line, index) => {
            const subLines = []
            const jaLine = jaLyrics[index]
            if (jaLine) {
              subLines.push({ className: 'japanese-line', content: renderLineText(jaLine.text) })
            }
            if (hasZh) {
              subLines.push({ className: 'chinese-line', content: zhLyrics[index]?.text || '' })
            }
            return (
              <LyricLineGroup
                key={lineKey(line, index)}
                line={line}
                index={index}
                isActive={index === currentIndex}
                onHover={hoverOn}
                onLeave={hoverOff}
                onSeek={onSeek}
                seekEnabled
                showTts={false}
                ttsText={line.text}
                ttsLoading={false}
                onReadLyric={handleReadLyric}
                onStopTTS={handleStopTTS}
                subLines={subLines}
              />
            )
          })}
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
              <LyricLine
                key={lineKey(line, index)}
                line={line}
                index={index}
                isActive={index === currentIndex}
                onHover={hoverOn}
                onLeave={hoverOff}
                onSeek={onSeek}
                seekEnabled
                showTts={showTts}
                ttsLoading={ttsLoading && hoveredIndex === index}
                onReadLyric={handleReadLyric}
                onStopTTS={handleStopTTS}
                renderLineText={renderLineText}
              />
            ))}
          </div>
        </div>
      )
    }

    return (
      <div className="lyrics-display" ref={containerRef}>
        <div className="lyrics-content">
          {primaryLyrics.map((line, index) => (
            <LyricLineGroup
              key={lineKey(line, index)}
              line={line}
              index={index}
              isActive={index === currentIndex}
              onHover={hoverOn}
              onLeave={hoverOff}
              onSeek={onSeek}
              seekEnabled
              showTts={showTts}
              ttsText={line.text}
              ttsLoading={ttsLoading && hoveredIndex === index}
              onReadLyric={handleReadLyric}
              onStopTTS={handleStopTTS}
              subLines={[
                { content: renderLineText(line.text) },
                { content: secondaryLyrics[index]?.text || '' },
              ]}
            />
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
          <LyricLine
            key={lineKey(line, index)}
            line={line}
            index={index}
            isActive={index === currentIndex}
            onHover={hoverOn}
            onLeave={hoverOff}
            onSeek={onSeek}
            seekEnabled
            showTts={showTts}
            ttsLoading={ttsLoading && hoveredIndex === index}
            onReadLyric={handleReadLyric}
            onStopTTS={handleStopTTS}
            renderLineText={renderLineText}
          />
        ))}
      </div>
    </div>
  )
}