import os
import json
import sys
from volcenginesdkarkruntime import Ark
from volcenginesdkarkruntime.types.images.images import SequentialImageGenerationOptions


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
    if not isinstance(json_data, dict) or "scenes_detail" not in json_data:
        print("错误: JSON数据格式不正确，缺少scenes_detail字段")
        return None

    scenes_detail = json_data.get("scenes_detail", [])

    if not scenes_detail:
        print("警告: scenes_detail字段为空")
        return None

    # 将scenes_detail数组转换为单个字符串
    scenes_detail_str = ". ".join(scenes_detail)

    # 添加漫画风格和对白气泡的描述
    comic_prompt = f"漫画风格连环画，包含对白气泡。{scenes_detail_str}"

    print(f"生成的提示词: {comic_prompt}")

    # 调用Seedream API生成连环画
    try:
        imagesResponse = client.images.generate(
            model="doubao-seedream-4-0-250828",
            prompt=comic_prompt,
            size="2K",
            sequential_image_generation="auto",
            sequential_image_generation_options=SequentialImageGenerationOptions(
                max_images=len(scenes_detail)
            ),
            response_format="url",
            watermark=True
        )

        # 返回结果
        results = []
        for i, image in enumerate(imagesResponse.data):
            results.append({
                "scene_index": i + 1,
                "url": image.url,
                "size": image.size
            })
            print(f"分镜 {i + 1} - URL: {image.url}, Size: {image.size}")

        return results

    except Exception as e:
        print(f"API调用出错: {e}")
        return None


def main():
    """
    主函数，处理从标准输入或文件读取的JSON数据
    """
    # 检查是否有命令行参数
    if len(sys.argv) > 1:
        # 从文件读取JSON数据
        json_file = sys.argv[1]
        try:
            with open(json_file, 'r', encoding='utf-8') as file:
                json_data = json.load(file)
                print(f"从文件 {json_file} 读取JSON数据")
        except Exception as e:
            print(f"读取文件错误: {e}")
            return
    else:
        # 从标准输入读取JSON数据
        try:
            input_data = sys.stdin.read()
            json_data = json.loads(input_data)
            print("从标准输入读取JSON数据")
        except Exception as e:
            print(f"读取标准输入错误: {e}")
            return

    # 处理JSON数据并生成连环画
    results = process_llm_json_and_generate_comics(json_data)

    if results:
        print(f"成功生成 {len(results)} 张连环画")
        # 可以选择将结果保存到文件
        output_file = "comic_generation_results.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print(f"结果已保存到 {output_file}")
    else:
        print("生成连环画失败")


# 使用示例
if __name__ == "__main__":
    # 示例：从LLM模型接收的JSON数据
    # 这里模拟一个从LLM接收的JSON数据
    sample_llm_json = {
        "scenes": [
            "深夜诊所里，林医生值班时，一个浑身湿透的年轻人推门而入，铜铃发出疲倦的响声。",
            "周远沉默坐下，目光扫视诊室，然后平静地推过一张皱巴巴的纸条，要求林医生阅读。"
        ],
        "scenes_detail": [
            "图片1：中景构图，诊所内部，林医生坐在诊桌后抬头，年轻人周远站在门口，雨珠从黑色夹克滴落，灯光昏暗，阴影柔和，铜铃微动，氛围宁静却紧张。",
            "图片2：特写构图，周远的手推皱巴巴纸条到桌上，林医生戴手套拿起纸条，焦点在纸条和手部，背景诊室书架整洁，光线聚焦桌面，表情疑惑。"
        ],
        "dialogue": [
            "对白1：林医生说：'请坐，哪里不舒服？'",
            "对白2：周远说：'有人给我留了这个。' 林医生说：'这里是诊所，如果是私事——' 周远说：'读一下。'"
        ]
    }

    # 如果要使用示例数据，取消下面的注释
    process_llm_json_and_generate_comics(sample_llm_json)

    # 否则运行主函数处理实际输入
    main()