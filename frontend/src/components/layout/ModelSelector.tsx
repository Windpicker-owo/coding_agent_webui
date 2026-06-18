import React, { useState, useRef, useEffect } from "react";
import { useSession, useSessionDispatch } from "../../hooks/useSession.ts";
import { getWSClient } from "../../utils/ws-client.ts";
import { ChevronDown, Box } from "lucide-react";

export function ModelSelector() {
  const state = useSession();
  const dispatch = useSessionDispatch();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const modelName = e.target.value;
    dispatch({ type: "SET_ACTIVE_MODEL", payload: modelName });

    // 如果有活跃会话，同步到后端
    if (state.sessionId) {
      try {
        getWSClient().send("model.select", { model_name: modelName });
      } catch (err) {
        console.error("切换模型失败:", err);
      }
    }
  };

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (modelName: string) => {
    dispatch({ type: "SET_ACTIVE_MODEL", payload: modelName });
    if (state.sessionId) {
      try {
        getWSClient().send("model.select", { model_name: modelName });
      } catch (err) {
        console.error("切换模型失败:", err);
      }
    }
    setIsOpen(false);
  };

  return (
    <div className="relative flex items-center" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1.5 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        title="选择模型"
      >
        <Box size={14} className="opacity-70" />
        <span className="max-w-[100px] truncate">{state.activeModel || "选择模型..."}</span>
        <ChevronDown size={12} className={`opacity-50 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 min-w-[160px] bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-50 animate-slide-up-fade origin-bottom-left">
          <div className="max-h-60 overflow-y-auto p-1">
            {state.availableModels.map((name) => (
              <button
                key={name}
                onClick={() => handleSelect(name)}
                className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors flex items-center gap-2 ${
                  state.activeModel === name
                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                }`}
              >
                <span className="truncate">{name}</span>
              </button>
            ))}
            {state.availableModels.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 text-center">
                暂无可用模型
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
