# 小说生成漫画应用

本项目目标：根据一篇小说自动生成相应漫画。约束：不使用第三方“agent”编排能力，仅允许调用 LLM、各类 AIGC（图像/视频/音频）模型与语音 TTS。当前前端为 Windows 桌面应用（Flutter 方案），后端使用 Python。


## 1. 项目愿景与范围
- 目标：从长文本小说到分镜、角色、场景、对话气泡与旁白的漫画生成与导出。
- 非目标：复杂互动剧情编辑器、在线 AI 漫画二次编辑器、商业发行渠道集成、自动爬取受版权保护文本、付费模式完善。

## 2. 整体架构（Windows 桌面，云端 API 优先）
- 桌面端（Windows）：
  - 方案：Flutter Windows（Material3 或 fluent_ui，现代视觉与动效强）。
- 本机服务（Orchestrator）：Python FastAPI，负责任务编排、状态管理与云 API 调用。
- 云端推理与模型（不训练，仅调用）：
  - LLM：Qwen Cloud（或其他云提供商）。
  - 图像：SDXL/FLUX 云端生成 API（支持图生图、ControlNet/IP-Adapter）。
  - TTS：云端语音 API（如 Edge-TTS/Azure/其他服务）。
- IPC：桌面端与本机服务通过 `HTTP (localhost)` 通信，统一鉴权与速率限制。
- 存储：本地目录（项目/素材/导出），可选对象存储（后续拓展）。

## 3. 核心模块（MVP ）
- 文本解析：小说清洗、章节/段落切分、角色/地点抽取（LLM 辅助）。
- 分镜脚本：LLM 生成场景摘要、镜头、构图与情绪标签。
- 图像生成（云端）：根据分镜与风格调用云 API 生成页面/面板底图；参考图/ControlNet 保持构图与一致性。
- 文本气泡与排版：从台词生成气泡，自动布局到面板中。
- 导出：页面（PNG/JPG）、书册（PDF）。

## 4. 桌面端技术选型与理由（Flutter 方案）
- Flutter（Windows）：
  - 优点：现代 UI 与动效强；跨平台潜力；体积与性能优于多数 Web 壳；生态稳定。
  - 风险：需配置 Windows 桌面构建环境（Visual Studio + C++ 工作负载）；部分插件桌面支持差异，需要选型验证。
- 组件与设计库（建议）：
  - 设计与组件：`material3` + 自定义主题（暗/亮）；或 `fluent_ui`（原生 Windows 风格）。
  - 路由与状态：`go_router`、`riverpod`/`bloc`。
  - 网络与工具：`dio`、`file_selector`、`window_manager`、`flutter_acrylic`（Mica/Acrylic）、`lottie`（动效）。
- Material3 vs Fluent 选择：
  - 只做 Windows 且追求 Fluent 原生质感 → 选 `fluent_ui`。
  - 目标是 5 天快速现代化与更强生态 → 选 `material3` + 自定义主题。

## 5. 数据流（端到端，云 API）
1) 输入小说与清洗 → 2) 场景切分与角色抽取 → 3) 分镜脚本与 Prompt → 4) 云端图像生成（支持图生图/ControlNet） → 5) 气泡排版 → 6) 导出。

## 6. API 草案（桌面调用本机服务，本机服务转发云端）
- `POST http://127.0.0.1:<port>/novel/upload` 上传文本并创建项目。
- `POST /pipeline/start` 启动生成流程（可选阶段）。
- `GET /job/{id}` 查询任务状态与进度。
- `GET /assets/{id}` 获取生成的图像/音频/文档。

## 7. 桌面端交互流程
- 导入小说 → 参数配置（风格/角色/面板） → 预览分镜 → 批量生成 → 审核 → 导出。

## 8. 一致性与质量
- 角色一致性：参考图 + IP-Adapter/FaceID（云 API 支持），固定 Prompt 片段与种子。
- 构图一致性：分镜模板 + ControlNet（姿态/深度/线稿），尽量使用图生图稳态化。
- 文本对齐：气泡指向与遮挡避免，台词长度控制与断行策略。

## 9. 成本、性能与扩展
- 成本控制：云调用缓存（哈希 key）；避免重复生成；分辨率与步数上限；缩略图预览。
- 并发与速率：队列化云调用；最大并发；处理云端 429/5xx 重试。

## 10. 合规与风险
- 版权与来源：仅处理授权文本；保留溯源元数据。
- 内容安全：过滤违规提示与图像；年龄分级提示。
- 隐私：本机优先存储；云调用仅上传必要内容；敏感内容加密传输。

## 11. 部署与环境（Windows + Flutter）
- 运行环境：Windows 10/11；Python 3.10+；Flutter 3.22+；Visual Studio（含“Desktop development with C++”）。
- 开发准备：
  - `flutter config --enable-windows-desktop`
  - `flutter doctor`（确保 Windows 构建工具安装完成）
- 打包与分发：
  - Flutter：`flutter build windows` 生成可执行文件；如需安装包可用 `msix` 插件。
  - 后端：PyInstaller（可选）将 FastAPI 服务打包为可执行；或以独立 Python 环境运行。
- 启动策略：应用启动时后台拉起 Python 服务（端口冲突检测与恢复）。

## 12. 开发指南
- 后端：`pip install -r requirements.txt`；启动：`uvicorn app.main:app --host 127.0.0.1 --port 8787 --reload`。
- 桌面端（Flutter）：
  - 初始化与运行：`flutter create app && flutter run -d windows`
  - 构建与打包：`flutter build windows`（可选 `msix` 发布）
- 云端配置：在 `.env` 设置 `LLM_PROVIDER`、`LLM_API_KEY`、`IMAGE_API_KEY`、`TTS_API_KEY` 等（仅后端读取）。

## 13. 目录结构建议
```
project/
  desktop/      # Flutter Windows 客户端工程
  backend/      # Python 服务（FastAPI/云 API 调用编排）
  configs/      # 云服务配置与密钥管理（本机 .env）
  data/         # 输入与中间数据
  outputs/      # 生成图片/音频/导出文档
  docs/
```

## 14. Prompt 模板与标注规范
- 模板：场景摘要、分镜、角色卡、风格描述（固定片段 + 变量）。
- 参考图：角色与场景参考图片目录；图生图使用说明。
- 布局标注：面板网格、气泡类型与指向规则。


