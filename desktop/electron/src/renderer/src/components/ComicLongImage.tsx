import React, { useEffect, useRef, useState } from 'react'

export type ComicImage = { id: string; url: string; sceneIndex: number; description?: string }

export type ComicLongImageProps = {
  images: ComicImage[]
  /** 明确像素宽度；若 fillParent=true 则忽略 */
  width?: number
  /** 填充父容器宽度（默认 true） */
  fillParent?: boolean
  /** 画面列宽占父容器可用宽度的比例（0-1） */
  panelWidthRatio?: number
  /** 每个竖直面板的高宽比（height / width），例如 1.6 更“竖直” */
  panelAspect?: number
  /** 顶边倾斜量（px），决定上边向左/右的偏差 */
  skew?: number
  /** 底边倾斜量（px），用于避免上下边平行，形成真实梯形 */
  bottomSkew?: number
  /** 面板间距（px） */
  gap?: number
  /** 每个图片的极薄边框宽度（px） */
  borderWidth?: number
  /** 每个图片的边框颜色 */
  borderColor?: string
  /** 背景色 */
  backgroundColor?: string
  /** 合成完成后回传 dataURL */
  onReady?: (dataUrl: string) => void
}

const ComicLongImage: React.FC<ComicLongImageProps> = ({
  images,
  width,
  fillParent = true,
  panelWidthRatio = 0.92,
  panelAspect = 1.6,
  skew = 12,
  bottomSkew,
  gap = 12,
  borderWidth = 1,
  borderColor = '#000000',
  backgroundColor = '#ffffff',
  onReady
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [canvasWidth, setCanvasWidth] = useState<number>(width || 720)

  // 跟随父容器宽度，几乎填充输出区
  useEffect(() => {
    if (!fillParent) {
      if (width) setCanvasWidth(width)
      return
    }
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const w = Math.max(320, Math.floor(el.clientWidth))
      setCanvasWidth(w)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fillParent, width])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || images.length === 0) return

    const innerPadding = 6
    const usableW = canvasWidth - innerPadding * 2
    const panelW = Math.max(Math.floor(usableW * panelWidthRatio), 80)
    const panelH = Math.floor(panelW * panelAspect)

    const draw = async () => {
      const bitmaps: ImageBitmap[] = []
      for (const img of images) {
        try {
          const bitmap = await loadBitmap(img.url)
          bitmaps.push(bitmap)
        } catch (e) {
          console.warn('加载图片失败，使用占位:', e)
          const bmp = await createPlaceholder(panelW, panelH)
          bitmaps.push(bmp)
        }
      }

      const totalH = images.length * panelH + (images.length + 1) * gap + 2 * innerPadding
      canvas.width = Math.floor(canvasWidth)
      canvas.height = Math.floor(totalH)

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.imageSmoothingEnabled = true
      // @ts-ignore
      ctx.imageSmoothingQuality = 'high'

      // 背景
      ctx.fillStyle = backgroundColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // 水平居中列
      const x = innerPadding + Math.floor((usableW - panelW) / 2)
      const firstDir = (bitmaps.length % 2 === 0) ? -1 : 1

      let y = gap + innerPadding
      for (let i = 0; i < bitmaps.length; i++) {
        const bmp = bitmaps[i]

        // T型：上边从左到右向下倾斜，下边从左到右向上倾斜；相邻面板整体180°翻转
        const base = Math.max(2, Math.min(Math.abs(skew), Math.floor(panelH / 3)))
        const alt = Math.max(2, Math.min(Math.abs(bottomSkew ?? base), Math.floor(panelH / 3)))
        const dir = i % 2 === 0 ? firstDir : -firstDir
        const isFirst = i === 0
        const isLast = i === bitmaps.length - 1
        const tTop = isFirst ? 0 : base
        const tBottom = isLast ? 0 : alt

        // 顶边与底边的坐标：左右边保持竖直；右侧竖直边长度因 tTop+tBottom 变化
        const topLeft = { x: x, y }
        const topRight = { x: x + panelW, y: y + dir * tTop }
        const bottomLeft = { x: x, y: y + panelH }
        const bottomRight = { x: x + panelW, y: y + panelH - dir * tBottom }

        // 梯形裁剪（上下边斜率相反；相邻面板的接缝平行）
        ctx.save()
        ctx.beginPath()
        ctx.moveTo(topLeft.x, topLeft.y)
        ctx.lineTo(topRight.x, topRight.y)
        ctx.lineTo(bottomRight.x, bottomRight.y)
        ctx.lineTo(bottomLeft.x, bottomLeft.y)
        ctx.closePath()
        ctx.clip()

        // cover 填充竖直外接矩形（以长竖边为高度基准）
        const leftLen = panelH
        const rightLen = panelH - dir * (tTop + tBottom)
        const longLen = Math.max(leftLen, rightLen)
        const targetRect = { x, y, w: panelW, h: panelH }
        const scaleW = targetRect.w / bmp.width
        const scaleH = longLen / bmp.height
        const scale = Math.max(scaleW, scaleH)
        const dw = Math.ceil(bmp.width * scale)
        const dh = Math.ceil(bmp.height * scale)
        const dx = targetRect.x + (targetRect.w - dw) / 2
        const anchorTop = dir === -1 ? (y - tTop) : y
        const dy = anchorTop + (longLen - dh) / 2

        ctx.drawImage(bmp, dx, dy, dw, dh)
        ctx.restore()

        // 极薄黑色描边
        if (borderWidth > 0) {
          ctx.beginPath()
          ctx.moveTo(topLeft.x, topLeft.y)
          ctx.lineTo(topRight.x, topRight.y)
          ctx.lineTo(bottomRight.x, bottomRight.y)
          ctx.lineTo(bottomLeft.x, bottomLeft.y)
          ctx.closePath()
          ctx.lineWidth = borderWidth
          ctx.strokeStyle = borderColor
          ctx.stroke()
        }

        y += panelH + gap
      }

      const url = canvas.toDataURL('image/png')
      onReady && onReady(url)
    }

    draw()
  }, [images, canvasWidth, panelWidthRatio, panelAspect, skew, bottomSkew, gap, borderWidth, borderColor, backgroundColor, onReady])

  return (
    <div ref={containerRef} className="comic-long-container">
      <canvas ref={canvasRef} className="comic-long-canvas" />
    </div>
  )
}

async function loadBitmap(url: string): Promise<ImageBitmap> {
  try {
    const resp = await fetch(url)
    const blob = await resp.blob()
    const bmp = await createImageBitmap(blob)
    return bmp
  } catch {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.referrerPolicy = 'no-referrer'
      img.onload = async () => {
        try {
          const off = document.createElement('canvas')
          off.width = img.naturalWidth
          off.height = img.naturalHeight
          const ctx = off.getContext('2d')
          if (!ctx) return reject(new Error('ctx null'))
          ctx.drawImage(img, 0, 0)
          const blobPromise = new Promise<Blob | null>((res) => off.toBlob(b => res(b), 'image/png'))
          const b = await blobPromise
          if (!b) return reject(new Error('blob null'))
          const bmp = await createImageBitmap(b)
          resolve(bmp)
        } catch (e) {
          reject(e)
        }
      }
      img.onerror = () => reject(new Error('image load error'))
      img.src = url
    })
  }
}

async function createPlaceholder(w: number, h: number): Promise<ImageBitmap> {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.floor(w))
  c.height = Math.max(1, Math.floor(h))
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#bdbdbd'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.strokeStyle = '#666'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, c.width - 1, c.height - 1)
  return await createImageBitmap(c)
}

export default ComicLongImage