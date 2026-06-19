/**
 * Setup Wizard 状态管理 Hook
 *
 * 管理 Setup Wizard 的多步骤状态（API Provider → 人设 → 确认），
 * 支持 localStorage 持久化（保存草稿）和提交到后端。
 */

import { useState, useCallback, useEffect } from "react";

// ─── 类型定义 ────────────────────────────────────────────────

export interface ApiProviderConfig {
  id: string; // 用于前端列表管理的唯一标识
  name: string;
  base_url: string;
  api_key: string;
  client_type: "openai" | "anthropic" | "gemini" | "aiohttp_gemini" | "bedrock";
  /** API 调用最大重试次数 */
  max_retry?: number;
  /** API 调用超时（秒） */
  timeout?: number;
  /** API 重试间隔（秒） */
  retry_interval?: number;
}

export interface ModelAssignment {
  providerId: string;
  modelName: string;
}

export interface PersonalityConfig {
  nickname: string;
  personality_core: string;
  reply_style: string;
  identity: string;
  background_story: string;
  safety_guidelines: string[];
  negative_behaviors: string[];
}

export interface ModelProfile {
  profile_name: string;
  model_name: string;
  tags: string[];
  description: string;
  temperature: number;
  max_tokens: number;
}

export interface McpServerConfig {
  id: string;
  name: string;
  type: "stdio" | "sse";
  // Stdio fields
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // SSE fields
  url?: string;
  // Common fields
  instructions?: string;
  defer_loading?: boolean;
}

export interface CodingAgentSetupConfig {
  /** 用户称呼 */
  tui_username: string;
  /** 首选终端 */
  preferred_terminal: string;
  /** 最大并行研究员数 */
  max_parallel_researchers: number;
  /** 项目理解缓存有效期（小时） */
  cache_ttl_hours: number;
}

export interface ModelDetailConfig {
  model_id: string;
  api_provider: string;
  max_context: number;
  price_in: number;
  price_out: number;
  cache_hit_price_in: number | null;
  force_stream_mode: boolean;
  tool_call_compat: boolean;
  extra_params: Record<string, unknown>;
  anti_truncation: boolean;
}

export interface SetupState {
  step: number; // 0=Provider, 1=Personality, 2=MCP, 3=Personalization, 4=Confirm
  apiProviders: ApiProviderConfig[];
  modelsAssignment: {
    main: ModelAssignment;
    coder: ModelAssignment;
    researcher: ModelAssignment;
    reviewer: ModelAssignment;
    title: ModelAssignment;
  };
  personality: PersonalityConfig;
  modelProfiles: ModelProfile[];
  mcpServers: McpServerConfig[];
  codingAgent: CodingAgentSetupConfig;
  models: ModelDetailConfig[];
}

export interface WizardSubmitConfig {
  api_providers: Array<{
    name: string;
    base_url: string;
    api_key: string;
    client_type: string;
    max_retry?: number;
    timeout?: number;
    retry_interval?: number;
  }>;
  roles: {
    main: string;
    coder: string;
    researcher: string;
    reviewer: string;
    title: string;
  };
  personality: {
    nickname: string;
    personality_core: string;
    reply_style: string;
    identity: string;
    background_story: string;
    safety_guidelines: string[];
    negative_behaviors: string[];
  };
  model_profiles: Array<{
    profile_name: string;
    model_name: string;
    tags: string[];
    description: string;
    temperature: number;
    max_tokens: number;
  }>;
  mcp_servers: Array<{
    name: string;
    type: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    instructions?: string;
    defer_loading?: boolean;
  }>;
  coding_agent: {
    tui_username: string;
    preferred_terminal: string;
    max_parallel_researchers: number;
    cache_ttl_hours: number;
    default_timeout: number;
    max_output_lines: number;
  };
  models: Array<{
    model_id: string;
    api_provider: string;
    max_context: number;
    price_in: number;
    price_out: number;
    cache_hit_price_in: number | null;
    force_stream_mode: boolean;
    tool_call_compat: boolean;
    extra_params: Record<string, unknown>;
    anti_truncation: boolean;
  }>;
}

