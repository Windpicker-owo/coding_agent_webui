/** 文件预览侧边栏 */
import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useSession, useSessionDispatch } from "../../hooks/useSession.ts";
import { X, FileCode, ChevronDown, AlignLeft } from "lucide-react";
import type { ContentPreviewInfo } from "../../types/messages";

function ContentPreviewBlock({ preview }: { preview: ContentPreviewInfo }) {
  const FOLD_THRESHOLD = 50000; // 在右侧面板可以显示更长
  const shouldFold = preview.content.length > FOLD_THRESHOLD;
  const [expanded, setExpanded] = useState(!shouldFold);

  // 每次 preview 变化时重置
  useEffect(() => {
    setExpanded(!shouldFold);
  }, [preview.messageId, shouldFold]);

  const header = preview.path
    ? `${preview.path}${preview.language ? ` (${preview.language})` : ""}`
    : preview.language ?? "preview";

  if (preview.type === "markdown") {
    const displayContent =
      shouldFold && !expanded
        ? preview.content.slice(0, FOLD_THRESHOLD) + "\n\n…"
        : preview.content;

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <AlignLeft size={16} className="text-blue-500" />
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
            {preview.title || header || "Markdown 内容"}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 bg-white dark:bg-gray-950 prose dark:prose-invert max-w-none text-sm">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
          >
            {displayContent}
          </ReactMarkdown>
          {shouldFold && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-4 text-xs font-medium px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 flex items-center gap-1 transition-colors mx-auto"
            >
              <ChevronDown
                size={14}
                className={`transition-transform ${expanded ? "rotate-180" : ""}`}
              />
              {expanded ? "收起部分内容" : "展开全部内容"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // code preview
  const displayContent =
    shouldFold && !expanded
      ? preview.content.slice(0, FOLD_THRESHOLD) + "\n…"
      : preview.content;

  const codeMarkdown = `~~~${preview.language || "text"}\n${displayContent}\n~~~`;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <FileCode size={16} className="text-gray-500" />
        <span className="text-sm font-mono text-gray-700 dark:text-gray-300 truncate">
          {header}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto bg-[#1e1e1e] dark:bg-[#0d1117]">
        <div className="p-4 text-[13px] font-mono [&_pre]:!m-0 [&_pre]:!p-0 [&_pre]:!bg-transparent [&_code]:!bg-transparent text-gray-300">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
          >
            {codeMarkdown}
          </ReactMarkdown>
        </div>
        {shouldFold && (
          <div className="p-4 flex justify-center sticky bottom-0 bg-gradient-to-t from-[#1e1e1e] dark:from-[#0d1117] pt-8">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-xs font-medium px-4 py-2 rounded-full bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-1 transition-colors shadow-lg border border-gray-700"
            >
              <ChevronDown
                size={14}
                className={`transition-transform ${expanded ? "rotate-180" : ""}`}
              />
              {expanded ? "收起部分代码" : "展开全部代码"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function RightPanel() {
  const { activePreview } = useSession();
  const dispatch = useSessionDispatch();
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    setMinimized(false);
  }, [activePreview?.messageId]);

  if (!activePreview) {
    return null;
  }

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed right-6 top-20 z-50 p-3 bg-white dark:bg-gray-800 rounded-full shadow-xl border border-gray-200 dark:border-gray-700 hover:scale-105 transition-transform"
        title="展开文件预览"
      >
        <FileCode size={20} className="text-blue-600 dark:text-blue-400" />
      </button>
    );
  }

  return (
    <div className="hidden xl:flex flex-col h-full bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 shadow-xl relative animate-slide-in-right w-80 2xl:w-96 shrink-0 z-20">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-800 shrink-0 bg-gray-50/50 dark:bg-gray-900/50">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {activePreview.type === "markdown" ? "文档预览" : "代码预览"}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimized(true)}
            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-md hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
            title="最小化"
          >
            <span className="block w-3 h-0.5 bg-current rounded-full" />
          </button>
          <button
            onClick={() => dispatch({ type: "SET_ACTIVE_PREVIEW", payload: null })}
            className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ContentPreviewBlock preview={activePreview} />
      </div>
    </div>
  );
}
