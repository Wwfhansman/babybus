# 小说转连环画系统架构设计文档

## 1. 系统概述

小说转连环画系统是一个集自然语言处理和AI图像生成于一体的Web应用系统。该系统能够将用户输入的小说文本通过大语言模型处理后，再利用AI绘画模型生成对应的连环漫画场景，为用户提供从文字到图像的创意转换服务。

### 1.1 核心功能

- 用户认证与管理（注册、登录、个人信息管理、头像上传）
- 小说文本处理与场景提取
- 漫画图像生成
- 历史记录管理
- 实时进度反馈（WebSocket通信）

### 1.2 系统架构

系统采用三层架构设计：

1. **表示层**：Web前端界面（通过HTML页面和WebSocket实现）
2. **业务逻辑层**：基于Flask的API服务和Socket.IO实时通信
3. **数据层**：SQLite数据库存储用户信息和历史记录

## 2. 系统架构图

```
┌─────────────────────┐      ┌───────────────────────┐      ┌───────────────────────┐
│   前端界面层        │      │     业务逻辑层        │      │       数据层          │
│                     │      │                       │      │                       │
│ - WebSocket测试页面 │<────>│ - Flask RESTful API   │<────>│ - SQLite数据库        │
│ - 其他客户端应用    │      │ - Socket.IO服务       │      │ - 文件系统（JSON文件,  │
│                     │      │ - 用户认证服务        │      │   头像文件）          │
└─────────────────────┘      └─────────────┬─────────┘      └───────────────────────┘
                                          │
                                          ▼
                           ┌─────────────────────────┐
                           │        外部服务         │
                           │                         │
                           │ - 豆包1.5 LLM模型       │
                           │ - Seedream AIGC模型     │
                           └─────────────────────────┘
```

## 3. 模块规格

### 3.1 用户管理模块 (User Management)

**功能描述**：负责用户的注册、登录、会话管理以及个人资料维护。

**核心组件**：

| 组件 | 功能描述 | 实现文件 | <mcfile name="main_api.py" path="d:\babybus\backend\main_api.py"></mcfile> |
|------|----------|----------|----------------------------------------|
| 用户注册 | 创建新用户账号 | `/api/register` 路由 | 第65-98行 |
| 用户登录 | 验证用户身份并生成会话令牌 | `/api/login` 路由 | 第101-140行 |
| 用户登出 | 销毁用户会话 | `/api/logout` 路由 | 第143-157行 |
| 个人资料 | 获取和更新用户信息 | `/api/profile` 路由 | 第304-324行 |
| 头像管理 | 上传、获取和删除用户头像 | `/api/avatar` 路由 | 第160-301行 |
| 会话管理 | 创建和验证用户会话 | DatabaseManager类方法 | <mcfile name="database.py" path="d:\babybus\backend\database.py"></mcfile> 第234-275行 |

**数据模型**：

```python
# 用户表 (users)
{
    'id': INTEGER,          # 用户ID
    'username': TEXT,       # 用户名
    'password_hash': TEXT,  # 密码哈希
    'email': TEXT,          # 电子邮箱
    'avatar': TEXT,         # 头像文件路径
    'created_at': TIMESTAMP,# 创建时间
    'last_login': TIMESTAMP # 最后登录时间
}

# 会话表 (user_sessions)
{
    'id': INTEGER,          # 会话ID
    'user_id': INTEGER,     # 用户ID
    'session_token': TEXT,  # 会话令牌
    'created_at': TIMESTAMP,# 创建时间
    'expires_at': TIMESTAMP # 过期时间
}
```

### 3.2 文本处理模块 (Text Processing)

**功能描述**：接收用户输入的小说文本，通过豆包1.5 LLM模型处理，提取场景信息、角色和环境描述，为后续的图像生成做准备。

**核心组件**：

| 组件 | 功能描述 | 实现文件 | <mcfile name="doubao_1_5.py" path="d:\babybus\backend\python_LLM\doubao_1_5.py"></mcfile> |
|------|----------|----------|----------------------------------------|
| 文本处理 | 使用LLM处理小说文本 | `process_novel_text` 函数 | 第72-98行 |
| 流式处理 | 流式输出LLM处理结果 | `process_novel_text_streaming` 函数 | 第101-131行 |
| 结果保存 | 将处理结果保存为JSON | `save_to_json` 函数 | 第173-183行 |
| 规则加载 | 读取处理规则文档 | `read_role_docx` 函数 | 第43-52行 |

**API端点**：
- `POST /api/process-novel` - 处理小说文本
- WebSocket事件：`process_novel`, `text_processing_complete`

