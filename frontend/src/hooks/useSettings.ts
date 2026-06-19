/**
 * Settings Panel 状态管理 Hook
 *
 * 管理设置面板的表单状态，支持从后端加载当前配置和提交更新。
 * 与 useSetup 共享数据类型（ApiProviderConfig, PersonalityConfig, ModelProfile, SetupState）。
 */

import { useState, useCallback, useEffect } from "react";
import type {
  ApiProviderConfig,
  PersonalityConfig,
  ModelProfile,
  SetupState,
  ModelAssignment,
  McpServerConfig,
  CodingAgentSetupConfig,
  ModelDetailConfig,
} from "./useSetup.ts";

// ─── 类型定义 ────────────────────────────────────────────────

export interface SettingsState {
  loading: boolean;
  loaded: boolean;
  saving: boolean;
  error: string;
  apiProviders: ApiProviderConfig[];
  modelsAssignment: SetupState["modelsAssignment"];
  personality: PersonalityConfig;
  modelProfiles: ModelProfile[];
  mcpServers: McpServerConfig[];
  codingAgent: CodingAgentSetupConfig;
  models: ModelDetailConfig[];
  notConfigured: boolean;
}

// ─── 默认值 ──────────────────────────────────────────────────

const defaultProviderId = crypto.randomUUID();

const DEFAULT_SETTINGS: SettingsState = {
  loading: false,
  loaded: false,
  saving: false,
  error: "",
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
    safety_guidelines: [],
    negative_behaviors: [],
  },
  modelProfiles: [],
  mcpServers: [],
  codingAgent: {
    tui_username: "User",
    preferred_terminal: "",
    max_parallel_researchers: 6,
    cache_ttl_hours: 24,
  },
  models: [],
  notConfigured: false,
};

// ─── API Key 掩码检测 ────────────────────────────────────────

export function isMaskedKey(key: string): boolean {
  return key.includes("***");
}

// ─── Hook ────────────────────────────────────────────────────

