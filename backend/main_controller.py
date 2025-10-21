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
        get_novel_input,
        export_json_for_aigc
    )
    from python_aigc.seedream import (
        process_llm_json_and_generate_comics,
        generate_comics_from_json_file,
        save_comic_results
    )
except ImportError as e:
    print(f"导入模块失败: {e}")
    print("请确保目录结构正确：")
    print("backend/")
    print("├── python_LLM/")
    print("│   └── doubao_1_5.py")
    print("├── python_aigc/")
    print("│   └── seedream.py")
    print("└── main_controller.py")
    sys.exit(1)


def get_role_docx_path():
    """
    获取role.docx文件的正确路径
    """
    # 尝试多个可能的路径
    possible_paths = [
        "./python_LLM/role.docx",  # 从项目根目录
        "./role.docx",  # 当前目录
        "python_LLM/role.docx",  # 相对路径
        os.path.join(os.path.dirname(__file__), "python_LLM", "role.docx"),  # 绝对路径
        os.path.join(os.path.dirname(__file__), "role.docx")  # 当前目录的绝对路径
    ]

    for path in possible_paths:
        if os.path.exists(path):
            print(f"找到role.docx文件: {path}")
            return path

    # 如果所有路径都找不到，让用户输入
    print("未找到role.docx文件，请手动指定路径")
    custom_path = input("请输入role.docx文件的完整路径: ").strip()
    if os.path.exists(custom_path):
        return custom_path
    else:
        print(f"文件不存在: {custom_path}")
        return None


def process_novel_to_comics(novel_text, processing_rules, output_filename=None):
    """
    完整流程：从小说文本处理到生成连环画

    参数:
        novel_text: 小说文本
        processing_rules: 处理规则
        output_filename: 输出文件名（可选）
    """
    print("=== 开始处理小说文本 ===")

    # 第一步：使用LLM处理小说文本
    llm_result = process_novel_text(novel_text, processing_rules)

    if not llm_result:
        print("LLM处理失败")
        return None

    print("LLM处理完成")

    # 保存LLM结果
    llm_output_file = None
    if output_filename:
        llm_output_file = f"llm_{output_filename}.json"
        save_to_json(llm_result, llm_output_file)
        print(f"LLM结果已保存到: {llm_output_file}")

    # 第二步：使用AIGC生成连环画
    print("=== 开始生成连环画 ===")
    comic_results = process_llm_json_and_generate_comics(llm_result)

    if not comic_results:
        print("连环画生成失败")
        return None

    print(f"成功生成 {len(comic_results)} 张连环画")

    # 保存连环画结果
    comic_output_file = None
    if output_filename:
        comic_output_file = f"comic_{output_filename}.json"
        save_comic_results(comic_results, llm_result, comic_output_file)
    else:
        comic_output_file = save_comic_results(comic_results, llm_result)

    return {
        "llm_result": llm_result,
        "comic_results": comic_results,
        "llm_output_file": llm_output_file,
        "comic_output_file": comic_output_file
    }


def batch_process_novels_to_comics(input_folder, output_folder, processing_rules):
    """
    批量处理小说文件并生成连环画
    """
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)

    for filename in os.listdir(input_folder):
        if filename.endswith('.txt'):
            input_path = os.path.join(input_folder, filename)
            base_name = os.path.splitext(filename)[0]

            try:
                with open(input_path, 'r', encoding='utf-8') as f:
                    novel_text = f.read()

                print(f"正在处理: {filename}")
                result = process_novel_to_comics(novel_text, processing_rules, base_name)

                if result:
                    print(f"处理完成: {filename}")
                else:
                    print(f"处理失败: {filename}")

            except Exception as e:
                print(f"处理文件 {filename} 时出错: {e}")


def main():
    """主控制器主函数"""
    print("=== 小说转连环画系统 ===")

    # 获取role.docx文件的正确路径
    role_docx_path = get_role_docx_path()
    if not role_docx_path:
        print("无法找到role.docx文件，程序退出")
        return

    # 读取处理规则
    processing_rules = read_role_docx(role_docx_path)

    if not processing_rules:
        print("无法读取处理规则，请确保role.docx文件格式正确")
        return

    print("处理规则加载成功！")

    while True:
        print("\n请选择操作模式:")
        print("1. 交互式处理（从小说文本到连环画）")
        print("2. 批量处理")
        print("3. 仅使用LLM处理文本")
        print("4. 仅使用AIGC生成连环画")
        print("5. 退出")

        choice = input("请输入选择 (1/2/3/4/5): ").strip()

        if choice == '1':
            # 交互式处理
            novel_text = get_novel_input()
            output_name = input("请输入输出文件名（可选）: ").strip()
            if not output_name:
                output_name = None

            result = process_novel_to_comics(novel_text, processing_rules, output_name)
            if result:
                print("处理完成！")
                if result.get('comic_output_file'):
                    print(f"连环画结果保存在: {result['comic_output_file']}")

        elif choice == '2':
            # 批量处理
            input_folder = input("请输入输入文件夹路径: ").strip()
            output_folder = input("请输入输出文件夹路径: ").strip()
            batch_process_novels_to_comics(input_folder, output_folder, processing_rules)

        elif choice == '3':
            # 仅使用LLM处理文本
            # 这里我们直接调用LLM模块的main函数，但需要确保它使用正确的role.docx路径
            print("切换到LLM处理模块...")
            from python_LLM.doubao_1_5 import main as llm_main
            # 设置环境变量或参数，确保LLM模块使用正确的role.docx路径
            os.environ['ROLE_DOCX_PATH'] = role_docx_path
            llm_main()

        elif choice == '4':
            # 仅使用AIGC生成连环画
            print("切换到AIGC生成模块...")
            from python_aigc.seedream import main as aigc_main
            aigc_main()

        elif choice == '5':
            print("程序退出")
            break

        else:
            print("无效选择，请重新输入")


if __name__ == "__main__":
    main()