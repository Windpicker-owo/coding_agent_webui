/** Markdown 消息气泡——支持代码高亮 */
import React, { useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { PluggableList } from "unified";
import { Check, Loader2, ChevronRight, Terminal, FileCode, CheckCircle2, Copy, MapPin, RotateCcw, Undo2, GitFork } from "lucide-react";
import { useSession, useSessionDispatch } from "../../hooks/useSession.ts";
import { getWSClient } from "../../utils/ws-client.ts";
import { normalizeToolName } from "../../utils/message-utils.ts";
import type { ContentPreviewInfo } from "../../types/messages";

interface ToolOutputMessage {
  id: string;
  role: string;
  content: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

interface MessageBubbleProps {
  inCompletedFold?: boolean;
  msg: {
    id: string;
    role: string;
    content: string;
    stream_id?: string;
    timestamp?: number;
    metadata?: Record<string, unknown>;
  };
}

interface MarkdownAstNode {
  type: string;
  children?: MarkdownAstNode[];
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
}

const INLINE_CURSOR_TARGETS = new Set([
  "paragraph",
  "heading",
  "emphasis",
  "strong",
  "delete",
  "link",
  "linkReference",
  "blockquote",
  "tableCell",
]);

function createCursorNode(cursorClassName: string): MarkdownAstNode {
  return {
    type: "md_live_cursor",
    data: {
      hName: "span",
      hProperties: {
        className: cursorClassName.split(" "),
        "aria-hidden": "true",
      },
    },
  };
}

function parseAnsiToReact(text: string) {
  // 匹配常见的 ANSI 控制符
  // eslint-disable-next-line no-control-regex
  const regex = /\x1B\[([0-9;]*)[a-zA-Z]/g;
  const parts = text.split(regex);
  let currentStyle: React.CSSProperties = {};
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      if (parts[i]) {
        elements.push(<span key={i} style={{ ...currentStyle }}>{parts[i]}</span>);
      }
    } else {
      const codes = parts[i].split(";");
      for (const code of codes) {
        if (code === "0" || code === "") {
          currentStyle = {};
        } else if (code === "1") {
          currentStyle.fontWeight = "bold";
        } else if (code === "31") {
          currentStyle.color = "#ef4444"; // red
        } else if (code === "32") {
          currentStyle.color = "#22c55e"; // green
        } else if (code === "33") {
          currentStyle.color = "#eab308"; // yellow
        } else if (code === "34") {
          currentStyle.color = "#3b82f6"; // blue
        } else if (code === "35") {
          currentStyle.color = "#d946ef"; // fuchsia
        } else if (code === "36") {
          currentStyle.color = "#06b6d4"; // cyan
        } else if (code === "37") {
          currentStyle.color = "#f3f4f6"; // white/gray
        } else if (code === "90") {
          currentStyle.color = "#9ca3af"; // bright black/gray
        }
      }
    }
  }
  return elements;
}

function appendCursorNode(node: MarkdownAstNode, cursorClassName: string): boolean {
  if (Array.isArray(node.children) && node.children.length > 0) {
    const lastChild = node.children[node.children.length - 1];
    if (appendCursorNode(lastChild, cursorClassName)) {
      return true;
    }
    if (INLINE_CURSOR_TARGETS.has(node.type)) {
      node.children.push(createCursorNode(cursorClassName));
      return true;
    }
  }
  return false;
}

function remarkLiveCursor(options?: { cursorClassName?: string }) {
  const cursorClassName = options?.cursorClassName ?? "md-live-cursor md-live-cursor--main";
  return (tree: MarkdownAstNode) => {
    if (!tree || typeof tree !== "object") {
      return;
    }
    if (!Array.isArray(tree.children)) {
      tree.children = [];
    }
    if (!appendCursorNode(tree, cursorClassName)) {
      tree.children.push({
        type: "paragraph",
        children: [createCursorNode(cursorClassName)],
      });
    }
  };
}

function getAgentAccent(source: string): {
  avatarBg: string;
  cursorClass: string;
} {
  if (source === "coder") {
    return {
      avatarBg: "bg-orange-500",
      cursorClass: "md-live-cursor md-live-cursor--coder",
    };
  }
  return {
    avatarBg: "bg-blue-600",
    cursorClass: "md-live-cursor md-live-cursor--main",
  };
}

// ── 文件内容预览 ──────────────────────────────────────────

/** 从文件路径推断代码语言 */
function getLanguageFromPath(path: string): string {
  const ext = (path.split(".").pop() ?? "").toLowerCase();
  const LANG_MAP: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",
    md: "markdown",
    css: "css",
    scss: "scss",
    html: "html",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    bat: "batch",
    ps1: "powershell",
    dockerfile: "dockerfile",
    env: "properties",
    gitignore: "gitignore",
    tf: "hcl",
  };
  return LANG_MAP[ext] || ext || "";
}


interface ResearchAgentItem {
  name?: string;
  module_path?: string;
  focus?: string;
}

interface DiffStats {
  added: number;
  removed: number;
}

function getToolContentPreview(
  toolName: string,
  args: Record<string, unknown>
): ContentPreviewInfo | null {
  const n = toolName.toLowerCase();

  // write: 新建文件 → 代码块预览
  if (n.includes("write")) {
    const content = args.content as string | undefined;
    const path = args.path as string | undefined;
    if (!content) return null;
    return {
      type: "code",
      content,
      path,
      language: path ? getLanguageFromPath(path) : undefined,
    };
  }

  // edit: 编辑文件 → 代码块预览（new_text）
  if (n.includes("edit")) {
    const content = args.new_text as string | undefined;
    const path = args.path as string | undefined;
    if (!content) return null;
    return {
      type: "code",
      content,
      path,
      language: path ? getLanguageFromPath(path) : undefined,
    };
  }

  // create_plan: 创建计划 → Markdown 渲染
  if (n.includes("create_plan")) {
    const title = args.title as string | undefined;
    const plainContent = args.content as string | undefined;
    if (!plainContent && !title) return null;
    const md = title ? `# ${title}\n\n${plainContent ?? ""}` : (plainContent ?? "");
    return { type: "markdown", content: md, title };
  }

  // implement_plan: 实施计划 → Markdown 渲染（plan_content 字段）
  if (n.includes("implement_plan")) {
    const planContent = args.plan_content as string | undefined;
    if (!planContent) return null;
    return { type: "markdown", content: planContent };
  }

  // enter_phase: 进入工作流阶段 → 展示阶段信息
  if (n.includes("enter_phase")) {
    const phase = args.phase as string | undefined;
    if (!phase) return null;
    return { type: "markdown", content: `进入阶段: ${phase}` };
  }

  return null;
}