**处理流程**：
1. 接收小说文本输入
2. 加载处理规则
3. 调用豆包API处理文本
4. 解析返回的JSON结果
5. 保存处理结果
6. 返回场景信息、角色和环境描述

### 3.3 图像生成模块 (Image Generation)

**功能描述**：接收文本处理模块的输出，通过Seedream AIGC模型生成对应的漫画图像。

**核心组件**：

| 组件 | 功能描述 | 实现文件 | <mcfile name="seedream.py" path="d:\babybus\backend\python_aigc\seedream.py"></mcfile> |
|------|----------|----------|----------------------------------------|
| 图像生成 | 生成漫画图像 | `process_llm_json_and_generate_comics` 函数 | 第14-87行 |
| 文件生成 | 从JSON文件生成漫画 | `generate_comics_from_json_file` 函数 | 第89-101行 |
| 结果保存 | 保存生成结果 | `save_comic_results` 函数 | 第103-130行 |

**API端点**：
- `POST /api/generate-comics` - 生成连环画
- WebSocket事件：`start_comics_generation`, `full_process_progress`

**处理流程**：
1. 接收文本处理结果（JSON格式）
2. 提取角色和环境一致性信息
3. 为每个场景构建提示词
4. 调用Seedream API生成图像
5. 保存生成的图像URL和相关信息
6. 返回生成结果

### 3.4 完整流程模块 (Full Process)

**功能描述**：整合文本处理和图像生成功能，提供端到端的小说转连环画服务。

**核心组件**：

| 组件 | 功能描述 | 实现文件 | <mcfile name="main_api.py" path="d:\babybus\backend\main_api.py"></mcfile> |
|------|----------|----------|----------------------------------------|
| 完整处理 | 处理小说并生成漫画 | `/api/full-process` 路由 | 第547-608行 |
| 进度反馈 | 提供实时处理进度 | `process_llm_json_and_generate_comics_with_progress` 函数 | 第920-930行 |

**WebSocket事件**：
- `full_process` - 开始完整流程
- `full_process_text_complete` - 文本处理完成
- `full_process_progress` - 处理进度更新
- `full_process_complete` - 完整流程完成

**处理流程**：
1. 接收小说文本输入
2. 调用文本处理模块处理文本
3. 调用图像生成模块生成漫画
4. 实时反馈处理进度
5. 保存处理结果到数据库和文件系统
6. 返回最终生成的漫画

### 3.5 历史记录模块 (History Management)

**功能描述**：管理用户的处理历史，包括存储、查询和删除历史记录。

**核心组件**：

| 组件 | 功能描述 | 实现文件 | <mcfile name="database.py" path="d:\babybus\backend\database.py"></mcfile> |
|------|----------|----------|----------------------------------------|
| 记录保存 | 保存漫画生成记录 | `save_comics_history` 函数 | 第151-177行 |
| 记录查询 | 查询用户历史记录 | `get_user_comics_history` 函数 | 第179-216行 |
| 详情查询 | 查询单个记录详情 | `get_comics_by_process_id` 函数 | 第218-247行 |
| 记录删除 | 删除历史记录 | `delete_comics_history` 函数 | 第249-264行 |

**API端点**：
- `GET /api/history` - 获取历史记录列表
- `GET /api/history/<process_id>` - 获取历史记录详情
- `DELETE /api/history/<int:history_id>` - 删除历史记录

**数据模型**：

```python
# 漫画历史记录表 (comics_history)
{
    'id': INTEGER,          # 记录ID
    'user_id': INTEGER,     # 用户ID
    'process_id': TEXT,     # 处理ID
    'novel_text': TEXT,     # 小说文本
    'llm_result': TEXT,     # LLM处理结果（JSON格式）
    'comic_results': TEXT,  # 漫画生成结果（JSON格式）
    'created_at': TIMESTAMP,# 创建时间
    'title': TEXT,          # 标题（可选）
    'description': TEXT     # 描述（可选）
}
```

### 3.6 数据库管理模块 (Database Management)

**功能描述**：提供数据库连接、初始化和CRUD操作的封装。

**核心组件**：

| 组件 | 功能描述 | 实现文件 | <mcfile name="database.py" path="d:\babybus\backend\database.py"></mcfile> |
|------|----------|----------|----------------------------------------|
| 初始化 | 创建数据库表 | `init_database` 方法 | 第11-50行 |
| 用户操作 | 用户相关数据库操作 | 多个方法 | 第52-149行 |
| 会话操作 | 会话相关数据库操作 | 多个方法 | 第266-300行 |
| 清理 | 清理过期会话 | `cleanup_expired_sessions` 方法 | 第302-315行 |

## 4. 数据流程

### 4.1 用户注册/登录流程

