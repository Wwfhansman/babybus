from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import os
import sys
import json
import hashlib
import secrets
from datetime import datetime

# 添加模块路径
sys.path.append('./python_LLM')
sys.path.append('./python_aigc')

try:
    from python_LLM.doubao_1_5 import (
        process_novel_text,
        save_to_json,
        load_json_file,
        read_role_docx,
        export_json_for_aigc
    )
    from python_aigc.seedream import (
        process_llm_json_and_generate_comics,
        generate_comics_from_json_file,
        save_comic_results
    )
except ImportError as e:
    print(f"导入模块失败: {e}")
    sys.exit(1)

# 导入数据库模块
from database import DatabaseManager

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

# 配置CORS，允许所有来源和所有方法
CORS(app, resources={r"/*": {"origins": "*", "methods": ["GET", "POST", "OPTIONS"]}})
# 配置SocketIO
socketio = SocketIO(app,
                    cors_allowed_origins="*",
                    async_mode='threading',
                    transports=['websocket', 'polling'],
                    ping_timeout=30,
                    ping_interval=10,
                    max_http_buffer_size=1024 * 1024 * 10)

# 全局变量
processing_rules = None
db = DatabaseManager()

# 存储处理状态
processing_states = {}


def hash_password(password):
    """密码哈希函数"""
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(password, password_hash):
    """验证密码"""
    return hash_password(password) == password_hash


def generate_session_token():
    """生成会话令牌"""
    return secrets.token_urlsafe(32)


def get_user_from_request():
    """从请求中获取用户信息"""
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return None

    session_token = auth_header.replace('Bearer ', '')
    session = db.get_session(session_token)
    if session:
        return db.get_user_by_id(session['user_id'])
    return None


def safe_strip(value):
    """安全地去除字符串两端的空白字符，处理None值"""
    if value is None:
        return ''
    return str(value).strip()


# 用户认证相关的HTTP API
@app.route('/api/register', methods=['POST', 'OPTIONS'])
def register():
    """用户注册"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        # 确保请求有JSON数据
        if not request.is_json:
            return jsonify({"error": "请求必须是JSON格式"}), 400

        data = request.get_json()
        if not data:
            return jsonify({"error": "请求数据为空"}), 400

        # 安全地获取和清理输入数据
        username = safe_strip(data.get('username'))
        password = data.get('password')
        email = safe_strip(data.get('email'))

        print(f"注册请求: username='{username}', email='{email}'")

        if not username or not password:
            return jsonify({"error": "用户名和密码不能为空"}), 400

        if len(username) < 3:
            return jsonify({"error": "用户名至少3个字符"}), 400

        if len(password) < 6:
            return jsonify({"error": "密码至少6个字符"}), 400

        password_hash = hash_password(password)
        user_id = db.create_user(username, password_hash, email if email else None)

        if user_id is None:
            return jsonify({"error": "用户名或邮箱已存在"}), 400

        return jsonify({
            "success": True,
            "message": "注册成功",
            "user_id": user_id
        })

    except Exception as e:
        print(f"注册异常: {str(e)}")
        return jsonify({"error": f"注册失败: {str(e)}"}), 500


@app.route('/api/login', methods=['POST', 'OPTIONS'])
def login():
    """用户登录"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        if not request.is_json:
            return jsonify({"error": "请求必须是JSON格式"}), 400

        data = request.get_json()
        if not data:
            return jsonify({"error": "请求数据为空"}), 400

        username = safe_strip(data.get('username'))
        password = data.get('password')

        print(f"登录请求: username='{username}'")

        if not username or not password:
            return jsonify({"error": "用户名和密码不能为空"}), 400

        user = db.get_user_by_username(username)
        if not user or not verify_password(password, user['password_hash']):
            return jsonify({"error": "用户名或密码错误"}), 401

        # 生成会话令牌
        session_token = generate_session_token()
        db.create_session(user['id'], session_token)
        db.update_user_login_time(user['id'])

        return jsonify({
            "success": True,
            "message": "登录成功",
            "session_token": session_token,
            "user": {
                "id": user['id'],
                "username": user['username'],
                "email": user['email']
            }
        })

    except Exception as e:
        print(f"登录异常: {str(e)}")
        return jsonify({"error": f"登录失败: {str(e)}"}), 500


