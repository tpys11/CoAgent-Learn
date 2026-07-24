from skills import Skill


class MemoryOps(Skill):
    name = "memory_ops"
    description = "读写用户三层记忆（L1事件/L2事实/L3画像）"
    input_schema = {"action": {"type": "string", "description": "read/write"}, "layer": {"type": "string", "description": "L1/L2/L3"}, "data": {"type": "object", "description": "写入数据"}}

    def execute(self, action="read", layer="L2", data=None, **kwargs):
        if action == "read":
            return {"memory": {layer: "暂无数据"}}
        return {"status": "written", "layer": layer}
