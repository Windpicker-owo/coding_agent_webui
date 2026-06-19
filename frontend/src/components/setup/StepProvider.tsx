/**
 * StepProvider — API Provider 及模型分配配置
 */
import { useState } from "react";
import { Plus, Trash2, Settings2, Database, ChevronDown, ChevronRight } from "lucide-react";
import type { ApiProviderConfig, ModelAssignment, SetupState, ModelDetailConfig } from "../../hooks/useSetup.ts";

interface StepProviderProps {
  apiProviders: ApiProviderConfig[];
  modelsAssignment: SetupState["modelsAssignment"];
  onAddProvider: () => void;
  onUpdateProvider: (id: string, partial: Partial<Omit<ApiProviderConfig, "id">>) => void;
  onRemoveProvider: (id: string) => void;
  onUpdateModelAssignment: (role: keyof SetupState["modelsAssignment"], assignment: Partial<ModelAssignment>) => void;
  /** 模型详情列表（可选，用于 SettingsPanel） */
  models?: ModelDetailConfig[];
  /** 更新模型详情 */
  onUpdateModel?: (index: number, partial: Partial<ModelDetailConfig>) => void;
  /** 添加模型 */
  onAddModel?: () => void;
  /** 删除模型 */
  onRemoveModel?: (index: number) => void;
}

