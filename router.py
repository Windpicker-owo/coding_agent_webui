"""Coding Agent WebUI HTTP Router。

自建独立 HTTP 服务器 serve 前端 SPA，同时提供 /api/ws-info 返回 WebSocket 后端信息。
兼容 BaseRouter 的插件注册机制，但 HTTP 服务器为独立端口运行。
"""

from __future__ import annotations

import asyncio
import base64
import os
import tempfile
import time
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from src.core.components.base.router import BaseRouter
from src.kernel.concurrency import get_task_manager, TaskInfo
from src.kernel.logger import get_logger
from src.app.plugin_system.api import service_api

from .config import WebUIConfig

logger = get_logger("coding_agent_webui.router")


class CodingAgentWebUIRouter(BaseRouter):
    """WebUI HTTP Router — 独立端口 serve 前端 SPA。"""

    router_name = "coding_agent_webui"
    router_description = "Coding Agent 浏览器端 WebUI"
    custom_route_path = "/router/coding_agent_webui"

    def __init__(self, plugin: Any) -> None:
        # 先初始化 BaseRouter（创建 self.app）
        super().__init__(plugin)

        self._config: WebUIConfig | None = None
        self._own_server: uvicorn.Server | None = None
        self._server_task_info: TaskInfo | None = None
        self._own_app: FastAPI | None = None
        self._running = False

    # ── 配置 ──────────────────────────────────────────────

    def _get_config(self) -> WebUIConfig:
        if self._config is None:
            cfg = getattr(self.plugin, "config", None)
            if isinstance(cfg, WebUIConfig):
                self._config = cfg
            else:
                self._config = WebUIConfig()
        return self._config

    # ── 独立 HTTP 服务器 ──────────────────────────────────

    async def _start_own_server(self) -> None:
        """创建并启动独立的 FastAPI app + uvicorn server。"""
        cfg = self._get_config()
        host = cfg.server.host
        port = cfg.server.port

        ws_cfg = cfg.ws
        ui_cfg = cfg.ui

        # 创建独立 FastAPI app
        self._own_app = FastAPI(
            title=ui_cfg.title,
            description="MoFox Code WebUI",
            version="0.2.0",
        )

        self._own_app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_methods=["*"],
            allow_headers=["*"],
        )

        # ── API 端点 ──
        @self._own_app.get("/api/ws-info")
        async def ws_info() -> dict[str, Any]:
            return {
                "host": ws_cfg.host,
                "port": ws_cfg.port,
                "path": ws_cfg.path,
                "url": f"ws://{ws_cfg.host}:{ws_cfg.port}{ws_cfg.path}",
            }

        @self._own_app.get("/api/config")
        async def ui_config() -> dict[str, Any]:
            dist_dir = Path(__file__).parent / "frontend" / "dist"
            avatar_path = dist_dir / "avatar-uploaded.png"
            if avatar_path.is_file():
                mtime = int(avatar_path.stat().st_mtime)
                avatar_url = f"/avatar-uploaded.png?t={mtime}"
            else:
                avatar_url = ui_cfg.avatar_url
            return {
                "title": ui_cfg.title,
                "default_theme": ui_cfg.default_theme,
                "avatar_url": avatar_url,
                "desktop_mode": os.environ.get("MOFOX_CODE_DESKTOP") == "1",
            }

        @self._own_app.get("/api/version")
        async def version_info() -> dict[str, Any]:
            """返回桌面端、框架和插件的版本信息。"""
            import json

            # 桌面端版本 — 从 Tauri 配置读取
            desktop_version = "0.1.0"
            tauri_conf = Path(__file__).parent.parent.parent / "desktop" / "tauri" / "tauri.conf.json"
            try:
                if tauri_conf.exists():
                    with open(tauri_conf, "r", encoding="utf-8") as f:
                        conf = json.load(f)
                    desktop_version = conf.get("version", desktop_version)
            except Exception:
                pass

            # Neo-MoFox 框架版本
            framework_version = "unknown"
            try:
                from src.core.config import CORE_VERSION
                framework_version = CORE_VERSION
            except Exception:
                pass

            # coding_agent 插件版本 — 从 manifest.json
            ca_version = "unknown"
            ca_manifest = Path(__file__).parent.parent / "coding_agent" / "manifest.json"
            try:
                if ca_manifest.exists():
                    with open(ca_manifest, "r", encoding="utf-8") as f:
                        ca_data = json.load(f)
                    ca_version = ca_data.get("version", ca_version)
            except Exception:
                pass

            # coding_agent_webui 插件版本
            webui_version = "unknown"
            webui_manifest = Path(__file__).parent / "manifest.json"
            try:
                if webui_manifest.exists():
                    with open(webui_manifest, "r", encoding="utf-8") as f:
                        webui_data = json.load(f)
                    webui_version = webui_data.get("version", webui_version)
            except Exception:
                pass

            return {
                "desktop": desktop_version,
                "framework": framework_version,
                "coding_agent": ca_version,
                "coding_agent_webui": webui_version,
            }

        @self._own_app.post("/api/setup/import")
        async def import_setup(request: Request):
            """从指定目录导入配置。"""
            import os
            from pathlib import Path
            from fastapi.responses import JSONResponse
            from desktop.config_parser import parse_configs

            try:
                payload = await request.json()
            except Exception:
                return JSONResponse(status_code=400, content={"status": "error", "message": "请求体必须为 JSON 格式"})

            target_path = payload.get("path")
            if not target_path:
                return JSONResponse(status_code=400, content={"status": "error", "message": "缺少路径参数"})

            target_dir = Path(target_path)
            if not target_dir.exists() or not target_dir.is_dir():
                return JSONResponse(status_code=400, content={"status": "error", "message": "目录不存在"})

            config_dir_path = target_dir / "config"
            if not config_dir_path.exists():
                return JSONResponse(status_code=400, content={"status": "error", "message": "该目录下没有 config 文件夹"})

            core_toml_path = config_dir_path / "core.toml"
            if not core_toml_path.exists():
                return JSONResponse(status_code=400, content={"status": "error", "message": "不是有效的 MoFox 实例目录 (缺少 config/core.toml)"})

            try:
                parsed = parse_configs(str(config_dir_path))
                if parsed.get("status") == "not_configured":
                     return JSONResponse(status_code=400, content={"status": "error", "message": "配置文件解析失败"})
                return parsed
            except Exception as e:
                import traceback
                traceback.print_exc()
                return JSONResponse(status_code=500, content={"status": "error", "message": f"解析失败: {e}"})

        @self._own_app.post("/api/setup")
        async def submit_setup(request: Request):
            """重新生成配置（供前端重新进入向导时使用）。"""
            from fastapi.responses import JSONResponse
            from desktop.config_generator import generate_configs
            try:
                config = await request.json()
                generated = generate_configs(config, "config")
                return JSONResponse(
                    content={
                        "status": "ok",
                        "message": "配置已更新，后端即将重启",
                        "files": {k: str(v) for k, v in generated.items()},
                    },
                    status_code=200,
                )
            except Exception as e:
                import traceback
                traceback.print_exc()
                return JSONResponse(
                    content={"status": "error", "message": f"配置生成失败: {e}"},
                    status_code=500,
                )

        @self._own_app.get("/api/settings")
        async def get_settings() -> dict[str, Any]:
            """返回当前配置，供前端设置面板使用。"""
            from desktop.config_parser import parse_configs
            try:
                wizard_config = parse_configs("config")
                
                # 隐藏 key 中间部分
                for provider in wizard_config.get("api_providers", []):
                    key = provider.get("api_key", "")
                    if len(key) > 8:
                        provider["api_key"] = key[:4] + "***" + key[-4:]
                    elif key:
                        provider["api_key"] = "***"
                        
                return wizard_config
            except Exception as e:
                import traceback
                traceback.print_exc()
                from fastapi.responses import JSONResponse
                return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})

        @self._own_app.post("/api/settings")
        async def post_settings(request: Request) -> dict[str, Any]:
            """接收更新后的配置 JSON，重新生成 TOML。"""
            from fastapi.responses import JSONResponse
            try:
                body = await request.json()
            except Exception:
                return JSONResponse(
                    status_code=400,
                    content={"status": "error", "message": "请求体必须为 JSON 格式"},
                )

            # 掩码还原处理
            providers = body.get("api_providers", [])
            has_masked = any("***" in p.get("api_key", "") for p in providers)
            
            if has_masked:
                from desktop.config_parser import parse_configs
                old_config = parse_configs("config")
                old_providers = old_config.get("api_providers", [])
                
                for new_p in providers:
                    if "***" in new_p.get("api_key", ""):
                        # 查找对应的旧提供商并还原 key
                        for old_p in old_providers:
                            if old_p.get("name") == new_p.get("name"):
                                new_p["api_key"] = old_p.get("api_key", "")
                                break
                        
            from desktop.config_generator import generate_configs
            try:
                generate_configs(body, "config")
                return {"status": "ok"}
            except Exception as e:
                import traceback
                traceback.print_exc()
                return JSONResponse(
                    status_code=500,
                    content={"status": "error", "message": f"配置保存失败: {e}"},
                )

        @self._own_app.post("/api/avatar/upload")
        async def avatar_upload(request: Request) -> dict[str, Any]:
            """接收前端 Canvas 导出的 base64 PNG，保存到 dist 目录。"""
            try:
                body = await request.json()
                image_data = body.get("image", "")
            except Exception:
                return JSONResponse(
                    status_code=400,
                    content={"error": "请求体必须为 JSON 格式"},
                )

            if not image_data or not isinstance(image_data, str):
                return JSONResponse(
                    status_code=400,
                    content={"error": "缺少 image 字段"},
                )

            # 解析 data:image/png;base64,... 格式
            if image_data.startswith("data:"):
                try:
                    header, encoded = image_data.split(",", 1)
                except ValueError:
                    return JSONResponse(
                        status_code=400,
                        content={"error": "无效的 data URL 格式"},
                    )
                if "base64" not in header:
                    return JSONResponse(
                        status_code=400,
                        content={"error": "仅支持 base64 编码"},
                    )
            else:
                encoded = image_data

            try:
                raw_bytes = base64.b64decode(encoded)
            except Exception:
                return JSONResponse(
                    status_code=400,
                    content={"error": "base64 解码失败"},
                )

            # 限制大小 5MB
            if len(raw_bytes) > 5 * 1024 * 1024:
                return JSONResponse(
                    status_code=400,
                    content={"error": "图片大小不能超过 5MB"},
                )

            dist_dir = Path(__file__).parent / "frontend" / "dist"
            dist_dir.mkdir(parents=True, exist_ok=True)
            dest = dist_dir / "avatar-uploaded.png"

            # 原子写入：使用 with 语句确保 fd 总是被关闭
            tmp_fd, tmp_path = tempfile.mkstemp(
                suffix=".png", dir=str(dist_dir)
            )
            try:
                with os.fdopen(tmp_fd, "wb") as f:
                    f.write(raw_bytes)
                os.replace(tmp_path, str(dest))
            except Exception:
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass
                raise

            ts = int(time.time())
            return {"avatar_url": f"/avatar-uploaded.png?t={ts}"}

        @self._own_app.post("/api/avatar/reset")
        async def avatar_reset() -> dict[str, Any]:
            """删除已上传的头像，恢复默认。"""
            dist_dir = Path(__file__).parent / "frontend" / "dist"
            avatar_path = dist_dir / "avatar-uploaded.png"
            try:
                avatar_path.unlink(missing_ok=True)
            except OSError:
                pass
            return {"avatar_url": "/logo.png"}

        # ── 静态文件 + SPA fallback ──
        dist_dir = Path(__file__).parent / "frontend" / "dist"
        if dist_dir.exists() and any(dist_dir.iterdir()):
            @self._own_app.get("/")
            async def root() -> FileResponse:
                resp = FileResponse(dist_dir / "index.html")
                resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
                return resp

            @self._own_app.get("/{full_path:path}", response_model=None)
            async def spa_fallback(full_path: str = "") -> FileResponse | JSONResponse:
                """SPA fallback：非 API 路径先检查静态文件，不存在则返回 index.html。

                路由优先级：/api/* 由 API 端点处理 > 本路由检查文件 > SPA fallback。
                favicon.svg、icons.svg、assets/* 等静态文件通过 file_path.is_file() 直接返回。
                """
                # /api/ 前缀的路径不应走到这里（API 路由优先）；兜底返回 404
                if full_path.startswith("api/"):
                    return JSONResponse(
                        status_code=404,
                        content={"detail": "Not Found"},
                    )

                # 检查 dist 目录中是否存在对应的静态文件
                # 覆盖 favicon.svg、icons.svg、assets/* 等所有根目录及子目录文件
                file_path = dist_dir / full_path
                if full_path and file_path.is_file():
                    return FileResponse(file_path)

                # SPA fallback：返回 index.html 让前端路由处理
                index_path = dist_dir / "index.html"
                if not index_path.exists():
                    return JSONResponse(
                        status_code=503,
                        content={"detail": "Frontend not available"},
                    )
                resp = FileResponse(index_path)
                resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
                return resp
        else:
            logger.warning(
                f"前端构建产物不存在: {dist_dir}，"
                f"请先在 plugins/coding_agent_webui/frontend/ 运行 npm run build"
            )

            @self._own_app.get("/")
            async def placeholder() -> dict[str, str]:
                return {
                    "message": "MoFox Code WebUI",
                    "status": "前端尚未构建，请运行 npm run build",
                }

        # 启动 uvicorn
        config = uvicorn.Config(
            app=self._own_app,
            host=host,
            port=port,
            log_level="info",
        )
        self._own_server = uvicorn.Server(config)
        self._running = True

        logger.info(f"WebUI HTTP 服务器启动: http://{host}:{port}")
        try:
            await self._own_server.serve()
        except asyncio.CancelledError:
            logger.info("WebUI HTTP 服务器已停止（任务取消）")
        finally:
            self._running = False

    # ── 生命周期 ──────────────────────────────────────────

    async def startup(self) -> None:
        """Router 挂载时回调——启动独立 HTTP 服务器。"""
        self._server_task_info = get_task_manager().create_task(
            self._start_own_server(), name="webui_server", daemon=True,
        )
        logger.info("WebUI Router 已挂载，独立服务器启动中")

    async def shutdown(self) -> None:
        """Router 卸载时回调——停止独立 HTTP 服务器。"""
        # 1. 通知 uvicorn 优雅退出
        if self._own_server is not None:
            self._own_server.should_exit = True

        # 2. 取消 TaskManager 中的服务器任务，确保不会泄漏
        if self._server_task_info is not None and not self._server_task_info.is_done():
            self._server_task_info.cancel()
            logger.info("WebUI 服务器任务已取消")

        self._own_server = None
        self._server_task_info = None
        self._running = False
        logger.info("WebUI HTTP 服务器已关闭")

    # ── BaseRouter 要求的端点注册（在独立 app 中不需要，但必须实现） ──

    def register_endpoints(self) -> None:
        """BaseRouter 要求的方法。在独立 app 中处理，此处为空实现。"""
        pass

    # ── 公开 API ──────────────────────────────────────────

    @property
    def own_url(self) -> str:
        cfg = self._get_config()
        return f"http://{cfg.server.host}:{cfg.server.port}"

    @property
    def is_running(self) -> bool:
        return self._running


__all__ = ["CodingAgentWebUIRouter"]
