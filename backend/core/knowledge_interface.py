# -*- coding: utf-8 -*-
"""知识库服务接口（Protocol）：约定知识库公开能力，便于未来替换底层向量库。
当前实现见 core.knowledge_service（sqlite-vec），调用方后续可依赖此接口。"""
from typing import Protocol, runtime_checkable


@runtime_checkable
class KnowledgeServiceProtocol(Protocol):
    def search(
        self,
        project_id: str,
        query: str,
        top_k: int = 3,
        include_images: bool = True,
        rerank: bool = True,
    ) -> list: ...

    def add_document(
        self,
        project_id: str,
        text: str,
        source: str = "",
        session_id: str = "",
        api_key: str = "",
        skip_context: bool = False,
    ) -> int: ...

    def add_image(
        self,
        project_id: str,
        source: str,
        image_data_uri: str,
        description: str,
        file_path: str = "",
        mime: str = "image/png",
    ) -> int: ...

    def list_docs(self, project_id: str) -> list: ...

    def delete_doc(self, project_id: str, source: str) -> int: ...

    def delete_project_kb(self, project_id: str) -> int: ...