@app.route('/api/logout', methods=['POST', 'OPTIONS'])
def logout():
    """用户登出"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            session_token = auth_header.replace('Bearer ', '')
            db.delete_session(session_token)

        return jsonify({"success": True, "message": "登出成功"})
    except Exception as e:
        print(f"登出异常: {str(e)}")
        return jsonify({"error": f"登出失败: {str(e)}"}), 500


@app.route('/api/profile', methods=['GET', 'OPTIONS'])
def get_profile():
    """获取用户信息"""
    if request.method == 'OPTIONS':
        return '', 200

    user = get_user_from_request()
    if not user:
        return jsonify({"error": "未认证"}), 401

    return jsonify({
        "user": {
            "id": user['id'],
            "username": user['username'],
            "email": user['email'],
            "created_at": user['created_at'],
            "last_login": user['last_login']
        }
    })


@app.route('/api/history', methods=['GET', 'OPTIONS'])
def get_history():
    """获取用户历史记录"""
    if request.method == 'OPTIONS':
        return '', 200

    user = get_user_from_request()
    if not user:
        return jsonify({"error": "未认证"}), 401

    limit = request.args.get('limit', 50, type=int)
    offset = request.args.get('offset', 0, type=int)

    history = db.get_user_comics_history(user['id'], limit, offset)

    # 简化返回数据，避免传输过大
    simplified_history = []
    for item in history:
        simplified_history.append({
            'id': item['id'],
            'process_id': item['process_id'],
            'title': item['title'] or f"漫画 {item['process_id']}",
            'description': item['description'],
            'created_at': item['created_at'],
            'total_scenes': len(item['comic_results']) if item['comic_results'] else 0,
            'preview_image': item['comic_results'][0]['url'] if item['comic_results'] and len(
                item['comic_results']) > 0 else None
        })

    return jsonify({
        "history": simplified_history,
        "total": len(history)
    })


@app.route('/api/history/<process_id>', methods=['GET', 'OPTIONS'])
def get_history_detail(process_id):
    """获取历史记录详情"""
    if request.method == 'OPTIONS':
        return '', 200

    user = get_user_from_request()
    if not user:
        return jsonify({"error": "未认证"}), 401

    record = db.get_comics_by_process_id(process_id)
    if not record or record['user_id'] != user['id']:
        return jsonify({"error": "记录不存在或无权访问"}), 404

    return jsonify({
        "history": record
    })


@app.route('/api/history/<int:history_id>', methods=['DELETE', 'OPTIONS'])
def delete_history(history_id):
    """删除历史记录"""
    if request.method == 'OPTIONS':
        return '', 200

    user = get_user_from_request()
    if not user:
        return jsonify({"error": "未认证"}), 401

    success = db.delete_comics_history(user['id'], history_id)
    if not success:
        return jsonify({"error": "删除失败"}), 404

    return jsonify({"success": True, "message": "删除成功"})


# 原有的健康检查端点
@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查端点"""
    return jsonify({"status": "healthy", "message": "服务运行正常"})


# 添加根路径路由，避免404错误
@app.route('/')
def index():
    """根路径"""
    return jsonify({
        "message": "小说转连环画系统API",
        "version": "1.0",
        "endpoints": [
            "/api/register - 用户注册",
            "/api/login - 用户登录",
            "/api/profile - 获取用户信息",
            "/api/history - 获取历史记录",
            "/api/process-novel - 处理小说文本",
            "/api/generate-comics - 生成连环画",
            "/api/full-process - 完整流程处理"
        ]
    })


