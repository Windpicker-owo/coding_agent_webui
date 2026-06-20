/** 历史会话侧边栏 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useSession, useSessionDispatch } from "../../hooks/useSession";
import { getWSClient } from "../../utils/ws-client";
import type { SessionSummary } from "../../types/messages";
import { Folder, FolderOpen, Loader2, Menu, Plus, ChevronDown, ChevronRight, MessageSquare, Trash2, Edit2, Check, X } from "lucide-react";
import { normalizePath } from "../../utils/path-utils";

interface SessionListProps {
  onNewSession: () => void;
  onOpenProject: () => void;
  collapsed: boolean;
  onToggle: () => void;
}

export function SessionList({ onNewSession, onOpenProject, collapsed, onToggle }: SessionListProps) {
  const state = useSession();
  const { sessionId, isConnected, lastWorkDir, sessions, multiSessions, phase, yoloMode, pendingApproval, messages, recentProjects } = state;
  const dispatch = useSessionDispatch();
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({});
  // YOLO 警告：切走工作中的非 YOLO 会话时弹确认
  const [pendingResume, setPendingResume] = useState<{s: SessionSummary, dir: string} | null>(null);

  const refreshList = useCallback(() => {
    setLoading(true);
    try {
      const dirsToFetch = Array.from(new Set([lastWorkDir, ...recentProjects].filter(Boolean).map(normalizePath)));
      getWSClient().send("session.list_multi", { directories: dirsToFetch });
    } catch {
      setLoading(false);
    }
  }, [lastWorkDir, recentProjects]);

  // 连接后自动拉取历史
  useEffect(() => {
    if (isConnected) {
      refreshList();
    }
  }, [isConnected, refreshList]);

  // 当 multiSessions 更新时清除 loading 状态
  useEffect(() => {
    setLoading(false);
  }, [multiSessions]);

  // 每 10 秒自动刷新会话列表（静默，不触发 loading）
  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(() => {
      try {
        const dirsToFetch = Array.from(new Set([lastWorkDir, ...recentProjects].filter(Boolean).map(normalizePath)));
        getWSClient().send("session.list_multi", { directories: dirsToFetch });
      } catch {
        // 静默忽略
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [isConnected, lastWorkDir, recentProjects]);

  // 检测当前会话是否在工作中（用于 YOLO 警告）：phase + pendingApproval + running tool_call
  const isCurrentWorking = useCallback(() => {
    if (phase === "thinking" || phase === "coding" || phase === "researching") return true;
    if (pendingApproval) return true;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.metadata?.kind === "tool_call" && m.metadata?.stage === "running") return true;
      if (m.metadata?.kind !== "tool_call" && m.metadata?.kind !== "console_output" && m.metadata?.kind !== "tool_result") break;
    }
    return false;
  }, [phase, pendingApproval, messages]);

  // 侧栏工作状态标记（仅基于 session.phase）
  const isWorkingPhase = (p: string) => p === "thinking" || p === "coding" || p === "researching";

  const handleResume = useCallback(
    (s: SessionSummary, dir: string) => {
      if (s.session_id === sessionId) return;
      // 当前会话正在工作中且非 YOLO 模式 → 弹出警告
      if (isCurrentWorking() && !yoloMode && sessionId) {
        setPendingResume({ s, dir });
        return;
      }
      doResume(s, dir);
    },
    [sessionId, isCurrentWorking, yoloMode]
  );

  const doResume = useCallback(
    (s: SessionSummary, dir: string) => {
      const client = getWSClient();
      dispatch({ type: "SET_CONNECTION", payload: "reconnecting" });
      dispatch({ type: "RESET_SESSION" });
      dispatch({ type: "SET_LAST_WORK_DIR", payload: dir });
      try {
        client.send("session.init", {
          working_directory: dir,
          session_id: s.session_id,
        });
      } catch {
        dispatch({ type: "SET_CONNECTION", payload: "open" });
      }
    },
    [dispatch]
  );

  const confirmResume = useCallback(() => {
    if (pendingResume) {
      doResume(pendingResume.s, pendingResume.dir);
      setPendingResume(null);
    }
  }, [pendingResume, doResume]);

  const cancelResume = useCallback(() => {
    setPendingResume(null);
  }, []);

  const handleDelete = useCallback(
    (s: SessionSummary, dir: string) => {
      if (!confirm(`确定删除会话 "${s.title || s.session_id.slice(0, 8)}"？`))
        return;
      try {
        getWSClient().send("session.delete", { session_id: s.session_id, working_directory: dir });
        // Optimistic update for multiSessions
        const updatedDirSessions = (multiSessions[dir] || []).filter((x: SessionSummary) => x.session_id !== s.session_id);
        dispatch({
          type: "SET_MULTI_SESSIONS",
          payload: { ...multiSessions, [dir]: updatedDirSessions },
        });
      } catch {
        // ignore
      }
    },
    [multiSessions, dispatch]
  );

  const handleRename = useCallback(
    (s: SessionSummary) => {
      setEditingId(s.session_id);
      setEditTitle(s.title || "");
      // Focus input after render
      setTimeout(() => editInputRef.current?.focus(), 0);
    },
    []
  );

  const commitRename = useCallback(() => {
    if (!editingId) return;
    const trimmed = editTitle.trim();
    if (trimmed && trimmed.length <= 60) {
      try {
        getWSClient().send("session.rename", {
          session_id: editingId,
          title: trimmed,
        });
        // Optimistically update multiSessions
        const newMultiSessions = { ...multiSessions };
        for (const dir in newMultiSessions) {
          newMultiSessions[dir] = newMultiSessions[dir].map((x: SessionSummary) =>
            x.session_id === editingId ? { ...x, title: trimmed } : x
          );
        }
        dispatch({
          type: "SET_MULTI_SESSIONS",
          payload: newMultiSessions,
        });
      } catch {
        // ignore
      }
    }
    setEditingId(null);
    setEditTitle("");
  }, [editingId, editTitle, multiSessions, dispatch]);

  const cancelRename = useCallback(() => {
    setEditingId(null);
    setEditTitle("");
  }, []);

  const toggleDir = useCallback((dir: string) => {
    setExpandedDirs(prev => ({ ...prev, [dir]: prev[dir] === false ? true : false }));
  }, []);

  const handleCloseDir = useCallback((dir: string) => {
    const normalized = normalizePath(dir);
    const isCurrent = normalizePath(lastWorkDir) === normalized;
    if (isCurrent) {
      if (!confirm(`当前正在使用项目 "${dir.split(/[\\/]/).pop() || dir}"，关闭将从列表中移除该项目。确定继续？`)) {
        return;
      }
    }
    dispatch({ type: "REMOVE_RECENT_PROJECT", payload: dir });
  }, [lastWorkDir, dispatch]);

  const dirsToDisplay = Array.from(new Set([lastWorkDir, ...recentProjects].filter(Boolean).map(normalizePath)));

  if (collapsed) {
    return (
      <aside className="w-14 h-full bg-gray-50 dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 flex flex-col items-center py-3 gap-3 shrink-0">
        <button
          onClick={onToggle}
          className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
          title="展开侧边栏"
        >
          <Menu size={20} />
        </button>
        <div className="w-8 h-px bg-gray-200 dark:bg-gray-800 my-1" />
        <button
          onClick={onNewSession}
          className="p-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 rounded-xl transition-colors shadow-sm"
          title="新建会话"
        >
          <Plus size={20} />
        </button>
        <button
          onClick={onOpenProject}
          className="p-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
          title="打开项目"
        >
          <FolderOpen size={20} />
        </button>
      </aside>
    );
  }

  return (
    <>
    <aside className={`w-64 flex flex-col shrink-0 h-full transition-colors ${
      state.desktopMode
        ? 'bg-gray-50/50 dark:bg-gray-900/40 border-r border-transparent'
        : 'bg-white dark:bg-gray-950 border-r border-gray-100 dark:border-gray-800'
    }`}>
      {/* Top Action Buttons */}
      <div 
        className="p-4 pb-2 flex gap-2"
        onPointerDown={(e) => {
          if (!state.desktopMode) return;
          const target = e.target as HTMLElement;
          if (!target.closest('button, input, a, select, textarea')) {
            window.parent.postMessage('tauri-drag', '*');
          }
        }}
      >
        <button
          onClick={() => {
            if (state.phase !== "ready" && state.phase !== "error" && state.phase !== "init") {
              const confirm = window.confirm("当前会话正在运行，是否强制中断并新建会话？");
              if (!confirm) return;
            }
            onNewSession();
          }}
          className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-xl font-medium transition-colors shadow-sm text-sm"
        >
          <Plus size={16} />
          新建会话
        </button>
        <button
          onClick={onOpenProject}
          className="flex items-center justify-center p-2 text-gray-500 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 rounded-xl transition-colors shrink-0"
          title="打开项目"
        >
          <Folder size={18} />
        </button>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">项目</span>
        <div className="flex items-center gap-1">
          <button
            onClick={refreshList}
            className="p-1 text-gray-500 hover:text-gray-300 text-xs"
            title="刷新"
          >
            ↻
          </button>
          <button
            onClick={onToggle}
            className="p-1 text-gray-500 hover:text-gray-300 text-xs"
            title="收起"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 搜索 */}
      <div className="px-3 py-1 mb-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索会话..."
          className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-gray-200 dark:focus:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-800 transition-all"
        />
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto pb-4">
        {loading && dirsToDisplay.length === 0 ? (
          <div className="p-3 text-xs text-gray-400 dark:text-gray-500 text-center">加载中...</div>
        ) : dirsToDisplay.length === 0 ? (
          <div className="p-3 text-xs text-gray-400 dark:text-gray-600 text-center">
            暂无项目
          </div>
        ) : (
          dirsToDisplay.map((dir) => {
            const name = dir.split(/[\\/]/).pop() || dir;
            const dirSessions = multiSessions[dir] || [];
            const filteredDirSessions = dirSessions
              .filter(
                (x: SessionSummary) =>
                  !search ||
                  x.title.toLowerCase().includes(search.toLowerCase()) ||
                  x.session_id.includes(search)
              )
              .sort((a: SessionSummary, b: SessionSummary) => b.last_active_at - a.last_active_at);

            // 如果有搜索词且当前目录下没有匹配项，则隐藏该目录
            if (search && filteredDirSessions.length === 0) return null;

            const isExpanded = expandedDirs[dir] !== false; // 默认展开

            return (
              <div key={dir} className="mb-2">
                <div className="group/dir flex w-full items-center rounded-lg transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/50">
                  <button
                    onClick={() => toggleDir(dir)}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 py-2"
                  >
                    <Folder size={14} className="text-gray-400 shrink-0" />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 flex-1 truncate text-left">{name}</span>
                    {isExpanded ? (
                      <ChevronDown size={12} className="text-gray-400 shrink-0" />
                    ) : (
                      <ChevronRight size={12} className="text-gray-400 shrink-0" />
                    )}
                  </button>
                  <button
                    onClick={() => handleCloseDir(dir)}
                    className="mr-2 shrink-0 p-0.5 text-gray-400 opacity-0 transition-all hover:text-red-400 group-hover/dir:opacity-100 focus-visible:opacity-100"
                    title="关闭项目"
                  >
                    <X size={12} />
                  </button>
                </div>
                
                {isExpanded && (
                  <div className="pl-4 ml-[19px] border-l border-gray-100 dark:border-gray-800 mt-0.5 flex flex-col gap-0.5">
                    {filteredDirSessions.length === 0 ? (
                      <div className="text-xs text-gray-400 dark:text-gray-600 py-1 pl-2">无历史会话</div>
                    ) : (
                      filteredDirSessions.map((s: SessionSummary) => (
                        <div
                          key={s.session_id}
                          onClick={() => {
                            if (editingId && editingId !== s.session_id) {
                              cancelRename();
                            }
                            if (editingId !== s.session_id) {
                              handleResume(s, dir);
                            }
                          }}
                          className={`group/item px-2 py-1.5 cursor-pointer rounded-lg transition-all flex items-start justify-between ${
                            s.session_id === sessionId
                              ? "bg-blue-50/80 dark:bg-blue-900/20 shadow-sm"
                              : "hover:bg-gray-50 dark:hover:bg-gray-900/50"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            {editingId === s.session_id ? (
                              <input
                                ref={editInputRef}
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value.slice(0, 60))}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    commitRename();
                                  } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    cancelRename();
                                  }
                                }}
                                onBlur={commitRename}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full px-1.5 py-0.5 text-xs bg-white dark:bg-gray-700 border border-blue-400 dark:border-blue-500 rounded text-gray-900 dark:text-white focus:outline-none"
                                maxLength={60}
                              />
                            ) : (
                              <div
                                className="text-xs text-gray-800 dark:text-gray-300 truncate pr-2"
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  handleRename(s);
                                }}
                                title="双击重命名"
                              >
                                {s.title || s.session_id.slice(0, 8)}
                              </div>
                            )}
                            <div className="text-[10px] text-gray-400 dark:text-gray-600 mt-0.5 flex items-center gap-1.5">
                              {isWorkingPhase(s.phase) && (
                                <Loader2 size={10} className="animate-spin text-blue-500 shrink-0" />
                              )}
                              <span>
                                {s.message_count} 条 · {new Date(s.last_active_at * 1000).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 ml-1 pt-0.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRename(s);
                              }}
                              className="opacity-0 group-hover/item:opacity-100 text-gray-400 hover:text-blue-400 text-xs transition-all p-1"
                              title="重命名"
                            >
                              ✎
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(s, dir);
                              }}
                              className="opacity-0 group-hover/item:opacity-100 text-gray-400 hover:text-red-400 text-xs transition-all p-1"
                              title="删除"
                            >
                              🗑
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>


    </aside>

    {/* YOLO 警告对话框：切走工作中的非 YOLO 会话时弹出 */}
    {pendingResume && (
      <div className="fixed inset-0 z-50 bg-black/60 p-4 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl max-w-sm w-full p-6 space-y-4">
          <h3 className="text-sm font-semibold text-yellow-600 dark:text-yellow-400 flex items-center gap-2">
            ⚠ 切换会话警告
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            当前会话正在工作中且未开启 <strong>YOLO 模式</strong>。
            切换到其他会话后，后台的 Console 命令审批请求将<strong>无法送达</strong>，会在超时后自动拒绝。
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500">
            建议先开启 YOLO 模式再切换，或等待当前工作完成。
          </p>
          <div className="flex gap-2 pt-2">
            <button
              onClick={cancelResume}
              className="flex-1 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-lg text-sm transition-colors"
            >
              取消
            </button>
            <button
              onClick={confirmResume}
              className="flex-1 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-medium rounded-lg text-sm transition-colors"
            >
              仍然切换
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