// ─── 默认值 ──────────────────────────────────────────────────

const defaultProviderId = crypto.randomUUID();

const DEFAULT_SETUP: SetupState = {
  step: 0,
  apiProviders: [
    {
      id: defaultProviderId,
      name: "OpenAI",
      base_url: "https://api.openai.com/v1",
      api_key: "",
      client_type: "openai",
    },
  ],
  modelsAssignment: {
    main: { providerId: defaultProviderId, modelName: "gpt-4o" },
    coder: { providerId: defaultProviderId, modelName: "gpt-4o" },
    researcher: { providerId: defaultProviderId, modelName: "gpt-4o-mini" },
    reviewer: { providerId: defaultProviderId, modelName: "gpt-4o" },
    title: { providerId: defaultProviderId, modelName: "gpt-4o-mini" },
  },
  personality: {
    nickname: "小狐狸",
    personality_core: "友好、活泼、乐于助人",
    reply_style: "自然口语化",
    identity: "AI助手",
    background_story: "",
    safety_guidelines: [
      "拒绝任何包含骚扰、冒犯、暴力、色情或危险内容的请求。",
    ],
    negative_behaviors: [
      "不主动提供个人信息，如姓名、地址、联系方式等。",
      "不参与任何违法活动。",
    ],
  },
  modelProfiles: [
    {
      profile_name: "Default",
      model_name: "gpt-4o",
      tags: ["日常开发"],
      description: "默认模型配置",
      temperature: 0.5,
      max_tokens: 16384,
    },
  ],
  mcpServers: [],
  codingAgent: {
    tui_username: "User",
    preferred_terminal: "",
    max_parallel_researchers: 6,
    cache_ttl_hours: 24,
  },
  models: [],
};

// ─── localStorage 键 ─────────────────────────────────────────

const SETUP_DRAFT_KEY = "mofox-code-setup-draft";
const SETUP_DONE_KEY = "mofox-code-setup-done";

// ─── Hook ────────────────────────────────────────────────────