# 原有的其他API端点保持不变，但需要添加OPTIONS方法支持
@app.route('/api/process-novel', methods=['POST', 'OPTIONS'])
def process_novel():
    """处理小说文本"""
    if request.method == 'OPTIONS':
        return '', 200

    user = get_user_from_request()
    if not user:
        return jsonify({"error": "未认证"}), 401

    try:
        if not request.is_json:
            return jsonify({"error": "请求必须是JSON格式"}), 400

        data = request.get_json()
        if not data:
            return jsonify({"error": "请求数据为空"}), 400

        novel_text = data.get('novel_text', '')

        if not novel_text:
            return jsonify({"error": "小说文本不能为空"}), 400

        # 调用LLM处理
        llm_result = process_novel_text(novel_text, processing_rules)

        if not llm_result:
            return jsonify({"error": "LLM处理失败"}), 500

        # 生成唯一ID
        process_id = datetime.now().strftime('%Y%m%d_%H%M%S')

        # 保存LLM结果
        llm_filename = f"llm_{process_id}.json"
        save_to_json(llm_result, llm_filename)

        return jsonify({
            "process_id": process_id,
            "llm_result": llm_result,
            "message": "小说处理完成"
        })

    except Exception as e:
        print(f"处理小说异常: {str(e)}")
        return jsonify({"error": f"处理失败: {str(e)}"}), 500


@app.route('/api/generate-comics', methods=['POST', 'OPTIONS'])
def generate_comics():
    """生成连环画"""
    if request.method == 'OPTIONS':
        return '', 200

    user = get_user_from_request()
    if not user:
        return jsonify({"error": "未认证"}), 401

    try:
        if not request.is_json:
            return jsonify({"error": "请求必须是JSON格式"}), 400

        data = request.get_json()
        if not data:
            return jsonify({"error": "请求数据为空"}), 400

        # 支持两种输入：process_id 或 直接的json_data
        process_id = data.get('process_id')
        json_data = data.get('json_data')

        if process_id:
            # 从文件加载
            llm_filename = f"llm_{process_id}.json"
            if not os.path.exists(llm_filename):
                return jsonify({"error": "找不到对应的处理结果"}), 404
            json_data = load_json_file(llm_filename)

        if not json_data:
            return jsonify({"error": "需要提供process_id或json_data"}), 400

        # 调用AIGC生成连环画
        comic_results = process_llm_json_and_generate_comics(json_data)

        if not comic_results:
            return jsonify({"error": "连环画生成失败"}), 500

        # 保存结果
        comic_filename = f"comic_{process_id if process_id else datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        save_comic_results(comic_results, json_data, comic_filename)

        return jsonify({
            "comic_results": comic_results,
            "total_scenes": len(comic_results),
            "message": "连环画生成完成"
        })

    except Exception as e:
        print(f"生成漫画异常: {str(e)}")
        return jsonify({"error": f"生成失败: {str(e)}"}), 500


@app.route('/api/full-process', methods=['POST', 'OPTIONS'])
def full_process():
    """完整流程：从小说到连环画"""
    if request.method == 'OPTIONS':
        return '', 200

    user = get_user_from_request()
    if not user:
        return jsonify({"error": "未认证"}), 401

    try:
        if not request.is_json:
            return jsonify({"error": "请求必须是JSON格式"}), 400

        data = request.get_json()
        if not data:
            return jsonify({"error": "请求数据为空"}), 400

        novel_text = data.get('novel_text', '')
        title = safe_strip(data.get('title'))
        description = safe_strip(data.get('description'))

        if not novel_text:
            return jsonify({"error": "小说文本不能为空"}), 400

        # 第一步：LLM处理
        llm_result = process_novel_text(novel_text, processing_rules)
        if not llm_result:
            return jsonify({"error": "LLM处理失败"}), 500

        # 第二步：AIGC生成
        comic_results = process_llm_json_and_generate_comics(llm_result)
        if not comic_results:
            return jsonify({"error": "连环画生成失败"}), 500

        # 生成唯一ID
        process_id = datetime.now().strftime('%Y%m%d_%H%M%S')

        # 保存结果到文件
        llm_filename = f"llm_{process_id}.json"
        comic_filename = f"comic_{process_id}.json"

        save_to_json(llm_result, llm_filename)
        save_comic_results(comic_results, llm_result, comic_filename)

        # 保存到数据库历史记录
        db.save_comics_history(
            user_id=user['id'],
            process_id=process_id,
            novel_text=novel_text,
            llm_result=llm_result,
            comic_results=comic_results,
            title=title,
            description=description
        )

        return jsonify({
            "process_id": process_id,
            "llm_result": llm_result,
            "comic_results": comic_results,
            "total_scenes": len(comic_results),
            "message": "完整流程处理完成"
        })

    except Exception as e:
        print(f"完整流程异常: {str(e)}")
        return jsonify({"error": f"处理失败: {str(e)}"}), 500


