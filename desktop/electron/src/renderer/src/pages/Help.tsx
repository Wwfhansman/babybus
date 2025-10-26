import React from 'react'
import '../styles/help.css'

const HelpPage: React.FC = () => {
  const scrollToId = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="help-page">
      <header className="help-header">
        <h1>帮助中心</h1>
        <p>快速了解如何使用「宝宝巴士·AI漫画」，涵盖创作流程、长图生成与积分说明等。</p>
      </header>

      <nav className="help-index" aria-label="帮助目录">
        <a href="#quickstart" onClick={(e) => { e.preventDefault(); scrollToId('quickstart') }}>快速开始</a>
        <a href="#workflow" onClick={(e) => { e.preventDefault(); scrollToId('workflow') }}>创作流程</a>
        <a href="#long-image" onClick={(e) => { e.preventDefault(); scrollToId('long-image') }}>长图生成</a>
        <a href="#credits" onClick={(e) => { e.preventDefault(); scrollToId('credits') }}>积分说明</a>
        <a href="#profile" onClick={(e) => { e.preventDefault(); scrollToId('profile') }}>个人中心</a>
        <a href="#faq" onClick={(e) => { e.preventDefault(); scrollToId('faq') }}>常见问题</a>
        <a href="#support" onClick={(e) => { e.preventDefault(); scrollToId('support') }}>反馈与支持</a>
      </nav>

      <section id="quickstart" className="help-section">
        <h2>快速开始</h2>
        <ul>
          <li>登录：使用账号密码登录。首次使用可在登录框内切换到注册。</li>
          <li>进入「创作」：左侧导航进入「创作」。右侧为创作工作区。</li>
          <li>上传小说：点击「上传新小说」，选择本地文件，系统会读取章节。</li>
          <li>选择章节并生成分镜：在章节内容区点击「生成分镜」，系统会识别场景与分镜。</li>
          <li>生成漫画：分镜就绪后，点击生成，等待漫画图片逐步产出。</li>
          <li>导出长图：生成完成后，可在输出区使用「长图生成」按当前场景合成长图。</li>
        </ul>
        <div className="callout info">
          <strong>提示：</strong> 生成过程中若网络波动，可稍后重试；进度条与状态将实时更新。
        </div>
      </section>

      <section id="workflow" className="help-section">
        <h2>创作流程</h2>
        <ol>
          <li><strong>管理小说：</strong> 左侧抽屉中浏览与选择小说，支持章节切换。</li>
          <li><strong>分镜设定：</strong> 在设定区查看角色与环境一致性，必要时进行调整。</li>
          <li><strong>生成分镜：</strong> 点击「生成分镜」后，系统会解析文本并生成场景预览。</li>
          <li><strong>生成漫画：</strong> 分镜完成后可生成漫画，图片将按场景顺序产出。</li>
          <li><strong>长图合成：</strong> 使用「长图生成」将当次生成的图片合并为一张长图。</li>
        </ol>
        <div className="callout tip">
          <strong>建议：</strong> 文本段落尽量清晰，角色、环境描述越完整，生成质量越好。
        </div>
      </section>

      <section id="long-image" className="help-section">
        <h2>长图生成</h2>
        <p>在创作页的输出区中，选择「长图生成」功能，可以将多张场景图拼接为一张长图，方便社交平台或移动端展示。</p>
        <ul>
          <li>尺寸：长图宽度随输出区自适应，高度按图片数量增长。</li>
          <li>格式：前端以画布合成预览，可导出为 PNG。</li>
          <li>性能：图片过多时合成耗时增加，建议 50 张以内分批导出。</li>
        </ul>
      </section>

      <section id="credits" className="help-section">
        <h2>积分说明</h2>
        <p>积分用于生成分镜与漫画的前端演示与资源消耗计量。当前规则与充值选项如下：</p>
        <ul>
          <li>消耗规则：
            <ul>
              <li>生成分镜：每章节约消耗 30–80 积分，随场景复杂度浮动。</li>
              <li>生成漫画：单张图片约消耗 10–30 积分，随画面复杂度浮动。</li>
              <li>长图合成：仅前端操作，不额外消耗积分。</li>
            </ul>
          </li>
          <li>充值选项（人民币对应积分）：
            <ul className="grid">
              <li>¥10 → +100 积分</li>
              <li>¥30 → +320 积分</li>
              <li>¥50 → +600 积分</li>
              <li>¥100 → +1300 积分</li>
              <li>¥200 → +2700 积分</li>
            </ul>
          </li>
          <li>积分存储：保存在浏览器本地（localStorage），不同设备不共享。</li>
        </ul>
        <div className="callout warn">
          <strong>声明：</strong> 充值为前端演示，不接入真实支付；仅改变本地积分数值。
        </div>
      </section>

      <section id="profile" className="help-section">
        <h2>个人中心</h2>
        <ul>
          <li>历史记录：查看过往生成的漫画，支持预览与详情。</li>
          <li>头像上传：支持本地头像图片上传与预览。</li>
          <li>筛选与分页：根据关键字快速定位历史记录，逐页加载更多。</li>
        </ul>
      </section>

      <section id="faq" className="help-section">
        <h2>常见问题</h2>
        <dl>
          <dt>登录失败怎么办？</dt>
          <dd>检查网络，确保服务器地址可访问；若账号错误，请重试或注册新账号。</dd>
          <dt>生成速度很慢？</dt>
          <dd>图片生成受网络与后端队列影响，建议等待或减少单次生成数量。</dd>
          <dt>预览空白或图片加载失败？</dt>
          <dd>尝试刷新页面；如仍失败，可在个人中心使用历史记录作为数据源。</dd>
          <dt>积分显示异常？</dt>
          <dd>清理浏览器缓存可能会重置本地积分；可通过充值选项恢复到需要的数值。</dd>
        </dl>
      </section>

      <section id="support" className="help-section">
        <h2>反馈与支持</h2>
        <p>如需反馈问题或提出建议，请在项目仓库提 Issue，或与维护者联系。请附带复现步骤与截图，便于定位问题。</p>
      </section>
    </div>
  )
}

export default HelpPage