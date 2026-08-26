# -*- coding: utf-8 -*-
"""手动停止注册表：request_id -> cancel_event。
v1/v2 两代引擎共用同一张表——/api/chat/stop 无需区分引擎即可停止任一代的进行中请求。"""

ACTIVE_CANCELS: dict = {}
