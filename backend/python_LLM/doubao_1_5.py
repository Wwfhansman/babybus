import os
import json
import sys
from datetime import datetime
from volcenginesdkarkruntime import Ark
from docx import Document
import re

# 添加父目录到路径，以便导入其他模块
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 初始化Ark客户端
client = Ark(
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    api_key=os.environ.get("ARK_API_KEY"),
)


def read_sample_novel():
    """从example.txt文件读取示例小说"""
    try:
        # 尝试从当前目录读取
        with open("example.txt", "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        # 如果当前目录没有，尝试从模块目录读取
        try:
            module_dir = os.path.dirname(os.path.abspath(__file__))
            example_path = os.path.join(module_dir, "example.txt")
            with open(example_path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception as e:
            print(f"读取example.txt文件时出错: {e}")
            return "这是一个示例小说文本，请确保example.txt文件存在并包含有效内容。"
    except Exception as e:
        print(f"读取example.txt文件时出错: {e}")
        return "这是一个示例小说文本，请确保example.txt文件存在并包含有效内容。"


# 不再在模块级别读取示例小说，改为在需要时读取
SAMPLE_NOVEL = None


def get_sample_novel():
    """获取示例小说文本（懒加载）"""
    global SAMPLE_NOVEL
    if SAMPLE_NOVEL is None:
        SAMPLE_NOVEL = read_sample_novel()
    return SAMPLE_NOVEL


def read_role_docx(file_path):
    """读取role.docx文件内容"""
    try:
        doc = Document(file_path)
        full_text = []
        for paragraph in doc.paragraphs:
            full_text.append(paragraph.text)
        return '\n'.join(full_text)
    except Exception as e:
        print(f"读取role.docx文件时出错: {e}")
        return None


def process_novel_text(novel_text, processing_rules):
    """处理小说文本"""

    # 构建系统提示词，包含处理规则
    system_prompt = f"""
{processing_rules}
请确保返回的内容是有效的JSON格式，不要添加任何额外的解释或说明。"""

    try:
        completion = client.chat.completions.create(
            model="doubao-1-5-pro-32k-250115",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": novel_text},
            ],
        )
        result = completion.choices[0].message.content

        # 尝试解析JSON，确保格式正确
        try:
            parsed_result = json.loads(result)
            return parsed_result  # 返回解析后的字典对象
        except json.JSONDecodeError:
            # 如果返回的不是有效JSON，尝试修复或返回错误
            print("API返回的内容不是有效的JSON格式")
            return result
    except Exception as e:
        print(f"API调用出错: {e}")
        return None


def process_novel_text_streaming(novel_text, processing_rules):
    """流式处理小说文本"""

    system_prompt = f"""
{processing_rules}
请确保返回的内容是有效的JSON格式，不要添加任何额外的解释或说明。"""

    try:
        print("----- 开始流式处理 -----")
        stream = client.chat.completions.create(
            model="doubao-1-5-pro-32k-250115",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": novel_text},
            ],
            stream=True,
        )

        full_response = ""
        for chunk in stream:
            if not chunk.choices:
                continue
            content = chunk.choices[0].delta.content
            if content:
                print(content, end="")
                full_response += content
        print()

        # 尝试解析JSON，确保格式正确
        try:
            parsed_result = json.loads(full_response)
            return parsed_result  # 返回解析后的字典对象
        except json.JSONDecodeError:
            # 如果返回的不是有效JSON，尝试修复或返回错误
            print("API返回的内容不是有效的JSON格式")
            return full_response
    except Exception as e:
        print(f"API调用出错: {e}")
        return None


def get_novel_input():
    """获取小说文本输入"""
    print("\n请选择输入方式：")
    print("1. 使用示例小说文本")
    print("2. 手动输入文本")
    print("3. 从文件读取")

    choice = input("请输入选择 (1/2/3): ").strip()

    if choice == '1':
        print("使用示例小说文本...")
        return get_sample_novel()

    elif choice == '2':
        print("\n请输入要处理的小说文本（输入空行结束）：")
        novel_lines = []
        while True:
            line = input()
            if line.strip() == "":
                break
            novel_lines.append(line)

        novel_text = '\n'.join(novel_lines)

        if not novel_text.strip():
            print("输入文本为空，将使用示例文本。")
            return get_sample_novel()
        return novel_text

    elif choice == '3':
        file_path = input("请输入文件路径: ").strip()
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            print(f"读取文件失败: {e}，将使用示例文本。")
            return get_sample_novel()

    else:
        print("无效选择，将使用示例文本。")
        return get_sample_novel()


