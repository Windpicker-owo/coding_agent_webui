import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useSession, useSessionDispatch } from "./hooks/useSession.ts";
import { getWSClient } from "./utils/ws-client.ts";
import { AppShell } from "./components/layout/AppShell.tsx";
import { DesktopShell } from "./components/layout/DesktopShell.tsx";
import type { ServerMessage, UIConfig } from "./types/messages";

function App() {
  const state = useSession();
  const dispatch = useSessionDispatch();
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(false);
  const [desktopModeChecked, setDesktopModeChecked] = useState(false);
  const [desktopMode, setDesktopMode] = useState(false);
  const autoConnectStartedRef = useRef(false);
  const sessionBootstrapRef = useRef(false);
  const [hasEverConnected, setHasEverConnected] = useState(false);

  // 尽早 fetch /api/config 获取 desktop_mode（不依赖 WebSocket 连接）
  useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<UIConfig>;
      })
      .then((cfg) => {
        if (cancelled) return;
        const isEmbedded = new URLSearchParams(window.location.search).get('embedded') === '1';
        const dm = cfg.desktop_mode === true || isEmbedded;
        setDesktopMode(dm);
        dispatch({ type: "SET_DESKTOP_MODE", payload: dm });
        if (cfg.avatar_url && dm) {
          dispatch({ type: "SET_AVATAR_URL", payload: cfg.avatar_url });
        }
      })
      .catch(() => {
        // 无法获取配置，但若URL指明是嵌入模式则强制为桌面模式
        if (!cancelled) {
          const isEmbedded = new URLSearchParams(window.location.search).get('embedded') === '1';
          setDesktopMode(isEmbedded);
          dispatch({ type: "SET_DESKTOP_MODE", payload: isEmbedded });
        }
      })
      .finally(() => {
        if (!cancelled) setDesktopModeChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  // 监听 WebSocket 消息 → dispatch 到 SessionContext
  useEffect(() => {
    const client = getWSClient();
    const handleMessage = (msg: ServerMessage) => {
      if (msg.type === "session.ready") {
        client.setSessionId(msg.payload.session_id);
      }
      dispatch({ type: "SERVER_MESSAGE", payload: msg });
    };
    client.onAny(handleMessage);
    return () => client.offAny(handleMessage);
  }, [dispatch]);

  // 监听连接状态变化
  useEffect(() => {
    const client = getWSClient();
    return client.onStateChange((nextState) => {
      if (nextState === "open") {
        setHasEverConnected(true);
        dispatch({ type: "SET_CONNECTION", payload: "open" });
        setError("");
        return;
      }
      if (nextState === "closed") {
        dispatch({ type: "SET_CONNECTION", payload: "closed" });
        sessionBootstrapRef.current = false;
        return;
      }
      if (nextState === "error" && !client.isConnected) {
        // 某些 WebView 环境下 error 后的 close 事件可能延迟或缺失。
        // 先进入 closed，让桌面端轮询重连链路立即接管。
        dispatch({ type: "SET_CONNECTION", payload: "closed" });
      }
    });
  }, [dispatch]);

  // 主题同步到 <html> 的 dark class
  useEffect(() => {
    const root = document.documentElement;
    root.lang = "zh-CN";
    root.setAttribute("translate", "no");
    root.classList.add("notranslate");
    document.body.setAttribute("translate", "no");
    document.body.classList.add("notranslate");
    document.getElementById("root")?.setAttribute("translate", "no");
    document.getElementById("root")?.classList.add("notranslate");

    if (state.theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    // Also explicitly set background color to ensure white theme works
    document.body.style.backgroundColor = state.theme === 'dark' ? '#030712' : '#ffffff';
  }, [state.theme]);

  // 桌面模式：缩小根字号提升信息密度
  useEffect(() => {
    const root = document.documentElement;
    if (desktopMode) {
      root.classList.add("desktop-mode");
    } else {
      root.classList.remove("desktop-mode");
    }
  }, [desktopMode]);

  // 持久化偏好到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem("mofox-code-prefs", JSON.stringify({
        wsUrl: state.wsUrl,
        theme: state.theme,
        ideMode: state.ideMode,
        lastWorkDir: state.lastWorkDir,
        lastSessionId: state.lastSessionId,
        recentProjects: state.recentProjects,
        imageUploadConfirmed: state.imageUploadConfirmed,
      }));
    } catch {
      // ignore
    }
  }, [state.wsUrl, state.theme, state.ideMode, state.lastWorkDir, state.lastSessionId, state.recentProjects, state.imageUploadConfirmed]);

  const handleConnect = useCallback(async (customUrl?: string) => {
    const url = typeof customUrl === "string" ? customUrl : state.wsUrl;
    setError("");
    setConnecting(true);
    dispatch({ type: "SET_CONNECTION", payload: "connecting" });
    try {
      const client = getWSClient();
      await client.connect(url);
      dispatch({ type: "SET_WS_URL", payload: url });
    } catch (e) {
      setError(e instanceof Error ? e.message : "连接失败");
      dispatch({ type: "SET_CONNECTION", payload: "closed" });
      throw e;
    } finally {
      setConnecting(false);
      setAutoConnectAttempted(true);
    }
  }, [state.wsUrl, dispatch]);

  // Web 模式：首次加载自动尝试连接 WebSocket
  useEffect(() => {
    if (autoConnectStartedRef.current || !desktopModeChecked || desktopMode) return;
    autoConnectStartedRef.current = true;
    handleConnect().catch(() => {});
  }, [handleConnect, desktopModeChecked, desktopMode]);

  // 桌面模式：自动轮询后端状态并连接
  useEffect(() => {
    if (!desktopModeChecked || !desktopMode || state.isConnected) return;
    
    let cancelled = false;
    let timer: number;

    const tryConnect = async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/ws-info");
        if (cancelled) return;
        
        if (!res.ok) throw new Error("Backend not ready");
        const data = await res.json();
        if (data.url) {
          if (cancelled) return;
          await handleConnect(data.url);
          return; // 成功则停止轮询
        }
      } catch {
        if (!cancelled) {
          timer = window.setTimeout(tryConnect, 2000);
        }
      }
    };

    // 如果还没有建立连接，立即尝试
    void tryConnect();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [desktopModeChecked, desktopMode, state.isConnected, handleConnect]);

  // 连接建立后，优先尝试恢复上一次会话；否则由 AppShell 弹出“打开项目目录”对话框
  useEffect(() => {
    // 连接建立后不再自动打开项目，由用户手动操作。
    return;
  }, [state.isConnected, state.sessionId, state.lastSessionId, state.lastWorkDir, dispatch]);

  // 连接成功后拉取后端 UI 配置（仅一次）
  useEffect(() => {
    if (!state.isConnected) return;
    let cancelled = false;
    fetch("/api/config")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<UIConfig>;
      })
      .then((cfg) => {
        if (!cancelled) {
          if (cfg.avatar_url) {
            dispatch({ type: "SET_AVATAR_URL", payload: cfg.avatar_url });
          }
          const isEmbedded = new URLSearchParams(window.location.search).get('embedded') === '1';
          if (cfg.desktop_mode !== undefined || isEmbedded) {
            dispatch({ type: "SET_DESKTOP_MODE", payload: cfg.desktop_mode === true || isEmbedded });
          }
        }
      })
      .catch(() => {
        // 保持默认 /bot-avatar.png
      });
    return () => {
      cancelled = true;
    };
  }, [state.isConnected, dispatch]);

  const handleDisconnect = useCallback(() => {
    const client = getWSClient();
    try {
      client.send("session.close", {});
    } catch {
      // ignore
    }
    client.disconnect();
    client.setSessionId("");
    sessionBootstrapRef.current = false;
    dispatch({ type: "SET_CONNECTION", payload: "closed" });
    dispatch({ type: "RESET_SESSION" });
    setError("");
  }, [dispatch]);

  // ── Setup Wizard（仅桌面版环境显示）──
  if (!desktopModeChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }


  // ── 连接界面 ──
  if (!state.isConnected && state.connectionState !== "reconnecting" && !(desktopMode && hasEverConnected)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white p-4 relative overflow-hidden">
        {/* Decorative Background Blobs */}
        <div className="absolute top-[20%] left-[20%] w-96 h-96 bg-blue-500/20 dark:bg-blue-600/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-[20%] right-[20%] w-96 h-96 bg-purple-500/20 dark:bg-purple-600/20 rounded-full blur-3xl"></div>

        <div className="w-full max-w-md bg-white/80 dark:bg-gray-900/80 backdrop-blur-2xl border border-white/50 dark:border-gray-700/50 rounded-3xl p-8 shadow-2xl relative z-10 animate-slide-up-fade">
          <div className="text-center mb-8">
            <div className="relative inline-block mb-4">
              <div className="absolute inset-0 bg-blue-500 blur-xl opacity-30 dark:opacity-50 animate-pulse rounded-full"></div>
              <div className="w-20 h-20 mx-auto rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg relative overflow-hidden ring-4 ring-white dark:ring-gray-800">
                <img src={state.avatarUrl || "/bot-avatar.png"} alt="MoFox Logo" className="w-full h-full object-cover" />
              </div>
            </div>
            <h1 className="text-3xl font-extrabold mb-2 bg-gradient-to-br from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent tracking-tight">MoFox Code</h1>
            <p className="text-gray-500 dark:text-gray-400 font-medium">AI 编程助手 WebUI</p>
          </div>

          {desktopMode ? (
            <div className="flex flex-col items-center justify-center space-y-6 py-8">
              <Loader2 size={48} className="animate-spin text-blue-600" />
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                  正在等待核心服务启动...
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  通常需要几秒钟时间，请稍候
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  WebSocket 地址
                </label>
                <div className="relative group">
                  <div className="absolute inset-0 bg-blue-500/10 dark:bg-blue-500/20 rounded-xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <input
                    type="text"
                    value={state.wsUrl}
                    onChange={(e) => dispatch({ type: "SET_WS_URL", payload: e.target.value })}
                    className="relative w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm shadow-sm transition-all"
                  />
                </div>
              </div>

              <button
                onClick={() => { void handleConnect(); }}
                disabled={connecting}
                className="relative w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-md hover:shadow-xl flex items-center justify-center gap-2 overflow-hidden group"
              >
                {connecting && <Loader2 size={18} className="animate-spin" />}
                <span>{connecting ? (autoConnectAttempted ? "连接中..." : "自动连接中...") : "连接"}</span>
                {!connecting && <div className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:[animation:shimmer_1.5s_infinite] skew-x-12"></div>}
              </button>

              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm font-medium animate-slide-up-fade">
                  {error}
                </div>
              )}
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500 text-center font-medium">
            页面会先自动连接后端；开始新对话时再选择项目目录
          </div>
        </div>
      </div>
    );
  }

  // ── 主界面（含重连遮罩）──
  if (state.desktopMode) {
    return <DesktopShell />;
  }
  return <AppShell onDisconnect={handleDisconnect} />;
}

export default App;
