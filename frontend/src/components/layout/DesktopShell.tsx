import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useSession, useSessionDispatch } from "../../hooks/useSession.ts";
import { getWSClient } from "../../utils/ws-client.ts";
import { SessionList } from "../session/SessionList.tsx";
import { ChatArea } from "./ChatArea.tsx";
import { StatusBar } from "./StatusBar.tsx";
import { getPhaseNoticeClasses } from "./AppShell.tsx";
import { ApprovalDialog } from "../approval/ApprovalDialog.tsx";
import { Loader2 } from "lucide-react";

interface DesktopShellProps {
  onDisconnect: () => void;
}

export function DesktopShell({ onDisconnect }: DesktopShellProps) {
  const state = useSession();
  const dispatch = useSessionDispatch();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [newWorkDir, setNewWorkDir] = useState(".");
  const [showOpenProjectDialog, setShowOpenProjectDialog] = useState(false);

  // Handle open project event emitted from elsewhere
  useEffect(() => {
    const handler = () => {
      setNewWorkDir(state.lastWorkDir || ".");
      setShowOpenProjectDialog(true);
    };
    window.addEventListener("open-project-dialog", handler);
    return () => window.removeEventListener("open-project-dialog", handler);
  }, [state.lastWorkDir]);

  const handleNewChat = useCallback(() => {
    dispatch({ type: "RESET_SESSION" });
  }, [dispatch]);

  const handleOpenProjectClick = useCallback(() => {
    if (!newWorkDir) return;
    try {
      getWSClient().send("project.open", { working_directory: newWorkDir });
      setShowOpenProjectDialog(false);
    } catch { /* */ }
  }, [newWorkDir]);

  const isBusy = state.phase !== "ready" && state.phase !== "init" && state.phase !== "error";
  const showActiveSpinner = state.phase === "thinking" || state.phase === "coding" || state.phase === "researching";
  const phaseDetail = state.phaseDetail.trim();

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-[#cccccc] overflow-hidden">
      {/* --- Main Content Area (Sidebar + Chat Area) --- */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        
        {/* Sidebar */}
        <div className={`h-full border-r border-gray-200 dark:border-[#2b2b2b] bg-gray-50 dark:bg-[#181818] transition-all duration-200 ${sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'}`}>
          <div className="w-64 h-full">
            <SessionList
              onNewSession={handleNewChat}
              onOpenProject={handleOpenProjectClick}
              collapsed={false}
              onToggle={() => setSidebarOpen(!sidebarOpen)}
            />
          </div>
        </div>

        {/* Main Chat Column */}
        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#1e1e1e]">
          
          {/* Breadcrumbs / Top Bar (Minimal) */}
          <div className="h-10 shrink-0 flex items-center px-4 border-b border-gray-100 dark:border-[#2b2b2b]">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1 text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 transition-colors mr-3"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            </button>
            <span className="text-sm font-medium text-gray-700 dark:text-[#cccccc] truncate">
              {state.title || "Untitled"}
            </span>
            <span className="mx-2 text-gray-400 dark:text-[#555555]">/</span>
            <span className="text-sm text-gray-500 dark:text-[#888888] truncate font-mono">
              {state.sessionId ? state.sessionId.slice(0, 8) : "New Session"}
            </span>
          </div>



          {/* Chat Area */}
          <ChatArea />
        </div>
      </div>

      {/* --- Native Status Bar --- */}
      <StatusBar />

      {/* --- Approval Dialog --- */}
      <ApprovalDialog />

      {/* --- Open Project Dialog --- */}
      {showOpenProjectDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#2b2b2b] shadow-2xl rounded-xl p-5 space-y-4 animate-slide-up-fade">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">打开项目</h2>
            <div>
              <label className="text-xs text-gray-500 block mb-1">工作目录路径</label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newWorkDir}
                  onChange={(e) => setNewWorkDir(e.target.value)}
                  className="flex-1 px-3 py-2 bg-gray-50 dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-gray-100 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleOpenProjectClick()}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowOpenProjectDialog(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleOpenProjectClick}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
              >
                打开
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