def save_to_json(result, filename):
    """将处理结果保存为JSON文件"""
    # 确保文件名以.json结尾
    if not filename.endswith('.json'):
        filename += '.json'

    try:
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"保存JSON文件失败: {e}")
        return False


def load_json_file(file_path):
    """从JSON文件加载数据"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"加载JSON文件失败: {e}")
        return None


def export_json_for_aigc(json_data, output_path=None):
    """
    导出JSON数据供AIGC模块使用

    参数:
        json_data: LLM处理后的JSON数据
        output_path: 输出文件路径（可选）
    """
    if output_path is None:
        output_path = f"llm_output_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

    if save_to_json(json_data, output_path):
        print(f"JSON数据已导出到: {output_path}")
        return output_path
    else:
        print("JSON数据导出失败")
        return None


def main():
    # 读取处理规则 - 优先使用环境变量中的路径
    role_file_path = os.environ.get('ROLE_DOCX_PATH', "./role.docx")
    processing_rules = read_role_docx(role_file_path)

    if not processing_rules:
        print("无法读取处理规则，程序退出。")
        return

    print("处理规则已加载成功！")
    print("=" * 50)

    while True:
        print("\n请选择操作：")
        print("1. 处理小说文本")
        print("2. 查看处理规则")
        print("3. 查看示例文本")
        print("4. 导出JSON数据供AIGC使用")
        print("5. 退出")

        choice = input("请输入选择 (1/2/3/4/5): ").strip()

        if choice == '5':
            print("程序退出。")
            break

        elif choice == '2':
            print("\n当前处理规则：")
            print("=" * 50)
            print(processing_rules)
            print("=" * 50)
            continue

        elif choice == '3':
            print("\n示例小说文本：")
            print("=" * 50)
            # 只显示前500字符作为预览
            sample_novel = get_sample_novel()
            preview = sample_novel[:500] + "..." if len(sample_novel) > 500 else sample_novel
            print(preview)
            print("=" * 50)
            continue

        elif choice == '1':
            # 获取小说文本
            novel_text = get_novel_input()

            print("\n请选择处理方式：")
            print("1. 标准处理")
            print("2. 流式处理")

            process_choice = input("请输入选择 (1/2): ").strip()

            if process_choice not in ['1', '2']:
                print("无效选择，返回主菜单。")
                continue

            print("\n" + "=" * 50)
            print("处理结果：")
            print("=" * 50)

            processing_mode = "标准处理" if process_choice == '1' else "流式处理"

            if process_choice == '1':
                # 标准处理
                result = process_novel_text(novel_text, processing_rules)
                if result:
                    print(json.dumps(result, ensure_ascii=False, indent=2))
            else:
                # 流式处理
                result = process_novel_text_streaming(novel_text, processing_rules)

            print("=" * 50)

            # 询问是否保存结果
            if result:
                save_choice = input("\n是否保存处理结果到JSON文件？(y/n): ").strip().lower()
                if save_choice == 'y':
                    filename = input("请输入文件名（不含扩展名）: ").strip()
                    if not filename:
                        filename = f"processed_novel_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

                    if save_to_json(result, filename):
                        print(f"结果已保存到 {filename}.json")
                    else:
                        print("保存失败")
            else:
                print("处理失败，无法保存结果。")

        elif choice == '4':
            # 从JSON文件加载数据并导出
            json_file_path = input("请输入JSON文件路径: ").strip()
            json_data = load_json_file(json_file_path)

            if json_data:
                output_path = input("请输入导出文件路径（可选）: ").strip()
                if not output_path:
                    output_path = None

                export_json_for_aigc(json_data, output_path)
            else:
                print("JSON数据加载失败，请检查文件路径和格式。")

        else:
            print("无效选择，请重新输入。")


def batch_process_novels(input_folder, output_folder, processing_rules):
    """批量处理小说文件"""
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)

    for filename in os.listdir(input_folder):
        if filename.endswith('.txt'):
            input_path = os.path.join(input_folder, filename)
            base_name = os.path.splitext(filename)[0]
            output_path = os.path.join(output_folder, f"processed_{base_name}.json")

            try:
                with open(input_path, 'r', encoding='utf-8') as f:
                    novel_text = f.read()

                print(f"正在处理: {filename}")
                result = process_novel_text(novel_text, processing_rules)

                if result:
                    if save_to_json(result, output_path):
                        print(f"处理完成: {output_path}")
                    else:
                        print(f"保存失败: {filename}")
                else:
                    print(f"处理失败: {filename}")

            except Exception as e:
                print(f"处理文件 {filename} 时出错: {e}")


if __name__ == "__main__":
    # 交互式处理
    main()