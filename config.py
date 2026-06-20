"""WebUI 配置。"""

from __future__ import annotations

from typing import ClassVar

from src.core.components.base.config import BaseConfig, Field, SectionBase, config_section


class WebUIConfig(BaseConfig):
    """Coding Agent WebUI 配置。"""

    config_name: ClassVar[str] = "config"
    config_description: ClassVar[str] = "Coding Agent WebUI 配置"

    @config_section("server", title="HTTP 服务器", tag="network")
    class ServerSection(SectionBase):
        """独立 HTTP 服务器配置。"""
        host: str = Field(default="127.0.0.1", description="监听地址（生产环境如需远程访问可改为 0.0.0.0）")
        port: int = Field(default=8680, description="监听端口（独立于主 HTTP 服务器）")

    @config_section("ws", title="WebSocket 后端", tag="network")
    class WsSection(SectionBase):
        """Coding Agent WebSocket 后端连接信息。"""
        host: str = Field(default="localhost", description="WS 主机")
        port: int = Field(default=8765, description="WS 端口")
        path: str = Field(default="/coding-agent/ws", description="WS 路径")

    @config_section("ui", title="UI 设置", tag="general")
    class UISection(SectionBase):
        """前端 UI 配置。"""
        title: str = Field(default="MoFox Code", description="页面标题")
        default_theme: str = Field(
            default="light",
            description="默认主题: dark / light",
        )
        avatar_url: str = Field(default="/logo.png", description="Bot 头像 URL")

    server: ServerSection = Field(default_factory=ServerSection)
    ws: WsSection = Field(default_factory=WsSection)
    ui: UISection = Field(default_factory=UISection)
