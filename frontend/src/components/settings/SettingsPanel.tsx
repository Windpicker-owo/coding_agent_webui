/**
 * SettingsPanel — 设置面板（侧滑抽屉）
 *
 * 桌面版专用，允许用户随时修改 API Provider、模型设置、Bot 人设。
 * 仅当 state.desktopMode === true 时由 AppShell 渲染。
 */

import { useState, useEffect, useCallback } from "react";
import { X, Save, Loader2, AlertCircle, Plus, Trash2 } from "lucide-react";
import { useSession } from "../../hooks/useSession.ts";
import { useSettings, isMaskedKey } from "../../hooks/useSettings.ts";
import { StepProvider } from "../setup/StepProvider.tsx";
import { StepPersonality } from "../setup/StepPersonality.tsx";
import { StepMcp } from "../setup/StepMcp.tsx";

interface SettingsPanelProps {
  onClose: () => void;
}

type CollapseSection = "provider" | "models" | "personality" | "mcp" | "advancedApi" | "modelDetails" | "coderProfiles" | "builtinPlugin";

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const sessionState = useSession();
  const {
    state,
    loadSettings,
    saveSettings,
    addApiProvider,
    updateApiProvider,
    removeApiProvider,
    updateModelAssignment,
    updatePersonality,
    addMcpServer,
    updateMcpServer,
    removeMcpServer,
    updateCodingAgent,
    updateModel,
    addModel,
    removeModel,
    addModelProfile,
    updateModelProfile,
    removeModelProfile,
    updateApiProviderAdvanced,
  } = useSettings();

  const [expanded, setExpanded] = useState<Set<CollapseSection>>(
    new Set(["provider"])
  );
  const [saveStatus, setSaveStatus] = useState<{
    type: "success" | "error" | "";
    message: string;
  }>({ type: "", message: "" });

  // 打开面板时加载配置
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const toggleSection = useCallback((section: CollapseSection) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaveStatus({ type: "", message: "" });
    const result = await saveSettings();
    setSaveStatus({
      type: result.success ? "success" : "error",
      message: result.message,
    });
    if (result.success) {
      // 非 Tauri 环境延迟关闭
      setTimeout(() => onClose(), 1500);
    }
  }, [saveSettings, onClose]);

  // ─── 渲染折叠区域 ──────────────────────────────────────────

  const sectionClass =
    "border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden";

  const sectionHeaderClass =
    "w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left";

  const sectionContentClass = "px-4 py-4 bg-white dark:bg-gray-900";

  const fieldClass =
    "w-full px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm transition-all";

  const labelClass =
    "block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5";

  const hintClass = "text-xs text-gray-400 dark:text-gray-500 mt-1";

  // ─── 加载状态 ──
  if (state.loading) {
    return (
      <>
        <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
        <div className="fixed right-0 top-0 h-full w-[450px] bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 z-50 flex items-center justify-center shadow-2xl">
          <Loader2 size={24} className="animate-spin text-blue-600" />
        </div>
      </>
    );
  }

  return (
    <>
      {/* 遮罩 */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* 抽屉 */}
      <div className="fixed right-0 top-0 h-full w-[450px] bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 z-50 flex flex-col shadow-2xl animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              设置
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              API Provider · 模型 · Bot 人设
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {state.notConfigured && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-700 dark:text-amber-300 text-sm">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>首次配置，请填写以下表单后保存。</span>
            </div>
          )}

          {state.error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{state.error}</span>
            </div>
          )}

          {saveStatus.type && (
            <div
              className={`flex items-start gap-2 p-3 rounded-xl text-sm ${
                saveStatus.type === "success"
                  ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300"
                  : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400"
              }`}
            >
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{saveStatus.message}</span>
            </div>
          )}

          {/* ── 1. API Provider ── */}
          <div className={sectionClass}>
            <button
              onClick={() => toggleSection("provider")}
              className={sectionHeaderClass}
            >
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                API 与模型分配
              </span>
              <span className="text-xs text-gray-400">
                {expanded.has("provider") ? "收起 ▲" : "展开 ▼"}
              </span>
            </button>
            {expanded.has("provider") && (
              <div className={sectionContentClass}>
                <StepProvider
                  apiProviders={state.apiProviders}
                  modelsAssignment={state.modelsAssignment}
                  onAddProvider={addApiProvider}
                  onUpdateProvider={updateApiProvider}
                  onRemoveProvider={removeApiProvider}
                  onUpdateModelAssignment={updateModelAssignment}
                />
              </div>
            )}
          </div>

          {/* ── 2. MCP 外部工具 ── */}
          <div className={sectionClass}>
            <button
              onClick={() => toggleSection("mcp")}
              className={sectionHeaderClass}
            >
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                MCP 服务
              </span>
              <span className="text-xs text-gray-400">
                {expanded.has("mcp") ? "收起 ▲" : "展开 ▼"}
              </span>
            </button>
            {expanded.has("mcp") && (
              <div className={sectionContentClass}>
                <StepMcp
                  mcpServers={state.mcpServers}
                  onAddMcpServer={addMcpServer}
                  onUpdateMcpServer={updateMcpServer}
                  onRemoveMcpServer={removeMcpServer}
                />
              </div>
            )}
          </div>

          {/* ── 3. Bot 人设 ── */}
          <div className={sectionClass}>
            <button
              onClick={() => toggleSection("personality")}
              className={sectionHeaderClass}
            >
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                Bot 人设
              </span>
              <span className="text-xs text-gray-400">
                {expanded.has("personality") ? "收起 ▲" : "展开 ▼"}
              </span>
            </button>
            {expanded.has("personality") && (
              <div className={sectionContentClass}>
                <StepPersonality
                  personality={state.personality}
                  onUpdate={updatePersonality}
                />
              </div>
            )}
          </div>

          {/* ── 4. 高级 API 设置 ── */}
          <div className={sectionClass}>
            <button
              onClick={() => toggleSection("advancedApi")}
              className={sectionHeaderClass}
            >
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                高级 API 设置
              </span>
              <span className="text-xs text-gray-400">
                {expanded.has("advancedApi") ? "收起 ▲" : "展开 ▼"}
              </span>
            </button>
            {expanded.has("advancedApi") && (
              <div className={sectionContentClass + " space-y-4"}>
                {state.apiProviders.map((provider) => (
                  <div key={provider.id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                      {provider.name || "未命名提供商"}
                    </h4>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">
                          最大重试
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={10}
                          value={provider.max_retry ?? 2}
                          onChange={(e) =>
                            updateApiProviderAdvanced(provider.id, {
                              max_retry: parseInt(e.target.value) || 0,
                            })
                          }
                          className="w-full px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs text-gray-900 dark:text-white"
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
                            updateApiProviderAdvanced(provider.id, {
                              timeout: parseInt(e.target.value) || 30,
                            })
                          }
                          className="w-full px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs text-gray-900 dark:text-white"
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
                            updateApiProviderAdvanced(provider.id, {
                              retry_interval: parseInt(e.target.value) || 0,
                            })
                          }
                          className="w-full px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs text-gray-900 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── 5. 模型详情 ── */}
          <div className={sectionClass}>
            <button
              onClick={() => toggleSection("modelDetails")}
              className={sectionHeaderClass}
            >
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                模型详情
              </span>
              <span className="text-xs text-gray-400">
                {expanded.has("modelDetails") ? "收起 ▲" : "展开 ▼"}
              </span>
            </button>
            {expanded.has("modelDetails") && (
              <div className={sectionContentClass}>
                <StepProvider
                  apiProviders={state.apiProviders}
                  modelsAssignment={state.modelsAssignment}
                  onAddProvider={addApiProvider}
                  onUpdateProvider={updateApiProvider}
                  onRemoveProvider={removeApiProvider}
                  onUpdateModelAssignment={updateModelAssignment}
                  models={state.models}
                  onUpdateModel={updateModel}
                  onAddModel={addModel}
                  onRemoveModel={removeModel}
                />
              </div>
            )}
          </div>

          {/* ── 6. Coder Profile ── */}
          <div className={sectionClass}>
            <button
              onClick={() => toggleSection("coderProfiles")}
              className={sectionHeaderClass}
            >
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                Coder Profile
              </span>
              <span className="text-xs text-gray-400">
                {expanded.has("coderProfiles") ? "收起 ▲" : "展开 ▼"}
              </span>
            </button>
            {expanded.has("coderProfiles") && (
              <div className={sectionContentClass + " space-y-4"}>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    配置不同的 Coder 模型配置文件（温度、tokens、描述等）。
                  </p>
                  <button
                    onClick={addModelProfile}
                    className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-lg transition-colors"
                  >
                    <Plus size={12} />
                    添加 Profile
                  </button>
                </div>
                {state.modelProfiles.length === 0 ? (
                  <div className="text-xs text-gray-400 dark:text-gray-600 text-center py-4">
                    暂无 Coder Profile
                  </div>
                ) : (
                  state.modelProfiles.map((mp, i) => (
                    <div
                      key={i}
                      className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300">
                          {mp.profile_name || "未命名 Profile"}
                        </h4>
                        <button
                          onClick={() => removeModelProfile(i)}
                          className="text-gray-400 hover:text-red-500 transition-colors p-0.5"
                          title="删除"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 block">
                            Profile 名称
                          </label>
                          <input
                            type="text"
                            value={mp.profile_name}
                            onChange={(e) =>
                              updateModelProfile(i, { profile_name: e.target.value })
                            }
                            className="w-full px-2 py-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs text-gray-900 dark:text-white mt-0.5"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 block">
                            模型名称
                          </label>
                          <input
                            type="text"
                            value={mp.model_name}
                            onChange={(e) =>
                              updateModelProfile(i, { model_name: e.target.value })
                            }
                            className="w-full px-2 py-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs text-gray-900 dark:text-white mt-0.5"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 block">
                            温度
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            min={0}
                            max={2}
                            value={mp.temperature}
                            onChange={(e) =>
                              updateModelProfile(i, {
                                temperature: parseFloat(e.target.value) ?? 0.5,
                              })
                            }
                            className="w-full px-2 py-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs text-gray-900 dark:text-white mt-0.5"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400 block">
                            最大 Tokens
                          </label>
                          <input
                            type="number"
                            value={mp.max_tokens}
                            onChange={(e) =>
                              updateModelProfile(i, {
                                max_tokens: parseInt(e.target.value) || 16384,
                              })
                            }
                            className="w-full px-2 py-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs text-gray-900 dark:text-white mt-0.5"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 block">
                          描述
                        </label>
                        <input
                          type="text"
                          value={mp.description}
                          onChange={(e) =>
                            updateModelProfile(i, { description: e.target.value })
                          }
                          className="w-full px-2 py-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs text-gray-900 dark:text-white mt-0.5"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 block">
                          Tags（逗号分隔）
                        </label>
                        <input
                          type="text"
                          value={mp.tags.join(", ")}
                          onChange={(e) =>
                            updateModelProfile(i, {
                              tags: e.target.value
                                .split(",")
                                .map((t) => t.trim())
                                .filter(Boolean),
                            })
                          }
                          className="w-full px-2 py-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs text-gray-900 dark:text-white mt-0.5"
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* ── 7. 内置插件设置 ── */}
          <div className={sectionClass}>
            <button
              onClick={() => toggleSection("builtinPlugin")}
              className={sectionHeaderClass}
            >
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                内置插件设置
              </span>
              <span className="text-xs text-gray-400">
                {expanded.has("builtinPlugin") ? "收起 ▲" : "展开 ▼"}
              </span>
            </button>
            {expanded.has("builtinPlugin") && (
              <div className={sectionContentClass + " space-y-4"}>
                <div>
                  <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">
                    Coding Agent 设置
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">
                        用户称呼
                      </label>
                      <input
                        type="text"
                        value={state.codingAgent.tui_username}
                        onChange={(e) => updateCodingAgent({ tui_username: e.target.value })}
                        placeholder="User"
                        className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">
                        首选终端
                      </label>
                      <select
                        value={state.codingAgent.preferred_terminal}
                        onChange={(e) => updateCodingAgent({ preferred_terminal: e.target.value })}
                        className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white"
                      >
                        <option value="">自动检测</option>
                        <option value="powershell">PowerShell 5</option>
                        <option value="pwsh">PowerShell 7</option>
                        <option value="cmd">CMD</option>
                        <option value="bash">Bash</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">
                        最大并行研究员数
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={state.codingAgent.max_parallel_researchers}
                        onChange={(e) =>
                          updateCodingAgent({
                            max_parallel_researchers: parseInt(e.target.value) || 1,
                          })
                        }
                        className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 block">
                        缓存有效期（小时）
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={720}
                        value={state.codingAgent.cache_ttl_hours}
                        onChange={(e) =>
                          updateCodingAgent({
                            cache_ttl_hours: parseInt(e.target.value) || 1,
                          })
                        }
                        className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-100 dark:border-gray-800 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-200 dark:border-gray-700 rounded-xl transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={state.saving}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
          >
            {state.saving && <Loader2 size={14} className="animate-spin" />}
            <Save size={14} />
            <span>保存并重启</span>
          </button>
        </div>
      </div>
    </>
  );
}
