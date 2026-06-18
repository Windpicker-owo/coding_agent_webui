/**
 * SetupWizard — 首启动配置向导主组件
 *
 * 包含 3 个步骤：
 * 0. StepProvider — API Provider 配置
 * 1. StepPersonality — Bot 人设
 * 2. StepConfirm — 确认并启动
 */

import { useState, useCallback, useEffect } from "react";
import { useSetup } from "../../hooks/useSetup.ts";
import { StepProvider } from "./StepProvider.tsx";
import { StepPersonality } from "./StepPersonality.tsx";
import { StepMcp } from "./StepMcp.tsx";
import { StepConfirm } from "./StepConfirm.tsx";
import { Loader2, CheckCircle2, Download, AlertCircle } from "lucide-react";

interface SetupWizardProps {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const {
    state,
    nextStep,
    prevStep,
    addApiProvider,
    updateApiProvider,
    removeApiProvider,
    updateModelAssignment,
    updatePersonality,
    addMcpServer,
    updateMcpServer,
    removeMcpServer,
    importFromPath,
    submitConfig,
  } = useSetup();

  const [submitting, setSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [showCompletion, setShowCompletion] = useState(false);
  const [closing, setClosing] = useState(false);

  // 用一个 local state 让动画更平滑
  // 用一个 local state 让动画更平滑
  const [currentStep, setCurrentStep] = useState(state.step);
  const [animating, setAnimating] = useState(false);

  const handleImport = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择 MoFox 实例根目录",
      });
      if (selected) {
        setImporting(true);
        setError("");
        const path = Array.isArray(selected) ? selected[0] : selected;
        const res = await importFromPath(path);
        if (!res.success) {
          setError(res.message);
        } else {
          // You could add a toast here, but for now we rely on the UI updating
          setError("");
        }
      }
    } catch (err) {
      console.error(err);
      setError("无法打开选择器，请确认在桌面端运行");
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    if (state.step !== currentStep) {
      setAnimating(true);
      const timer = setTimeout(() => {
        setCurrentStep(state.step);
        setAnimating(false);
      }, 300); // 300ms fade out transition
      return () => clearTimeout(timer);
    }
  }, [state.step, currentStep]);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError("");
    try {
      const result = await submitConfig();
      if (result.success) {
        setShowCompletion(true);
        setTimeout(() => {
          setClosing(true);
          setTimeout(() => {
            onComplete();
            window.location.reload();
          }, 600); // Wait for fade out animation
        }, 2000); // Show completion screen for 2s
      } else {
        setError(result.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }, [submitConfig, onComplete]);

  const totalSteps = 4;

  if (showCompletion) {
    return (
      <div className={`fixed inset-0 z-50 flex items-center justify-center bg-white dark:bg-gray-950 transition-opacity duration-700 ${closing ? 'opacity-0' : 'opacity-100'}`}>
        <div className="text-center animate-slide-up-fade-in">
          <div className="relative inline-block mb-8">
            <div className="absolute inset-0 bg-green-500 blur-3xl opacity-20 animate-pulse-slow rounded-full"></div>
            <div className="relative w-32 h-32 mx-auto rounded-full bg-green-50 dark:bg-green-900/30 flex items-center justify-center border-4 border-green-500 shadow-2xl shadow-green-500/20">
              <CheckCircle2 className="w-16 h-16 text-green-500" />
            </div>
          </div>
          <h1 className="text-4xl font-extrabold mb-4 bg-gradient-to-br from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
            一切就绪
          </h1>
          <p className="text-lg text-gray-500 dark:text-gray-400 font-medium">
            正在为您准备工作空间...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white font-sans overflow-hidden">
      {/* 侧边栏装饰 (类似 Windows 11 OOBE) */}
      <div className="hidden lg:flex lg:w-[35%] relative flex-col justify-between p-12 overflow-hidden bg-blue-600">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-purple-600/40 mix-blend-overlay"></div>
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-400 rounded-full blur-[100px] opacity-50"></div>
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-purple-500 rounded-full blur-[120px] opacity-40 translate-x-1/3 translate-y-1/3"></div>
        
        <div className="relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center shadow-lg border border-white/20 mb-8">
            <img src="/logo.png" alt="MoFox Logo" className="w-10 h-10 object-contain drop-shadow-md" />
          </div>
          <h1 className="text-4xl font-extrabold text-white mb-4 leading-tight tracking-tight">
            欢迎使用 <br/>MoFox Code
          </h1>
          <p className="text-blue-100 text-lg leading-relaxed max-w-sm font-medium">
            下一代智能编程助手。只需几步，即可开启属于您的 AI 结对编程体验。
          </p>
        </div>

        <div className="relative z-10 space-y-6">
          <div className="flex flex-col gap-3">
            {Array.from({ length: totalSteps }, (_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-500 ${
                  i < state.step ? 'bg-white text-blue-600' :
                  i === state.step ? 'bg-blue-400 text-white ring-4 ring-blue-400/30' :
                  'bg-white/10 text-blue-200'
                }`}>
                  {i < state.step ? <CheckCircle2 className="w-5 h-5" /> : i + 1}
                </div>
                <span className={`font-semibold transition-colors duration-300 ${
                  i <= state.step ? 'text-white' : 'text-blue-200'
                }`}>
                  {i === 0 ? "API 配置" : i === 1 ? "助手设定" : i === 2 ? "MCP 服务" : "确认信息"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 右侧主体内容 */}
      <div className="flex-1 flex flex-col relative h-screen overflow-hidden bg-white dark:bg-[#09090b]">
        {/* Mobile Header */}
        <div className="lg:hidden p-6 border-b border-gray-100 dark:border-gray-800 flex items-center gap-4">
          <img src="/logo.png" alt="Logo" className="w-8 h-8" />
          <h1 className="font-bold text-xl">MoFox Code</h1>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-8 lg:px-24 lg:py-16 scroll-smooth">
          <div className="max-w-2xl mx-auto">
            {error && currentStep !== 3 && (
              <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm flex items-start gap-3 animate-slide-up-fade-in">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">遇到了一些问题</h3>
                  <p>{error}</p>
                </div>
              </div>
            )}

            {/* 内容区带着动画 */}
            <div className={`transition-opacity duration-300 ${animating ? 'opacity-0' : 'opacity-100 animate-slide-up-fade-in'}`}>
              {currentStep === 0 && (
                <StepProvider
                  apiProviders={state.apiProviders}
                  modelsAssignment={state.modelsAssignment}
                  onAddProvider={addApiProvider}
                  onUpdateProvider={updateApiProvider}
                  onRemoveProvider={removeApiProvider}
                  onUpdateModelAssignment={updateModelAssignment}
                />
              )}
              {currentStep === 1 && (
                <StepPersonality
                  personality={state.personality}
                  onUpdate={updatePersonality}
                />
              )}
              {currentStep === 2 && (
                <StepMcp
                  mcpServers={state.mcpServers}
                  onAddMcpServer={addMcpServer}
                  onUpdateMcpServer={updateMcpServer}
                  onRemoveMcpServer={removeMcpServer}
                />
              )}
              {currentStep === 3 && (
                <StepConfirm
                  apiProviders={state.apiProviders}
                  modelsAssignment={state.modelsAssignment}
                  personality={state.personality}
                  modelProfiles={state.modelProfiles}
                  mcpServers={state.mcpServers}
                  submitting={submitting}
                  error={error}
                  onSubmit={handleSubmit}
                />
              )}
            </div>
          </div>
        </div>

        {/* 底部导航栏 */}
        <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-t border-gray-100 dark:border-gray-800 p-6 lg:px-24 z-10">
          <div className="max-w-2xl mx-auto flex justify-between items-center">
            {state.step > 0 ? (
              <button
                onClick={prevStep}
                disabled={animating || submitting}
                className="px-6 py-2.5 text-sm font-semibold text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors disabled:opacity-50"
              >
                返回
              </button>
            ) : (
              <button
                onClick={handleImport}
                disabled={animating || submitting || importing}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
              >
                {importing ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                从已有实例导入
              </button>
            )}
            {state.step < 3 ? (
              <button
                onClick={nextStep}
                disabled={animating}
                className="px-8 py-2.5 bg-gray-900 hover:bg-black dark:bg-white dark:hover:bg-gray-100 dark:text-gray-900 text-white font-semibold rounded-full transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                继续
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={animating || submitting}
                className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full transition-all shadow-md hover:shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting && <Loader2 size={16} className="animate-spin" />}
                {submitting ? "正在配置..." : "完成并启动"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
