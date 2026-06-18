/**
 * StepConfirm — 确认配置并启动
 */

import { XCircle, Database, Bot, Settings2, Plug } from "lucide-react";
import type {
  ApiProviderConfig,
  PersonalityConfig,
  ModelProfile,
  SetupState,
  McpServerConfig,
} from "../../hooks/useSetup.ts";

interface StepConfirmProps {
  apiProviders: ApiProviderConfig[];
  modelsAssignment: SetupState["modelsAssignment"];
  personality: PersonalityConfig;
  modelProfiles: ModelProfile[];
  mcpServers: McpServerConfig[];
  submitting: boolean;
  error: string;
  onSubmit: () => void;
}

export function StepConfirm({
  apiProviders,
  modelsAssignment,
  personality,
  modelProfiles,
  mcpServers,
  submitting,
  error,
}: StepConfirmProps) {
  const sectionClass =
    "p-5 bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-gray-800/80 rounded-2xl shadow-sm hover:shadow-md transition-shadow";
  const keyClass = "text-sm text-gray-500 dark:text-gray-400";
  const valClass = "text-sm text-gray-900 dark:text-white font-medium";

  const getProviderName = (id: string) => {
    const p = apiProviders.find(p => p.id === id);
    return p ? p.name : "未知";
  };

  return (
    <div className="space-y-8 animate-fade-in pb-4">
      <div className="space-y-2">
        <h2 className="text-3xl font-extrabold tracking-tight">确认配置</h2>
        <p className="text-gray-500 dark:text-gray-400 text-lg">
          请检查以下摘要信息，确认无误后点击下方完成按钮。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* API Provider 摘要 */}
        <div className={sectionClass}>
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-gray-800">
            <Database className="w-5 h-5 text-blue-500" />
            <h3 className="font-bold text-gray-900 dark:text-white">
              API 提供商 ({apiProviders.length})
            </h3>
          </div>
          <div className="space-y-4">
            {apiProviders.map((p, idx) => (
              <div key={p.id} className={idx > 0 ? "pt-4 border-t border-gray-50 dark:border-gray-800/50" : ""}>
                <div className="flex justify-between mb-2">
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{p.name}</span>
                  <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-md text-gray-500">{p.client_type}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className={keyClass}>URL</span>
                  <span className={`${valClass} truncate max-w-[150px]`}>{p.base_url}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 人设摘要 */}
        <div className={sectionClass}>
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-gray-800">
            <Bot className="w-5 h-5 text-purple-500" />
            <h3 className="font-bold text-gray-900 dark:text-white">
              AI 助手身份
            </h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className={keyClass}>昵称</span>
              <span className={valClass}>{personality.nickname}</span>
            </div>
            <div className="flex justify-between">
              <span className={keyClass}>身份</span>
              <span className={valClass}>{personality.identity}</span>
            </div>
            <div className="flex justify-between">
              <span className={keyClass}>性格特征</span>
              <span className={`${valClass} truncate max-w-[180px]`} title={personality.personality_core}>
                {personality.personality_core}
              </span>
            </div>
          </div>
        </div>

        {/* 模型分配摘要 */}
        <div className={`md:col-span-2 ${sectionClass}`}>
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-gray-800">
            <Settings2 className="w-5 h-5 text-green-500" />
            <h3 className="font-bold text-gray-900 dark:text-white">
              角色模型分配
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {Object.entries(modelsAssignment).map(([role, assign]) => (
              <div key={role} className="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-xl border border-gray-100 dark:border-gray-800/60">
                <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">{role}</div>
                <div className="font-medium text-gray-900 dark:text-gray-100 truncate" title={assign.modelName}>
                  {assign.modelName || "-"}
                </div>
                <div className="text-xs text-blue-600 dark:text-blue-400 mt-1 truncate">
                  {getProviderName(assign.providerId)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* MCP 服务摘要 */}
        <div className={`md:col-span-2 ${sectionClass}`}>
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-gray-800">
            <Plug className="w-5 h-5 text-green-500" />
            <h3 className="font-bold text-gray-900 dark:text-white">
              MCP 服务 ({mcpServers.length})
            </h3>
          </div>
          {mcpServers.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400 italic">
              未配置任何 MCP 服务。
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {mcpServers.map((srv) => (
                <div key={srv.id} className="bg-gray-50 dark:bg-gray-800/40 p-3 rounded-xl border border-gray-100 dark:border-gray-800/60 flex items-center justify-between">
                  <div className="font-medium text-gray-900 dark:text-gray-100 truncate flex-1">
                    {srv.name}
                  </div>
                  <div className="text-xs text-gray-500 bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
                    {srv.type.toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 错误消息 */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm font-medium flex items-start gap-3 animate-slide-up-fade-in shadow-sm">
          <XCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}
    </div>
  );
}
