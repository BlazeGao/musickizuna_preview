import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import './LandingPage.css'

const slogan = '语言连接音乐，音乐连接世界'

export default function LandingPage({ onEnter }) {
  const [leaving, setLeaving] = useState(false)
  const sloganRef = useRef(null)

  useEffect(() => {
    document.title = 'Music Kizuna 2 Preview'
  }, [])

  useLayoutEffect(() => {
    const media = gsap.matchMedia()
    const context = gsap.context(() => {
      media.add('(prefers-reduced-motion: no-preference)', () => {
        const chars = gsap.utils.toArray('.slogan-char')
        const glyphs = gsap.utils.toArray('.slogan-glyph')
        const echoes = gsap.utils.toArray('.slogan-echo')

        gsap.set(chars, {
          autoAlpha: 0,
          y: 56,
          rotationX: -92,
          rotationZ: -5,
          scale: 0.72,
          filter: 'blur(14px)',
          transformOrigin: '50% 100%',
        })
        gsap.set(echoes, { autoAlpha: 0 })

        const intro = gsap.timeline({ defaults: { ease: 'power4.out' } })
        intro
          .to('.slogan-kicker', { autoAlpha: 1, x: 0, duration: 0.6 }, 0.35)
          .to(chars, {
            autoAlpha: 1,
            y: 0,
            rotationX: 0,
            rotationZ: 0,
            scale: 1,
            filter: 'blur(0px)',
            duration: 1.05,
            stagger: { each: 0.055, from: 'start' },
          }, 0.48)
          .fromTo('.slogan-underline',
            { scaleX: 0, transformOrigin: '0% 50%' },
            { scaleX: 1, duration: 1.1, ease: 'expo.inOut' },
            0.82
          )
          .fromTo('.slogan-caption',
            { autoAlpha: 0, x: -14 },
            { autoAlpha: 1, x: 0, duration: 0.7 },
            1.18
          )
          .fromTo('.slogan-flare',
            { xPercent: -150, autoAlpha: 0 },
            { xPercent: 180, autoAlpha: 0.85, duration: 1.25, ease: 'power2.inOut' },
            0.95
          )

        gsap.to(glyphs, {
          y: (index) => index % 2 === 0 ? -3 : 3,
          color: (index) => index === 6 ? '#ff6878' : '#ffffff',
          textShadow: (index) => index === 6
            ? '0 0 18px rgba(255, 77, 95, 0.8)'
            : '0 0 16px rgba(119, 244, 234, 0.2)',
          duration: 1.35,
          ease: 'sine.inOut',
          stagger: { each: 0.08, from: 'center' },
          repeat: -1,
          yoyo: true,
          delay: 2.1,
        })

        gsap.timeline({ repeat: -1, repeatDelay: 3.4, delay: 2.6 })
          .to(echoes[0], { autoAlpha: 0.32, x: -8, duration: 0.06, ease: 'none' })
          .to(echoes[1], { autoAlpha: 0.25, x: 9, duration: 0.06, ease: 'none' }, '<')
          .to(echoes, { autoAlpha: 0, x: 0, duration: 0.16, ease: 'power2.out' })
          .to('.slogan-flare', { xPercent: 180, duration: 0.01 })
          .fromTo('.slogan-flare',
            { xPercent: -150, autoAlpha: 0 },
            { xPercent: 180, autoAlpha: 0.65, duration: 1.1, ease: 'power2.inOut' },
            '+=0.15'
          )
      })

      media.add('(prefers-reduced-motion: reduce)', () => {
        gsap.set('.slogan-char, .slogan-kicker, .slogan-caption', {
          clearProps: 'all',
          autoAlpha: 1,
        })
        gsap.set('.slogan-underline', { scaleX: 1 })
      })
    }, sloganRef)

    return () => {
      media.revert()
      context.revert()
    }
  }, [])

  const handleEnter = () => {
    setLeaving(true)
    window.setTimeout(onEnter, 520)
  }

  return (
    <main className={`landing-page ${leaving ? 'is-leaving' : ''}`}>
      <div className="landing-aurora landing-aurora-one" />
      <div className="landing-aurora landing-aurora-two" />
      <div className="landing-grain" />
      <div className="landing-grid" />

      <header className="landing-nav">
        <a className="landing-brand" href="#home" aria-label="Music Kizuna 首页">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>MUSIC KIZUNA</span>
        </a>
        <span className="preview-pill">
          <i />
          PREVIEW BUILD
        </span>
      </header>

      <section className="landing-hero">
        <div className="eyebrow">
          <span>LANGUAGE</span>
          <i />
          <span>MUSIC</span>
          <i />
          <span>WORLD</span>
        </div>

        <h1 className="landing-title" aria-label="Music Kizuna 2 Preview">
          <span className="title-line title-line-primary">Music Kizuna</span>
          <span className="title-line title-line-secondary">
            <b>2</b>
            <em>PREVIEW</em>
          </span>
        </h1>

        <div className="slogan-stage" ref={sloganRef} aria-label={slogan}>
          <span className="slogan-kicker" aria-hidden="true">THE SOUND OF CONNECTION</span>
          <span className="slogan-echo slogan-echo-cyan" aria-hidden="true">{slogan}</span>
          <span className="slogan-echo slogan-echo-red" aria-hidden="true">{slogan}</span>
          <p className="landing-slogan">
            {Array.from(slogan).map((char, index) => (
              <span
                key={`${char}-${index}`}
                className={char === '，' ? 'slogan-char slogan-pause' : 'slogan-char'}
                aria-hidden="true"
              >
                <span className="slogan-glyph">{char}</span>
              </span>
            ))}
          </p>
          <span className="slogan-flare" aria-hidden="true" />
          <span className="slogan-underline" aria-hidden="true" />
          <span className="slogan-caption" aria-hidden="true">
            <i />
            TRANSLATING EMOTION INTO SOUND
          </span>
        </div>

        <button className="enter-button" type="button" onClick={handleEnter}>
          <span className="enter-button-text">进入网站</span>
          <span className="enter-button-icon" aria-hidden="true">↗</span>
        </button>
      </section>

      <div className="visualizer" aria-hidden="true">
        {[0.48, 0.8, 0.36, 0.95, 0.58, 0.72, 0.42, 0.88, 0.5, 0.68, 0.34, 0.78].map((scale, index) => (
          <i key={index} style={{ '--bar-scale': scale, '--bar-index': index }} />
        ))}
      </div>

      <div className="landing-orbit" aria-hidden="true">
        <div className="orbit-ring orbit-ring-outer" />
        <div className="orbit-ring orbit-ring-inner" />
        <div className="orbit-core">
          <span>MK</span>
          <i />
        </div>
      </div>

      <footer className="landing-footer">
        <div className="footer-scroll">
          <span>SCROLL TO FEEL THE RHYTHM</span>
          <i />
        </div>
        <div
          className="author-credit"
          aria-label="作者：bilibili 随风漫步Blaze"
        >
          <span className="author-label">CREATED BY</span>
          <strong>bilibili@随风漫步Blaze</strong>
        </div>
      </footer>
    </main>
  )
}