@app.route('/api/results/<process_id>', methods=['GET', 'OPTIONS'])
def get_results(process_id):
    """获取处理结果"""
    if request.method == 'OPTIONS':
        return '', 200

    user = get_user_from_request()
    if not user:
        return jsonify({"error": "未认证"}), 401

    try:
        comic_filename = f"comic_{process_id}.json"
        if not os.path.exists(comic_filename):
            return jsonify({"error": "找不到对应的处理结果"}), 404

        with open(comic_filename, 'r', encoding='utf-8') as f:
            results = json.load(f)

        return jsonify(results)

    except Exception as e:
        print(f"获取结果异常: {str(e)}")
        return jsonify({"error": f"获取结果失败: {str(e)}"}), 500


# WebSocket 连接事件
@socketio.on('connect')
def handle_connect():
    """客户端连接事件"""
    print(f"客户端已连接: {request.sid}")
    # 注意：这里不立即发送认证成功消息，等待客户端发送认证信息
    emit('connection_status', {'status': 'connected', 'message': '成功连接到服务器'})


@socketio.on('disconnect')
def handle_disconnect():
    """客户端断开连接事件"""
    print(f"客户端已断开: {request.sid}")
    # 清理该客户端的处理状态
    if request.sid in processing_states:
        del processing_states[request.sid]


@socketio.on('authenticate')
def handle_authenticate(data):
    """WebSocket认证"""
    print(f"收到认证请求: {data}")
    session_token = data.get('session_token')

    if not session_token:
        print("认证失败: 未提供session_token")
        emit('authentication_result', {'success': False, 'error': '未提供认证令牌'})
        return

    session = db.get_session(session_token)
    if not session:
        print(f"认证失败: 无效的session_token: {session_token}")
        emit('authentication_result', {'success': False, 'error': '认证令牌无效或已过期'})
        return

    # 认证成功
    user = db.get_user_by_id(session['user_id'])
    if not user:
        print(f"认证失败: 用户不存在: {session['user_id']}")
        emit('authentication_result', {'success': False, 'error': '用户不存在'})
        return

    print(f"认证成功: user_id={user['id']}, username={user['username']}")

    # 存储处理状态
    processing_states[request.sid] = {
        'user_id': user['id'],
        'username': user['username']
    }

    emit('authentication_result', {
        'success': True,
        'username': user['username'],
        'message': '认证成功'
    })