function getDiffStats(diff?: string): DiffStats | null {
  if (!diff) return null;

  let added = 0;
  let removed = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ") || line.startsWith("--- ") || line.startsWith("@@")) {
      continue;
    }
    if (line.startsWith("+")) {
      added += 1;
    } else if (line.startsWith("-")) {
      removed += 1;
    }
  }

  if (added === 0 && removed === 0) {
    return null;
  }

  return { added, removed };
}

function summarizeFileChanges(changes: MessageBubbleProps["msg"][]) {
  const files = new Map<string, DiffStats>();

  for (const change of changes) {
    const path = String(change.metadata?.path || "未知文件");
    const changeType = String(change.metadata?.change_type || "modify");
    const diff = change.metadata?.diff as string | undefined;
    const content = change.metadata?.content as string | undefined;
    const stats = getDiffStats(diff) ?? { added: 0, removed: 0 };

    if ((changeType === "create" || changeType === "created") && stats.added === 0 && content) {
      stats.added = content.replace(/\n$/, "").split("\n").length;
    }

    const current = files.get(path) ?? { added: 0, removed: 0 };
    current.added += stats.added;
    current.removed += stats.removed;
    files.set(path, current);
  }

  return files;
}


export function MessageBubble({ msg, inCompletedFold = false }: MessageBubbleProps) {
  const { phase, avatarUrl, ideMode, desktopMode } = useSession();
  const dispatch = useSessionDispatch();
  const kind = msg.metadata?.kind as string | undefined;
  const source = (msg.metadata?.source as string | undefined) ?? "agent";
  const agentAccent = getAgentAccent(source);

  // 自动打开 create_plan 的预览
  const hasAutoOpened = useRef(false);
  useEffect(() => {
    if (hasAutoOpened.current) return;
    
    // 情况1：tool_call 是 create_plan
    if (kind === "tool_group" || kind === "tool_call") {
      const rawToolName = (msg.metadata?.tool_name as string) ?? "unknown";
      const normalizedName = (normalizeToolName(rawToolName) || rawToolName).toLowerCase();
      if (normalizedName.includes("create_plan")) {
        const args = msg.metadata?.args as Record<string, unknown> | undefined;
        const preview = getToolContentPreview(normalizedName, args || {});
        if (preview) {
          preview.messageId = msg.id;
          dispatch({ type: "SET_ACTIVE_PREVIEW", payload: preview });
          hasAutoOpened.current = true;
        }
      }
    }
    
    // 情况2：file_change 并且是个 .md 文件的创建
    if (kind === "file_change") {
      const changeType = msg.metadata?.change_type as string;
      const path = msg.metadata?.path as string;
      const isCreate = changeType === "create" || changeType === "created";
      const isMd = (path || "").toLowerCase().endsWith(".md");
      const fileContent = (msg.metadata?.content as string | undefined) || "";
      
      if (isCreate && isMd && fileContent) {
        dispatch({ 
          type: "SET_ACTIVE_PREVIEW", 
          payload: {
            type: "markdown",
            content: fileContent,
            path,
            messageId: msg.id
          }
        });
        hasAutoOpened.current = true;
      }
    }
  }, [kind, msg.metadata, msg.id, dispatch]);

  if (kind === "aggressive_fold") {
    const activities = (msg.metadata?.activities as MessageBubbleProps["msg"][]) || [];
    if (activities.length === 0) return null;

    const durationMs = (msg.metadata?.durationMs as number) || 0;
    const durationStr = durationMs > 60000 
      ? `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`
      : `${Math.floor(durationMs / 1000)}.${Math.floor((durationMs % 1000) / 100)}s`;

    return (
      <div className="w-full my-6">
        <details className="group">
          <summary className="list-none cursor-pointer select-none inline-flex items-center gap-2 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/50 dark:hover:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-700/50 text-[13px] text-gray-600 dark:text-gray-400 transition-all">
            <Check size={14} className="text-green-500" />
            <span className="font-medium">已处理 {durationMs > 1000 ? durationStr : ""}</span>
            <ChevronRight size={14} className="text-gray-400 group-open:rotate-90 transition-transform ml-1" />
          </summary>
          <div className="mt-4 pl-4 ml-3 border-l-2 border-gray-100 dark:border-gray-800/60 space-y-2">
            {activities.map(act => (
              <MessageBubble key={act.id} msg={act} inCompletedFold />
            ))}
          </div>
        </details>
      </div>
    );
  }

  if (kind === "activity_group") {
    const activities = (msg.metadata?.activities as MessageBubbleProps["msg"][]) || [];
    if (activities.length === 0) return null;

    const counts = {
      tools: activities.filter(a => a.metadata?.kind === "tool_call").length,
      thoughts: activities.filter(a => a.metadata?.kind === "thinking").length,
      checkpoints: activities.filter(a => a.metadata?.kind === "checkpoint_created").length,
      research: activities.filter(a => a.metadata?.kind === "research_progress").length,
    };
    
    let summaryText = "";
    if (counts.tools) summaryText += `${counts.tools} 个工具调用 `;
    if (counts.thoughts) summaryText += `${counts.thoughts} 次思考 `;
    if (counts.checkpoints) summaryText += `${counts.checkpoints} 个检查点 `;
    if (counts.research) summaryText += `${counts.research} 次研究 `;
    
    const pending = msg.metadata?.pending;
    
    return (
      <details className="group animate-slide-up-fade mb-3 w-full">
        <summary className="list-none cursor-pointer select-none inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">
          {pending ? (
            <Loader2 size={12} className="animate-spin text-blue-500" />
          ) : (
            <ChevronRight size={14} className="text-gray-400 group-open:rotate-90 transition-transform" />
          )}
          <span>{summaryText || "后台活动"}</span>
        </summary>
        <div className="mt-1.5 pl-3 ml-1.5 border-l-2 border-gray-100 dark:border-gray-800 space-y-1">
          {activities.map(act => (
            <MessageBubble key={act.id} msg={act} />
          ))}
        </div>
      </details>
    );
  }

  // 工具调用折叠组
  if (kind === "tool_group" || kind === "tool_call") {
    const rawToolName = (msg.metadata?.tool_name as string) ?? "unknown";
    const toolName = normalizeToolName(rawToolName) || rawToolName || "unknown";
    const args = msg.metadata?.args as Record<string, unknown> | undefined;
    const argsSummary = msg.metadata?.args_summary as string | undefined;
    const reason = msg.metadata?.reason as string | undefined;
    const stage = (msg.metadata?.stage as string | undefined) ?? "running";
    const outputs = Array.isArray(msg.metadata?.outputs)
      ? (msg.metadata?.outputs as ToolOutputMessage[])
      : [];

    const isAgentActive = phase === "coding" || phase === "researching";
    const effectiveStage = stage === "completed" || outputs.length > 0 || !isAgentActive ? "completed" : "running";

    // --- 特殊处理 enter_phase 工具调用 ---
    const normalizedNameForCheck = toolName.toLowerCase();
    if (normalizedNameForCheck.includes("enter_phase")) {
      const phaseName = (args?.phase || args?.phase_name || "") as string;
      const rsn = reason || (args?.reason as string | undefined);
      
      return (
        <div className={`my-4 flex justify-center animate-slide-up-fade ${inCompletedFold ? "-ml-7 w-[calc(100%+1.75rem)]" : "w-full"}`}>
          <div className="flex flex-col items-center w-full max-w-2xl px-4">
            <div className="flex items-center w-full gap-3">
              <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800"></div>
              <div className="text-blue-600 dark:text-blue-400 font-medium text-[11px] tracking-wide whitespace-nowrap">
                进入阶段: {phaseName}
              </div>
              <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800"></div>
            </div>
            {rsn && (
              <div className="mt-1.5 text-[10px] leading-relaxed text-gray-500 dark:text-gray-400 text-center max-w-lg">
                {rsn}
              </div>
            )}
          </div>
        </div>
      );
    }

    /** 截断长文本，超出最大长度加 "..." */
    const truncate = (s: string, maxLen = 60): string => {
      if (s.length <= maxLen) return String(s);
      return String(s).slice(0, maxLen - 3) + "...";
    };

    // 格式化工具标题
    let titleStr = `使用了工具: ${toolName}`;
    let isRunningStr = `正在使用工具: ${toolName}`;
    const normalizedName = toolName.toLowerCase();
    const hasArgs = Boolean(args && Object.keys(args).length > 0);
    if (hasArgs) {
      const toolArgs = args ?? {};
      const path = (toolArgs.path || toolArgs.AbsolutePath || toolArgs.TargetFile ||
                     toolArgs.DirectoryPath || toolArgs.SearchPath || toolArgs.file_path || "") as string;
      const cmd = (toolArgs.command || toolArgs.CommandLine || toolArgs.cmd || "") as string;
      const query = (toolArgs.query || toolArgs.Query || toolArgs.pattern || "") as string;
      const title = (toolArgs.title || "") as string;
      const startLine = toolArgs.start_line ?? toolArgs.StartLine;
      const endLine = toolArgs.end_line ?? toolArgs.EndLine;

      if (normalizedName.includes("read")) {
        const p = truncate(path);
        titleStr = p ? `读取 ${p}` : "读取文件";
        isRunningStr = p ? `正在读取 ${p}` : "正在读取文件";
      } else if (normalizedName.includes("edit") || normalizedName.includes("write")) {
        const p = truncate(path);
        if (startLine !== undefined && endLine !== undefined) {
          titleStr = `编辑 ${p} +${startLine} -${endLine}`;
          isRunningStr = `正在编辑 ${p} +${startLine} -${endLine}`;
        } else {
          const action = normalizedName.includes("write") ? "新建" : "编辑";
          titleStr = `${action} ${p}`;
          isRunningStr = `正在${action} ${p}`;
        }
      } else if (normalizedName.includes("console")) {
        const c = truncate(cmd);
        titleStr = `执行命令: ${c}`;
        isRunningStr = `正在执行命令: ${c}`;
      } else if (normalizedName.includes("ls")) {
        const p = truncate(path);
        titleStr = `列出目录 ${p}`;
        isRunningStr = `正在列出目录 ${p}`;
      } else if (normalizedName.includes("grep") || normalizedName.includes("find")) {
        const q = query ? truncate(query) : "";
        const p = path ? truncate(path) : "";
        const loc = p ? ` 于 ${p}` : "";
        titleStr = `搜索 ${q}${loc}`;
        isRunningStr = `正在搜索 ${q}${loc}`;
      } else if (normalizedName.includes("create_plan")) {
        const t = title ? truncate(title) : "";
        titleStr = t ? `创建计划: ${t}` : "创建计划";
        isRunningStr = t ? `正在创建计划: ${t}` : "正在创建计划";
      } else if (normalizedName.includes("implement_plan")) {
        titleStr = "实施计划";
        isRunningStr = "正在实施计划";
      } else if (normalizedName.includes("enter_phase")) {
        const phase = (toolArgs.phase || toolArgs.phase_name || "") as string;
        const phaseDisplay = phase ? `: ${phase}` : "";
        titleStr = `进入阶段${phaseDisplay}`;
        isRunningStr = `正在进入阶段${phaseDisplay}`;
      }
    } else {
      if (normalizedName.includes("read")) {
        titleStr = "读取文件";
        isRunningStr = "正在读取文件";
      } else if (normalizedName.includes("edit")) {
        titleStr = "编辑文件";
        isRunningStr = "正在编辑文件";
      } else if (normalizedName.includes("write")) {
        titleStr = "写入文件";
        isRunningStr = "正在写入文件";
      } else if (normalizedName.includes("console")) {
        titleStr = argsSummary ? `执行命令: ${truncate(argsSummary)}` : "执行命令";
        isRunningStr = argsSummary ? `正在执行命令: ${truncate(argsSummary)}` : "正在执行命令";
      } else if (normalizedName.includes("create_plan")) {
        titleStr = "创建计划";
        isRunningStr = "正在创建计划";
      } else if (normalizedName.includes("implement_plan")) {
        titleStr = "实施计划";
        isRunningStr = "正在实施计划";
      } else if (normalizedName.includes("enter_phase")) {
        titleStr = "进入阶段";
        isRunningStr = "正在进入阶段";
      }
    }

    return (
      <details className={`group animate-slide-up-fade ${desktopMode ? "mb-1 w-full" : (ideMode ? "mb-4 w-full" : "mb-4 w-full sm:max-w-3xl sm:ml-12")}`}>
        <summary className={desktopMode
          ? "list-none cursor-pointer select-none inline-flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
          : "list-none cursor-pointer select-none inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/50 dark:hover:bg-gray-800 transition-colors border border-gray-200 dark:border-gray-700/50 shadow-sm text-sm"
        }>
          {effectiveStage === "running" ? (
            <Loader2 size={desktopMode ? 12 : 14} className="animate-spin text-blue-500" />
          ) : (
            <Check size={desktopMode ? 12 : 14} className="text-green-500" />
          )}
          <span className={desktopMode ? "font-normal" : "font-medium text-gray-700 dark:text-gray-300"}>
            {effectiveStage === "running" ? isRunningStr : titleStr}
          </span>
          {!desktopMode && <ChevronRight size={14} className="text-gray-400 group-open:rotate-90 transition-transform" />}
        </summary>

        <div className={`${ideMode ? 'mt-1 ml-2 p-2 space-y-2' : 'mt-2 ml-4 p-4 space-y-4'} bg-gray-50/80 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 rounded-xl`}>
          {reason && (
            <div className="text-xs italic text-gray-400 dark:text-gray-500">
              {reason}
            </div>
          )}
          {(() => {
            if (!args || Object.keys(args).length === 0) return null;
            // 过滤掉 reason，因为已经单独显示了
            const displayArgs = Object.fromEntries(
              Object.entries(args).filter(([key]) => key !== "reason"),
            );
            if (Object.keys(displayArgs).length === 0) return null;

            return (
              <div>
                <div className="text-xs uppercase tracking-wider text-gray-500 mb-1.5 font-semibold">输入参数</div>
                <div className="flex flex-col gap-2">
                  {Object.entries(displayArgs).map(([key, val]) => (
                    <div key={key} className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-2.5 shadow-sm">
                      <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">{key}</div>
                      {typeof val === "string" && val.includes("\n") ? (
                        <pre className="text-[13px] text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap overflow-x-auto">
                          {val}
                        </pre>
                      ) : (
                        <div className="text-[13px] text-gray-700 dark:text-gray-300 font-mono break-all">
                          {typeof val === "string" ? val : JSON.stringify(val)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          {(!args || Object.keys(args).length === 0) && argsSummary && (
            <div>
              <div className="text-xs uppercase tracking-wider text-gray-500 mb-1.5 font-semibold">输入参数</div>
              <div className="text-xs text-gray-700 dark:text-gray-300 font-mono bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-3 rounded-lg shadow-sm">
                {argsSummary}
              </div>
            </div>
          )}

          {/* ── 文件内容预览 ── */}
          {(() => {
            const preview = getToolContentPreview(normalizedName, args || {});
            if (!preview) return null;
            preview.messageId = msg.id;
            return (
              <div className="mt-3">
                <button
                  onClick={() => dispatch({ type: "SET_ACTIVE_PREVIEW", payload: preview })}
                  className="px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <FileCode size={14} />
                  在右侧预览文件内容
                </button>
              </div>
            );
          })()}

          {outputs.map((output, index) => {
            const outputKind = output.metadata?.kind as string | undefined;
            const stream = (output.metadata?.stream as string | undefined) ?? "stdout";
            const exitCode = output.metadata?.exit_code as number | undefined;
            const outputRawToolName = (output.metadata?.tool_name as string | undefined) ?? toolName;
            const outputToolName = normalizeToolName(outputRawToolName) || outputRawToolName;
            const title = outputKind === "console_output"
              ? `CONSOLE ${stream.toUpperCase()}`
              : `RESULT ${outputToolName}`;
            return (
              <details key={output.id || `${msg.id}-output-${index}`} className="group/output" open={exitCode !== 0}>
                <summary className="flex items-center gap-2 mb-1.5 cursor-pointer list-none select-none">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1 group-hover/output:text-gray-700 dark:group-hover/output:text-gray-300 transition-colors">
                    <ChevronRight size={12} className="group-open/output:rotate-90 transition-transform" />
                    <Terminal size={12} /> {title}
                  </span>
                  {exitCode !== undefined && (
                    <span
                      className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                        exitCode === 0 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      }`}
                    >
                      exit: {exitCode}
                    </span>
                  )}
                </summary>
                <pre className="p-3 bg-[#1e1e1e] dark:bg-[#0d1117] rounded-lg text-[13px] text-gray-300 overflow-x-auto font-mono whitespace-pre-wrap max-h-96 overflow-y-auto shadow-inner border border-gray-800 ml-4">
                  {parseAnsiToReact(output.content)}
                </pre>
              </details>
            );
          })}
        </div>
      </details>
    );
  }

  // 思考面板
  if (kind === "thinking") {
    const pending = msg.metadata?.pending === true;
    const thinkingElapsed = msg.metadata?.thinking_elapsed as number | undefined;
    const elapsedStr = thinkingElapsed !== undefined
      ? (thinkingElapsed / 1000) >= 60
        ? `${Math.floor(thinkingElapsed / 60000)}m ${Math.round((thinkingElapsed % 60000) / 1000)}s`
        : `${(thinkingElapsed / 1000).toFixed(1)}s`
      : null;
    return (
      <details className={`group animate-slide-up-fade ${desktopMode ? "mb-1 w-full" : (ideMode ? "mb-4 w-full" : "mb-4 w-full sm:max-w-3xl sm:ml-12")}`} open={pending}>
        <summary className={desktopMode
          ? "list-none text-[12px] text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-600 dark:hover:text-gray-400 select-none inline-flex items-center gap-1.5"
          : "text-xs text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-600 dark:hover:text-gray-400 select-none flex items-center gap-2"
        }>
          {pending && <Loader2 size={12} className="animate-spin" />}
          <span>{pending ? "正在思考..." : `思考过程 (${elapsedStr ?? "刚刚"})`}</span>
        </summary>
        <div className="mt-1 p-3 bg-gray-100 dark:bg-gray-800/50 rounded text-xs text-gray-500 dark:text-gray-400 border-l-2 border-gray-300 dark:border-gray-700 overflow-x-auto">
          <MarkdownContent content={msg.content} />
        </div>
      </details>
    );
  }

  // Console 输出
  if (kind === "console_output") {
    const exitCode = msg.metadata?.exit_code as number | undefined;
    const stream = (msg.metadata?.stream as string | undefined) ?? "stdout";
    return (
      <div className={`mb-4 animate-slide-up-fade ${ideMode ? "w-full" : "w-full sm:max-w-3xl sm:ml-12"}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded font-mono">
            CONSOLE {stream.toUpperCase()}
          </span>
          {exitCode !== undefined && (
            <span
              className={`text-xs font-mono ${
                exitCode === 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              exit: {exitCode}
            </span>
          )}
        </div>
        <pre className="p-3 bg-gray-950 rounded text-xs text-gray-300 overflow-x-auto font-mono whitespace-pre-wrap max-h-96 overflow-y-auto">
          {msg.content}
        </pre>
      </div>
    );
  }

  if (kind === "tool_result") {
    const rawToolName = (msg.metadata?.tool_name as string | undefined) ?? "tool";
    const toolName = normalizeToolName(rawToolName) || rawToolName;
    return (
      <div className={`mb-4 animate-slide-up-fade ${ideMode ? "w-full" : "w-full sm:max-w-3xl sm:ml-12"}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-300 rounded font-mono">
            RESULT {toolName}
          </span>
        </div>
        <pre className="p-3 bg-gray-950 rounded text-xs text-gray-300 overflow-x-auto font-mono whitespace-pre-wrap max-h-96 overflow-y-auto">
          {msg.content}
        </pre>
      </div>
    );
  }

  if (kind === "file_change_summary") {
    const changes = (msg.metadata?.changes as MessageBubbleProps["msg"][] | undefined) ?? [];
    const files = summarizeFileChanges(changes);
    const totals = Array.from(files.values()).reduce(
      (sum, stats) => ({ added: sum.added + stats.added, removed: sum.removed + stats.removed }),
      { added: 0, removed: 0 },
    );

    if (files.size === 0) return null;

    return (
      <section className="w-full my-4 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900/40">
        <div className="flex items-center justify-between gap-4 px-4 py-3 bg-gray-50/70 dark:bg-gray-900/70">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-gray-500 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700">
              <FileCode size={16} />
            </span>
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
              已编辑 {files.size} 个文件
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2 font-mono text-xs">
            <span className="text-green-600 dark:text-green-400">+{totals.added}</span>
            <span className="text-red-600 dark:text-red-400">-{totals.removed}</span>
          </div>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {Array.from(files.entries()).map(([path, stats]) => (
            <button
              key={path}
              type="button"
              title={path}
              aria-label={`预览文件变更 ${path}`}
              onClick={() => {
                const change = [...changes].reverse().find(item => String(item.metadata?.path || "未知文件") === path);
                const diff = change?.metadata?.diff as string | undefined;
                const content = change?.metadata?.content as string | undefined;
                const isMarkdown = !diff && path.toLowerCase().endsWith(".md");
                dispatch({
                  type: "SET_ACTIVE_PREVIEW",
                  payload: {
                    type: isMarkdown ? "markdown" : "code",
                    content: diff || content || "此文件变更没有可用的 Diff 内容。",
                    language: diff ? "diff" : getLanguageFromPath(path),
                    path,
                    title: diff ? `${path} · Diff` : path,
                    messageId: `${msg.id}-${path}`,
                  },
                });
              }}
              className="flex w-full cursor-pointer items-center justify-between gap-4 px-4 py-3 text-left text-[13px] text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:text-gray-300 dark:hover:bg-gray-800/60"
            >
              <span className="min-w-0 truncate">{path}</span>
              <span className="flex shrink-0 items-center gap-2 font-mono text-xs">
                <span className="text-green-600 dark:text-green-400">+{stats.added}</span>
                <span className="text-red-600 dark:text-red-400">-{stats.removed}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  // 文件变更
  if (kind === "file_change") {
    const changeType = msg.metadata?.change_type as string;
    const path = msg.metadata?.path as string;
    const diff = msg.metadata?.diff as string | undefined;
    const isCreate = changeType === "create" || changeType === "created";
    const isDelete = changeType === "delete" || changeType === "deleted";
    const fileContent = (msg.metadata?.content as string | undefined) || "";
    const diffStats = !isCreate && !isDelete ? getDiffStats(diff) : null;

    // CREATE 类型：构建内容预览信息
    const contentPreview: ContentPreviewInfo | null =
      isCreate && fileContent
        ? (() => {
            const isMd = (path || "").toLowerCase().endsWith(".md");
            return {
              type: isMd ? "markdown" : "code",
              content: fileContent,
              path,
              language: isMd ? undefined : getLanguageFromPath(path || ""),
            };
          })()
        : null;

    const hasExpandable = Boolean(diff || contentPreview);

    // .md 文件的 CREATE 气泡默认展开（计划文档通常需要立即查看）
    const isMdCreate = isCreate && (path || "").toLowerCase().endsWith(".md");

    return (
      <details
        className={`mb-4 group animate-slide-up-fade ${ideMode ? "w-full" : "w-full sm:max-w-3xl sm:ml-12"}`}
        open={isMdCreate || !hasExpandable}
      >
        <summary className="list-none cursor-pointer select-none inline-flex flex-wrap items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm text-sm">
          <FileCode size={16} className="text-gray-500" />
          <span
            className={`text-xs px-1.5 py-0.5 rounded font-mono font-medium ${
              changeType === "create" || changeType === "created"
                ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400"
                : changeType === "delete" || changeType === "deleted"
                ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400"
                : "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400"
            }`}
          >
            {(changeType || "modify").toUpperCase()}
          </span>
          <code className="text-gray-800 dark:text-gray-200 break-all">{path}</code>
          {diffStats && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-900/80 px-2 py-0.5 text-[11px] font-mono">
              <span className="text-green-600 dark:text-green-400">+{diffStats.added}</span>
              <span className="text-red-600 dark:text-red-400">-{diffStats.removed}</span>
            </span>
          )}
          {hasExpandable && (
            <ChevronRight size={14} className="text-gray-400 group-open:rotate-90 transition-transform" />
          )}
        </summary>
        {contentPreview && (
          <div className="mt-3 ml-1 mb-2">
            <button
              onClick={() => dispatch({ type: "SET_ACTIVE_PREVIEW", payload: { ...contentPreview, messageId: msg.id } })}
              className="px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <FileCode size={14} />
              在右侧预览新建文件
            </button>
          </div>
        )}
        {diff && (
          <div className="mt-2">
            <DiffPreview diff={diff} />
          </div>
        )}
        {isMdCreate && (
          <div className="mt-2 flex justify-end">
            <button
              onClick={() => {
                const goalText = `迭代此目标文档（${path}），直到此文档中的目标全部完成且实现完整，无暗病、bug、偏离，最终质量达到产品级交付水准。`;
                try {
                  getWSClient().send("goal.set", { text: goalText });
                  dispatch({ type: "SET_GOAL_MODE", payload: true });
                } catch { /* ignore */ }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
            >
              🎯 设为 Goal
            </button>
          </div>
        )}
      </details>
    );
  }

  // 研究进度
  if (kind === "research_progress") {
    const totalRaw = (msg.metadata?.total as number | undefined) ?? 0;
    const completedRaw = (msg.metadata?.completed as number | undefined) ?? 0;
    const currentModule = ((msg.metadata?.current_module as string | undefined)
      ?? (msg.metadata?.module as string | undefined)
      ?? "") as string;
    const status = (msg.metadata?.status as string | undefined) ?? "";
    const scopeSummary = (msg.metadata?.scope_summary as string | undefined) ?? "";
    const ignoredPatternsCount = (msg.metadata?.ignored_patterns_count as number | undefined) ?? 0;
    const activeAgents = Array.isArray(msg.metadata?.active_agents)
      ? (msg.metadata?.active_agents as ResearchAgentItem[])
      : [];
    const inProgress = msg.metadata?.in_progress !== false;
    const safeTotal = Math.max(totalRaw, 1);
    const safeCompleted = Math.max(0, Math.min(completedRaw, safeTotal));
    const percent = typeof msg.metadata?.percent === "number"
      ? Math.max(0, Math.min(msg.metadata.percent as number, 100))
      : Math.round((safeCompleted / safeTotal) * 100);
    const progressLabel = totalRaw > 0 ? `${Math.min(completedRaw, totalRaw)}/${totalRaw}` : "准备中";

    if (desktopMode) {
      return (
        <div className="w-full flex items-center gap-2 mb-1 animate-slide-up-fade text-[12px] text-sky-600 dark:text-sky-500/80">
          {inProgress ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <CheckCircle2 size={12} />
          )}
          <span>{inProgress ? "项目研究中" : "研究完成"} {progressLabel}</span>
          <span className="text-gray-400 dark:text-gray-500">- {currentModule || status || "准备开始项目侦察"} ({percent}%)</span>
        </div>
      );
    }

    return (
      <div className={`mb-4 animate-slide-up-fade ${ideMode ? "w-full" : "w-full sm:max-w-3xl sm:ml-12"}`}>
        <div className="rounded-2xl border border-sky-200 bg-sky-50/90 dark:border-sky-900/40 dark:bg-sky-950/20 shadow-sm overflow-hidden">
          <div className="px-4 py-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-sky-900 dark:text-sky-100">
                {inProgress ? (
                  <Loader2 size={15} className="animate-spin text-sky-600 dark:text-sky-400" />
                ) : (
                  <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" />
                )}
                <span>{inProgress ? "项目研究中" : "项目研究完成"}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/70 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 font-mono">
                  {progressLabel}
                </span>
              </div>
              <div className="mt-1 text-sm text-sky-800/90 dark:text-sky-100/90 break-words">
                {currentModule || status || "准备开始项目侦察"}
              </div>
            </div>
          </div>

          <div className="px-4 pb-4 space-y-3">
            <div className="h-2 rounded-full bg-sky-100 dark:bg-sky-900/40 overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r from-sky-500 via-cyan-400 to-emerald-400 transition-all duration-300 ${
                  totalRaw > 0 ? "" : "animate-pulse"
                }`}
                style={{ width: totalRaw > 0 ? `${percent}%` : "38%" }}
              />
            </div>

            {(scopeSummary || ignoredPatternsCount > 0 || status) && (
              <div className="flex flex-wrap gap-2 text-xs text-sky-800/80 dark:text-sky-200/80">
                {status && (
                  <span className="px-2 py-1 rounded-full bg-white/70 dark:bg-sky-900/30">
                    状态: {status}
                  </span>
                )}
                {scopeSummary && (
                  <span className="px-2 py-1 rounded-full bg-white/70 dark:bg-sky-900/30">
                    {scopeSummary}
                  </span>
                )}
                {ignoredPatternsCount > 0 && (
                  <span className="px-2 py-1 rounded-full bg-white/70 dark:bg-sky-900/30">
                    .gitignore 规则: {ignoredPatternsCount}
                  </span>
                )}
              </div>
            )}

            {activeAgents.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wider font-semibold text-sky-700 dark:text-sky-300">
                  活跃 Research Agents
                </div>
                <div className="grid gap-2">
                  {activeAgents.slice(0, 6).map((agent, index) => (
                    <div
                      key={`${agent.name ?? "researcher"}-${agent.module_path ?? index}`}
                      className="rounded-xl border border-sky-100 bg-white/80 dark:border-sky-900/30 dark:bg-sky-950/30 px-3 py-2"
                    >
                      <div className="text-sm font-medium text-sky-900 dark:text-sky-100">
                        {agent.name || `researcher-${index + 1}`}
                      </div>
                      <div className="text-xs text-sky-800/80 dark:text-sky-200/80 break-words">
                        {agent.module_path || "准备中..."}
                        {agent.focus ? ` (${agent.focus})` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 回滚结果
  if (kind === "rollback_result") {
    return (
      <div className="w-fit sm:ml-12 mb-4 p-2 bg-orange-900/20 border border-orange-900/50 rounded text-xs text-orange-300 animate-slide-up-fade">
        ↩ {msg.content}
      </div>
    );
  }

  if (kind === "checkpoint_created") {
    const checkpointId = msg.metadata?.id as string | undefined;
    const step = msg.metadata?.step as number | undefined;
    const tool = (msg.metadata?.tool as string | undefined) ?? "tool";
    const description = (msg.metadata?.description as string | undefined) ?? msg.content;
    const filesAffected = msg.metadata?.files_affected as number | undefined;
    const reversible = msg.metadata?.reversible !== false;
    if (desktopMode) {
      return (
        <div className="w-full flex items-center gap-2 mb-1 animate-slide-up-fade text-[12px] text-amber-600 dark:text-amber-500/80">
          <MapPin size={12} />
          <span>检查点 {step ? `#${step}` : ""} {tool}</span>
          <span className="text-gray-400 dark:text-gray-500">- {filesAffected ?? 0} 个文件</span>
          {reversible && checkpointId && (
            <button
              onClick={() => getWSClient().send("checkpoint.rollback", { mode: "to", checkpoint_id: checkpointId })}
              className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded text-amber-700 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/30 transition-colors"
              title="回滚到这个检查点"
            >
              <RotateCcw size={12} />
              回滚
            </button>
          )}
        </div>
      );
    }
    return (
      <div className="w-full flex justify-center mb-4 animate-slide-up-fade">
        <div className={`px-4 py-3 rounded-2xl border border-amber-200 bg-amber-50/90 dark:border-amber-900/40 dark:bg-amber-950/20 shadow-sm ${ideMode ? "w-full" : "w-full sm:max-w-2xl"}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
                <MapPin size={15} />
                <span>检查点 {step ? `#${step}` : ""}</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-mono">
                  {tool}
                </span>
              </div>
              <div className="mt-1 text-sm text-amber-800/90 dark:text-amber-100/90 break-words">
                {description}
              </div>
              <div className="mt-1 text-xs text-amber-700/80 dark:text-amber-300/80">
                {filesAffected ?? 0} 个文件已纳入回滚点
              </div>
            </div>
            {reversible && checkpointId && (
              <button
                onClick={() =>
                  getWSClient().send("checkpoint.rollback", {
                    mode: "to",
                    checkpoint_id: checkpointId,
                  })
                }
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/80 text-amber-700 hover:bg-white dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50 text-xs font-medium border border-amber-200 dark:border-amber-800 transition-colors"
                title="回滚到这个检查点"
              >
                <RotateCcw size={12} />
                回滚到这里
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 目标完成
  if (kind === "goal_complete") {
    return (
      <div className="w-fit sm:ml-12 mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/50 rounded-lg text-sm text-green-800 dark:text-green-300 flex items-center gap-2 animate-slide-up-fade shadow-sm">
        <CheckCircle2 size={18} className="text-green-600 dark:text-green-400" />
        <span className="font-medium">{msg.content}</span>
      </div>
    );
  }

  // 上下文压缩
  if (kind === "compressing") {
    return (
      <div className="w-fit sm:ml-12 mb-4 p-2 text-xs text-gray-500 animate-pulse">
        {msg.content}
      </div>
    );
  }

  // 关联结果
  if (kind === "link_result") {
    const success = Boolean(msg.metadata?.success);
    return (
      <div
        className={`w-fit sm:ml-12 mb-4 p-2 rounded text-xs animate-slide-up-fade ${
          success
            ? "bg-green-900/20 text-green-300"
            : "bg-red-900/20 text-red-300"
        }`}
      >
        {msg.content}
      </div>
    );
  }

  // ── 普通消息（Markdown 渲染） ──
  const isUser = msg.role === "user";
  const isSystem = msg.role === "system";
  const isStreaming = msg.metadata?.streaming === true;
  const isGuidance = msg.metadata?.kind === "guidance";
  const canUndoUserMessage = Boolean(
    isUser &&
    phase === "ready" &&
    typeof msg.metadata?.checkpoint_id === "string" &&
    msg.metadata?.checkpoint_id
  );
  const canForkHere = Boolean(
    !isUser &&
    !isSystem &&
    !isStreaming &&
    phase === "ready" &&
    msg.metadata?.forkable === true
  );

  if (isSystem) {
    return (
      <div className={`p-3 rounded-lg bg-gray-50 dark:bg-gray-900 text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap animate-slide-up-fade border border-gray-100 dark:border-gray-800 mb-4 mx-auto text-center ${ideMode ? "w-full" : "w-full sm:max-w-3xl"}`}>
        {msg.content}
      </div>
    );
  }

  return (
    <div className={`flex w-full ${desktopMode ? "justify-start" : (isUser ? "justify-end" : "justify-start")} animate-slide-up-fade ${desktopMode || ideMode ? 'mb-3' : 'mb-6'}`}>
      {!isUser && !desktopMode && (
        <button
          onClick={() => window.dispatchEvent(new Event('open-avatar-upload'))}
          className={`w-8 h-8 rounded-xl ${agentAccent.avatarBg} flex items-center justify-center shadow-inner shrink-0 mr-4 mt-1 ${ideMode ? 'hidden' : 'hidden sm:flex'} overflow-hidden cursor-pointer hover:opacity-80 transition-opacity`}
          title="更换头像"
        >
          <img src={avatarUrl} alt="MoFox" className="w-full h-full object-cover" />
        </button>
      )}
      
      <div
        className={`${desktopMode || ideMode ? 'w-full' : 'max-w-[85%] sm:max-w-[75%]'} flex flex-col ${desktopMode && isUser ? 'items-end' : ''}`}
      >
        {desktopMode && !isUser && (
          <div className="text-xs font-semibold mb-1 select-none flex items-center gap-1.5">
            <span className={`${
              source === "coder" 
                ? "text-orange-500 dark:text-orange-400" 
                : source === "solo"
                  ? "text-cyan-500 dark:text-cyan-400"
                  : "text-blue-500 dark:text-blue-400"
            }`}>
              {source === "coder" ? "Coder" : source === "solo" ? "SOLO" : "MoFox"}
            </span>
          </div>
        )}
        {!isUser && !isSystem && !ideMode && !desktopMode && (
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 ml-1 select-none flex items-center gap-1.5">
            {source === "coder" ? "Coder Agent" : source === "solo" ? "SOLO Agent" : "Main Agent"}
          </div>
        )}
        <div
          className={`${
          isUser
            ? `${desktopMode ? 'px-4 py-2 max-w-[85%] inline-block text-left mt-0.5' : (ideMode ? 'px-3 py-2' : 'px-5 py-3.5')} rounded-2xl ${desktopMode ? 'rounded-tr-sm bg-gray-100 text-gray-900 dark:bg-[#2b2d31] dark:text-gray-100' : 'rounded-tr-sm text-white ' + (isGuidance ? "bg-amber-500" : "bg-blue-600")} shadow-sm`
            : `prose ${desktopMode || ideMode ? 'prose-sm' : ''} dark:prose-invert max-w-none text-gray-900 dark:text-gray-100`
          }`}
        >
          {isUser || isSystem ? (
            <div className={`${desktopMode ? 'text-[14px]' : (ideMode ? 'text-[13px]' : 'text-[15px]')} whitespace-pre-wrap break-words leading-relaxed`}>
              {isUser && Array.isArray(msg.metadata?.images) && (msg.metadata!.images as string[]).length > 0 && (
                <div className="flex gap-2 flex-wrap mb-2">
                  {(msg.metadata!.images as string[]).map((src, i) => (
                    <img key={i} src={src} alt="" className="max-w-[200px] max-h-[200px] rounded-lg object-cover border border-white/20" />
                  ))}
                </div>
              )}
              {msg.content}
            </div>
          ) : (
            <div>
              <MarkdownContent
                content={msg.content}
                streaming={isStreaming}
                cursorClassName={agentAccent.cursorClass}
              />
            </div>
          )}
        </div>

        {(canUndoUserMessage || canForkHere) && (
          <div className={`mt-2 flex items-center gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
            {canUndoUserMessage && (
              <button
                onClick={() => {
                  if (!confirm("撤回这条用户消息，并回滚这之后的所有修改？")) {
                    return;
                  }
                  getWSClient().send("session.undo_user_message", {
                    message_id: msg.id,
                  });
                  dispatch({ type: "SET_RECALL_CONTENT", payload: msg.content });
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-200 bg-white text-xs text-gray-600 hover:text-gray-900 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:text-white dark:hover:border-gray-600 transition-colors"
                title="撤回这条消息并回滚之后的修改"
              >
                <Undo2 size={12} />
                撤回
              </button>
            )}
            {canForkHere && (
              <button
                onClick={() =>
                  getWSClient().send("session.fork", {
                    anchor_message_id: msg.id,
                  })
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-200 bg-white text-xs text-gray-600 hover:text-gray-900 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:text-white dark:hover:border-gray-600 transition-colors"
                title="从这条回复分叉出一个新会话"
              >
                <GitFork size={12} />
                Fork
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Markdown 渲染（带代码高亮） */
const MarkdownContent = React.memo(function MarkdownContent({
  content,
  streaming = false,
  cursorClassName = "md-live-cursor md-live-cursor--main",
}: {
  content: string;
  streaming?: boolean;
  cursorClassName?: string;
}) {
  const remarkPlugins: PluggableList = streaming
    ? [remarkGfm, [remarkLiveCursor, { cursorClassName }]]
    : [remarkGfm];

  return (
    <div className={streaming ? "streaming-markdown" : undefined}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children, ...props }) => {
            // 自定义 pre，包含复制按钮
            return (
              <div className="relative group my-4 rounded-xl overflow-hidden bg-[#1e1e1e] dark:bg-[#0d1117] border border-gray-200 dark:border-gray-800 shadow-sm">
                <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
                  <span className="text-xs font-mono text-gray-500">code</span>
                  <button 
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    title="Copy code"
                    onClick={() => {
                      // 简单的复制逻辑
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const codeNode = (children as any)?.props?.children;
                      if (typeof codeNode === "string") {
                        navigator.clipboard.writeText(codeNode);
                      }
                    }}
                  >
                    <Copy size={14} />
                  </button>
                </div>
                <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed" {...props}>
                  {children}
                </pre>
              </div>
            );
          },
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            return isInline ? (
              <code
                className="bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded text-xs text-pink-600 dark:text-pink-300"
                {...props}
              >
                {children}
              </code>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-700 text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-gray-300 dark:border-gray-700 px-2 py-1 bg-gray-100 dark:bg-gray-800 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-gray-300 dark:border-gray-700 px-2 py-1">{children}</td>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 underline"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

function DiffPreview({ diff }: { diff: string }) {
  return (
    <pre className="p-3 bg-[#111827] rounded-lg text-[12px] overflow-x-auto font-mono whitespace-pre-wrap max-h-96 overflow-y-auto border border-gray-800 shadow-inner">
      {diff.split("\n").map((line, index) => {
        let className = "text-gray-300";
        if (line.startsWith("+") && !line.startsWith("+++")) {
          className = "text-green-400";
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          className = "text-red-400";
        } else if (line.startsWith("@@")) {
          className = "text-sky-400";
        }
        return (
          <div key={`${index}-${line}`} className={className}>
            {line || " "}
          </div>
        );
      })}
    </pre>
  );
}
