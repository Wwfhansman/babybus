import os
import json
import sys
import time
from volcenginesdkarkruntime import Ark
from volcenginesdkarkruntime.types.images.images import SequentialImageGenerationOptions

# 添加父目录到路径，以便导入其他模块
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def process_llm_json_and_generate_comics(json_data):
    """
    处理从LLM模型接收的JSON数据并生成连环画

    参数:
        json_data: 从LLM模型接收的JSON数据，格式应包含scenes_detail字段
    """
    # 初始化Ark客户端
    client = Ark(
        base_url="https://ark.cn-beijing.volces.com/api/v3",
        api_key=os.environ.get("ARK_API_KEY"),
    )

    # 验证JSON数据格式
    if not isinstance(json_data, dict):
        print("错误: JSON数据格式不正确，应为字典类型")
        return None

    # 检查是否有 scenes_detail 或 scenes 字段
    scenes_detail = json_data.get("scenes_detail", [])
    if not scenes_detail:
        scenes_detail = json_data.get("scenes", [])
        if scenes_detail:
            print("使用 scenes 字段作为场景描述")

    if not scenes_detail:
        print("警告: 未找到有效的场景描述字段 (scenes_detail 或 scenes)")
        return None

    # 提取角色和环境一致性信息
    character_consistency = json_data.get("character_consistency", {})
    environment_consistency = json_data.get("environment_consistency", {})

    # 构建一致性提示词前缀
    consistency_prefix = ""

    if character_consistency:
        char_desc = " ".join([f"{name}: {desc}" for name, desc in character_consistency.items()])
        consistency_prefix += f"角色设定: {char_desc}. "

    if environment_consistency:
        env_desc = " ".join([f"{env}: {desc}" for env, desc in environment_consistency.items()])
        consistency_prefix += f"环境设定: {env_desc}. "

    # 对每个场景分别调用API
    results = []
    for i, scene_detail in enumerate(scenes_detail):
        # 为每个场景单独构建提示词，加入一致性信息
        comic_prompt = f"{consistency_prefix}漫画风格连环画,注意每幅画面间的连贯性。{scene_detail}"

        print(f"场景 {i + 1} 的提示词: {comic_prompt}")

        # 调用Seedream API生成单个场景的图片
        try:
            imagesResponse = client.images.generate(
                model="doubao-seedream-4-0-250828",
                prompt=comic_prompt,
                size="1K",
                sequential_image_generation="auto",
                sequential_image_generation_options=SequentialImageGenerationOptions(
                    max_images=1  # 每次只生成一张图片
                ),
                response_format="url",
                watermark=False
            )

            # 处理响应
            if imagesResponse.data and len(imagesResponse.data) > 0:
                image = imagesResponse.data[0]
                results.append({
                    "scene_index": i + 1,
                    "url": image.url,
                    "size": image.size,
                    "prompt": comic_prompt
                })
                print(f"分镜 {i + 1} - URL: {image.url}, Size: {image.size}")
            else:
                print(f"警告: 场景 {i + 1} 没有生成图片")

            # 添加短暂延迟，避免API限制
            time.sleep(1)

        except Exception as e:
            print(f"场景 {i + 1} 的API调用出错: {e}")
            # 即使某个场景失败，继续处理其他场景

    return results


def generate_comics_from_json_file(json_file_path):
    """
    从JSON文件加载数据并生成连环画

    参数:
        json_file_path: JSON文件路径
    """
    try:
        with open(json_file_path, 'r', encoding='utf-8') as f:
            json_data = json.load(f)

        print(f"从文件 {json_file_path} 加载JSON数据成功")
        return process_llm_json_and_generate_comics(json_data)
    except Exception as e:
        print(f"加载JSON文件失败: {e}")
        return None


def save_comic_results(comic_results, json_data, output_file=None):
    """
    保存连环画生成结果

    参数:
        comic_results: 生成的连环画结果
        json_data: 原始JSON数据
        output_file: 输出文件路径（可选）
    """
    if output_file is None:
        from datetime import datetime
        output_file = f"comic_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

    try:
        result_data = {
            "total_scenes": len(comic_results),
            "character_consistency": json_data.get("character_consistency", {}),
            "environment_consistency": json_data.get("environment_consistency", {}),
            "results": comic_results
        }

        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(result_data, f, ensure_ascii=False, indent=2)

        print(f"连环画生成结果已保存到: {output_file}")
        return output_file
    except Exception as e:
        print(f"保存连环画结果失败: {e}")
        return None


def load_example_json():
    """
    从example.json文件加载示例数据
    """
    example_file_path = os.path.join(os.path.dirname(__file__), "example.json")
    try:
        with open(example_file_path, 'r', encoding='utf-8') as f:
            example_data = json.load(f)
        print(f"从 {example_file_path} 加载示例数据成功")
        return example_data
    except FileNotFoundError:
        print(f"示例文件 {example_file_path} 不存在")
        return None
    except json.JSONDecodeError as e:
        print(f"示例文件格式错误: {e}")
        return None
    except Exception as e:
        print(f"加载示例文件失败: {e}")
        return None


def main():
    """AIGC模块独立运行时的主函数"""
    print("=== AIGC连环画生成模块 ===")
    print("请选择操作：")
    print("1. 从JSON文件生成连环画")
    print("2. 使用示例数据生成连环画")

    choice = input("请输入选择 (1/2): ").strip()

    if choice == '1':
        json_file_path = input("请输入JSON文件路径: ").strip()
        results = generate_comics_from_json_file(json_file_path)

        if results:
            output_file = input("请输入输出文件路径（可选）: ").strip()
            if not output_file:
                output_file = None

            # 加载原始JSON数据以获取一致性信息
            with open(json_file_path, 'r', encoding='utf-8') as f:
                original_data = json.load(f)

            save_comic_results(results, original_data, output_file)

            # 打印所有生成的图片URL
            print("\n生成的图片URL列表:")
            for result in results:
                print(f"场景 {result['scene_index']}: {result['url']}")
        else:
            print("生成连环画失败")

    elif choice == '2':
        # 使用示例数据
        example_data = load_example_json()

        if example_data:
            print("使用示例数据生成连环画")
            results = process_llm_json_and_generate_comics(example_data)

            if results:
                output_file = input("请输入输出文件路径（可选，直接回车使用默认名称）: ").strip()
                if not output_file:
                    output_file = "comic_generation_results.json"

                save_comic_results(results, example_data, output_file)

                # 打印所有生成的图片URL
                print("\n生成的图片URL列表:")
                for result in results:
                    print(f"场景 {result['scene_index']}: {result['url']}")
            else:
                print("生成连环画失败")
        else:
            print("无法加载示例数据，请确保 example.json 文件存在且格式正确")
    else:
        print("无效选择")


if __name__ == "__main__":
    main()