export function useSettings() {
  const [state, setState] = useState<SettingsState>({ ...DEFAULT_SETTINGS });

  // ─── 加载设置 ──
  const loadSettings = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const resp = await fetch("/api/settings");
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = await resp.json();

      if (data.status === "not_configured") {
        setState((prev) => ({
          ...prev,
          loading: false,
          loaded: true,
          notConfigured: true,
        }));
        return;
      }

      // 兼容旧格式或解析新格式
      let apiProviders: ApiProviderConfig[] = [];
      let modelsAssignment = DEFAULT_SETTINGS.modelsAssignment;

      if (data.api_providers && Array.isArray(data.api_providers)) {
          apiProviders = data.api_providers.map((p: any) => ({
              id: crypto.randomUUID(),
              name: p.name || "",
              base_url: p.base_url || "",
              api_key: p.api_key || "",
              client_type: p.client_type || "openai",
          }));
      } else if (data.api_provider) {
          apiProviders = [{
              id: defaultProviderId,
              name: data.api_provider.name || "",
              base_url: data.api_provider.base_url || "",
              api_key: data.api_provider.api_key || "",
              client_type: data.api_provider.client_type || "openai",
          }];
      }

      if (apiProviders.length === 0) {
          apiProviders = [DEFAULT_SETTINGS.apiProviders[0]];
      }

      if (data.roles) {
          const parseRole = (roleStr: string | undefined | null) => {
              if (!roleStr) return { providerId: apiProviders[0]?.id || "", modelName: "" };
              const parts = roleStr.split("/");
              if (parts.length >= 2) {
                  const providerName = parts[0];
                  const modelName = parts.slice(1).join("/");
                  const p = apiProviders.find(p => p.name === providerName);
                  return { providerId: p ? p.id : (apiProviders[0]?.id || ""), modelName };
              }
              return { providerId: apiProviders[0]?.id || "", modelName: roleStr };
          };
          modelsAssignment = {
              main: parseRole(data.roles.main),
              coder: parseRole(data.roles.coder),
              researcher: parseRole(data.roles.researcher),
              reviewer: parseRole(data.roles.reviewer),
              title: parseRole(data.roles.title),
          };
      } else if (data.models && !Array.isArray(data.models)) {
          const pid = apiProviders[0].id;
          modelsAssignment = {
              main: { providerId: pid, modelName: data.models.main || "" },
              coder: { providerId: pid, modelName: data.models.coder || "" },
              researcher: { providerId: pid, modelName: data.models.researcher || "" },
              reviewer: { providerId: pid, modelName: data.models.reviewer || "" },
              title: { providerId: pid, modelName: data.models.title || "" },
          };
      }

      const personality = {
        nickname: data.personality?.nickname || "",
        personality_core: data.personality?.personality_core || "",
        reply_style: data.personality?.reply_style || "",
        identity: data.personality?.identity || "",
        background_story: data.personality?.background_story || "",
        safety_guidelines: data.personality?.safety_guidelines || [],
        negative_behaviors: data.personality?.negative_behaviors || [],
      };

      const modelProfiles: ModelProfile[] = (
        data.model_profiles || []
      ).map((mp: Record<string, unknown>) => ({
        profile_name: (mp.profile_name as string) || "",
        model_name: (mp.model_name as string) || "",
        tags: (mp.tags as string[]) || [],
        description: (mp.description as string) || "",
        temperature: (mp.temperature as number) ?? 0.5,
        max_tokens: (mp.max_tokens as number) ?? 16384,
      }));

      const mcpServers: McpServerConfig[] = (
        data.mcp_servers || []
      ).map((srv: Record<string, any>) => ({
        id: crypto.randomUUID(),
        name: srv.name || "",
        type: srv.type || "stdio",
        command: srv.command || "",
        args: srv.args || [],
        env: srv.env || {},
        url: srv.url || "",
        instructions: srv.instructions || "",
        defer_loading: !!srv.defer_loading,
      }));

      const codingAgent: CodingAgentSetupConfig = {
        tui_username: data.coding_agent?.tui_username || "User",
        preferred_terminal: data.coding_agent?.preferred_terminal || "",
        max_parallel_researchers: data.coding_agent?.max_parallel_researchers ?? 6,
        cache_ttl_hours: data.coding_agent?.cache_ttl_hours ?? 24,
      };

      const models: ModelDetailConfig[] = (
        data.models || []
      ).map((m: Record<string, any>) => ({
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

      setState((prev) => ({
        ...prev,
        loading: false,
        loaded: true,
        apiProviders,
        modelsAssignment,
        personality,
        modelProfiles,
        mcpServers,
        codingAgent,
        models,
      }));
    } catch (e) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: e instanceof Error ? e.message : "加载配置失败",
      }));
    }
  }, []);

  const getProviderName = useCallback(
    (providerId: string): string => {
      const provider = state.apiProviders.find((p) => p.id === providerId);
      return provider ? provider.name.trim() : "Unknown";
    },
    [state.apiProviders]
  );

  // ─── 保存设置 ──
  const saveSettings = useCallback(async (): Promise<{
    success: boolean;
    message: string;
  }> => {
    setState((prev) => ({ ...prev, saving: true, error: "" }));

    const defaultProviderName = state.apiProviders[0]?.name.trim() || "OpenAI";
    const getResolvedRoleStr = (role: keyof SetupState["modelsAssignment"]) => {
        const assignment = state.modelsAssignment[role];
        const providerName = getProviderName(assignment.providerId) || defaultProviderName;
        const modelName = assignment.modelName.trim() || state.modelsAssignment.main.modelName.trim();
        return `${providerName}/${modelName}`;
    };

    const submitBody = {
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
        model_name: mp.model_name.trim() || state.modelsAssignment.main.modelName.trim(),
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

    try {
      // ── Tauri IPC 路径 ──
      if (window.__TAURI__) {
        try {
          await window.__TAURI__.core.invoke<string>("submit_setup", {
            config: submitBody,
          });
          // 通过 Tauri 重启后端
          await window.__TAURI__.core.invoke("restart_backend");
          setState((prev) => ({ ...prev, saving: false }));
          return { success: true, message: "配置已保存，后端正在重启..." };
        } catch (e) {
          setState((prev) => ({ ...prev, saving: false }));
          return {
            success: false,
            message: e instanceof Error ? e.message : "Tauri 保存失败",
          };
        }
      }

      // ── HTTP API 路径 ──
      const resp = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitBody),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ message: "未知错误" }));
        setState((prev) => ({ ...prev, saving: false }));
        return {
          success: false,
          message: err.message || `HTTP ${resp.status}`,
        };
      }

      setState((prev) => ({ ...prev, saving: false }));
      return { success: true, message: "配置已更新" };
    } catch (e) {
      setState((prev) => ({ ...prev, saving: false }));
      return {
        success: false,
        message: e instanceof Error ? e.message : "保存失败，请检查后端是否运行",
      };
    }
  }, [state, getProviderName]);

  // ─── Actions ──────────────────────────────

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
      if (newProviders.length === 0) {
        newProviders.push({
          id: crypto.randomUUID(),
          name: "OpenAI",
          base_url: "https://api.openai.com/v1",
          api_key: "",
          client_type: "openai",
        });
      }
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

  const updateCodingAgent = useCallback(
    (partial: Partial<CodingAgentSetupConfig>) => {
      setState((prev) => ({
        ...prev,
        codingAgent: { ...prev.codingAgent, ...partial },
      }));
    },
    []
  );

  const updateModel = useCallback(
    (index: number, partial: Partial<ModelDetailConfig>) => {
      setState((prev) => ({
        ...prev,
        models: prev.models.map((m, i) =>
          i === index ? { ...m, ...partial } : m
        ),
      }));
    },
    []
  );

  const addModel = useCallback(() => {
    setState((prev) => ({
      ...prev,
      models: [
        ...prev.models,
        {
          model_id: "",
          api_provider: prev.apiProviders[0]?.name || "",
          max_context: 0,
          price_in: 0,
          price_out: 0,
          cache_hit_price_in: null,
          force_stream_mode: false,
          tool_call_compat: false,
          extra_params: {},
          anti_truncation: false,
        },
      ],
    }));
  }, []);

  const removeModel = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      models: prev.models.filter((_, i) => i !== index),
    }));
  }, []);

  const addModelProfile = useCallback(() => {
    setState((prev) => ({
      ...prev,
      modelProfiles: [
        ...prev.modelProfiles,
        {
          profile_name: "New Profile",
          model_name: prev.modelsAssignment.main.modelName || "gpt-4o",
          tags: [],
          description: "",
          temperature: 0.5,
          max_tokens: 16384,
        },
      ],
    }));
  }, []);

  const updateModelProfile = useCallback(
    (index: number, partial: Partial<ModelProfile>) => {
      setState((prev) => ({
        ...prev,
        modelProfiles: prev.modelProfiles.map((mp, i) =>
          i === index ? { ...mp, ...partial } : mp
        ),
      }));
    },
    []
  );

  const removeModelProfile = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      modelProfiles: prev.modelProfiles.filter((_, i) => i !== index),
    }));
  }, []);

  const updateApiProviderAdvanced = useCallback(
    (id: string, partial: { max_retry?: number; timeout?: number; retry_interval?: number }) => {
      setState((prev) => ({
        ...prev,
        apiProviders: prev.apiProviders.map((p) =>
          p.id === id ? { ...p, ...partial } : p
        ),
      }));
    },
    []
  );

  return {
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
  };
}
