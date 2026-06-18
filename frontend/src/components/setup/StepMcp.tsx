/**
 * StepMcp — MCP 服务配置
 */

import { Plus, Trash2, Plug, PlayCircle, Info } from "lucide-react";
import type { McpServerConfig } from "../../hooks/useSetup.ts";

interface StepMcpProps {
  mcpServers: McpServerConfig[];
  onAddMcpServer: () => void;
  onUpdateMcpServer: (id: string, partial: Partial<Omit<McpServerConfig, "id">>) => void;
  onRemoveMcpServer: (id: string) => void;
}

export function StepMcp({
  mcpServers,
  onAddMcpServer,
  onUpdateMcpServer,
  onRemoveMcpServer,
}: StepMcpProps) {
  const fieldClass =
    "w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm transition-all";
  const labelClass =
    "block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5";
  const hintClass = "text-xs text-gray-400 dark:text-gray-500 mt-1";

  return (
    <div className="space-y-10 animate-fade-in">
      <div className="space-y-2">
        <h2 className="text-3xl font-extrabold tracking-tight">MCP 服务配置</h2>
        <p className="text-gray-500 dark:text-gray-400 text-lg">
          配置 Model Context Protocol (MCP) 服务，为模型提供额外的工具和数据源。您可以随时跳过并在稍后配置。
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plug className="w-5 h-5 text-green-500" />
            <h3 className="text-xl font-bold">外部工具服务器</h3>
          </div>
          <button
            onClick={onAddMcpServer}
            className="flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 bg-green-50 dark:bg-green-900/30 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            添加 MCP
          </button>
        </div>

        {mcpServers.length === 0 ? (
          <div className="p-10 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl flex flex-col items-center justify-center text-center">
            <Plug className="w-10 h-10 text-gray-300 dark:text-gray-700 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">目前没有任何 MCP 服务配置。您可以直接跳过此步骤。</p>
          </div>
        ) : (
          <div className="space-y-4">
            {mcpServers.map((server) => (
              <div key={server.id} className="p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative group">
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onRemoveMcpServer(server.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                    title="删除此 MCP 服务"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="md:col-span-1">
                    <label className={labelClass}>服务名称</label>
                    <input
                      type="text"
                      value={server.name}
                      onChange={(e) => onUpdateMcpServer(server.id, { name: e.target.value })}
                      placeholder="如: fetch, bing-search..."
                      className={fieldClass}
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className={labelClass}>连接类型</label>
                    <select
                      value={server.type}
                      onChange={(e) => onUpdateMcpServer(server.id, { type: e.target.value as "stdio" | "sse" })}
                      className={fieldClass}
                    >
                      <option value="stdio">Stdio (本地进程)</option>
                      <option value="sse">SSE (HTTP长连接)</option>
                    </select>
                  </div>

                  {server.type === "stdio" ? (
                    <>
                      <div className="md:col-span-2">
                        <label className={labelClass}>执行命令 (Command)</label>
                        <div className="flex items-center gap-2">
                          <PlayCircle className="w-4 h-4 text-gray-400" />
                          <input
                            type="text"
                            value={server.command || ""}
                            onChange={(e) => onUpdateMcpServer(server.id, { command: e.target.value })}
                            placeholder="如: npx 或 uvx"
                            className={fieldClass}
                          />
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <label className={labelClass}>运行参数 (Args)</label>
                        <input
                          type="text"
                          value={(server.args || []).join(" ")}
                          onChange={(e) => {
                            // Simple split by space for args.
                            const val = e.target.value;
                            onUpdateMcpServer(server.id, { args: val ? val.split(" ") : [] });
                          }}
                          placeholder="如: -y @modelcontextprotocol/server-everything"
                          className={fieldClass}
                        />
                        <p className={hintClass}>参数间用空格分隔</p>
                      </div>
                      <div className="md:col-span-2">
                        <label className={labelClass}>环境变量 (Env, JSON格式)</label>
                        <input
                          type="text"
                          value={JSON.stringify(server.env || {})}
                          onChange={(e) => {
                            try {
                              const val = JSON.parse(e.target.value || "{}");
                              onUpdateMcpServer(server.id, { env: val });
                            } catch (err) {
                              // Ignore invalid JSON while typing
                            }
                          }}
                          placeholder='如: {"API_KEY": "xxx"}'
                          className={fieldClass}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="md:col-span-2">
                      <label className={labelClass}>服务端点 (URL)</label>
                      <input
                        type="text"
                        value={server.url || ""}
                        onChange={(e) => onUpdateMcpServer(server.id, { url: e.target.value })}
                        placeholder="http://localhost:3000/sse"
                        className={fieldClass}
                      />
                    </div>
                  )}

                  <div className="md:col-span-2">
                    <label className={labelClass}>提示指令 (Instructions)</label>
                    <textarea
                      value={server.instructions || ""}
                      onChange={(e) => onUpdateMcpServer(server.id, { instructions: e.target.value })}
                      placeholder="告诉模型这个 MCP 服务器主要是用来做什么的..."
                      className={`${fieldClass} min-h-[80px] resize-y`}
                    />
                  </div>

                  <div className="md:col-span-2 flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!server.defer_loading}
                        onChange={(e) => onUpdateMcpServer(server.id, { defer_loading: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                      <span className="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300">延迟加载 (仅分配给子代理时加载)</span>
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
