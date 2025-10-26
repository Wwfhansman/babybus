# 小说转连环画系统运行说明

本文档提供小说转连环画系统的运行环境配置和使用说明。

## 系统概述

小说转连环画系统是一个基于Flask和Socket.IO的Web应用，能够将小说文本转换为连环画图片。系统集成了豆包1.5 LLM模型进行文本处理和Seedream AIGC模型进行图像生成。

## 环境要求

- Python 3.7+
- pip包管理工具
- 网络连接（需要访问豆包API）

## 安装步骤

### 1. 克隆代码库

```bash
cd d:\babybus
# 确保代码已经在backend目录下
```

### 2. 安装依赖包

```bash
cd d:\babybus\backend
pip install -r requirements.txt
```

如果没有requirements.txt文件，请运行以下命令手动安装所需包：

```bash
pip install flask flask-cors flask-socketio volcengine-python-sdk[ark] python-docx pillow
```

### 3. 配置环境变量

系统需要设置以下环境变量：

- `ARK_API_KEY`: 豆包API的访问密钥
- `SECRET_KEY`: Flask应用的密钥（可选，默认使用开发密钥）
- `ROLE_DOCX_PATH`: 处理规则文档路径（可选，默认会搜索常见位置）

Windows系统下设置环境变量：

```cmd
set ARK_API_KEY=your_ark_api_key_here
set SECRET_KEY=your_secret_key_here
```

或者在运行前创建`.env`文件（需要安装python-dotenv包）：

```
ARK_API_KEY=your_ark_api_key_here
SECRET_KEY=your_secret_key_here
```

### 4. 准备处理规则文档

确保在以下位置之一存在`role.docx`文件：
- `./python_LLM/role.docx`
- `./role.docx`
- `python_LLM/role.docx`

## 运行系统

### 启动后端服务

在`backend`目录下执行：

```bash
python main_api.py
```

服务将在`http://0.0.0.0:5000`启动，并支持WebSocket连接。

### 访问系统

1. **API测试**：可以通过访问`http://localhost:5000/`获取API列表
2. **WebSocket测试**：打开`http://localhost:5000/websocket_test.html`进行前端功能测试

## API端点说明

系统提供以下主要API端点：

### 用户管理
- `POST /api/register` - 用户注册
- `POST /api/login` - 用户登录
- `POST /api/logout` - 用户登出
- `GET /api/profile` - 获取用户信息
- `POST /api/avatar` - 上传用户头像
- `DELETE /api/avatar` - 删除用户头像

### 核心功能
- `POST /api/process-novel` - 处理小说文本
- `POST /api/generate-comics` - 生成连环画
- `POST /api/full-process` - 完整流程处理（文本处理+图像生成）
- `GET /api/results/<process_id>` - 获取处理结果
- `GET /api/history` - 获取历史记录
- `GET /api/history/<process_id>` - 获取历史记录详情
- `DELETE /api/history/<int:history_id>` - 删除历史记录

### 状态检查
- `GET /api/health` - 健康检查

## WebSocket事件

系统支持以下WebSocket事件：

### 认证相关
- `connect` - 客户端连接
- `disconnect` - 客户端断开连接
- `authenticate` - 认证请求
- `authentication_result` - 认证结果

### 处理相关
- `process_novel` - 处理小说文本（第一阶段）
- `text_processing_complete` - 文本处理完成
- `full_process` - 完整流程处理
- `full_process_text_complete` - 文本处理完成
- `start_comics_generation` - 开始生成连环画
- `full_process_progress` - 处理进度
- `full_process_complete` - 完整流程处理完成

### 状态和错误
- `connection_status` - 连接状态
- `process_status` - 处理状态
- `process_error` - 处理错误
- `full_process_error` - 完整流程错误

## 典型使用流程

### 1. 用户注册和登录

```bash
# 注册
curl -X POST http://localhost:5000/api/register \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "password123", "email": "test@example.com"}'

# 登录
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "password123"}'
```

### 2. 完整流程处理

使用登录返回的token进行认证：

```bash
curl -X POST http://localhost:5000/api/full-process \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -d '{"novel_text": "从前有座山，山上有座庙...", "title": "测试故事", "description": "一个简单的测试故事"}'
```

## 故障排除

### 常见问题

1. **API连接失败**
   - 检查`ARK_API_KEY`是否正确设置
   - 确保网络连接正常，能够访问豆包API

2. **找不到role.docx文件**
   - 确保`role.docx`文件存在于正确的位置
   - 可以通过设置`ROLE_DOCX_PATH`环境变量指定文件路径

3. **数据库错误**
   - 检查数据库文件权限
   - 系统使用SQLite，不需要额外的数据库服务

4. **头像上传失败**
   - 确保上传的文件格式正确（png, jpg, jpeg, gif）
   - 检查文件大小是否超过2MB限制
   - 验证avatars目录是否存在且有写入权限

### 日志查看

系统会在控制台输出详细日志，可以通过日志查看错误信息。在生产环境中，可以配置更详细的日志记录。

## 安全注意事项

1. 生产环境中务必修改`SECRET_KEY`为强随机值
2. 定期清理过期的用户会话
3. 考虑添加API限流机制防止滥用
4. 敏感数据传输建议使用HTTPS
5. 确保`ARK_API_KEY`安全存储，避免硬编码在代码中

## 停止服务

按`Ctrl+C`停止运行中的服务。