```
用户 -> 注册/登录请求 -> 数据验证 -> 密码哈希/验证 -> 创建/获取会话 -> 返回会话令牌
```

### 4.2 小说转漫画流程

```
用户 -> 输入小说文本 -> 验证用户身份 -> 文本处理(LLM) -> 生成场景信息 -> 图像生成(AIGC) -> 返回漫画结果 -> 保存历史记录
```

### 4.3 WebSocket通信流程

```
客户端连接 -> 认证请求 -> 处理小说文本 -> 返回文本处理结果 -> 开始生成图像 -> 实时反馈进度 -> 返回最终结果
```

## 5. 技术栈

| 类别 | 技术/框架 | 用途 | 来源 |
|------|----------|------|------|
| 后端框架 | Flask | Web服务器和RESTful API | <mcfile name="main_api.py" path="d:\babybus\backend\main_api.py"></mcfile> |
| 实时通信 | Flask-SocketIO | WebSocket通信 | <mcfile name="main_api.py" path="d:\babybus\backend\main_api.py"></mcfile> |
| 数据库 | SQLite | 数据存储 | <mcfile name="database.py" path="d:\babybus\backend\database.py"></mcfile> |
| 大语言模型 | 豆包1.5 | 文本处理 | <mcfile name="doubao_1_5.py" path="d:\babybus\backend\python_LLM\doubao_1_5.py"></mcfile> |
| AI图像生成 | Seedream | 图像生成 | <mcfile name="seedream.py" path="d:\babybus\backend\python_aigc\seedream.py"></mcfile> |
| API客户端 | volcenginesdkarkruntime | 访问豆包API | <mcfile name="doubao_1_5.py" path="d:\babybus\backend\python_LLM\doubao_1_5.py"></mcfile> |
| 文档处理 | python-docx | 读取处理规则 | <mcfile name="doubao_1_5.py" path="d:\babybus\backend\python_LLM\doubao_1_5.py"></mcfile> |
| 图像处理 | Pillow | 头像处理 | <mcfile name="main_api.py" path="d:\babybus\backend\main_api.py"></mcfile> |
| 跨域支持 | Flask-CORS | 支持跨域请求 | <mcfile name="main_api.py" path="d:\babybus\backend\main_api.py"></mcfile> |

## 6. 接口规范

### 6.1 RESTful API接口

**通用规范**：
- 所有API返回JSON格式数据
- 需要认证的接口使用Bearer Token认证
- 支持CORS，允许跨域请求
- 提供OPTIONS方法支持预检请求

**认证格式**：
```
Authorization: Bearer {session_token}
```

**响应格式**：
```json
// 成功响应
{
  "success": true,
  "message": "操作成功",
  "data": {...}
}

// 错误响应
{
  "error": "错误消息"
}
```

### 6.2 WebSocket事件规范

**事件命名约定**：
- 使用小写字母和下划线
- 事件名称具有描述性
- 状态事件以`_status`结尾
- 错误事件以`_error`结尾
- 完成事件以`_complete`结尾

**消息格式**：
```javascript
// 客户端发送
{
  event: "事件名称",
  data: {
    // 事件数据
  }
}

// 服务器响应
{
  status: "处理状态",
  message: "状态描述",
  data: {
    // 响应数据
  }
}
```

## 7. 扩展性设计

### 7.1 模块化架构

系统采用模块化设计，各个功能模块相对独立，便于扩展和维护：

- LLM模块可替换为其他大语言模型
- AIGC模块可集成其他图像生成服务
- 数据库模块可升级为更强大的数据库系统

### 7.2 配置灵活性

系统通过环境变量和配置文件提供灵活的配置选项：

- API密钥通过环境变量配置
- 处理规则可通过文档调整
- 存储路径和文件命名可配置

### 7.3 性能优化点

- 可实现结果缓存机制，避免重复处理
- 可添加任务队列，处理长时间运行的生成任务
- 可优化图像生成流程，并行处理多个场景

## 8. 安全考虑

### 8.1 认证与授权

- 密码哈希存储
- 会话令牌验证
- 资源访问权限控制

### 8.2 输入验证

- 用户输入清理
- 文件类型和大小验证
- SQL注入防护

### 8.3 数据保护

- 敏感信息加密
- 定期清理过期数据
- 防止信息泄露

## 9. 总结

小说转连环画系统采用模块化、可扩展的架构设计，结合最新的AI技术，为用户提供从文本到图像的创意转换服务。系统通过RESTful API和WebSocket提供灵活的交互方式，同时注重安全性和用户体验。通过合理的架构设计和组件划分，系统具备良好的可维护性和扩展性，能够适应未来功能扩展和性能优化的需求。