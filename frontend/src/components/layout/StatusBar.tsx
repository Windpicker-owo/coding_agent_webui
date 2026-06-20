import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSession, useSessionDispatch } from "../../hooks/useSession.ts";
import { Sun, Moon, Loader2, StopCircle, CheckCircle, AlertCircle, ChartNoAxesCombined, ChevronUp } from "lucide-react";
import { getWSClient } from "../../utils/ws-client.ts";

function formatCompactTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}K`;
  return value.toLocaleString();
}

export function StatusBar() {
  const state = useSession();
  const dispatch = useSessionDispatch();
  const [showUsageDetails, setShowUsageDetails] = useState(false);
  const usageRef = useRef<HTMLDivElement>(null);

  const usageTotals = useMemo(() => {
    return Object.values(state.sessionUsage || {}).reduce(
      (totals, usage) => ({
        prompt: totals.prompt + (usage.prompt_tokens || 0),
        completion: totals.completion + (usage.completion_tokens || 0),
        cacheHit: totals.cacheHit + (usage.cache_hit_tokens || 0),
        cost: totals.cost + (usage.cost || 0),
      }),
      { prompt: 0, completion: 0, cacheHit: 0, cost: 0 },
    );
  }, [state.sessionUsage]);

  const totalTokens = usageTotals.prompt + usageTotals.completion;
  const contextTotal = Number(state.contextUsage?.total ?? state.contextUsage?.max_context ?? 0);
  const contextUsed = Number(state.contextUsage?.used ?? state.contextUsage?.total_tokens ?? 0);
  const contextRemaining = Math.max(0, contextTotal - contextUsed);
  const remainingPercent = contextTotal > 0
    ? Math.max(0, Math.min(100, (contextRemaining / contextTotal) * 100))
    : Math.max(0, Math.min(100, 100 - (state.contextUsage?.percent ?? 0)));
  const hasUsage = Boolean(state.contextUsage || totalTokens > 0 || usageTotals.cost > 0);

  useEffect(() => {
    if (!showUsageDetails) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (usageRef.current && !usageRef.current.contains(event.target as Node)) {
        setShowUsageDetails(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowUsageDetails(false);
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showUsageDetails]);

  const handleInterrupt = () => {
    getWSClient().send("user.interrupt", {});
  };

  const isBusy = state.phase !== "ready" && state.phase !== "init" && state.phase !== "error";
  const showActiveSpinner = state.phase === "thinking" || state.phase === "coding" || state.phase === "researching";

  const getStatusBarClasses = (phase: string) => {
    if (!state.isConnected) return "bg-gray-600 dark:bg-gray-800 text-white";
    switch (phase) {
      case "thinking": return "bg-amber-600 dark:bg-amber-700 text-white";
      case "coding": return "bg-sky-600 dark:bg-sky-700 text-white";
      case "researching": return "bg-violet-600 dark:bg-violet-700 text-white";
      case "error": return "bg-red-600 dark:bg-red-700 text-white";
      default: return "bg-blue-600 dark:bg-blue-800 text-white";
    }
  };

  return (
    <div className={`flex items-center justify-between px-3 h-6 shrink-0 text-[11px] font-mono select-none z-50 transition-colors ${getStatusBarClasses(state.phase)}`}>
      
      {/* Left side: Status, Branch/Project, Model */}
      <div className="flex items-center gap-3 h-full overflow-hidden">
        {/* Backend Status / Phase */}
        <div className="flex items-center gap-1.5 h-full px-1 hover:bg-white/10 cursor-pointer transition-colors" title={state.phaseDetail || state.phase}>
          {state.isConnected ? (
            showActiveSpinner ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />
          ) : (
            <AlertCircle size={12} className="text-yellow-300" />
          )}
          <span className="truncate max-w-[200px]">{state.isConnected ? (state.phase === "ready" ? "Ready" : state.phaseDetail || state.phase) : "Disconnected"}</span>
        </div>

        {/* Interrupt Button */}
        {isBusy && (
          <button 
            onClick={handleInterrupt}
            className="flex items-center gap-1 h-full px-2 hover:bg-red-500/50 bg-red-500/30 transition-colors"
          >
            <StopCircle size={10} />
            <span>Interrupt</span>
          </button>
        )}

        {/* Project Name */}
        {state.projectName && (
          <div className="flex items-center gap-1 h-full px-1 hover:bg-white/10 cursor-pointer transition-colors" title={state.lastWorkDir}>
            <span>{state.projectName}</span>
          </div>
        )}
      </div>

      {/* Right side: Stats, Settings */}
      <div className="flex items-center gap-3 h-full">
        {/* Modes */}
        {/* Modes */}
        <button
          onClick={() => {
            const v = !state.autoReview;
            getWSClient().send("auto_review.toggle", { enabled: v });
            dispatch({ type: "SET_AUTO_REVIEW", payload: v });
          }}
          className={`flex items-center justify-center h-full px-2 transition-colors ${state.autoReview ? "bg-blue-500/50 hover:bg-blue-500/70" : "hover:bg-white/10 opacity-70 hover:opacity-100"}`}
          title="Toggle Auto Mode"
        >
          Auto
        </button>
        <button
          onClick={() => {
            const v = !state.yoloMode;
            getWSClient().send("yolo.toggle", { enabled: v });
            dispatch({ type: "SET_YOLO_MODE", payload: v });
          }}
          className={`flex items-center justify-center h-full px-2 transition-colors ${state.yoloMode ? "bg-red-500/50 text-red-100 hover:bg-red-500/70" : "hover:bg-white/10 opacity-70 hover:opacity-100"}`}
          title="Toggle YOLO Mode"
        >
          YOLO
        </button>
        {state.goalMode && <span className="text-orange-200 px-1" title="Goal Mode On">Goal</span>}
        {state.soloMode && <span className="text-cyan-200 px-1" title="Solo Mode On">Solo</span>}

        {/* Usage & context details */}
        {hasUsage && (
          <div className="relative h-full" ref={usageRef}>
            <button
              type="button"
              onClick={() => setShowUsageDetails(value => !value)}
              aria-expanded={showUsageDetails}
              aria-label="查看用量与上下文详情"
              className={`flex h-full items-center gap-2 px-2 transition-colors ${showUsageDetails ? "bg-white/20" : "hover:bg-white/10"}`}
              title="点击查看用量与上下文详情"
            >
              <ChartNoAxesCombined size={12} />
              {state.contextUsage && <span>余 {remainingPercent.toFixed(0)}%</span>}
              {totalTokens > 0 && <span>{formatCompactTokens(totalTokens)} tokens</span>}
              {usageTotals.cost > 0 && <span>${usageTotals.cost.toFixed(3)}</span>}
              <ChevronUp size={11} className={`transition-transform ${showUsageDetails ? "rotate-180" : ""}`} />
            </button>

            {showUsageDetails && (
              <div className="absolute bottom-full right-0 mb-2 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white text-gray-800 shadow-2xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 font-sans select-text">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                  <div>
                    <div className="text-sm font-semibold">用量与上下文</div>
                    <div className="mt-0.5 max-w-[220px] truncate text-[11px] text-gray-400" title={state.contextUsage?.model_name || ""}>
                      {state.contextUsage?.model_name || "当前会话"}
                    </div>
                  </div>
                  {state.contextUsage?.source && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      {state.contextUsage.source}
                    </span>
                  )}
                </div>

                {state.contextUsage && (
                  <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                    <div className="mb-2 flex items-end justify-between">
                      <span className="text-xs text-gray-500 dark:text-gray-400">剩余上下文</span>
                      <span className={`text-lg font-semibold ${remainingPercent < 20 ? "text-red-500" : remainingPercent < 50 ? "text-amber-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {remainingPercent.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      <div
                        className={`h-full rounded-full transition-all ${remainingPercent < 20 ? "bg-red-500" : remainingPercent < 50 ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${remainingPercent}%` }}
                      />
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] text-gray-400">
                      <span>剩余 {contextRemaining.toLocaleString()}</span>
                      <span>上限 {contextTotal.toLocaleString()}</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 text-xs">
                  <div><div className="text-gray-400">输入 Tokens</div><div className="mt-0.5 font-mono">{usageTotals.prompt.toLocaleString()}</div></div>
                  <div><div className="text-gray-400">输出 Tokens</div><div className="mt-0.5 font-mono">{usageTotals.completion.toLocaleString()}</div></div>
                  <div><div className="text-gray-400">缓存命中</div><div className="mt-0.5 font-mono text-emerald-600 dark:text-emerald-400">{usageTotals.cacheHit.toLocaleString()}</div></div>
                  <div><div className="text-gray-400">累计费用</div><div className="mt-0.5 font-mono">${usageTotals.cost.toFixed(4)}</div></div>
                  {state.contextUsage?.reasoning_tokens !== undefined && (
                    <div><div className="text-gray-400">推理 Tokens</div><div className="mt-0.5 font-mono">{state.contextUsage.reasoning_tokens.toLocaleString()}</div></div>
                  )}
                  {state.contextUsage?.request_count !== undefined && (
                    <div><div className="text-gray-400">请求次数</div><div className="mt-0.5 font-mono">{state.contextUsage.request_count.toLocaleString()}</div></div>
                  )}
                </div>

                {Object.keys(state.sessionUsage || {}).length > 0 && (
                  <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-800">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">按模型</div>
                    <div className="max-h-40 space-y-2 overflow-y-auto">
                      {Object.entries(state.sessionUsage).map(([model, usage]) => (
                        <div key={model} className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800/70">
                          <div className="truncate text-xs font-medium" title={model}>{model}</div>
                          <div className="mt-1 flex justify-between gap-3 text-[10px] text-gray-400">
                            <span>{formatCompactTokens((usage.prompt_tokens || 0) + (usage.completion_tokens || 0))} tokens</span>
                            <span>${(usage.cost || 0).toFixed(4)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Theme Toggle */}
        <button 
          onClick={() => dispatch({ type: "SET_THEME", payload: state.theme === "dark" ? "light" : "dark" })}
          className="flex items-center justify-center h-full px-1.5 hover:bg-white/10 transition-colors"
        >
          {state.theme === "dark" ? <Sun size={12} /> : <Moon size={12} />}
        </button>
      </div>
    </div>
  );
}