# 原有的WebSocket处理函数保持不变，但需要确保有正确的用户认证检查
@socketio.on('process_novel')
def handle_process_novel(data):
    """WebSocket处理小说文本 - 第一阶段"""
    try:
        # 检查用户认证
        if request.sid not in processing_states or 'user_id' not in processing_states[request.sid]:
            emit('process_error', {'error': '请先登录'})
            return

        user_id = processing_states[request.sid]['user_id']
        novel_text = data.get('novel_text', '')

        if not novel_text:
            emit('process_error', {'error': '小说文本不能为空'})
            return

        emit('process_status', {'status': 'processing', 'message': '开始处理小说文本...', 'step': 1})

        # 调用LLM处理
        emit('process_status', {'status': 'processing', 'message': '正在调用LLM处理文本...', 'step': 2})
        llm_result = process_novel_text(novel_text, processing_rules)

        if not llm_result:
            emit('process_error', {'error': 'LLM处理失败'})
            return

        emit('process_status', {'status': 'processing', 'message': 'LLM处理完成，正在准备结果...', 'step': 3})

        # 生成唯一ID
        process_id = datetime.now().strftime('%Y%m%d_%H%M%S')

        # 保存LLM结果
        llm_filename = f"llm_{process_id}.json"
        save_to_json(llm_result, llm_filename)

        # 存储处理状态
        processing_states[request.sid].update({
            'process_id': process_id,
            'llm_result': llm_result,
            'llm_filename': llm_filename,
            'current_stage': 'text_processed',
            'novel_text': novel_text
        })

        # 发送文本处理结果给前端
        text_result = {
            "process_id": process_id,
            "scenes_count": len(llm_result.get('scenes_detail', [])),
            "character_consistency": llm_result.get('character_consistency', {}),
            "environment_consistency": llm_result.get('environment_consistency', {}),
            "scenes_preview": [
                {
                    "scene_index": i + 1,
                    "description": scene[:100] + "..." if len(scene) > 100 else scene
                }
                for i, scene in enumerate(llm_result.get('scenes_detail', [])[:5])  # 只发送前5个场景预览
            ],
            "message": "小说文本处理完成，准备生成连环画"
        }

        emit('text_processing_complete', text_result)

    except Exception as e:
        print(f"处理小说异常: {str(e)}")
        emit('process_error', {'error': f'处理失败: {str(e)}'})


@socketio.on('full_process')
def handle_full_process(data):
    """WebSocket完整流程：从小说到连环画 - 分阶段处理"""
    try:
        # 检查用户认证
        if request.sid not in processing_states or 'user_id' not in processing_states[request.sid]:
            emit('full_process_error', {'error': '请先登录'})
            return

        user_id = processing_states[request.sid]['user_id']
        novel_text = data.get('novel_text', '')
        title = safe_strip(data.get('title'))
        description = safe_strip(data.get('description'))

        if not novel_text:
            emit('full_process_error', {'error': '小说文本不能为空'})
            return

        emit('full_process_status', {'status': 'processing', 'message': '开始完整流程处理...', 'step': 1})

        # 第一步：LLM处理
        emit('full_process_status', {'status': 'processing', 'message': '正在处理小说文本...', 'step': 2})
        llm_result = process_novel_text(novel_text, processing_rules)

        if not llm_result:
            emit('full_process_error', {'error': 'LLM处理失败'})
            return

        # 生成唯一ID
        process_id = datetime.now().strftime('%Y%m%d_%H%M%S')

        # 保存LLM结果
        llm_filename = f"llm_{process_id}.json"
        save_to_json(llm_result, llm_filename)

        # 存储处理状态
        processing_states[request.sid].update({
            'process_id': process_id,
            'llm_result': llm_result,
            'llm_filename': llm_filename,
            'current_stage': 'text_processed',
            'novel_text': novel_text,
            'title': title,
            'description': description
        })

        # 发送文本处理结果给前端
        text_result = {
            "process_id": process_id,
            "scenes_count": len(llm_result.get('scenes_detail', [])),
            "character_consistency": llm_result.get('character_consistency', {}),
            "environment_consistency": llm_result.get('environment_consistency', {}),
            "scenes_detail": llm_result.get('scenes_detail', []),
            "message": "小说文本处理完成，开始生成连环画"
        }

        emit('full_process_text_complete', text_result)

    except Exception as e:
        print(f"完整流程异常: {str(e)}")
        emit('full_process_error', {'error': f'处理失败: {str(e)}'})


