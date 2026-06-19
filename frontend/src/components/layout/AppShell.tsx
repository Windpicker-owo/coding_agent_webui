/** AppShell — 三栏布局壳 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useSession, useSessionDispatch } from "../../hooks/useSession.ts";
import { getWSClient } from "../../utils/ws-client.ts";
import { SessionList } from "../session/SessionList.tsx";
import { ApprovalDialog } from "../approval/ApprovalDialog.tsx";
import { ChatArea } from "./ChatArea.tsx";
import { RightPanel } from "./RightPanel.tsx";
import {
  Menu,
  Sun,
  Moon,
  Loader2,
  LogOut,
  StopCircle,
  Target,
  Folder,
  SquarePen,
  FolderSearch,
  Monitor,
  Smartphone,
  Settings,
  FolderOpen,
} from "lucide-react";
import { DirectoryPicker } from "./DirectoryPicker.tsx";
import { AvatarUpload } from "./AvatarUpload.tsx";
import { SettingsPanel } from "../settings/SettingsPanel.tsx";
import { normalizePath } from "../../utils/path-utils";

interface AppShellProps {
  onDisconnect: () => void;
}

function getPhaseBadgeClasses(phase: string): string {
  switch (phase) {
    case "ready":
      return "border border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800/80 dark:bg-emerald-900/30 dark:text-emerald-200";
    case "thinking":
      return "border border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-800/80 dark:bg-amber-900/30 dark:text-amber-200";
    case "coding":
      return "border border-sky-200 bg-sky-100 text-sky-900 dark:border-sky-800/80 dark:bg-sky-900/30 dark:text-sky-200";
    case "researching":
      return "border border-violet-200 bg-violet-100 text-violet-900 dark:border-violet-800/80 dark:bg-violet-900/30 dark:text-violet-200";
    case "error":
      return "border border-rose-200 bg-rose-100 text-rose-900 dark:border-rose-800/80 dark:bg-rose-900/30 dark:text-rose-200";
    default:
      return "border border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200";
  }
}

function getModeBadgeClasses(mode: "auto" | "yolo" | "goal" | "solo"): string {
  switch (mode) {
    case "auto":
      return "border border-violet-200 bg-violet-100 text-violet-800 dark:border-violet-800/80 dark:bg-violet-900/30 dark:text-violet-200";
    case "yolo":
      return "border border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-800/80 dark:bg-rose-900/30 dark:text-rose-200";
    case "goal":
      return "border border-orange-200 bg-orange-100 text-orange-800 dark:border-orange-800/80 dark:bg-orange-900/30 dark:text-orange-200";
    case "solo":
      return "border border-cyan-200 bg-cyan-100 text-cyan-800 dark:border-cyan-800/80 dark:bg-cyan-900/30 dark:text-cyan-200";
  }
}

function getPhaseNoticeClasses(phase: string): string {
  switch (phase) {
    case "thinking":
      return "border-b border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-900/30 dark:bg-amber-900/10 dark:text-amber-200";
    case "coding":
      return "border-b border-sky-200 bg-sky-50/80 text-sky-900 dark:border-sky-900/30 dark:bg-sky-900/10 dark:text-sky-200";
    case "researching":
      return "border-b border-violet-200 bg-violet-50/80 text-violet-900 dark:border-violet-900/30 dark:bg-violet-900/10 dark:text-violet-200";
    default:
      return "border-b border-gray-200 bg-gray-50/80 text-gray-700 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-300";
  }
}

export function AppShell({ onDisconnect }: AppShellProps) {
  const state = useSession();
  const dispatch = useSessionDispatch();
  const [sidebarOpen, setSidebarOpen] = useState(
    () => (typeof window !== "undefined" ? window.innerWidth >= 1024 : true)
  );
  const [showOpenProjectDialog, setShowOpenProjectDialog] = useState(false);
  const [newWorkDir, setNewWorkDir] = useState(".");
  const [showGoalInput, setShowGoalInput] = useState(false);
  const [goalText, setGoalText] = useState("");
  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false);
  const [newSessionMode, setNewSessionMode] = useState<"pro" | "solo">("pro");
  const [newSessionSoloModel, setNewSessionSoloModel] = useState("");
  const [showDirectoryPicker, setShowDirectoryPicker] = useState(false);
  const [showAvatarUpload, setShowAvatarUpload] = useState(false);
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);

  // 监听 ChatArea 发出的"打开项目"自定义事件
  useEffect(() => {
    const handler = () => {
      setNewWorkDir(state.lastWorkDir || ".");
      setShowOpenProjectDialog(true);
    };
    window.addEventListener("open-project-dialog", handler);
    return () => window.removeEventListener("open-project-dialog", handler);
  }, [state.lastWorkDir]);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (showStatsPanel && statsRef.current && !statsRef.current.contains(e.target as Node)) {
        setShowStatsPanel(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [showStatsPanel]);

  React.useEffect(() => {
    const handler = () => setShowAvatarUpload(true);
    window.addEventListener("open-avatar-upload", handler);
    return () => window.removeEventListener("open-avatar-upload", handler);
  }, []);

  React.useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const handleMatch = (e: MediaQueryListEvent) => {
      if (state.ideMode && e.matches) {
        return; // 开启IDE模式时，如果在宽屏下则保持当前状态，不自动展开
      }
      setSidebarOpen(e.matches);
    };
    mql.addEventListener('change', handleMatch);
    return () => mql.removeEventListener('change', handleMatch);
  }, [state.ideMode]);

  const handleOpenProjectClick = useCallback(() => {
    setNewWorkDir(state.lastWorkDir || ".");
    setShowOpenProjectDialog(true);
  }, [state.lastWorkDir]);

  const handleNewChat = useCallback(() => {
    dispatch({ type: "RESET_SESSION" });
  }, [dispatch]);

  const totalCost = useMemo(() => {
    return Object.values(state.sessionUsage || {}).reduce((acc, curr) => acc + (curr.cost || 0), 0);
  }, [state.sessionUsage]);

  const totalTokens = useMemo(() => {
    return Object.values(state.sessionUsage || {}).reduce((acc, curr) => acc + (curr.prompt_tokens || 0) + (curr.completion_tokens || 0), 0);
  }, [state.sessionUsage]);

  const handleConfirmNewSession = useCallback(() => {
    setShowNewSessionDialog(false);
    const client = getWSClient();
    dispatch({ type: "RESET_SESSION" });
    client.send("session.init", {
      working_directory: state.lastWorkDir,
      session_id: "",
      solo_mode: newSessionMode === "solo",
      solo_model: newSessionMode === "solo" ? newSessionSoloModel : "",
    });
    client.send("session.list", {});
  }, [state.lastWorkDir, newSessionMode, newSessionSoloModel, dispatch]);

  const handleOpenProject = useCallback(() => {
    if (!newWorkDir.trim()) return;
    setShowOpenProjectDialog(false);
    const client = getWSClient();
    dispatch({ type: "SET_CONNECTION", payload: "reconnecting" });
    dispatch({ type: "RESET_SESSION" });
    dispatch({ type: "SET_LAST_WORK_DIR", payload: newWorkDir.trim() });
    dispatch({ type: "SET_LAST_SESSION_ID", payload: "" });
    dispatch({ type: "ADD_RECENT_PROJECT", payload: newWorkDir.trim() });
    try {
      client.send("project.open", {
        working_directory: newWorkDir.trim(),
      });
    } catch {
      dispatch({ type: "SET_CONNECTION", payload: "open" });
      setShowOpenProjectDialog(true);
    }
  }, [newWorkDir, dispatch]);

  const handleInterrupt = useCallback(() => {
    getWSClient().send("user.interrupt", {});
  }, []);

  const handleSetGoal = useCallback(() => {
    if (!goalText.trim()) return;
    getWSClient().send("goal.set", { text: goalText.trim() });
    dispatch({ type: "SET_GOAL_MODE", payload: true });
    setGoalText("");
    setShowGoalInput(false);
  }, [goalText, dispatch]);

  const isBusy = state.phase !== "ready" && state.phase !== "init" && state.phase !== "error";
  const showActiveSpinner = state.phase === "thinking" || state.phase === "coding" || state.phase === "researching";
  const phaseDetail = state.phaseDetail.trim();

  return (
    <div className="h-screen flex bg-white dark:bg-gray-950 text-gray-900 dark:text-white">
      {/* ── 左侧：历史会话 (Full Height) ── */}
      <div className={state.ideMode && !sidebarOpen ? "hidden" : "hidden lg:block h-full"}>
        <SessionList
          onNewSession={handleNewChat}
          onOpenProject={handleOpenProjectClick}
          collapsed={!sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
        />
      </div>

      {/* ── 右侧：Header + Chat + RightPanel ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* ── Header ── */}
        <header 
          className={`flex items-center justify-between px-6 shrink-0 z-30 transition-colors ${
            state.desktopMode
              ? "bg-transparent pr-[140px] h-12" 
              : "bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-900 shadow-sm py-3"
          }`}
          onPointerDown={(e) => {
            if (!state.desktopMode) return;
            const target = e.target as HTMLElement;
            // 只要不是点击在交互元素上，都可以拖拽
            if (!target.closest('button, input, a, select, textarea')) {
              window.parent.postMessage('tauri-drag', '*');
            }
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors lg:hidden"
            >
              <Menu size={18} />
            </button>
            
            {!state.desktopMode && (
              <>
                <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-inner shrink-0 overflow-hidden">
                  <img src="/logo.png" alt="MoFox Logo" className="w-full h-full object-cover" />
                </div>
                {!state.ideMode && (
                  <h1 className="text-lg font-semibold tracking-tight shrink-0 hidden sm:block">MoFox Code</h1>
                )}
              </>
            )}

            {state.projectName && (
              <span
                className={`text-sm ${state.desktopMode ? "font-semibold text-gray-800 dark:text-gray-200" : "text-gray-500 dark:text-gray-400"} truncate hidden sm:inline cursor-default`}
                title={`项目路径: ${state.lastWorkDir}`}
              >
                {state.projectName}
              </span>
            )}
            {state.lastWorkDir && state.lastWorkDir !== "." && (
              <span className="text-xs text-gray-400 dark:text-gray-600 truncate hidden md:inline font-mono" title={state.lastWorkDir}>
                {state.lastWorkDir}
              </span>
            )}
            <span
              className={`text-xs px-2.5 py-1 rounded-full shrink-0 font-medium ${getPhaseBadgeClasses(state.phase)}`}
            >
              <span className="inline-flex items-center gap-1.5">
                {showActiveSpinner && <Loader2 size={12} className="animate-spin" />}
                {state.phase}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* 模式指示器 */}
            <div className="hidden sm:flex items-center gap-1.5">
              {state.autoReview && (
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${getModeBadgeClasses("auto")}`}>
                  Auto
                </span>
              )}
              {state.yoloMode && (
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${getModeBadgeClasses("yolo")}`}>
                  YOLO
                </span>
              )}
              {state.goalMode && (
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${getModeBadgeClasses("goal")}`}>
                  Goal
                </span>
              )}
              {state.soloMode && (
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${getModeBadgeClasses("solo")}`}>
                  Solo
                </span>
              )}
            </div>

            {/* 上下文用量 */}
            {state.contextUsage && (
              <div className="hidden md:flex items-center gap-1.5">
                <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      state.contextUsage.percent > 80
                        ? "bg-red-500"
                        : state.contextUsage.percent > 50
                        ? "bg-yellow-500"
                        : "bg-green-500"
                    }`}
                    style={{
                      width: `${Math.min(state.contextUsage.percent, 100)}%`,
                    }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-8 text-right" title="当前上下文占用比例">
                  {state.contextUsage.percent.toFixed(0)}%
                </span>
              </div>
            )}

            {/* 消耗统计 */}
            {(totalTokens > 0 || totalCost > 0) && (
              <div className="relative hidden md:block" ref={statsRef}>
                <button
                  onClick={() => setShowStatsPanel(!showStatsPanel)}
                  className="flex items-center gap-1.5 ml-2 mr-1 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title="点击查看各模型消耗详情"
                >
                  <div className="text-xs text-gray-500 font-mono flex items-center gap-1">
                    <span className="text-gray-400">Tokens:</span>
                    <span>{(totalTokens / 1000).toFixed(1)}k</span>
                  </div>
                  {totalCost > 0 && (
                    <div className="text-xs text-gray-500 font-mono flex items-center gap-0.5">
                      <span className="text-gray-400">$</span>
                      <span>{totalCost.toFixed(3)}</span>
                    </div>
                  )}
                </button>

                {showStatsPanel && (
                  <div className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-xl z-50 p-4 animate-slide-up-fade">
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">消耗统计明细</h3>
                    <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                      {Object.entries(state.sessionUsage || {}).map(([model, usage]) => (
                        <div key={model} className="space-y-1.5">
                          <div className="text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded truncate" title={model}>
                            {model}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                            <div className="flex flex-col">
                              <span className="text-gray-400">Input</span>
                              <span className="text-gray-600 dark:text-gray-400">{usage.prompt_tokens?.toLocaleString() || 0}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-gray-400">Cache Hit</span>
                              <span className="text-green-600 dark:text-green-400">{usage.cache_hit_tokens?.toLocaleString() || 0}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-gray-400">Output</span>
                              <span className="text-gray-600 dark:text-gray-400">{usage.completion_tokens?.toLocaleString() || 0}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-gray-400">Cost</span>
                              <span className="text-gray-600 dark:text-gray-400">${usage.cost?.toFixed(4) || "0.0000"}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 中断按钮 */}
            {isBusy && (
              <button
                onClick={handleInterrupt}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-lg transition-colors font-medium"
              >
                <StopCircle size={14} />
                <span>中断</span>
              </button>
            )}

            {/* Goal 按钮 */}
            {!state.goalMode && (
              <button
                onClick={() => setShowGoalInput(!showGoalInput)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg transition-colors font-medium hidden sm:flex"
              >
                <Target size={14} />
                <span>Goal</span>
              </button>
            )}

            <div className="w-px h-4 bg-gray-200 dark:bg-gray-800 mx-1"></div>

            {/* 设置按钮（桌面版专用） */}
            {state.desktopMode && (
              <button
                onClick={() => window.parent.postMessage('open-settings', '*')}
                className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="设置"
              >
                <Settings size={16} />
              </button>
            )}

            {!state.desktopMode && (
              <button
                onClick={() => {
                  dispatch({ type: "SET_IDE_MODE", payload: !state.ideMode });
                  if (!state.ideMode) {
                    setSidebarOpen(false); // 开启IDE模式时自动折叠侧边栏
                  }
                }}
                className={`p-2 rounded-md transition-colors ${state.ideMode ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20" : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
                title={state.ideMode ? "退出紧凑模式 (IDE模式)" : "开启紧凑模式 (IDE模式)"}
              >
                {state.ideMode ? <Monitor size={16} /> : <Smartphone size={16} />}
              </button>
            )}

            <button
              onClick={() => dispatch({ type: "SET_THEME", payload: state.theme === "dark" ? "light" : "dark" })}
              className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={state.theme === "dark" ? "切换亮色主题" : "切换暗色主题"}
            >
              {state.theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {!state.desktopMode && (
              <button
                onClick={onDisconnect}
                className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title="断开连接"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </header>

        {isBusy && phaseDetail && (
          <div className={`px-4 sm:px-6 py-2 shrink-0 ${getPhaseNoticeClasses(state.phase)}`}>
            <div className="flex items-center gap-2 text-sm">
              <Loader2 size={14} className={`shrink-0 ${showActiveSpinner ? "animate-spin" : ""}`} />
              <span className="truncate">{phaseDetail}</span>
            </div>
          </div>
        )}

        {/* Goal 输入条 */}
        {showGoalInput && (
          <div className="px-4 py-3 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 flex justify-center shrink-0 z-10 shadow-sm">
            <div className="w-full max-w-4xl flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shrink-0">
                <Target size={18} />
              </div>
              <input
                type="text"
                value={goalText}
                onChange={(e) => setGoalText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSetGoal()}
                placeholder="输入长线目标，让 AI 在无监督模式下自主规划并完成任务..."
                className="flex-1 bg-transparent border-none text-sm text-gray-900 dark:text-white focus:outline-none placeholder-gray-400 dark:placeholder-gray-500"
                autoFocus
              />
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setShowGoalInput(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSetGoal}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full shadow-sm hover:shadow transition-all"
                >
                  开始执行
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── 中间内容区 ── */}
        <div className="flex-1 flex overflow-hidden min-h-0 relative">
          {!state.projectName ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gray-50/50 dark:bg-gray-900/50 overflow-y-auto">
              <div className="w-24 h-24 mb-6 rounded-3xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shadow-inner">
                <img src="/logo.png" alt="MoFox Logo" className="w-16 h-16 object-cover" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">欢迎来到 MoFox Code</h2>
              <p className="text-gray-500 dark:text-gray-400 max-w-md mb-8 text-sm">
                您目前还没有打开任何项目。请先打开或关联一个本地项目，以便 MoFox 了解您的代码上下文。
              </p>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    setNewWorkDir(state.lastWorkDir || ".");
                    setShowOpenProjectDialog(true);
                  }}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all shadow-sm hover:shadow text-sm"
                >
                  <FolderOpen size={18} />
                  打开本地项目
                </button>
              </div>
              {state.recentProjects.length > 0 && (
                <div className="mt-12 text-left w-full max-w-md">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">最近打开</h3>
                  <div className="space-y-1">
                    {state.recentProjects.slice(0, 5).map((dir) => (
                      <button
                        key={dir}
                        onClick={() => {
                          const client = getWSClient();
                          const normalized = normalizePath(dir);
                          dispatch({ type: "SET_CONNECTION", payload: "reconnecting" });
                          dispatch({ type: "RESET_SESSION" });
                          dispatch({ type: "SET_LAST_WORK_DIR", payload: normalized });
                          dispatch({ type: "SET_LAST_SESSION_ID", payload: "" });
                          client.send("project.open", { working_directory: normalized });
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-100 dark:border-gray-800 rounded-xl transition-all text-left group"
                      >
                        <Folder size={18} className="text-blue-500 opacity-70 group-hover:opacity-100 transition-opacity shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {dir.split(/[\\/]/).pop() || dir}
                          </div>
                          <div className="text-xs text-gray-400 truncate">
                            {dir}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white dark:bg-gray-950">
                <ChatArea />
              </div>
              <RightPanel />
            </>
          )}
        </div>
      </div>

      {/* ── 移动端历史抽屉 ── */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex animate-in fade-in duration-200">
          <div className="h-full shadow-2xl z-10 slide-in-from-left duration-300">
            <SessionList
              onNewSession={() => {
                handleNewChat();
                setSidebarOpen(false);
              }}
              onOpenProject={() => {
                handleOpenProjectClick();
                setSidebarOpen(false);
              }}
              collapsed={false}
              onToggle={() => setSidebarOpen(false)}
            />
          </div>
          <div
            className="flex-1 bg-black/50 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
        </div>
      )}

      {/* ── 审批弹窗 ── */}
      <ApprovalDialog />

      {/* ── 打开项目弹窗 ── */}
      {showOpenProjectDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">打开项目</h2>
            <div>
              <label className="text-xs text-gray-500 block mb-1">项目目录</label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newWorkDir}
                  onChange={(e) => setNewWorkDir(e.target.value)}
                  className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleOpenProject()}
                />
                <button
                  onClick={() => setShowDirectoryPicker(true)}
                  className="px-2.5 py-2 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title="浏览目录"
                >
                  <FolderSearch size={18} />
                </button>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowOpenProjectDialog(false)}
                className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-300"
              >
                取消
              </button>
              <button
                onClick={handleOpenProject}
                className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                打开
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DirectoryPicker 弹窗 ── */}
      {showDirectoryPicker && (
        <DirectoryPicker
          initialPath={newWorkDir || "/"}
          onSelect={(selectedPath) => {
            setNewWorkDir(selectedPath);
            setShowDirectoryPicker(false);
          }}
          onCancel={() => setShowDirectoryPicker(false)}
        />
      )}

      {/* ── 新建会话弹窗 ── */}
      {showNewSessionDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">新建会话</h2>

            {/* 模式选择器：Pro / Solo 二选一 */}
            <div className="grid grid-cols-2 gap-3">
              {/* Pro 卡片 */}
              <button
                onClick={() => setNewSessionMode("pro")}
                className={`text-left p-3 rounded-xl border-2 transition-all ${
                  newSessionMode === "pro"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
              >
                <div className={`text-sm font-semibold mb-1 ${
                  newSessionMode === "pro" ? "text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-gray-300"
                }`}>Pro</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  默认会话模式，遵循严格工作流程，适用于大多数任务
                </div>
              </button>

              {/* Solo 卡片 */}
              <button
                onClick={() => setNewSessionMode("solo")}
                className={`text-left p-3 rounded-xl border-2 transition-all ${
                  newSessionMode === "solo"
                    ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20"
                    : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
              >
                <div className={`text-sm font-semibold mb-1 ${
                  newSessionMode === "solo" ? "text-cyan-700 dark:text-cyan-300" : "text-gray-700 dark:text-gray-300"
                }`}>Solo</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  传统单 Agent 模式，无多智能体协作，适用于顶级大模型或简单日常任务
                </div>
              </button>
            </div>

            {/* 模型选择（仅 Solo 选中时显示） */}
            {newSessionMode === "solo" && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">模型</label>
                <select
                  value={newSessionSoloModel}
                  onChange={(e) => setNewSessionSoloModel(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 cursor-pointer"
                >
                  <option value="">选择模型...</option>
                  {state.availableModels.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowNewSessionDialog(false)}
                className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-300"
              >
                取消
              </button>
              <button
                onClick={handleConfirmNewSession}
                className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 头像上传弹窗 ── */}
      {showAvatarUpload && (
        <AvatarUpload
          open={showAvatarUpload}
          onClose={() => setShowAvatarUpload(false)}
          onUploaded={(url) => {
            dispatch({ type: "SET_AVATAR_URL", payload: url });
          }}
        />
      )}

      {/* ── 设置面板（桌面版专用）── */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
