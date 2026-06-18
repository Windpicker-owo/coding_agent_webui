/** 消息输入组件 */
import { useState, useRef, useEffect } from "react";
import { useSession, useSessionDispatch } from "../../hooks/useSession.ts";
import { getWSClient } from "../../utils/ws-client.ts";
import { ModelSelector } from "./ModelSelector.tsx";
import { ArrowUp } from "lucide-react";
import { ModeToggle } from "./ModeToggle.tsx";
import { LinkProjectButton } from "./LinkProjectButton.tsx";

export function MessageInput() {
  const state = useSession();
  const dispatch = useSessionDispatch();
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevSessionRef = useRef(state.sessionId);
  const isBusy = state.phase !== "ready" && state.phase !== "init" && state.phase !== "error";
  const disabled = !state.isConnected || (!state.sessionId && !state.lastWorkDir);

  // sessionId 变化时：保存旧草稿，恢复新草稿
  useEffect(() => {
    const prev = prevSessionRef.current;
    const next = state.sessionId;
    if (prev !== next) {
      // 保存旧会话的草稿
      if (prev && text.trim()) {
        dispatch({ type: "SAVE_DRAFT", payload: { sessionId: prev, text } });
      }
      // 恢复新会话的草稿（或清空）
      const draft = (next && state.draftTexts[next]) ? state.draftTexts[next] : "";
      setText(draft);
      prevSessionRef.current = next;
    }
  }, [state.sessionId]); // eslint-disable-line react-hooks/exhaustive-deps


  // 连接后且模型列表为空时，主动拉取
  useEffect(() => {
    if (state.isConnected && state.availableModels.length === 0) {
      try {
        getWSClient().send("model.list", {});
      } catch { /* ignore */ }
    }
  }, [state.isConnected, state.availableModels.length]);

  // Recall content: when user clicks undo, fill the input box
  useEffect(() => {
    if (state.recallContent !== null) {
      setText(state.recallContent);
      dispatch({ type: "SET_RECALL_CONTENT", payload: null });
      // Focus after React re-renders
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [state.recallContent, dispatch]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [text]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || disabled) return;

    try {
      const client = getWSClient();
      if (!state.sessionId) {
        client.send("session.init", {
          working_directory: state.lastWorkDir,
          session_id: "",
          solo_mode: state.soloMode,
          model_name: state.activeModel || undefined,
        });
        client.send("session.list", {});
      }

      const content = text.trim();
      const kind = isBusy ? "guidance" : "message";
      const clientMessageId = client.send("user.message", {
        content,
        kind,
      });
      dispatch({
        type: "ADD_LOCAL_MESSAGE",
        payload: {
          role: "user",
          content,
          metadata: {
            ...(kind === "guidance" ? { kind } : {}),
            client_message_id: clientMessageId,
            local_pending: true,
          },
        },
      });
      setText("");
    } catch (err) {
      console.error("发送失败:", err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className={state.ideMode ? "w-full" : "max-w-3xl mx-auto relative"}>
      <div className={`flex flex-col bg-white dark:bg-gray-900 transition-all duration-200 ${state.ideMode ? 'border-none' : 'rounded-[1.5rem] border shadow-md'} ${disabled ? (state.ideMode ? 'opacity-70' : 'border-gray-200 dark:border-gray-800 opacity-70') : (state.ideMode ? 'focus-within:bg-gray-50 dark:focus-within:bg-gray-800/50' : 'border-gray-300 dark:border-gray-700 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:shadow-lg')}`}>
        <div className={`flex ${state.ideMode ? 'px-3 pt-2' : 'px-4 pt-3'}`}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              !state.sessionId && !state.lastWorkDir
                ? "先打开项目目录开始会话..."
                : !state.sessionId
                ? "输入消息给 MoFox, 发送后将自动新建会话..."
                : isBusy
                ? "输入补充引导... (Enter 发送, Shift+Enter 换行)"
                : "输入消息给 MoFox... (Enter 发送, Shift+Enter 换行)"
            }
            disabled={disabled}
            className={`flex-1 max-h-[200px] ${state.ideMode ? 'min-h-[36px] text-sm' : 'min-h-[44px] text-[15px]'} bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none resize-none leading-relaxed`}
            rows={1}
            autoFocus
          />
        </div>
        
        {/* Action Bar */}
        <div className={`flex items-center justify-between px-3 pt-1 mt-1 ${state.ideMode ? 'pb-3' : 'pb-2'}`}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <ModelSelector />
            
            <div className="w-px h-4 bg-gray-200 dark:bg-gray-800 mx-1"></div>
            
            <div className="hidden sm:flex items-center px-1">
              <ModeToggle
                label="Auto"
                enabled={state.autoReview}
                onToggle={(v) => {
                  getWSClient().send("auto_review.toggle", { enabled: v });
                  dispatch({ type: "SET_AUTO_REVIEW", payload: v });
                }}
              />
            </div>
            
            <div className="hidden sm:flex items-center px-1">
              <ModeToggle
                label="YOLO"
                enabled={state.yoloMode}
                danger
                onToggle={(v) => {
                  getWSClient().send("yolo.toggle", { enabled: v });
                  dispatch({ type: "SET_YOLO_MODE", payload: v });
                }}
              />
            </div>


            <LinkProjectButton />
          </div>
          
          <div className="flex items-center gap-2">
            {!state.sessionId ? (
              <div className="flex bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg">
                <button
                  onClick={() => dispatch({ type: "SET_SOLO_MODE", payload: false })}
                  className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${
                    !state.soloMode
                      ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                  }`}
                >
                  Pro
                </button>
                <button
                  onClick={() => dispatch({ type: "SET_SOLO_MODE", payload: true })}
                  className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${
                    state.soloMode
                      ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                  }`}
                >
                  Solo
                </button>
              </div>
            ) : (
              <div className="px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-[11px] font-medium text-gray-500 dark:text-gray-400 select-none">
                {state.soloMode ? "Solo 模式" : "Pro 模式"}
              </div>
            )}
            
            <button
              onClick={() => handleSubmit()}
              disabled={!text.trim() || disabled}
              className={`shrink-0 p-2 rounded-full transition-all duration-200 flex items-center justify-center
                ${!text.trim() || disabled 
                  ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600' 
                  : 'bg-black dark:bg-white text-white dark:text-black shadow hover:scale-105'}`}
              title={isBusy ? "发送引导" : "发送消息"}
            >
              <ArrowUp size={18} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
      {!state.ideMode && (
        <div className="text-center mt-2">
          <span className="text-[11px] text-gray-400 dark:text-gray-500">
            MoFox Code 可能会产生不准确的信息，请自行核对重要代码。
          </span>
        </div>
      )}

    </div>
  );
}
