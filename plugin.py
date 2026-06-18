"""Coding Agent WebUI 插件。"""

from __future__ import annotations

from src.core.components.base.plugin import BasePlugin
from src.core.components.loader import register_plugin

from .config import WebUIConfig
from .router import CodingAgentWebUIRouter


@register_plugin
class CodingAgentWebUIPlugin(BasePlugin):
    """为 coding_agent 提供浏览器端 WebUI。"""

    plugin_name = "coding_agent_webui"
    plugin_version = "0.1.0"
    plugin_description = "Coding Agent 浏览器端 WebUI，基于 React + Vite"

    configs = [WebUIConfig]
    # coding_agent 为建议依赖（提供 WebSocket 后端），非强制
    dependent_components = []

    def get_components(self) -> list[type]:
        return [CodingAgentWebUIRouter]