export function StepProvider({
  apiProviders,
  modelsAssignment,
  onAddProvider,
  onUpdateProvider,
  onRemoveProvider,
  onUpdateModelAssignment,
  models,
  onUpdateModel,
  onAddModel,
  onRemoveModel,
}: StepProviderProps) {
  const fieldClass =
    "w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm transition-all";
  const labelClass =
    "block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5";
  const hintClass = "text-xs text-gray-400 dark:text-gray-500 mt-1";

  // Track which providers have advanced settings expanded
  const [expandedAdvanced, setExpandedAdvanced] = useState<Set<string>>(new Set());

  const toggleAdvanced = (providerId: string) => {
    setExpandedAdvanced((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  };

  const roles: Array<{ key: keyof SetupState["modelsAssignment"]; label: string; desc: string }> = [
    { key: "main", label: "主模型 (Main)", desc: "用于日常对话和基础任务" },
    { key: "coder", label: "编码模型 (Coder)", desc: "用于代码生成和编辑任务" },
    { key: "researcher", label: "研究模型 (Researcher)", desc: "用于文档搜索和信息收集" },
    { key: "reviewer", label: "审查模型 (Reviewer)", desc: "用于代码审查和质量控制" },
    { key: "title", label: "标题模型 (Title)", desc: "用于生成对话标题（建议用小模型）" },
  ];

  const showModelDetails = !!(models && onUpdateModel && onAddModel && onRemoveModel);

  return (
    <div className="space-y-10 animate-fade-in">
      <div className="space-y-2">
        <h2 className="text-3xl font-extrabold tracking-tight">API 与模型配置</h2>
        <p className="text-gray-500 dark:text-gray-400 text-lg">
          您可以配置一个或多个 API 提供商，并为不同的工作角色分配最适合的模型。
        </p>
      </div>

      {/* API Providers Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-500" />
            <h3 className="text-xl font-bold">API 提供商</h3>
          </div>
          <button
            onClick={onAddProvider}
            className="flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            添加提供商
          </button>
        </div>

        <div className="space-y-4">
          {apiProviders.map((provider, index) => (
            <div key={provider.id} className="p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative group">
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onRemoveProvider(provider.id)}
                  disabled={apiProviders.length === 1}
                  className="text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
                  title={apiProviders.length === 1 ? "至少需要保留一个提供商" : "删除此提供商"}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <label className={labelClass}>名称标识</label>
                  <input
                    type="text"
                    value={provider.name}
                    onChange={(e) => onUpdateProvider(provider.id, { name: e.target.value })}
                    placeholder="如: OpenAI, SiliconFlow, DeepSeek..."
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>客户端协议</label>
                  <select
                    value={provider.client_type}
                    onChange={(e) => onUpdateProvider(provider.id, { client_type: e.target.value as any })}
                    className={fieldClass}
                  >
                    <option value="openai">OpenAI 兼容</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="gemini">Gemini</option>
                    <option value="aiohttp_gemini">Aiohttp Gemini (备用)</option>
                    <option value="bedrock">AWS Bedrock</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Base URL</label>
                  <input
                    type="text"
                    value={provider.base_url}
                    onChange={(e) => onUpdateProvider(provider.id, { base_url: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                    className={fieldClass}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>API Key</label>
                  <input
                    type="password"
                    value={provider.api_key}
                    onChange={(e) => onUpdateProvider(provider.id, { api_key: e.target.value })}
                    placeholder="sk-..."
                    className={fieldClass}
                  />
                </div>
              </div>

              {/* Advanced Settings Collapsible */}
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => toggleAdvanced(provider.id)}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                >
                  {expandedAdvanced.has(provider.id) ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                  高级设置
                </button>
                {expandedAdvanced.has(provider.id) && (
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">
                        最大重试次数
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={provider.max_retry ?? 2}
                        onChange={(e) =>
                          onUpdateProvider(provider.id, { max_retry: parseInt(e.target.value) || 0 })
                        }
                        className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">
                        超时（秒）
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={600}
                        value={provider.timeout ?? 30}
                        onChange={(e) =>
                          onUpdateProvider(provider.id, { timeout: parseInt(e.target.value) || 30 })
                        }
                        className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">
                        重试间隔（秒）
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={120}
                        value={provider.retry_interval ?? 10}
                        onChange={(e) =>
                          onUpdateProvider(provider.id, { retry_interval: parseInt(e.target.value) || 0 })
                        }
                        className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Model Assignments Section */}
      <div className="space-y-4 pt-6 border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2 mb-2">
          <Settings2 className="w-5 h-5 text-purple-500" />
          <h3 className="text-xl font-bold">角色与模型分配</h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          指定在不同任务中使用的模型。你可以将所有任务都分配给同一个大模型，或者为特定任务选择更适合的模型。
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {roles.map((role) => {
            const assignment = modelsAssignment[role.key];
            return (
              <div key={role.key} className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                <div className="mb-3">
                  <h4 className="font-bold text-gray-900 dark:text-white">{role.label}</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{role.desc}</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">使用提供商</label>
                    <select
                      value={assignment.providerId}
                      onChange={(e) => onUpdateModelAssignment(role.key, { providerId: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
                    >
                      {apiProviders.map((p) => (
                        <option key={p.id} value={p.id}>{p.name || "未命名提供商"}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">模型名称</label>
                    <input
                      type="text"
                      value={assignment.modelName}
                      onChange={(e) => onUpdateModelAssignment(role.key, { modelName: e.target.value })}
                      placeholder="如: gpt-4o"
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Model Details Section (only when props are provided) */}
      {showModelDetails && (
        <div className="space-y-4 pt-6 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-green-500" />
              <h3 className="text-xl font-bold">模型详情</h3>
            </div>
            <button
              onClick={onAddModel}
              className="flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              添加模型
            </button>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            配置每个模型的详细参数，包括价格、上下文长度、流模式等。
          </p>

          <div className="space-y-4">
            {models!.map((m, i) => (
              <div key={i} className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200">
                    模型 #{i + 1}
                  </h4>
                  <button
                    onClick={() => onRemoveModel!(i)}
                    className="text-gray-400 hover:text-red-500 transition-colors p-1"
                    title="删除模型"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">Model ID</label>
                    <input
                      type="text"
                      value={m.model_id}
                      onChange={(e) => onUpdateModel!(i, { model_id: e.target.value })}
                      className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">API Provider</label>
                    <input
                      type="text"
                      value={m.api_provider}
                      onChange={(e) => onUpdateModel!(i, { api_provider: e.target.value })}
                      className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">最大上下文</label>
                    <input
                      type="number"
                      value={m.max_context}
                      onChange={(e) => onUpdateModel!(i, { max_context: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">输入价格 ($/M tokens)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={m.price_in}
                      onChange={(e) => onUpdateModel!(i, { price_in: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">输出价格 ($/M tokens)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={m.price_out}
                      onChange={(e) => onUpdateModel!(i, { price_out: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">缓存命中价格 ($/M tokens)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={m.cache_hit_price_in ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        onUpdateModel!(i, { cache_hit_price_in: val === "" ? null : parseFloat(val) });
                      }}
                      className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white"
                    />
                  </div>
                  <div className="col-span-2 flex items-center gap-6 pt-1">
                    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <input
                        type="checkbox"
                        checked={m.force_stream_mode}
                        onChange={(e) => onUpdateModel!(i, { force_stream_mode: e.target.checked })}
                        className="rounded"
                      />
                      强制流模式
                    </label>
                    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <input
                        type="checkbox"
                        checked={m.tool_call_compat}
                        onChange={(e) => onUpdateModel!(i, { tool_call_compat: e.target.checked })}
                        className="rounded"
                      />
                      工具调用兼容
                    </label>
                    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <input
                        type="checkbox"
                        checked={m.anti_truncation}
                        onChange={(e) => onUpdateModel!(i, { anti_truncation: e.target.checked })}
                        className="rounded"
                      />
                      防截断
                    </label>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">
                      Extra Params (JSON)
                    </label>
                    <textarea
                      value={JSON.stringify(m.extra_params, null, 2)}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value);
                          onUpdateModel!(i, { extra_params: parsed });
                        } catch {
                          // Allow typing invalid JSON temporarily
                        }
                      }}
                      rows={3}
                      className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white font-mono"
                      placeholder='{"key": "value"}'
                    />
                  </div>
                </div>
              </div>
            ))}
            {(!models || models.length === 0) && (
              <div className="text-xs text-gray-400 dark:text-gray-600 text-center py-4">
                暂无模型详情配置，点击"添加模型"开始
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
