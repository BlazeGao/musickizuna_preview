import { useRef } from 'react'
import { LANG_LABELS, SUPPORTED_LANGS } from '../utils/historyManager'
import './NowPlaying.css'

export default function NowPlaying({
  entry,
  isPlaying,
  activeLang,
  onSelect,
  onDoubleClick,
  onRemove,
  onAddLyrics,
  onRemoveLyrics,
  onDragStart,
  onDragOver,
  onDrop,
}) {
  const isBuiltin = !!entry?.isBuiltin
  const inputRefs = useRef({})

  const availableLangs = activeLang === 'en' ? ['zh', 'en'] : activeLang === 'yue' ? ['zh'] : activeLang === 'ja' ? ['ja', 'zh'] : [activeLang]
  const lyrics = entry.lyrics || {}
  const boundLangs = availableLangs.filter((l) => lyrics[l]?.name)
  const unboundLangs = availableLangs.filter((l) => !lyrics[l]?.name)

  const handleLyricsChange = (lang, e) => {
    const file = e.target.files[0]
    if (file) {
      onAddLyrics(entry, lang, file)
    }
    e.target.value = ''
  }

  return (
    <li
      className={`now-playing-item ${isPlaying ? 'playing' : ''}`}
      draggable
      onDragStart={(e) => onDragStart(e)}
      onDragOver={(e) => onDragOver(e)}
      onDrop={(e) => onDrop(e)}
    >
      <div
        className="now-playing-card"
        onClick={() => onSelect(entry)}
        onDoubleClick={() => onDoubleClick(entry)}
      >
        <div className="now-playing-header">
          {isPlaying && <span className="playing-indicator" />}
          <span className="now-playing-music">{entry.musicName}</span>
        </div>

        <div className="now-playing-lyrics-list">
          {boundLangs.map((lang) => (
            <div key={lang} className="now-playing-lyrics-row">
              <span className="lyrics-lang-label">{LANG_LABELS[lang] || lang}</span>
              <span className="lyrics-file-name">{lyrics[lang].name}</span>
              <button
                className="lyrics-remove-btn"
                title="移除歌词"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemoveLyrics(entry.id, lang)
                }}
              >
                ×
              </button>
            </div>
          ))}

          {unboundLangs.map((lang) => (
            <button
              key={lang}
              className="now-playing-add-btn"
              onClick={(e) => {
                e.stopPropagation()
                inputRefs.current[lang]?.click()
              }}
            >
              + 添加{LANG_LABELS[lang] || lang}歌词
            </button>
          ))}

          {boundLangs.length === 0 && unboundLangs.length === 0 && (
            <span className="now-playing-no-lang">无可用语种</span>
          )}
        </div>

        {availableLangs.map((lang) => (
          <input
            key={lang}
            ref={(el) => { inputRefs.current[lang] = el }}
            type="file"
            accept=".txt,.lrc"
            onChange={(e) => handleLyricsChange(lang, e)}
            style={{ display: 'none' }}
          />
        ))}
      </div>

      <button
        className="now-playing-remove"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(entry.id)
        }}
        style={isBuiltin ? { display: 'none' } : undefined}
        disabled={isBuiltin}
      >
        ×
      </button>
    </li>
  )
}
