/** 聊天区域 */
import { useRef, useEffect, useLayoutEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "../../hooks/useSession.ts";
import type { UIMessage } from "../../types/messages.ts";
import { MessageBubble, type MessageBubbleView } from "../chat/MessageBubble.tsx";
import { MessageInput } from "./MessageInput.tsx";
import { isSameMessage, normalizeToolName } from "../../utils/message-utils.ts";
import { ArrowDown, Loader2 } from "lucide-react";

// 输入区悬浮在消息容器上方，正常追底时仍会保留约 100px 的可视缓冲。
const SCROLL_THRESHOLD = 128;

function isToolResultMessage(msg: UIMessage): boolean {
  const kind = msg.metadata?.kind;
  return msg.role === "system" && (kind === "console_output" || kind === "tool_result");
}

function isPhaseBoundary(msg: UIMessage): boolean {
  if (msg.metadata?.kind !== "tool_call") return false;
  const rawToolName = msg.metadata?.tool_name as string | undefined;
  const toolName = rawToolName ? normalizeToolName(rawToolName).toLowerCase() : "";
  return toolName.includes("enter_phase") || toolName.includes("implement_plan");
}

function isActivityPending(message: UIMessage): boolean {
  const kind = message.metadata?.kind;
  if (kind === "tool_call") {
    const outputs = Array.isArray(message.metadata?.outputs) ? message.metadata.outputs : [];
    return message.metadata?.stage === "running" && outputs.length === 0;
  }
  if (kind === "thinking") return message.metadata?.pending === true;
  if (kind === "research_progress") return message.metadata?.in_progress !== false;
  return false;
}

function buildRenderableMessages(messages: UIMessage[], desktopMode: boolean, collapseCompleted: boolean): UIMessage[] {
  const renderable: UIMessage[] = [];
  let currentToolGroup: UIMessage | null = null;
  let currentActivityGroup: UIMessage | null = null;

  const isIntermediate = (msg: UIMessage) => {
    const kind = msg.metadata?.kind as string;
    if (msg.role !== "system" || kind === "file_change" || isToolResultMessage(msg) || isPhaseBoundary(msg)) {
      return false;
    }
    return true;
  };

  for (const message of messages) {
    if (desktopMode && message.metadata?.kind === "file_change") {
      const last = renderable[renderable.length - 1];
      if (!isSameMessage(last, message)) renderable.push(message);
      continue;
    }

    if (desktopMode && isIntermediate(message)) {
      if (!currentActivityGroup) {
        currentActivityGroup = {
          id: `group-${message.id}`,
          role: "system",
          content: "",
          timestamp: message.timestamp || Date.now(),
          metadata: {
            kind: "activity_group",
            activities: [],
            pending: false,
          },
        } as UIMessage;
        renderable.push(currentActivityGroup);
      }
      const acts = currentActivityGroup.metadata!.activities as UIMessage[];
      const activityMessage = message.metadata?.kind === "tool_call"
        ? {
            ...message,
            metadata: {
              ...message.metadata,
              outputs: Array.isArray(message.metadata?.outputs)
                ? [...(message.metadata.outputs as UIMessage[])]
                : [],
            },
          }
        : message;
      acts.push(activityMessage);
      currentActivityGroup.metadata!.pending = acts.some(isActivityPending);

      continue;
    }

    if (desktopMode && isToolResultMessage(message)) {
      if (currentActivityGroup) {
        const acts = currentActivityGroup.metadata!.activities as UIMessage[];
        const lastToolCall = [...acts].reverse().find(m => m.metadata?.kind === "tool_call");
        if (lastToolCall) {
          const outputs = Array.isArray(lastToolCall.metadata?.outputs)
            ? (lastToolCall.metadata.outputs as UIMessage[])
            : [];
          if (!outputs.some(output => isSameMessage(output, message))) {
            lastToolCall.metadata = { ...lastToolCall.metadata, outputs: [...outputs, message] };
          }
        } else {
          acts.push(message);
        }
        currentActivityGroup.metadata!.pending = acts.some(isActivityPending);
      } else {
        renderable.push(message);
      }
      continue;
    }

    if (desktopMode) {
      if (message.role === "user" || message.role === "agent" || isPhaseBoundary(message)) {
        currentActivityGroup = null;
      }
      
      const last = renderable[renderable.length - 1];
      if (isSameMessage(last, message)) continue;
      renderable.push(message);
      continue;
    }

    // Web Mode (non-desktopMode) logic
    if (!desktopMode && message.role === "system" && message.metadata?.kind === "tool_call") {
      currentToolGroup = {
        ...message,
        metadata: {
          ...message.metadata,
          kind: "tool_group",
          outputs: [],
        },
      };
      renderable.push(currentToolGroup);
      continue;
    }

    if (isToolResultMessage(message)) {
      if (currentToolGroup) {
        (currentToolGroup.metadata!.outputs as UIMessage[]).push(message);
      } else {
        renderable.push(message);
      }
      continue;
    }

    if (
      message.role === "user" ||
      message.role === "agent" ||
      (message.role === "system" && message.metadata?.kind === "checkpoint_created")
    ) {
      currentToolGroup = null;
    }

    const last = renderable[renderable.length - 1];
    if (isSameMessage(last, message)) {
      continue;
    }

    const previous = renderable[renderable.length - 2];
    if (
      message.role === "agent" &&
      last?.role === "system" &&
      last.metadata?.kind === "thinking" &&
      previous?.role === "agent" &&
      isSameMessage(previous, message)
    ) {
      renderable.splice(renderable.length - 2, 1);
      renderable.push(message);
      continue;
    }

    renderable.push(message);
  }

  // 桌面模式下，文件变动始终汇总到本轮回复的末尾。
  // 历史轮次始终保持折叠；只有当前仍在进行的轮次展开过程消息。
  // 否则一发送新消息，waitingForBot 会让全部历史轮次瞬间展开并把视口顶到很前面。
  if (desktopMode) {
    const finalRenderable: UIMessage[] = [];
    let lastUserIndex = -1;
    for (let index = renderable.length - 1; index >= 0; index--) {
      if (renderable[index].role === "user") {
        lastUserIndex = index;
        break;
      }
    }
    let i = 0;
    while (i < renderable.length) {
      if (renderable[i].role === "user") {
        finalRenderable.push(renderable[i]);
        i++;
      } else {
        const blockStart = i;
        const block: UIMessage[] = [];
        while (i < renderable.length && renderable[i].role !== "user") {
          block.push(renderable[i]);
          i++;
        }
        
        if (block.length === 0) continue;

        const fileChanges = block.filter(message => message.metadata?.kind === "file_change");
        const contentMessages = block.filter(message => message.metadata?.kind !== "file_change");
        const collapseBlock = blockStart < lastUserIndex || collapseCompleted;
        const isCurrentTurn = blockStart > lastUserIndex;

        if (!collapseBlock) {
          finalRenderable.push(...contentMessages);
        } else {
          let lastAgentIdx = -1;
          for (let j = contentMessages.length - 1; j >= 0; j--) {
            if (contentMessages[j].role === "agent") {
              lastAgentIdx = j;
              break;
            }
          }

          const lastAgentMsg = lastAgentIdx >= 0 ? contentMessages[lastAgentIdx] : null;
          const group = contentMessages.filter((_, index) => index !== lastAgentIdx);

          if (group.length > 0) {
            let startTime = group[0].timestamp || Date.now();
            let endTime = startTime;
            for (const msg of group) {
              const ts = msg.timestamp || Date.now();
              if (ts < startTime) startTime = ts;
              if (ts > endTime) endTime = ts;
            }
            finalRenderable.push({
              id: `agg-fold-${group[0].id}`,
              role: "system",
              content: "",
              timestamp: startTime,
              metadata: {
                kind: "aggressive_fold",
                activities: group,
                durationMs: endTime - startTime,
              }
            } as UIMessage);
          }

          if (lastAgentMsg) {
            finalRenderable.push(lastAgentMsg);
          }
        }

        if (fileChanges.length > 0) {
          finalRenderable.push({
            id: `file-summary-${fileChanges[0].id}`,
            role: "system",
            content: "",
            timestamp: fileChanges[0].timestamp,
            metadata: {
              kind: "file_change_summary",
              changes: fileChanges,
              autoOpen: isCurrentTurn && collapseCompleted,
            },
          });
        }
      }
    }
    return finalRenderable;
  }

  return renderable;
}

function isNearBottom(el: HTMLElement): boolean {
  return el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_THRESHOLD;
}

export function ChatArea() {
  const { messages, sessionId, isConnected, waitingForBot, connectionState, avatarUrl, ideMode, desktopMode, projectName, phase } = useSession();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const autoScrollEnabledRef = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const completedReady = phase === "ready" && !waitingForBot;
  const [foldStable, setFoldStable] = useState(() => completedReady);
  const collapseCompleted = completedReady && foldStable;
  const renderableMessages = useMemo(
    () => buildRenderableMessages(messages, desktopMode, collapseCompleted),
    [messages, desktopMode, collapseCompleted],
  );
  const bubbleView = useMemo<MessageBubbleView>(
    () => ({ phase, avatarUrl, ideMode, desktopMode }),
    [phase, avatarUrl, ideMode, desktopMode],
  );

  // 某些阶段切换会短暂发出 ready；延迟确认空闲，避免“已处理”出现一帧后又消失。
  useEffect(() => {
    const timer = window.setTimeout(
      () => setFoldStable(completedReady),
      completedReady ? 240 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [completedReady]);

  const stickToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    setShowScrollButton(false);
  }, []);

  // 滚动事件只读取位置。是否暂停追底由明确的用户滚动意图决定，
  // 避免内容增高或程序滚动触发 scroll 后误关自动跟随。
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const nearBottom = isNearBottom(container);
    if (nearBottom) autoScrollEnabledRef.current = true;
    setShowScrollButton(!nearBottom);
  }, []);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (event.deltaY < 0) autoScrollEnabledRef.current = false;
  }, []);

  const handleTouchMove = useCallback(() => {
    autoScrollEnabledRef.current = false;
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    if (event.clientX >= bounds.right - 18) {
      autoScrollEnabledRef.current = false;
    }
  }, []);

  // 一键回到底部
  const scrollToBottom = useCallback(() => {
    autoScrollEnabledRef.current = true;
    stickToBottom();
  }, [stickToBottom]);

  // 切换会话后默认恢复为自动追底
  useLayoutEffect(() => {
    autoScrollEnabledRef.current = true;
    stickToBottom();
    const frame = window.requestAnimationFrame(stickToBottom);
    return () => window.cancelAnimationFrame(frame);
  }, [sessionId, stickToBottom]);

  // ResizeObserver：观察真正的消息内容高度变化，覆盖工具气泡/文件预览/检查点等异步撑高
  useEffect(() => {
    const container = scrollContainerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (!autoScrollEnabledRef.current) return;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        stickToBottom();
      });
    });
    observer.observe(content);
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [sessionId, stickToBottom]);

  if (connectionState === "reconnecting") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 h-full bg-white dark:bg-gray-950 animate-fade-in">
        <div className="flex flex-col items-center animate-zoom-in">
          <div className="w-12 h-12 mb-4 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-blue-500" />
          </div>
          <h3 className="font-pixel pixel-shadow text-gray-800 dark:text-gray-200 mb-1" style={{ zoom: 1.5, display: 'inline-block' }}>恢复会话中</h3>
          <p className="font-pixel text-gray-500 dark:text-gray-400">正在同步数据...</p>
        </div>
      </div>
    );
  }

  // 未打开项目：显示欢迎页，不显示聊天输入框
  // projectName 只在后端返回 project.opened / session.ready 后才被设置，
  // 因此它是“项目已打开”的权威信号。
  if (!projectName) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 h-full bg-white dark:bg-gray-950">
        <div className="text-center mb-8">
          <h2 className="font-pixel pixel-shadow text-gray-800 dark:text-gray-200 mb-2" style={{ zoom: 2, display: 'inline-block' }}>
            {isConnected ? "欢迎使用 MoFox Code" : "等待连接..."}
          </h2>
          <p className="font-pixel text-gray-500 dark:text-gray-400 mb-6">
            {isConnected ? "请先打开一个项目目录开始工作。" : "请先启动后端服务。"}
          </p>
          {isConnected && (
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent("open-project-dialog"));
              }}
              className="font-pixel pixel-bold px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              打开项目
            </button>
          )}
        </div>
      </div>
    );
  }

  // 项目已打开，但尚无活跃会话：显示输入框，发送后自动创建会话
  if (!sessionId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 h-full bg-white dark:bg-gray-950">
        <div className={`w-full ${ideMode ? '' : 'max-w-3xl'} text-center mb-8`}>
          <h2 className="font-pixel pixel-shadow text-gray-800 dark:text-gray-200 mb-2" style={{ zoom: 2, display: 'inline-block' }}>
            {isConnected ? "准备好开始编码了吗？" : "等待连接..."}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {isConnected
              ? `项目: ${projectName}  —  输入你的需求，MoFox 将为你创建一个新会话。`
              : "请先启动后端服务并打开项目目录。"}
          </p>
        </div>
        <div className={`w-full ${ideMode ? '' : 'max-w-3xl'} px-4`}>
          <MessageInput />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 relative bg-white dark:bg-gray-950">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onWheel={handleWheel}
        onTouchMove={handleTouchMove}
        onPointerDown={handlePointerDown}
        className={`flex-1 min-h-0 overflow-y-auto px-4 pt-4 relative ${ideMode ? 'pb-40' : 'pb-[200px]'}`}
      >
        <div ref={contentRef} className={`${desktopMode || ideMode ? 'w-full' : 'max-w-4xl mx-auto'} space-y-6`}>
          {renderableMessages.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-gray-500 dark:text-gray-400">
              <p className="font-pixel">会话已就绪，在下方输入消息开始对话。</p>
            </div>
          ) : (
            <>
              {renderableMessages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} view={bubbleView} />
              ))}
              {waitingForBot && (
                <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 text-sm animate-pulse py-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                  <span className="font-pixel ml-1">MoFox 正在思考...</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className={`absolute bottom-0 left-0 right-0 pointer-events-none ${ideMode ? 'bg-white dark:bg-gray-950 pt-2 pb-0 px-0 border-t border-gray-100 dark:border-gray-800' : 'bg-gradient-to-t from-white via-white to-transparent dark:from-[#1e1e1e] dark:via-[#1e1e1e] dark:to-transparent pt-12 pb-6 px-4'}`}>
        <div className={`${ideMode ? 'w-full' : 'max-w-4xl mx-auto'} relative pointer-events-auto`}>
          {/* 回到底部浮动按钮 */}
          {showScrollButton && (
            <button
              onClick={scrollToBottom}
              className="absolute -top-14 left-1/2 -translate-x-1/2 z-10 w-8 h-8 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-md flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-all animate-bounce"
              title="回到底部"
            >
              <ArrowDown size={16} className="text-gray-600 dark:text-gray-300" />
            </button>
          )}
          <MessageInput />
        </div>
      </div>
    </div>
  );
}
