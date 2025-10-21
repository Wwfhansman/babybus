from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
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
CORS(app)  # 允许跨域请求

# 全局变量
processing_rules = None


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


if __name__ == '__main__':
    # 初始化后端
    initialize_backend()

    # 启动Flask应用
    print("启动后端服务...")
    app.run(host='0.0.0.0', port=5000, debug=True)