@socketio.on('start_comics_generation')
def handle_start_comics_generation(data):
    """开始生成连环画（在文本处理完成后由前端触发）"""
    try:
        process_id = data.get('process_id')

        # 从处理状态中获取数据
        client_state = processing_states.get(request.sid, {})
        if not client_state or client_state.get('process_id') != process_id:
            emit('generation_error', {'error': '找不到对应的处理状态'})
            return

        json_data = client_state.get('llm_result')
        if not json_data:
            emit('generation_error', {'error': '没有可用的文本处理结果'})
            return

        emit('full_process_status', {'status': 'processing', 'message': '开始生成连环画图片...', 'step': 4})

        # 调用AIGC生成连环画
        comic_results = process_llm_json_and_generate_comics_with_progress(
            json_data,
            progress_callback=lambda step, total: emit('full_process_progress', {
                'step': step,
                'total': total,
                'message': f'正在生成第 {step}/{total} 张图片...'
            })
        )

        if not comic_results:
            emit('full_process_error', {'error': '连环画生成失败'})
            return

        emit('full_process_status', {'status': 'processing', 'message': '正在保存最终结果...', 'step': 5})

        # 保存结果到文件
        llm_filename = f"llm_{process_id}.json"
        comic_filename = f"comic_{process_id}.json"

        save_to_json(json_data, llm_filename)
        save_comic_results(comic_results, json_data, comic_filename)

        # 保存到数据库历史记录
        user_id = client_state.get('user_id')
        novel_text = client_state.get('novel_text', '')
        title = client_state.get('title', '')
        description = client_state.get('description', '')

        if user_id:
            db.save_comics_history(
                user_id=user_id,
                process_id=process_id,
                novel_text=novel_text,
                llm_result=json_data,
                comic_results=comic_results,
                title=title,
                description=description
            )

        # 更新处理状态
        processing_states[request.sid]['comic_results'] = comic_results
        processing_states[request.sid]['comic_filename'] = comic_filename
        processing_states[request.sid]['current_stage'] = 'comics_generated'

        emit('full_process_complete', {
            "process_id": process_id,
            "llm_result": json_data,
            "comic_results": comic_results,
            "total_scenes": len(comic_results),
            "message": "完整流程处理完成"
        })

    except Exception as e:
        print(f"生成漫画异常: {str(e)}")
        emit('full_process_error', {'error': f'生成失败: {str(e)}'})


def process_llm_json_and_generate_comics_with_progress(json_data, progress_callback=None):
    """支持进度回调的AIGC生成函数"""
    try:
        from python_aigc.seedream import process_llm_json_and_generate_comics

        # 这里可以添加更详细的进度跟踪
        # 暂时使用原函数，在实际应用中可以根据需要修改seedream.py以支持进度回调
        return process_llm_json_and_generate_comics(json_data)
    except Exception as e:
        print(f"AIGC生成失败: {e}")
        return None


def initialize_backend():
    """初始化后端服务"""
    global processing_rules

    # 获取role.docx路径
    def get_role_docx_path():
        possible_paths = [
            "./python_LLM/role.docx",
            "./role.docx",
            "python_LLM/role.docx",
            os.path.join(os.path.dirname(__file__), "python_LLM", "role.docx"),
        ]

        for path in possible_paths:
            if os.path.exists(path):
                print(f"找到role.docx文件: {path}")
                return path
        return None

    role_docx_path = get_role_docx_path()
    if not role_docx_path:
        raise Exception("无法找到role.docx文件")

    # 读取处理规则
    processing_rules = read_role_docx(role_docx_path)
    if not processing_rules:
        raise Exception("无法读取处理规则")

    print("后端服务初始化完成")


if __name__ == '__main__':
    # 初始化后端
    initialize_backend()

    # 启动Flask-SocketIO应用
    print("启动后端服务（支持WebSocket和用户系统）...")
    print("API端点:")
    print("  POST /api/register - 用户注册")
    print("  POST /api/login - 用户登录")
    print("  GET  /api/profile - 获取用户信息")
    print("  GET  /api/history - 获取历史记录")
    print("  POST /api/process-novel - 处理小说文本")
    print("  POST /api/generate-comics - 生成连环画")
    print("  POST /api/full-process - 完整流程处理")

    socketio.run(app, host='0.0.0.0', port=5000, debug=True, allow_unsafe_werkzeug=True)