import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297
const MARGIN_MM = 12
const PAGE_CONTENT_WIDTH = A4_WIDTH_MM - MARGIN_MM * 2
const PAGE_CONTENT_HEIGHT = A4_HEIGHT_MM - MARGIN_MM * 2

function expandElementForCapture(element) {
  const clone = element.cloneNode(true)
  const width = element.scrollWidth
  clone.style.width = `${width}px`
  clone.style.height = `${element.scrollHeight}px`
  clone.style.overflow = 'visible'
  clone.style.position = 'absolute'
  clone.style.top = '0'
  clone.style.left = '0'
  clone.style.zIndex = '-1'
  clone.style.pointerEvents = 'none'
  document.body.appendChild(clone)
  return clone
}

export async function exportElementToPDF(element, filename, { backgroundColor = '#fafafa' } = {}) {
  if (!element) throw new Error('exportElementToPDF: element is null')

  let clone = null
  let target = element
  try {
    if (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth) {
      clone = expandElementForCapture(element)
      target = clone
    }

    const canvas = await html2canvas(target, {
      backgroundColor,
      scale: 2,
      useCORS: true,
      logging: false,
      windowWidth: target.scrollWidth,
      windowHeight: target.scrollHeight,
    })

    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error('element is empty')
    }

    const pxPerMm = canvas.width / PAGE_CONTENT_WIDTH
    const totalContentHeightMm = canvas.height / pxPerMm
    const totalPages = Math.max(1, Math.ceil(totalContentHeightMm / PAGE_CONTENT_HEIGHT))

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    })

    const sliceHeightPx = PAGE_CONTENT_HEIGHT * pxPerMm

    for (let i = 0; i < totalPages; i++) {
      if (i > 0) pdf.addPage('a4', 'portrait')

      const sourceY = i * sliceHeightPx
      const sourceHeight = Math.min(sliceHeightPx, canvas.height - sourceY)

      if (sourceHeight <= 0) continue

      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = canvas.width
      pageCanvas.height = sourceHeight
      const ctx = pageCanvas.getContext('2d')
      ctx.fillStyle = backgroundColor
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
      ctx.drawImage(
        canvas,
        0, sourceY, canvas.width, sourceHeight,
        0, 0, canvas.width, sourceHeight
      )

      const pageImgData = pageCanvas.toDataURL('image/jpeg', 0.92)
      const pageHeightMm = sourceHeight / pxPerMm

      pdf.addImage(
        pageImgData,
        'JPEG',
        MARGIN_MM,
        MARGIN_MM,
        PAGE_CONTENT_WIDTH,
        pageHeightMm,
        undefined,
        'FAST'
      )
    }

    pdf.save(filename)
  } finally {
    if (clone && clone.parentNode) clone.parentNode.removeChild(clone)
  }
}

export async function exportFuriganaToPDF(element, filename) {
  return exportElementToPDF(element, filename)
}
