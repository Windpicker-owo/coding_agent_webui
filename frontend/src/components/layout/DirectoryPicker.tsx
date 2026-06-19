/** DirectoryPicker — 目录浏览器弹窗
 *
 * 通过 WebSocket browse.directory 消息浏览服务器端文件系统。
 * 确认后通过 onSelect 回调返回选中的路径。
 * Windows 下支持驱动盘选择。
 */

import { useState, useEffect, useCallback } from "react";
import { getWSClient } from "../../utils/ws-client.ts";
import { normalizePath } from "../../utils/path-utils.ts";
import type { BrowseDirectoryResultPayload } from "../../types/messages";
import { Folder, ChevronRight, Home, HardDrive } from "lucide-react";

interface DirectoryEntry {
  name: string;
  is_dir: boolean;
}

interface DirectoryPickerProps {
  /** 初始路径 */
  initialPath?: string;
  /** 选中路径回调 */
  onSelect: (path: string) => void;
  /** 取消回调 */
  onCancel: () => void;
}

/** 判断当前是否处于 Windows 根目录（驱动盘列表）视图 */
function isWindowsRootView(path: string): boolean {
  return path === "根目录" || path === "" || path === "/";
}

/** 判断 entry name 是否像 Windows 驱动盘 (e.g. "C:\\") */
function isDriveEntry(name: string): boolean {
  return /^[A-Z]:\\?$/.test(name);
}

export function DirectoryPicker({
  initialPath = "/",
  onSelect,
  onCancel,
}: DirectoryPickerProps) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [parent, setParent] = useState<string | null>(null);
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /** 请求浏览目录 */
  const browsePath = useCallback((path: string) => {
    setLoading(true);
    setError(null);
    try {
      getWSClient().send("browse.directory", { path });
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  }, []);

  /** 监听 browse.directory_result */
  useEffect(() => {
    const client = getWSClient();

    const handler = (msg: { type: string; payload: unknown }) => {
      if (msg.type !== "browse.directory_result") return;
      const p = msg.payload as BrowseDirectoryResultPayload;

      setCurrentPath(p.path);
      setParent(p.parent);
      setEntries(p.entries || []);
      setError(p.error || null);
      setLoading(false);
    };

    client.on("browse.directory_result", handler);

    // 初始加载
    browsePath(initialPath);

    return () => {
      client.off("browse.directory_result", handler);
    };
  }, [initialPath, browsePath]);

  /** 点击目录进入 */
  const handleEnterDir = useCallback(
    (entryName: string) => {
      // Windows 根目录视图：点击驱动盘直接进入该盘
      if (isWindowsRootView(currentPath) && isDriveEntry(entryName)) {
        browsePath(entryName);
        return;
      }
      const sep = currentPath.endsWith("/") || currentPath.endsWith("\\") ? "" : "\\";
      browsePath(normalizePath(currentPath + sep + entryName));
    },
    [currentPath, browsePath]
  );

  /** 返回上级 */
  const handleGoParent = useCallback(() => {
    if (parent !== null) {
      browsePath(parent);
    }
  }, [parent, browsePath]);

  /** 确认选择当前目录 */
  const handleConfirm = useCallback(() => {
    // Windows 根目录视图不允许直接确认
    if (isWindowsRootView(currentPath)) return;
    onSelect(normalizePath(currentPath));
  }, [currentPath, onSelect]);

  const atRoot = isWindowsRootView(currentPath);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl flex flex-col max-h-[70vh]">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            选择目录
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* 当前路径 + 导航按钮 */}
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0 space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => browsePath("/")}
              disabled={loading || atRoot}
              className="p-1 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 disabled:opacity-40"
              title="根目录（驱动盘列表）"
            >
              <Home size={16} />
            </button>
            <button
              onClick={handleGoParent}
              disabled={parent === null || loading}
              className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40"
            >
              ..
            </button>
            <span
              className="flex-1 text-xs text-gray-500 dark:text-gray-400 font-mono truncate select-all"
              title={currentPath}
            >
              {atRoot ? "💻 选择驱动盘..." : currentPath}
            </span>
          </div>
        </div>

        {/* 目录列表 */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-gray-400">
              加载中...
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <span className="text-sm text-red-500">错误: {error}</span>
              <button
                onClick={() => browsePath(currentPath)}
                className="text-xs text-blue-500 hover:text-blue-400"
              >
                重试
              </button>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-gray-400">
              此目录为空
            </div>
          ) : (
            <div className="py-1">
              {entries.map((entry) => (
                <div
                  key={entry.name}
                  className={`group w-full flex items-center justify-between px-5 py-2 text-sm transition-colors ${
                    entry.is_dir
                      ? "hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-700 dark:text-gray-300"
                      : "text-gray-400 dark:text-gray-600"
                  }`}
                >
                  <div 
                    className={`flex-1 flex items-center gap-3 overflow-hidden ${entry.is_dir ? "cursor-pointer" : "cursor-default"}`}
                    onClick={() => {
                      if (entry.is_dir) {
                        handleEnterDir(entry.name);
                      }
                    }}
                  >
                    {entry.is_dir ? (
                      isWindowsRootView(currentPath) && isDriveEntry(entry.name) ? (
                        <HardDrive size={16} className="text-blue-500 shrink-0" />
                      ) : (
                        <Folder size={16} className="text-amber-500 shrink-0" />
                      )
                    ) : (
                      <ChevronRight size={16} className="text-gray-300 dark:text-gray-700 shrink-0" />
                    )}
                    <span className="truncate">{entry.name}</span>
                  </div>
                  
                  {entry.is_dir && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        let targetPath = "";
                        if (isWindowsRootView(currentPath) && isDriveEntry(entry.name)) {
                          targetPath = entry.name;
                        } else {
                          const sep = currentPath.endsWith("/") || currentPath.endsWith("\\") ? "" : "\\";
                          targetPath = normalizePath(currentPath + sep + entry.name);
                        }
                        onSelect(targetPath);
                      }}
                      className="ml-3 px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-200 dark:hover:bg-blue-800/50 shrink-0"
                    >
                      选择
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-gray-100 dark:border-gray-800 shrink-0">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            取消
          </button>
          <div className="flex-1" />
          <button
            onClick={handleConfirm}
            disabled={loading || !!error || atRoot}
            className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
          >
            {atRoot ? "请选择一个目录" : "选择此目录"}
          </button>
        </div>
      </div>
    </div>
  );
}
