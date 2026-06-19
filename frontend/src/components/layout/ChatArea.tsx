/** 聊天区域 */
import { useRef, useEffect, useState, useCallback, useLayoutEffect } from "react";
import { useSession } from "../../hooks/useSession.ts";
import type { UIMessage } from "../../types/messages.ts";
import { MessageBubble } from "../chat/MessageBubble.tsx";
import { MessageInput } from "./MessageInput.tsx";
import { isSameMessage } from "../../utils/message-utils.ts";
import { ArrowDown, Loader2 } from "lucide-react";

const SCROLL_THRESHOLD = 80;

function isToolResultMessage(msg: UIMessage): boolean {
  const kind = msg.metadata?.kind;
  return msg.role === "system" && (kind === "console_output" || kind === "tool_result");
}

function buildRenderableMessages(messages: UIMessage[]): UIMessage[] {
  const renderable: UIMessage[] = [];
  let currentToolGroup: UIMessage | null = null;

  for (const message of messages) {
    if (message.role === "system" && message.metadata?.kind === "tool_call") {
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

  return renderable;
}

function isNearBottom(el: HTMLElement): boolean {
  return el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_THRESHOLD;
}

export function ChatArea() {
  const { messages, sessionId, isConnected, waitingForBot, connectionState, avatarUrl, ideMode, lastWorkDir, projectName } = useSession();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const autoScrollEnabledRef = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const renderableMessages = buildRenderableMessages(messages);

  const stickToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    setShowScrollButton(false);
  }, []);

  // 滚动事件：控制"回到底部"按钮显隐
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const shouldAutoScroll = isNearBottom(container);
    autoScrollEnabledRef.current = shouldAutoScroll;
    setShowScrollButton(!shouldAutoScroll);
  }, []);

  // 一键回到底部
  const scrollToBottom = useCallback(() => {
    autoScrollEnabledRef.current = true;
    stickToBottom();
  }, [stickToBottom]);

  // 切换会话后默认恢复为自动追底
  useEffect(() => {
    autoScrollEnabledRef.current = true;
  }, [sessionId]);

  // 新消息到达后，如果用户原本就在底部附近，则继续追底
  useLayoutEffect(() => {
    if (!autoScrollEnabledRef.current) return;
    stickToBottom();
  }, [messages, stickToBottom]);

  // ResizeObserver：观察真正的消息内容高度变化，覆盖工具气泡/文件预览/检查点等异步撑高
  useEffect(() => {
    const container = scrollContainerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    const observer = new ResizeObserver(() => {
      if (!autoScrollEnabledRef.current) return;
      stickToBottom();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [stickToBottom]);

  if (connectionState === "reconnecting") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 h-full bg-white dark:bg-gray-950 animate-fade-in">
        <div className="flex flex-col items-center animate-zoom-in">
          <div className="w-12 h-12 mb-4 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-blue-500" />
          </div>
          <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-1">恢复会话中</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm">正在同步数据...</p>
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
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
            {isConnected ? "欢迎使用 MoFox Code" : "等待连接..."}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
            {isConnected ? "请先打开一个项目目录开始工作。" : "请先启动后端服务。"}
          </p>
          {isConnected && (
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent("open-project-dialog"));
              }}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
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
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
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
        className={`flex-1 min-h-0 overflow-y-auto px-4 pt-4 relative ${ideMode ? 'pb-40' : 'pb-[200px]'}`}
      >
        <div ref={contentRef} className={`${ideMode ? 'w-full' : 'max-w-4xl mx-auto'} space-y-6`}>
          {renderableMessages.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-gray-500 dark:text-gray-400">
              <p className="text-sm">会话已就绪，在下方输入消息开始对话。</p>
            </div>
          ) : (
            <>
              {renderableMessages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
              {waitingForBot && (
                <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 text-sm animate-pulse py-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                  <span className="ml-1 text-xs">MoFox 正在思考...</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className={`absolute bottom-0 left-0 right-0 pointer-events-none ${ideMode ? 'bg-white dark:bg-gray-950 pt-2 pb-0 px-0 border-t border-gray-100 dark:border-gray-800' : 'bg-gradient-to-t from-white via-white to-transparent dark:from-gray-950 dark:via-gray-950 dark:to-transparent pt-12 pb-6 px-4'}`}>
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
