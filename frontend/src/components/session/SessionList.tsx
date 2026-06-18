/** 历史会话侧边栏 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useSession, useSessionDispatch } from "../../hooks/useSession.ts";
import { getWSClient } from "../../utils/ws-client.ts";
import type { SessionSummary } from "../../types/messages";
import { Folder, FolderOpen, Loader2, Menu, Plus } from "lucide-react";

interface SessionListProps {
  onNewSession: () => void;
  onOpenProject: () => void;
  collapsed: boolean;
  onToggle: () => void;
}

export function SessionList({ onNewSession, onOpenProject, collapsed, onToggle }: SessionListProps) {
  const state = useSession();
  const { sessionId, isConnected, lastWorkDir, sessions, phase, yoloMode, pendingApproval, messages } = state;
  const dispatch = useSessionDispatch();
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const editInputRef = useRef<HTMLInputElement | null>(null);
  // YOLO 警告：切走工作中的非 YOLO 会话时弹确认
  const [pendingResume, setPendingResume] = useState<SessionSummary | null>(null);

  const refreshList = useCallback(() => {
    setLoading(true);
    try {
      getWSClient().send("session.list", {});
    } catch {
      setLoading(false);
    }
  }, []);

  // 连接后自动拉取历史
  useEffect(() => {
    if (isConnected && lastWorkDir) {
      refreshList();
    }
  }, [isConnected, lastWorkDir, refreshList]);

  // 当 sessions 更新时清除 loading 状态
  useEffect(() => {
    setLoading(false);
  }, [sessions]);

  // 每 10 秒自动刷新会话列表（静默，不触发 loading）
  useEffect(() => {
    if (!isConnected || !lastWorkDir) return;
    const interval = setInterval(() => {
      try {
        getWSClient().send("session.list", {});
      } catch {
        // 静默忽略
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [isConnected, lastWorkDir]);

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
    (s: SessionSummary) => {
      if (s.session_id === sessionId) return;
      // 当前会话正在工作中且非 YOLO 模式 → 弹出警告
      if (isCurrentWorking() && !yoloMode && sessionId) {
        setPendingResume(s);
        return;
      }
      doResume(s);
    },
    [sessionId, isCurrentWorking, yoloMode, dispatch, lastWorkDir]
  );

  const doResume = useCallback(
    (s: SessionSummary) => {
      const client = getWSClient();
      dispatch({ type: "SET_CONNECTION", payload: "reconnecting" });
      dispatch({ type: "RESET_SESSION" });
      try {
        client.send("session.init", {
          working_directory: lastWorkDir || ".",
          session_id: s.session_id,
        });
      } catch {
        dispatch({ type: "SET_CONNECTION", payload: "open" });
      }
    },
    [dispatch, lastWorkDir]
  );

  const confirmResume = useCallback(() => {
    if (pendingResume) {
      doResume(pendingResume);
      setPendingResume(null);
    }
  }, [pendingResume, doResume]);

  const cancelResume = useCallback(() => {
    setPendingResume(null);
  }, []);

  const handleDelete = useCallback(
    (s: SessionSummary) => {
      if (!confirm(`确定删除会话 "${s.title || s.session_id.slice(0, 8)}"？`))
        return;
      try {
        getWSClient().send("session.delete", { session_id: s.session_id });
        dispatch({
          type: "SET_SESSIONS",
          payload: sessions.filter((x) => x.session_id !== s.session_id),
        });
      } catch {
        // ignore
      }
    },
    [sessions, dispatch]
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
        // Optimistically update local state
        dispatch({
          type: "SET_SESSIONS",
          payload: sessions.map((s) =>
            s.session_id === editingId ? { ...s, title: trimmed } : s
          ),
        });
      } catch {
        // ignore
      }
    }
    setEditingId(null);
    setEditTitle("");
  }, [editingId, editTitle, sessions, dispatch]);

  const cancelRename = useCallback(() => {
    setEditingId(null);
    setEditTitle("");
  }, []);

  const filtered = sessions
    .filter(
      (s) =>
        !search ||
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.session_id.includes(search)
    )
    .sort((a, b) => b.last_active_at - a.last_active_at);

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
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">历史会话</span>
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
      <div className="flex-1 overflow-y-auto">
        {loading && sessions.length === 0 ? (
          <div className="p-3 text-xs text-gray-400 dark:text-gray-500 text-center">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="p-3 text-xs text-gray-400 dark:text-gray-600 text-center">
            {search ? "无匹配会话" : "暂无历史会话"}
          </div>
        ) : (
          filtered.map((s) => (
            <div
              key={s.session_id}
              onClick={() => {
                if (editingId && editingId !== s.session_id) {
                  cancelRename();
                }
                if (editingId !== s.session_id) {
                  handleResume(s);
                }
              }}
              className={`group mx-2 my-0.5 px-3 py-2 cursor-pointer rounded-lg transition-all ${
                s.session_id === sessionId
                  ? "bg-blue-50/80 dark:bg-blue-900/20 shadow-sm"
                  : "hover:bg-gray-50 dark:hover:bg-gray-900/50"
              }`}
            >
              <div className="flex items-start justify-between">
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
                      className="text-xs font-medium text-gray-800 dark:text-gray-300 truncate"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleRename(s);
                      }}
                      title="双击重命名"
                    >
                      {s.title || s.session_id.slice(0, 8)}
                    </div>
                  )}
                  <div className="text-xs text-gray-400 dark:text-gray-600 mt-0.5 flex items-center gap-1.5">
                    {isWorkingPhase(s.phase) && (
                      <Loader2 size={10} className="animate-spin text-blue-500 shrink-0" />
                    )}
                    <span>
                      {s.message_count} 条消息 ·{" "}
                      {new Date(s.last_active_at * 1000).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 ml-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRename(s);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-blue-400 text-xs transition-all"
                    title="重命名"
                  >
                    ✎
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(s);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 text-xs transition-all"
                    title="删除"
                  >
                    🗑
                  </button>
                </div>
              </div>
            </div>
          ))
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
