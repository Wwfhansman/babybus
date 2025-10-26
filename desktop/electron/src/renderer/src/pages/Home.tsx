import React, { useEffect, useRef } from 'react'
import '../styles/home.css'

// 简易粒子结构（Canvas 2D 实现，白底黑色粒子）
interface Particle {
  x: number
  y: number
  ox: number
  oy: number
  vx: number
  vy: number
}

const HomePage: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animRef = useRef<number | null>(null)
  const pointsRef = useRef<Particle[]>([])
  const mouseRef = useRef<{ x: number; y: number } | null>(null)
  const dprRef = useRef<number>(1)

  // 初始化粒子：从离屏 Canvas 上绘制 “BABYBUS” 文本，采样像素生成点
  const initPoints = (W: number, H: number) => {
    const off = document.createElement('canvas')
    off.width = Math.floor(W)
    off.height = Math.floor(H * 0.7)
    const octx = off.getContext('2d')!
    // 白底（采样用）
    octx.fillStyle = '#fff'
    octx.fillRect(0, 0, off.width, off.height)
    // 黑字
    let fontSize = Math.floor(off.height * 0.85)
    octx.fillStyle = '#000'
    octx.textBaseline = 'middle'
    octx.font = `bold ${fontSize}px "Microsoft YaHei", system-ui, -apple-system, Segoe UI, Roboto, sans-serif`
    const text = 'BABYBUS'
    let metrics = octx.measureText(text)
    const maxTextWidth = Math.floor(off.width * 0.86) // 左右保留一定边距，避免裁剪
    if (metrics.width > maxTextWidth) {
      const scale = maxTextWidth / metrics.width
      fontSize = Math.floor(fontSize * scale)
      octx.font = `bold ${fontSize}px "Microsoft YaHei", system-ui, -apple-system, Segoe UI, Roboto, sans-serif`
      metrics = octx.measureText(text)
    }
    const tx = Math.floor((off.width - metrics.width) / 2)
    const ty = Math.floor(off.height / 2)
    octx.fillText(text, tx, ty)

    const img = octx.getImageData(0, 0, off.width, off.height)
    const data = img.data
    const pts: Particle[] = []
    const step = 2 // 更高密度（扩大区域后总粒子更多）
    const baseX = (W - off.width) / 2
    const baseY = (H - off.height) / 2

    for (let y = 0; y < off.height; y += step) {
      for (let x = 0; x < off.width; x += step) {
        const idx = (y * off.width + x) * 4
        const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3]
        if (a > 200 && r < 50 && g < 50 && b < 50) {
          const px = baseX + x + (Math.random() - 0.5) * 0.8
          const py = baseY + y + (Math.random() - 0.5) * 0.8
          pts.push({ x: px, y: py, ox: px, oy: py, vx: 0, vy: 0 })
        }
      }
    }
    pointsRef.current = pts
  }

  const loop = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.clientWidth
    const H = canvas.clientHeight

    ctx.clearRect(0, 0, W, H)

    const pts = pointsRef.current
    const mouse = mouseRef.current

    // 根据主题变量设置粒子颜色（light: 深色，dark: 浅色）
    const styles = getComputedStyle(document.documentElement)
    const particleColor = (styles.getPropertyValue('--text').trim() || '#000')
    ctx.fillStyle = particleColor

    const radius = 150
    const repel = 0.7
    const attract = 0.08
    const damping = 0.88

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      if (mouse) {
        const dx = p.x - mouse.x
        const dy = p.y - mouse.y
        const dist = Math.hypot(dx, dy)
        if (dist < radius && dist > 0.001) {
          const force = (1 - dist / radius) * repel
          p.vx += (dx / dist) * force
          p.vy += (dy / dist) * force
        }
      }
      // 回形状吸引力 + 轻微抖动
      p.vx += (p.ox - p.x) * attract + (Math.random() - 0.5) * 0.02
      p.vy += (p.oy - p.y) * attract + (Math.random() - 0.5) * 0.02

      // 阻尼
      p.vx *= damping
      p.vy *= damping

      // 位置更新
      p.x += p.vx
      p.y += p.vy

      // 绘制粒子（颜色跟随主题）
      ctx.fillRect(p.x, p.y, 2, 2)
    }

    animRef.current = window.requestAnimationFrame(loop)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const dpr = (window.devicePixelRatio || 1)
      dprRef.current = Math.min(2, dpr)
      const rectW = canvas.clientWidth
      const rectH = canvas.clientHeight
      canvas.width = Math.floor(rectW * dprRef.current)
      canvas.height = Math.floor(rectH * dprRef.current)
      ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0)
      initPoints(rectW, rectH)
    }

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    const onLeave = () => { mouseRef.current = null }

    resize()
    window.addEventListener('resize', resize)
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mouseleave', onLeave)

    animRef.current = window.requestAnimationFrame(loop)

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  return (
    <div className="home-page">
      <section className="hero">
        <canvas ref={canvasRef} className="hero-canvas" />
      </section>

      <section className="tagline">
        <div className="cn">文字跃然次元，AI 绘就万象。</div>
        <div className="en">Words leap across dimensions, AI paints all visions.</div>
      </section>

      <section className="modules">
        <div className="modules-title">项目概览</div>
        <div className="intro-grid">
          <div className="card">
            <h3>用户人群</h3>
            <p>服务小说作者、同好读者、文化从业者及内容运营团队，支持文本到多模态传播，快速生成主视觉与长图合集。</p>
          </div>
          <div className="card">
            <h3>生图流程</h3>
            <p>导入章节文本，提取分镜与关键要素；构建提示、设定角色/场景一致性；批量生成图像，自动拼接长图，审核后一键导出。</p>
          </div>
          <div className="card">
            <h3>技术架构</h3>
            <p>前端采用 Electron+React 统一渲染与主题；后端 Python 提供 AIGC/LLM 管线与本地存储；WebSocket 实时通信，任务队列与缓存优化交互延迟。</p>
          </div>
          <div className="card">
            <h3>开发人员</h3>
            <p>产品/前端/部署：吴文凡（Kris）；测试/后端：李锦堃。欢迎社区协作与贡献。</p>
          </div>
        </div>
      </section>
    </div>
  )
}

export default HomePage