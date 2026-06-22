/** 消息输入组件 */
import { useState, useRef, useEffect } from "react";
import { useSession, useSessionDispatch } from "../../hooks/useSession.ts";
import { getWSClient } from "../../utils/ws-client.ts";
import { ModelSelector } from "./ModelSelector.tsx";
import { ArrowUp, Image as ImageIcon } from "lucide-react";
import { ModeToggle } from "./ModeToggle.tsx";
import { LinkProjectButton } from "./LinkProjectButton.tsx";

export function MessageInput() {
  const state = useSession();
  const dispatch = useSessionDispatch();
  const [text, setText] = useState("");
  const [pendingImages, setPendingImages] = useState<string[]>([]); // base64 data URLs
  const [showImageWarning, setShowImageWarning] = useState(false);
  const [pendingImageFiles, setPendingImageFiles] = useState<File[]>([]); // files waiting for confirmation
  const [skillQuery, setSkillQuery] = useState<string | null>(null); // null = 不显示下拉
  const [skillSelectedIndex, setSkillSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevSessionRef = useRef(state.sessionId);
  const isBusy = state.phase !== "ready" && state.phase !== "init" && state.phase !== "error";
  const disabled = !state.isConnected || (!state.sessionId && !state.projectName);

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

  // 连接后拉取 Skills 列表
  useEffect(() => {
    if (state.isConnected && state.sessionId && state.availableSkills.length === 0) {
      try {
        getWSClient().send("skill.list", {});
      } catch { /* ignore */ }
    }
  }, [state.isConnected, state.sessionId, state.availableSkills.length]);

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

  // ── Skill 自动补全 ────────────────────────────────────

  /** 当前可用的过滤后 skill 列表 */
  const filteredSkills = skillQuery !== null
    ? state.availableSkills.filter(s =>
        s.name.toLowerCase().includes(skillQuery.toLowerCase())
      )
    : [];

  /** 选中 skill 并插入到 textarea */
  const insertSkill = (skillName: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursorPos = textarea.selectionStart;
    const beforeCursor = text.substring(0, cursorPos);
    const afterCursor = text.substring(cursorPos);
    const slashIdx = beforeCursor.lastIndexOf('/');
    if (slashIdx === -1) return;
    const newText = beforeCursor.substring(0, slashIdx) + `/${skillName} ` + afterCursor;
    setText(newText);
    setSkillQuery(null);
    setSkillSelectedIndex(0);
    const newCursorPos = slashIdx + skillName.length + 2; // /name + space
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const doProcessImages = (files: File[]) => {
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setPendingImages((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleImageFiles = (files: File[]) => {
    if (!state.imageUploadConfirmed) {
      setPendingImageFiles(files);
      setShowImageWarning(true);
      return;
    }
    doProcessImages(files);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmedText = text.trim();
    if (!trimmedText && pendingImages.length === 0) return;
    if (disabled) return;

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

      const content = trimmedText;
      const kind = isBusy ? "guidance" : "message";
      const clientMessageId = client.send("user.message", {
        content,
        kind,
        ...(pendingImages.length > 0 ? { images: pendingImages } : {}),
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
            ...(pendingImages.length > 0 ? { images: pendingImages } : {}),
          },
        },
      });
      setText("");
      setPendingImages([]);
    } catch (err) {
      console.error("发送失败:", err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setText(newText);

    // 检测 skill 触发：取光标前的文本，查找最近的 /
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursorPos = textarea.selectionStart;
    const beforeCursor = newText.substring(0, cursorPos);
    const slashIdx = beforeCursor.lastIndexOf('/');
    if (slashIdx === -1) {
      setSkillQuery(null);
      setSkillSelectedIndex(0);
      return;
    }
    const afterSlash = beforeCursor.substring(slashIdx + 1);
    // / 后必须无空格、无换行才算 skill query
    if (/[\s\n]/.test(afterSlash)) {
      setSkillQuery(null);
      setSkillSelectedIndex(0);
      return;
    }
    setSkillQuery(afterSlash);
    setSkillSelectedIndex(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Skill 下拉激活时的键盘导航
    if (skillQuery !== null && filteredSkills.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSkillSelectedIndex(i => Math.min(i + 1, filteredSkills.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSkillSelectedIndex(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        insertSkill(filteredSkills[skillSelectedIndex].name);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        insertSkill(filteredSkills[skillSelectedIndex].name);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSkillQuery(null);
        return;
      }
    }

    // 无匹配 skill 时 Escape 关闭提示
    if (skillQuery !== null && e.key === 'Escape') {
      e.preventDefault();
      setSkillQuery(null);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      handleImageFiles(imageFiles);
    }
  };

  return (
    <div className={state.ideMode ? "w-full" : "max-w-3xl mx-auto relative"}>
      <div className={`flex flex-col bg-transparent transition-all duration-200 ${state.ideMode ? 'border-none' : 'rounded-[1.5rem] border shadow-md bg-white dark:bg-[#1e1e1e]'} ${disabled ? (state.ideMode ? 'opacity-70' : 'border-gray-200 dark:border-[#2b2b2b] opacity-70') : (state.ideMode ? '' : 'border-gray-300 dark:border-[#3b3b3b] focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:shadow-lg')}`}>
        <div className={`flex relative ${state.ideMode ? 'px-3 pt-2' : 'px-4 pt-3'}`}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              !state.projectName
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

        {/* Skill 自动补全下拉 */}
        {skillQuery !== null && (
          <div className="absolute left-0 right-0 mx-3 z-50 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-[#1e1e1e] shadow-lg overflow-hidden"
               style={{ bottom: "100%", marginBottom: "4px" }}>
            {filteredSkills.length > 0 ? (
              <div className="max-h-48 overflow-y-auto py-1">
                {filteredSkills.map((skill, idx) => (
                  <div
                    key={skill.name}
                    className={`px-3 py-2 cursor-pointer flex items-center gap-2 transition-colors ${
                      idx === skillSelectedIndex
                        ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                    onClick={() => insertSkill(skill.name)}
                    onMouseEnter={() => setSkillSelectedIndex(idx)}
                  >
                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">/</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{skill.name}</div>
                      {skill.description && (
                        <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{skill.description}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">
                {state.availableSkills.length === 0
                  ? "当前项目暂无可用 Skill（在 .agents/skills/ 下创建）"
                  : `没有匹配 "${skillQuery}" 的 Skill`}
              </div>
            )}
          </div>
        )}

        {/* 图片预览 */}
        {pendingImages.length > 0 && (
          <div className="flex gap-2 px-4 pt-2 flex-wrap">
            {pendingImages.map((img, i) => (
              <div key={i} className="relative group">
                <img src={img} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200 dark:border-gray-700" />
                <button
                  onClick={() => setPendingImages((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Action Bar */}
        <div className={`flex items-center justify-between pt-1 mt-1 ${state.ideMode ? 'px-3 pb-3' : 'px-3 pb-2'}`}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <label
              className="p-1.5 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
              title="上传图片"
            >
              <ImageIcon size={16} />
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  handleImageFiles(files);
                  e.target.value = "";
                }}
              />
            </label>
            
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
                  className={`font-pixel pixel-bold px-3 py-1 rounded-md transition-all ${
                    !state.soloMode
                      ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                  }`}
                >
                  Pro
                </button>
                <button
                  onClick={() => dispatch({ type: "SET_SOLO_MODE", payload: true })}
                  className={`font-pixel pixel-bold px-3 py-1 rounded-md transition-all ${
                    state.soloMode
                      ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                  }`}
                >
                  Solo
                </button>
              </div>
            ) : (
              <div className="font-pixel pixel-bold px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-500 dark:text-gray-400 select-none">
                {state.soloMode ? "Solo 模式" : "Pro 模式"}
              </div>
            )}
            
            <button
              onClick={() => handleSubmit()}
              disabled={(!text.trim() && pendingImages.length === 0) || disabled}
              className={`shrink-0 p-2 rounded-full transition-all duration-200 flex items-center justify-center
                ${(!text.trim() && pendingImages.length === 0) || disabled 
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

      {/* 图片上传警告弹窗 */}
      {showImageWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
            <h3 className="font-pixel pixel-bold text-amber-600 dark:text-amber-400">
              ⚠ 多模态消息确认
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              请确认你当前使用的模型支持图像输入。不支持的模型可能无法识别图片内容或报错。
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowImageWarning(false);
                  setPendingImageFiles([]);
                }}
                className="font-pixel px-3 py-1.5 text-gray-400 hover:text-gray-300"
              >
                取消
              </button>
              <button
                onClick={() => {
                  dispatch({ type: "SET_IMAGE_UPLOAD_CONFIRMED", payload: true });
                  setShowImageWarning(false);
                  if (pendingImageFiles.length > 0) {
                    doProcessImages(pendingImageFiles);
                    setPendingImageFiles([]);
                  }
                }}
                className="font-pixel pixel-bold px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
              >
                已确认，不再提醒
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
