import os
import json
import re
import time
from volcenginesdkarkruntime import Ark
from volcenginesdkarkruntime.types.images.images import SequentialImageGenerationOptions


#    目前AI还不行，就算已经足够细致的prompt也无法让AI每次都生成足够满意的气泡旁白

def add_dialogue_to_images():
    """
    为已生成的漫画图片添加对白气泡
    """
    # 初始化Ark客户端
    client = Ark(
        base_url="https://ark.cn-beijing.volces.com/api/v3",
        api_key=os.environ.get("ARK_API_KEY"),
    )

    # 1. 加载已生成的图片结果
    try:
        with open('comic_generation_results.json', 'r', encoding='utf-8') as f:
            generated_data = json.load(f)
        print("成功加载生成的图片数据")
    except Exception as e:
        print(f"加载comic_generation_results.json失败: {e}")
        return None

    # 2. 原始数据（包含对白）
    # 这里使用您提供的示例数据，实际使用时您可以替换为从文件加载
    original_data = {
        "scenes": [
            "深夜诊所里，林医生值班时，一个浑身湿透的年轻人推门而入，铜铃发出疲倦的响声。",
            "周远沉默坐下，目光扫视诊室，然后平静地推过一张皱巴巴的纸条，要求林医生阅读。",
            "周远透露纸条来自已故的陈静，林医生听到名字后手指微顿，气氛骤然紧张。"
        ],
        "scenes_detail": [
            "图片1：中景构图，诊所内部，林医生坐在诊桌后抬头，年轻人周远站在门口，雨珠从黑色夹克滴落，灯光昏暗，阴影柔和，铜铃微动，氛围宁静却紧张。",
            "图片2：特写构图，周远的手推皱巴巴纸条到桌上，林医生戴手套拿起纸条，焦点在纸条和手部，背景诊室书架整洁，光线聚焦桌面，表情疑惑。",
            "图片3：中景构图，周远倾身向前，林医生擦拭眼镜，两人表情严肃，挂钟滴答声象征时间流逝，光线冷调，氛围凝重。"
        ],
        "dialogue": [
            "对白1：林医生说：'请坐。哪里不舒服？'",
            "对白2：周远说：'有人留了这个。' 林医生说：'读一下。'",
            "对白3：周远说：'纸条人昨天死了。' 林医生问：'你是谁？'"
        ]
    }

    dialogue_list = original_data.get('dialogue', [])

    # 3. 处理每个场景，添加对白气泡
    edited_results = []

    # 确保results字段存在
    results = generated_data.get('results', []) if isinstance(generated_data, dict) else generated_data

    for i, result in enumerate(results):
        scene_idx = result.get('scene_index', i + 1)
        image_url = result.get('url', '')

        if not image_url:
            print(f"场景 {scene_idx} 缺少图片URL，跳过")
            continue

        # 获取对应的对白文本
        if i < len(dialogue_list):
            dialogue_str = dialogue_list[i]
            # 清理对白文本：移除"对白X："前缀
            dialogue_clean = re.sub(r'对白\d+：', '', dialogue_str)
        else:
            dialogue_clean = "无对白"
            print(f"场景 {scene_idx} 没有对应的对白")

        # 构建编辑提示词
        edit_prompt = f"在原图片基础上添加漫画风格的对白气泡，气泡内容为：'{dialogue_clean}'。对白气泡应该是典型的漫画风格，白色背景黑色边框，文字清晰易读，位置要合理不遮挡重要画面内容，并指向对应的角色。保持原图片的整体风格和构图不变。"

        print(f"场景 {scene_idx} 编辑提示词: {edit_prompt}")

        # 调用Seedream API编辑图片
        try:
            # 根据:cite[1]，API支持传入images参数进行图像编辑
            imagesResponse = client.images.generate(
                model="doubao-seedream-4-0-250828",
                prompt=edit_prompt,
                image=[image_url],  # 传入原图片URL进行编辑
                size="2K",
                sequential_image_generation="auto",
                sequential_image_generation_options=SequentialImageGenerationOptions(max_images=1),
                response_format="url",
                watermark=False
            )

            # 处理响应
            if imagesResponse.data and len(imagesResponse.data) > 0:
                edited_image = imagesResponse.data[0]
                edited_results.append({
                    "scene_index": scene_idx,
                    "original_url": image_url,
                    "edited_url": edited_image.url,
                    "size": edited_image.size,
                    "dialogue": dialogue_clean,
                    "prompt": edit_prompt
                })
                print(f"场景 {scene_idx} 编辑成功 - URL: {edited_image.url}")
            else:
                print(f"场景 {scene_idx} 编辑失败，无返回图片")
                edited_results.append({
                    "scene_index": scene_idx,
                    "original_url": image_url,
                    "edited_url": None,
                    "error": "无返回图片"
                })

            # 添加延迟避免API限制
            time.sleep(1)

        except Exception as e:
            print(f"场景 {scene_idx} API调用出错: {e}")
            edited_results.append({
                "scene_index": scene_idx,
                "original_url": image_url,
                "edited_url": None,
                "error": str(e)
            })

    return edited_results


def main():
    """
    主函数：执行添加对白气泡流程
    """
    print("开始为漫画图片添加对白气泡...")

    edited_results = add_dialogue_to_images()

    if edited_results:
        # 统计成功数量
        success_count = sum(1 for result in edited_results if result.get('edited_url'))

        print(f"\n处理完成！成功编辑 {success_count}/{len(edited_results)} 张图片")

        # 保存编辑后的结果
        output_data = {
            "total_scenes": len(edited_results),
            "success_count": success_count,
            "results": edited_results
        }

        output_file = "edited_comic_with_dialogue.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)

        print(f"编辑结果已保存到: {output_file}")

        # 打印所有编辑后的图片URL
        print("\n编辑后的图片URL列表:")
        for result in edited_results:
            if result.get('edited_url'):
                print(f"场景 {result['scene_index']}: {result['edited_url']}")
            else:
                print(f"场景 {result['scene_index']}: 编辑失败 - {result.get('error', '未知错误')}")
    else:
        print("添加对白气泡失败，无有效结果")


if __name__ == "__main__":
    main()