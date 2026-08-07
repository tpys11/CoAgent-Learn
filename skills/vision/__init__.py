from skills import Skill


class VisionSkill(Skill):
    name = "vision"
    description = "视觉理解：识别图片内容（调用智谱 glm-4v-flash），返回图片描述"
    input_schema = {"image": {"type": "string", "description": "图片 base64 或 URL"}, "prompt": {"type": "string", "description": "要模型回答的问题"}}

    def execute(self, image="", prompt="请描述这张图片的内容", **kwargs):
        try:
            from core.vision_service import describe_image
            text = describe_image(image, prompt)
            return {"description": text}
        except Exception as e:
            return {"description": "[vision skill] 异常: " + str(e)[:200]}
