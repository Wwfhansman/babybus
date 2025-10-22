from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import os
import sys
import json
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

app = Flask(__name__)
# 配置CORS，允许所有来源和所有方法
CORS(app, resources={r"/*": {"origins": "*", "methods": ["GET", "POST", "OPTIONS"]}})
# 配置SocketIO，添加更多参数以确保网络连接稳定性
socketio = SocketIO(app,
                    cors_allowed_origins="*",
                    async_mode='threading',
                    transports=['websocket', 'polling'],  # 指定支持的传输方式
                    ping_timeout=30,  # 心跳超时时间
                    ping_interval=10,  # 心跳间隔
                    max_http_buffer_size=1024 * 1024 * 10)  # 增加最大缓冲区大小

# 全局变量
processing_rules = None

# 存储处理状态
processing_states = {}


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


# WebSocket 连接事件
@socketio.on('connect')
def handle_connect():
    """客户端连接事件"""
    print(f"客户端已连接: {request.sid}")
    emit('connection_status', {'status': 'connected', 'message': '成功连接到服务器'})


@socketio.on('disconnect')
def handle_disconnect():
    """客户端断开连接事件"""
    print(f"客户端已断开: {request.sid}")
    # 清理该客户端的处理状态
    if request.sid in processing_states:
        del processing_states[request.sid]


@socketio.on('process_novel')
def handle_process_novel(data):
    """WebSocket处理小说文本 - 第一阶段"""
    try:
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
        processing_states[request.sid] = {
            'process_id': process_id,
            'llm_result': llm_result,
            'llm_filename': llm_filename,
            'current_stage': 'text_processed'
        }

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
        emit('process_error', {'error': f'处理失败: {str(e)}'})


@socketio.on('generate_comics')
def handle_generate_comics(data):
    """WebSocket生成连环画 - 第二阶段"""
    try:
        process_id = data.get('process_id')
        json_data = data.get('json_data')

        emit('generation_status', {'status': 'processing', 'message': '开始生成连环画...', 'step': 1})

        # 优先使用客户端状态中存储的数据
        client_state = processing_states.get(request.sid, {})
        if not json_data and client_state.get('llm_result'):
            json_data = client_state['llm_result']
            process_id = client_state.get('process_id')
            emit('generation_status', {'status': 'processing', 'message': '使用已处理的文本结果...', 'step': 2})
        elif process_id and not json_data:
            # 从文件加载
            llm_filename = f"llm_{process_id}.json"
            if not os.path.exists(llm_filename):
                emit('generation_error', {'error': '找不到对应的处理结果'})
                return
            json_data = load_json_file(llm_filename)
            emit('generation_status', {'status': 'processing', 'message': '已加载LLM处理结果...', 'step': 2})

        if not json_data:
            emit('generation_error', {'error': '需要提供process_id或json_data'})
            return

        # 调用AIGC生成连环画
        emit('generation_status', {'status': 'processing', 'message': '正在调用AIGC生成图片...', 'step': 3})

        comic_results = process_llm_json_and_generate_comics_with_progress(
            json_data,
            progress_callback=lambda step, total: emit('generation_progress', {
                'step': step,
                'total': total,
                'message': f'正在生成第 {step}/{total} 张图片...'
            })
        )

        if not comic_results:
            emit('generation_error', {'error': '连环画生成失败'})
            return

        emit('generation_status', {'status': 'processing', 'message': '正在保存生成结果...', 'step': 4})

        # 保存结果
        comic_filename = f"comic_{process_id if process_id else datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        save_comic_results(comic_results, json_data, comic_filename)

        # 更新处理状态
        if request.sid in processing_states:
            processing_states[request.sid]['comic_results'] = comic_results
            processing_states[request.sid]['comic_filename'] = comic_filename
            processing_states[request.sid]['current_stage'] = 'comics_generated'

        # 发送图片生成结果给前端
        emit('comics_generation_complete', {
            "process_id": process_id,
            "comic_results": comic_results,
            "total_scenes": len(comic_results),
            "message": "连环画生成完成"
        })

    except Exception as e:
        emit('generation_error', {'error': f'生成失败: {str(e)}'})


@socketio.on('full_process')
def handle_full_process(data):
    """WebSocket完整流程：从小说到连环画 - 分阶段处理"""
    try:
        novel_text = data.get('novel_text', '')

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
        processing_states[request.sid] = {
            'process_id': process_id,
            'llm_result': llm_result,
            'llm_filename': llm_filename,
            'current_stage': 'text_processed'
        }

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

        # 第二步：AIGC生成（等待前端确认后开始）
        # 这里不自动开始，等待前端调用 generate_comics

    except Exception as e:
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

        # 保存结果
        llm_filename = f"llm_{process_id}.json"
        comic_filename = f"comic_{process_id}.json"

        save_to_json(json_data, llm_filename)
        save_comic_results(comic_results, json_data, comic_filename)

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
        emit('full_process_error', {'error': f'生成失败: {str(e)}'})


# 原有的HTTP API端点保持不变
@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查端点"""
    return jsonify({"status": "healthy", "message": "服务运行正常"})


@app.route('/api/process-novel', methods=['POST'])
def process_novel():
    """处理小说文本"""
    try:
        data = request.get_json()
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
        return jsonify({"error": f"处理失败: {str(e)}"}), 500


@app.route('/api/generate-comics', methods=['POST'])
def generate_comics():
    """生成连环画"""
    try:
        data = request.get_json()

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
        return jsonify({"error": f"生成失败: {str(e)}"}), 500


@app.route('/api/full-process', methods=['POST'])
def full_process():
    """完整流程：从小说到连环画"""
    try:
        data = request.get_json()
        novel_text = data.get('novel_text', '')

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

        # 保存结果
        llm_filename = f"llm_{process_id}.json"
        comic_filename = f"comic_{process_id}.json"

        save_to_json(llm_result, llm_filename)
        save_comic_results(comic_results, llm_result, comic_filename)

        return jsonify({
            "process_id": process_id,
            "llm_result": llm_result,
            "comic_results": comic_results,
            "total_scenes": len(comic_results),
            "message": "完整流程处理完成"
        })

    except Exception as e:
        return jsonify({"error": f"处理失败: {str(e)}"}), 500


@app.route('/api/results/<process_id>', methods=['GET'])
def get_results(process_id):
    """获取处理结果"""
    try:
        comic_filename = f"comic_{process_id}.json"
        if not os.path.exists(comic_filename):
            return jsonify({"error": "找不到对应的处理结果"}), 404

        with open(comic_filename, 'r', encoding='utf-8') as f:
            results = json.load(f)

        return jsonify(results)

    except Exception as e:
        return jsonify({"error": f"获取结果失败: {str(e)}"}), 500


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


if __name__ == '__main__':
    # 初始化后端
    initialize_backend()

    # 启动Flask-SocketIO应用
    print("启动后端服务（支持WebSocket）...")
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, allow_unsafe_werkzeug=True)