export function useSetup() {
  const [state, setState] = useState<SetupState>(() => {
    // 从 localStorage 恢复草稿
    try {
      const raw = localStorage.getItem(SETUP_DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // 兼容旧版本的单 apiProvider
        if (parsed.apiProvider && !parsed.apiProviders) {
            const legacyId = crypto.randomUUID();
            const legacyProvider = {
                id: legacyId,
                name: parsed.apiProvider.name || "OpenAI",
                base_url: parsed.apiProvider.base_url || "https://api.openai.com/v1",
                api_key: parsed.apiProvider.api_key || "",
                client_type: parsed.apiProvider.client_type || "openai",
            };
            const legacyModels = parsed.apiProvider.models || {};
            parsed.apiProviders = [legacyProvider];
            parsed.modelsAssignment = {
                main: { providerId: legacyId, modelName: legacyModels.main || "gpt-4o" },
                coder: { providerId: legacyId, modelName: legacyModels.coder || "gpt-4o" },
                researcher: { providerId: legacyId, modelName: legacyModels.researcher || "gpt-4o-mini" },
                reviewer: { providerId: legacyId, modelName: legacyModels.reviewer || "gpt-4o" },
                title: { providerId: legacyId, modelName: legacyModels.title || "gpt-4o-mini" },
            };
            delete parsed.apiProvider;
        }
        return { ...DEFAULT_SETUP, ...parsed };
      }
    } catch {
      // ignore
    }
    return { ...DEFAULT_SETUP };
  });

  // 持久化草稿到 localStorage（每次 state 变化时）
  useEffect(() => {
    try {
      localStorage.setItem(SETUP_DRAFT_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [state]);

  // ─── Actions ────────────────────────────────────────────

  const setStep = useCallback((step: number) => {
    setState((prev) => ({ ...prev, step }));
  }, []);

  const nextStep = useCallback(() => {
    setState((prev) => ({ ...prev, step: Math.min(prev.step + 1, 4) }));
  }, []);

  const prevStep = useCallback(() => {
    setState((prev) => ({ ...prev, step: Math.max(prev.step - 1, 0) }));
  }, []);

  const addApiProvider = useCallback(() => {
    setState((prev) => ({
      ...prev,
      apiProviders: [
        ...prev.apiProviders,
        {
          id: crypto.randomUUID(),
          name: "New Provider",
          base_url: "https://api.openai.com/v1",
          api_key: "",
          client_type: "openai",
        },
      ],
    }));
  }, []);

  const updateApiProvider = useCallback(
    (id: string, partial: Partial<Omit<ApiProviderConfig, "id">>) => {
      setState((prev) => ({
        ...prev,
        apiProviders: prev.apiProviders.map((p) =>
          p.id === id ? { ...p, ...partial } : p
        ),
      }));
    },
    []
  );

  const removeApiProvider = useCallback((id: string) => {
    setState((prev) => {
      const newProviders = prev.apiProviders.filter((p) => p.id !== id);
      // 如果删除后为空，添加一个默认的
      if (newProviders.length === 0) {
        newProviders.push({
          id: crypto.randomUUID(),
          name: "OpenAI",
          base_url: "https://api.openai.com/v1",
          api_key: "",
          client_type: "openai",
        });
      }
      
      // 检查模型分配中是否有关联了被删除的提供商，如果有，退回到第一个可用的提供商
      const fallbackId = newProviders[0].id;
      const newAssignments = { ...prev.modelsAssignment };
      for (const role of Object.keys(newAssignments) as Array<keyof typeof newAssignments>) {
        if (newAssignments[role].providerId === id) {
          newAssignments[role] = { ...newAssignments[role], providerId: fallbackId };
        }
      }

      return {
        ...prev,
        apiProviders: newProviders,
        modelsAssignment: newAssignments,
      };
    });
  }, []);

  const updateModelAssignment = useCallback(
    (role: keyof SetupState["modelsAssignment"], assignment: Partial<ModelAssignment>) => {
      setState((prev) => ({
        ...prev,
        modelsAssignment: {
          ...prev.modelsAssignment,
          [role]: { ...prev.modelsAssignment[role], ...assignment },
        },
      }));
    },
    []
  );

  const updatePersonality = useCallback(
    (partial: Partial<PersonalityConfig>) => {
      setState((prev) => ({
        ...prev,
        personality: { ...prev.personality, ...partial },
      }));
    },
    []
  );

  const updateCodingAgent = useCallback(
    (partial: Partial<CodingAgentSetupConfig>) => {
      setState((prev) => ({
        ...prev,
        codingAgent: { ...prev.codingAgent, ...partial },
      }));
    },
    []
  );

  /** 获取 provider 的名字辅助函数 */
  const getProviderName = useCallback(
    (providerId: string): string => {
      const provider = state.apiProviders.find((p) => p.id === providerId);
      return provider ? provider.name.trim() : "Unknown";
    },
    [state.apiProviders]
  );

  /** 构建提交给后端的配置 JSON */
  const buildSubmitConfig = useCallback((): WizardSubmitConfig => {
    const defaultProviderName = state.apiProviders[0]?.name.trim() || "OpenAI";
    
    // Helper to get resolved assignment
    const getResolvedRoleStr = (role: keyof SetupState["modelsAssignment"]) => {
      const assignment = state.modelsAssignment[role];
      const providerName = getProviderName(assignment.providerId) || defaultProviderName;
      // 如果没有模型名，退回到 main 模型。
      const modelName = assignment.modelName.trim() || state.modelsAssignment.main.modelName.trim();
      return `${providerName}/${modelName}`;
    };

    const payload = {
      api_providers: state.apiProviders.map((p) => ({
        name: p.name.trim(),
        base_url: p.base_url.trim(),
        api_key: p.api_key.trim(),
        client_type: p.client_type,
        max_retry: p.max_retry ?? 2,
        timeout: p.timeout ?? 30,
        retry_interval: p.retry_interval ?? 10,
      })),
      roles: {
        main: getResolvedRoleStr("main"),
        coder: getResolvedRoleStr("coder"),
        researcher: getResolvedRoleStr("researcher"),
        reviewer: getResolvedRoleStr("reviewer"),
        title: getResolvedRoleStr("title"),
      },
      personality: {
        nickname: state.personality.nickname.trim() || "小狐狸",
        personality_core: state.personality.personality_core.trim(),
        reply_style: state.personality.reply_style.trim(),
        identity: state.personality.identity.trim(),
        background_story: state.personality.background_story.trim(),
        safety_guidelines: state.personality.safety_guidelines,
        negative_behaviors: state.personality.negative_behaviors,
      },
      model_profiles: state.modelProfiles.map((mp) => ({
        profile_name: mp.profile_name,
        model_name: mp.model_name.trim() || state.modelsAssignment.main.modelName.trim(), // fallback
        tags: mp.tags,
        description: mp.description,
        temperature: mp.temperature,
        max_tokens: mp.max_tokens,
      })),
      mcp_servers: state.mcpServers.map((srv) => ({
        name: srv.name.trim(),
        type: srv.type,
        command: srv.command?.trim(),
        args: srv.args,
        env: srv.env,
        url: srv.url?.trim(),
        instructions: srv.instructions?.trim(),
        defer_loading: srv.defer_loading,
      })),
      coding_agent: {
        tui_username: state.codingAgent.tui_username.trim() || "User",
        preferred_terminal: state.codingAgent.preferred_terminal || "",
        max_parallel_researchers: state.codingAgent.max_parallel_researchers || 6,
        cache_ttl_hours: state.codingAgent.cache_ttl_hours || 24,
        default_timeout: 30,
        max_output_lines: 200,
      },
      models: state.models.map((m) => ({
        model_id: m.model_id,
        api_provider: m.api_provider,
        max_context: m.max_context,
        price_in: m.price_in,
        price_out: m.price_out,
        cache_hit_price_in: m.cache_hit_price_in,
        force_stream_mode: m.force_stream_mode,
        tool_call_compat: m.tool_call_compat,
        extra_params: m.extra_params,
        anti_truncation: m.anti_truncation,
      })),
    };
    return payload;
  }, [state, getProviderName]);

  const addMcpServer = useCallback(() => {
    setState((prev) => ({
      ...prev,
      mcpServers: [
        ...prev.mcpServers,
        {
          id: crypto.randomUUID(),
          name: "new-mcp-server",
          type: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-everything"],
        },
      ],
    }));
  }, []);

  const updateMcpServer = useCallback(
    (id: string, partial: Partial<Omit<McpServerConfig, "id">>) => {
      setState((prev) => ({
        ...prev,
        mcpServers: prev.mcpServers.map((s) =>
          s.id === id ? { ...s, ...partial } : s
        ),
      }));
    },
    []
  );

  const removeMcpServer = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      mcpServers: prev.mcpServers.filter((s) => s.id !== id),
    }));
  }, []);

  const importFromPath = useCallback(async (path: string): Promise<{ success: boolean; message: string }> => {
    try {
      const resp = await fetch("/api/setup/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        return { success: false, message: data.message || "导入失败" };
      }

      // Convert imported data back to SetupState
      setState((prev) => {
        const newState = { ...prev };
        
        if (data.api_providers && data.api_providers.length > 0) {
          newState.apiProviders = data.api_providers.map((p: any) => ({
            id: crypto.randomUUID(),
            name: p.name,
            base_url: p.base_url,
            api_key: p.api_key,
            client_type: p.client_type,
            max_retry: p.max_retry ?? 2,
            timeout: p.timeout ?? 30,
            retry_interval: p.retry_interval ?? 10,
          }));
        }

        if (data.roles) {
          const resolveAssignment = (roleStr: any) => {
            if (!roleStr || typeof roleStr !== "string") return undefined;
            const parts = roleStr.split("/");
            if (parts.length >= 2) {
              const providerName = parts[0];
              const modelName = parts.slice(1).join("/");
              const provider = newState.apiProviders.find(p => p.name === providerName) || newState.apiProviders[0];
              return { providerId: provider?.id || "", modelName };
            }
            return { providerId: newState.apiProviders[0]?.id || "", modelName: roleStr };
          };

          newState.modelsAssignment = {
            main: resolveAssignment(data.roles.main) || prev.modelsAssignment.main,
            coder: resolveAssignment(data.roles.coder) || prev.modelsAssignment.coder,
            researcher: resolveAssignment(data.roles.researcher) || prev.modelsAssignment.researcher,
            reviewer: resolveAssignment(data.roles.reviewer) || prev.modelsAssignment.reviewer,
            title: resolveAssignment(data.roles.title) || prev.modelsAssignment.title,
          };
        }

        if (data.personality) {
          newState.personality = { ...prev.personality, ...data.personality };
        }

        if (data.mcp_servers) {
          newState.mcpServers = data.mcp_servers.map((s: any) => ({
            ...s,
            id: crypto.randomUUID(),
          }));
        }

        if (data.model_profiles && data.model_profiles.length > 0) {
          newState.modelProfiles = data.model_profiles;
        }

        if (data.coding_agent) {
          newState.codingAgent = {
            tui_username: data.coding_agent.tui_username || "User",
            preferred_terminal: data.coding_agent.preferred_terminal || "",
            max_parallel_researchers: data.coding_agent.max_parallel_researchers ?? 6,
            cache_ttl_hours: data.coding_agent.cache_ttl_hours ?? 24,
          };
        }

        if (data.models && Array.isArray(data.models)) {
          newState.models = data.models.map((m: any) => ({
            model_id: m.model_id || "",
            api_provider: m.api_provider || "",
            max_context: m.max_context ?? 0,
            price_in: m.price_in ?? 0,
            price_out: m.price_out ?? 0,
            cache_hit_price_in: m.cache_hit_price_in ?? null,
            force_stream_mode: m.force_stream_mode ?? false,
            tool_call_compat: m.tool_call_compat ?? false,
            extra_params: m.extra_params ?? {},
            anti_truncation: m.anti_truncation ?? false,
          }));
        }

        return newState;
      });

      return { success: true, message: "配置已成功导入" };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : "请求导入接口失败" };
    }
  }, []);

  /** 提交配置到后端（Tauri IPC 优先，HTTP fallback） */
  const submitConfig = useCallback(async (): Promise<{
    success: boolean;
    message: string;
  }> => {
    const config = buildSubmitConfig();

    // ── Tauri IPC 路径 ──
    if (window.__TAURI__) {
      try {
        const savedPath = await window.__TAURI__.core.invoke<string>(
          "submit_setup",
          { config }
        );
        localStorage.setItem(SETUP_DONE_KEY, "true");
        localStorage.removeItem(SETUP_DRAFT_KEY);
        return {
          success: true,
          message: `配置已保存到 ${savedPath}，后端即将重启`,
        };
      } catch (e) {
        return {
          success: false,
          message:
            e instanceof Error ? e.message : "Tauri 提交失败",
        };
      }
    }

    // ── HTTP API 路径（浏览器 / 无 Tauri 环境）──
    try {
      const resp = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ message: "未知错误" }));
        return { success: false, message: err.message || `HTTP ${resp.status}` };
      }

      const data = await resp.json();
      localStorage.setItem(SETUP_DONE_KEY, "true");
      localStorage.removeItem(SETUP_DRAFT_KEY);
      return { success: true, message: data.message || "配置已保存" };
    } catch (e) {
      return {
        success: false,
        message: e instanceof Error ? e.message : "提交失败，请检查后端是否运行",
      };
    }
  }, [buildSubmitConfig]);

  /** 检查是否已完成设置 */
  const isSetupDone = useCallback((): boolean => {
    return localStorage.getItem(SETUP_DONE_KEY) === "true";
  }, []);

  return {
    state,
    setStep,
    nextStep,
    prevStep,
    addApiProvider,
    updateApiProvider,
    removeApiProvider,
    updateModelAssignment,
    updatePersonality,
    updateCodingAgent,
    addMcpServer,
    updateMcpServer,
    removeMcpServer,
    importFromPath,
    buildSubmitConfig,
    submitConfig,
    isSetupDone,
  };
}
