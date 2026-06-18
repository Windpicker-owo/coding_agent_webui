/** 项目管理：关联目录按钮 */
import React, { useState, useRef, useEffect } from "react";
import { getWSClient } from "../../utils/ws-client.ts";
import { FolderSearch } from "lucide-react";
import { DirectoryPicker } from "./DirectoryPicker.tsx";

export function LinkProjectButton() {
  const [showInput, setShowInput] = useState(false);
  const [path, setPath] = useState("");
  const [showDirectoryPicker, setShowDirectoryPicker] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showInput &&
        !showDirectoryPicker &&
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowInput(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showInput, showDirectoryPicker]);

  const handleLink = () => {
    if (!path.trim()) return;
    getWSClient().send("session.link", { path: path.trim() });
    setPath("");
    setShowInput(false);
  };

  return (
    <div ref={containerRef}>
      {!showInput ? (
        <button
          onClick={() => setShowInput(true)}
          className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          title="关联外部项目"
        >
          <FolderSearch size={14} />
          <span className="hidden sm:inline">关联项目</span>
        </button>
      ) : (
        <div className="flex gap-1">
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="项目路径..."
            className="flex-1 px-2 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-xs text-gray-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleLink()}
          />
          <button
            onClick={() => setShowDirectoryPicker(true)}
            className="px-1.5 py-1 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded transition-colors"
            title="浏览目录"
          >
            <FolderSearch size={14} />
          </button>
          <button
            onClick={handleLink}
            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded"
          >
            确定
          </button>
        </div>
      )}

      {/* ── DirectoryPicker 弹窗 ── */}
      {showDirectoryPicker && (
        <DirectoryPicker
          initialPath={path || "/"}
          onSelect={(selectedPath) => {
            setPath(selectedPath);
            setShowDirectoryPicker(false);
          }}
          onCancel={() => setShowDirectoryPicker(false)}
        />
      )}
    </div>
  );
}
