/**
 * 全局会话状态管理 — SessionContext
 *
 * 使用 useReducer 处理所有 ServerMessage → 状态变更。
 * 支持消息列表流式追加(agent.text 同 stream_id 持续拼接)。
 */

import {
  createContext,
  useReducer,
  type ReactNode,
} from "react";
import type {
  ServerMessage,
  UIMessage,
  CheckpointInfo,
  ContextUsage,
  PendingApproval,
  ConnectionState,
  SessionSummary,
  ResearchProgressPayload,
  SessionUsageStats,
  ContentPreviewInfo,
} from "../types/messages";
import {
  createUiMessage,
  sanitizeDisplayContent,
  isThinkingPlaceholderContent,
  isSameMessage,
  findLastStreamingAgentIndex,
  findLastThinkingIndex,
  closePendingThinkingForSource,
  closeStreamingForSource,
} from "../utils/message-utils";
import { normalizePath } from "../utils/path-utils";

// ─── 状态模型 ────────────────────────────────────────────

export interface SessionState {
  /** 连接状态 */
  connectionState: ConnectionState;
  /** WebSocket URL */
  wsUrl: string;
  /** 主题 */
  theme: "dark" | "light";
  /** 会话 ID */
  sessionId: string;
  /** 项目名称 */
  projectName: string;
  /** 会话标题 */
  title: string;
  /** 当前阶段: init/ready/thinking/coding/researching/reviewing/error */
  phase: string;
  /** 当前阶段的细节文案 */
  phaseDetail: string;
  /** 自动审查模式 */
  autoReview: boolean;
  /** YOLO 模式(免审批) */
  yoloMode: boolean;
  /** 目标模式(自主完成) */
  goalMode: boolean;
  /** Solo 模式 */
  soloMode: boolean;
  /** IDE 紧凑模式 */
  ideMode: boolean;
  /** 消息列表 */
  messages: UIMessage[];
  /** 检查点列表 */
  checkpoints: CheckpointInfo[];
  /** 待审批请求 */
  pendingApproval: PendingApproval | null;
  /** 上下文用量 */
  contextUsage: ContextUsage | null;
  /** 会话累计用量（按 model_name 索引） */
  sessionUsage: Record<string, SessionUsageStats>;
  /** 各 source 最近使用的模型 */
  sourceModels: Record<string, string>;
  /** 关联目录 */
  linkedDirs: string[];
  /** 是否已连接 */
  isConnected: boolean;
  /** 当前流式消息 ID */
  activeStreamId: string | null;
  /** 历史会话列表 */
  sessions: SessionSummary[];
  /** 多项目分组的历史会话列表 */
  multiSessions: Record<string, SessionSummary[]>;
  /** 项目信息 */
  projectInfo: {
    name: string;
    virtualEnv: string;
  } | null;
  /** 上次使用的工作目录 */
  lastWorkDir: string;
  /** 上次恢复/打开的会话 ID */
  lastSessionId: string;
  /** 撤回后回填到输入框的内容 */
  recallContent: string | null;
  /** Bot 头像 URL */
  avatarUrl: string;
  /** 等待后端响应中（用户已发送消息，等待 bot 首次回复） */
  waitingForBot: boolean;
  /** 可用模型列表 */
  availableModels: string[];
  /** 当前激活的模型 */
  activeModel: string;
  /** 当前选中的预览内容 */
  activePreview: ContentPreviewInfo | null;
  /** 会话输入草稿（sessionId → text） */
  draftTexts: Record<string, string>;
  /** 桌面版模式标记 */
  desktopMode: boolean;
  /** 最近打开的项目目录列表 */
  recentProjects: string[];
  /** 是否已确认图片上传警告 */
  imageUploadConfirmed: boolean;
}

/** 从 localStorage 读取持久化偏好 */
function loadPersistedPrefs(): {
  wsUrl: string;
  theme: "dark" | "light";
  ideMode: boolean;
  lastWorkDir: string;
  lastSessionId: string;
  recentProjects: string[];
  imageUploadConfirmed: boolean;
} {
  try {
    const raw = localStorage.getItem("mofox-code-prefs");
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        wsUrl: parsed.wsUrl || "ws://127.0.0.1:8765/coding-agent/ws",
        theme: parsed.theme === "light" ? "light" : "dark",
        ideMode: !!parsed.ideMode,
        lastWorkDir: "", // 不从 localStorage 恢复，始终以空状态启动
        lastSessionId: "", // 不从 localStorage 恢复，始终以空状态启动
        recentProjects: parsed.recentProjects || [],
        imageUploadConfirmed: parsed.imageUploadConfirmed ?? false,
      };
    }
  } catch { /* ignore */ }
  return {
    wsUrl: "ws://127.0.0.1:8765/coding-agent/ws",
    theme: "light",
    ideMode: false,
    lastWorkDir: "",
    lastSessionId: "",
    recentProjects: [],
    imageUploadConfirmed: false,
  };
}

const persisted = loadPersistedPrefs();

const initialState: SessionState = {
  connectionState: "closed",
  wsUrl: persisted.wsUrl,
  theme: persisted.theme,
  sessionId: "",
  projectName: "",
  title: "",
  phase: "init",
  phaseDetail: "",
  autoReview: false,
  yoloMode: false,
  goalMode: false,
  soloMode: false,
  ideMode: persisted.ideMode,
  messages: [],
  checkpoints: [],
  pendingApproval: null,
  contextUsage: null,
  sessionUsage: {},
  sourceModels: {},
  linkedDirs: [],
  isConnected: false,
  activeStreamId: null,
  sessions: [],
  multiSessions: {},
  projectInfo: null,
  lastWorkDir: persisted.lastWorkDir,
  lastSessionId: persisted.lastSessionId,
  recallContent: null,
  avatarUrl: "/logo.png",
  waitingForBot: false,
  availableModels: [],
  activeModel: "",
  activePreview: null,
  draftTexts: {},
  desktopMode: false,
  recentProjects: persisted.recentProjects,
  imageUploadConfirmed: persisted.imageUploadConfirmed,
};

// ─── Action 类型 ─────────────────────────────────────────

export type SessionAction =
  | { type: "SET_CONNECTION"; payload: ConnectionState }
  | { type: "SET_WS_URL"; payload: string }
  | { type: "SET_THEME"; payload: "dark" | "light" }
  | { type: "SET_AUTO_REVIEW"; payload: boolean }
  | { type: "SET_YOLO_MODE"; payload: boolean }
  | { type: "SET_GOAL_MODE"; payload: boolean }
  | { type: "SET_SOLO_MODE"; payload: boolean }
  | { type: "SET_IDE_MODE"; payload: boolean }
  | { type: "SET_LAST_WORK_DIR"; payload: string }
  | { type: "SET_LAST_SESSION_ID"; payload: string }
  | {
      type: "ADD_LOCAL_MESSAGE";
      payload: {
        role: UIMessage["role"];
        content: string;
        metadata?: Record<string, unknown>;
      };
    }
  | { type: "RESET_SESSION" }
  | { type: "CLEAR_PENDING_APPROVAL" }
  | { type: "SERVER_MESSAGE"; payload: ServerMessage }
  | { type: "SET_RECALL_CONTENT"; payload: string | null }
  | { type: "SET_SESSIONS"; payload: SessionSummary[] }
  | { type: "SET_MULTI_SESSIONS"; payload: Record<string, SessionSummary[]> }
  | { type: "SET_PROJECT_INFO"; payload: { name: string; virtualEnv: string } }
  | { type: "SET_AVATAR_URL"; payload: string }
  | { type: "SET_AVAILABLE_MODELS"; payload: string[] }
  | { type: "SET_ACTIVE_MODEL"; payload: string }
  | { type: "SET_ACTIVE_PREVIEW"; payload: ContentPreviewInfo | null }
  | { type: "SAVE_DRAFT"; payload: { sessionId: string; text: string } }
  | { type: "SET_DESKTOP_MODE"; payload: boolean }
  | { type: "ADD_RECENT_PROJECT"; payload: string }
  | { type: "REMOVE_RECENT_PROJECT"; payload: string }
  | { type: "SET_IMAGE_UPLOAD_CONFIRMED"; payload: boolean };

// ─── Reducer ─────────────────────────────────────────────

function sessionReducer(
  state: SessionState,
  action: SessionAction
): SessionState {
  switch (action.type) {
    case "SET_CONNECTION":
      return {
        ...state,
        connectionState: action.payload,
        isConnected: action.payload === "open",
      };

    case "SET_WS_URL":
      return { ...state, wsUrl: action.payload };

    case "SET_THEME":
      return { ...state, theme: action.payload };

    case "SET_AUTO_REVIEW":
      return { ...state, autoReview: action.payload };

    case "SET_YOLO_MODE":
      return { ...state, yoloMode: action.payload };

    case "SET_GOAL_MODE":
      return { ...state, goalMode: action.payload };

    case "SET_SOLO_MODE":
      return { ...state, soloMode: action.payload };

    case "SET_IDE_MODE":
      return { ...state, ideMode: action.payload };

    case "SET_LAST_WORK_DIR":
      return { ...state, lastWorkDir: action.payload };

    case "SET_LAST_SESSION_ID":
      return { ...state, lastSessionId: action.payload };

    case "ADD_LOCAL_MESSAGE":
      return {
        ...state,
        messages: [
          ...state.messages,
          createUiMessage(
            action.payload.role,
            action.payload.content,
            action.payload.metadata
          ),
        ],
        waitingForBot: action.payload.role === "user" ? true : state.waitingForBot,
      };

    case "RESET_SESSION":
      return {
        ...initialState,
        wsUrl: state.wsUrl,
        theme: state.theme,
        lastWorkDir: state.lastWorkDir,
        lastSessionId: state.lastSessionId,
        sessions: state.sessions,
        multiSessions: state.multiSessions,
        connectionState: state.connectionState,
        isConnected: state.isConnected,
        recallContent: null,
        avatarUrl: state.avatarUrl,
        activePreview: null,
        draftTexts: state.draftTexts,
        ideMode: state.ideMode,
        desktopMode: state.desktopMode,
        recentProjects: state.recentProjects,
        imageUploadConfirmed: state.imageUploadConfirmed,
        projectName: state.projectName,
        projectInfo: state.projectInfo,
        linkedDirs: state.linkedDirs,
      };

    case "CLEAR_PENDING_APPROVAL":
      return {
        ...state,
        pendingApproval: null,
      };

    case "SERVER_MESSAGE":
      return handleServerMessage(state, action.payload);

    case "SET_RECALL_CONTENT":
      return { ...state, recallContent: action.payload };

    case "SET_SESSIONS":
      return { ...state, sessions: action.payload };

    case "SET_MULTI_SESSIONS":
      return { ...state, multiSessions: action.payload };

    case "SET_PROJECT_INFO":
      return { ...state, projectInfo: action.payload };

    case "SET_AVATAR_URL":
      return { ...state, avatarUrl: action.payload };

    case "SET_AVAILABLE_MODELS":
      return { ...state, availableModels: action.payload };

    case "SET_ACTIVE_MODEL":
      return { ...state, activeModel: action.payload };

    case "SET_ACTIVE_PREVIEW":
      return { ...state, activePreview: action.payload };

    case "SAVE_DRAFT":
      return {
        ...state,
        draftTexts: {
          ...state.draftTexts,
          [action.payload.sessionId]: action.payload.text,
        },
      };

    case "SET_DESKTOP_MODE":
      return { ...state, desktopMode: action.payload };

    case "ADD_RECENT_PROJECT": {
      const dir = normalizePath(action.payload.trim());
      if (!dir) return state;
      const filtered = state.recentProjects.filter((p) => normalizePath(p) !== dir);
      return { ...state, recentProjects: [dir, ...filtered].slice(0, 10) };
    }

    case "REMOVE_RECENT_PROJECT": {
      const dir = normalizePath(action.payload.trim());
      if (!dir) return state;
      const newRecent = state.recentProjects.filter((p) => normalizePath(p) !== dir);
      const newMulti = { ...state.multiSessions };
      delete newMulti[dir];
      // Also remove from normalized variants in multiSessions keys
      for (const key of Object.keys(newMulti)) {
        if (normalizePath(key) === dir) {
          delete newMulti[key];
        }
      }
      return {
        ...state,
        recentProjects: newRecent,
        multiSessions: newMulti,
        lastWorkDir: normalizePath(state.lastWorkDir) === dir ? "" : state.lastWorkDir,
      };
    }

    case "SET_IMAGE_UPLOAD_CONFIRMED":
      return { ...state, imageUploadConfirmed: action.payload };

    default:
      return state;
  }
}

function normalizeContextUsage(payload: ContextUsage): ContextUsage {
  const total = payload.total ?? payload.max_context ?? 0;
  const used = payload.used ?? payload.total_tokens ?? 0;
  const percent = total > 0
    ? (used / total) * 100
    : payload.percent ?? 0;
  return {
    ...payload,
    used,
    total,
    percent,
  };
}

function mergeSessionUsage(
  current: Record<string, SessionUsageStats>,
  payload: ContextUsage,
): Record<string, SessionUsageStats> {
  const modelName = (payload.model_name ?? "").trim();
  if (!modelName) {
    return current;
  }

  const next = { ...current };
  const promptTokens = Number(payload.prompt_tokens ?? 0);
  const completionTokens = Number(payload.completion_tokens ?? 0);
  const cacheHitTokens = Number(payload.cache_hit_tokens ?? 0);
  const cost = Number(payload.cost ?? 0);

  if (payload.is_cumulative) {
    next[modelName] = {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cache_hit_tokens: cacheHitTokens,
      cost,
    };
    return next;
  }

  const existing = next[modelName] ?? {
    prompt_tokens: 0,
    completion_tokens: 0,
    cache_hit_tokens: 0,
    cost: 0,
  };
  next[modelName] = {
    prompt_tokens: existing.prompt_tokens + promptTokens,
    completion_tokens: existing.completion_tokens + completionTokens,
    cache_hit_tokens: existing.cache_hit_tokens + cacheHitTokens,
    cost: existing.cost + cost,
  };
  return next;
}

function mergeSourceModels(
  current: Record<string, string>,
  payload: ContextUsage,
): Record<string, string> {
  const source = (payload.source ?? "").trim();
  const modelName = (payload.model_name ?? "").trim();
  if (!source || !modelName) {
    return current;
  }
  if (current[source] === modelName) {
    return current;
  }
  return {
    ...current,
    [source]: modelName,
  };
}

interface NormalizedResearchProgress {
  total: number;
  completed: number;
  percent?: number;
  currentModule: string;
  status: string;
  activeAgents: ResearchProgressPayload["active_agents"];
  scopeSummary: string;
  ignoredPatternsCount: number;
  inProgress: boolean;
  summary: string;
}

function normalizeResearchProgress(payload: ResearchProgressPayload): NormalizedResearchProgress {
  const total = typeof payload.total === "number" ? payload.total : 0;
  const completed = typeof payload.completed === "number" ? payload.completed : 0;
  const currentModule = payload.current_module ?? payload.module ?? "";
  const status = payload.status ?? "";
  const percent = typeof payload.percent === "number"
    ? payload.percent
    : total > 0
      ? (completed / total) * 100
      : undefined;
  const isComplete = (
    (total > 0 && completed >= total)
    || currentModule === "研究完成"
    || status === "completed"
    || percent === 100
  );

  return {
    total,
    completed,
    percent,
    currentModule,
    status,
    activeAgents: payload.active_agents ?? [],
    scopeSummary: payload.scope_summary ?? "",
    ignoredPatternsCount: payload.ignored_patterns_count ?? 0,
    inProgress: !isComplete,
    summary: isComplete
      ? "项目研究完成"
      : `项目研究中: ${currentModule || status || "准备中..."}`,
  };
}

function normalizeTimelineMessage(raw: UIMessage, index: number): UIMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const role = raw.role === "user" || raw.role === "agent" || raw.role === "system"
    ? raw.role
    : "system";
  const content = typeof raw.content === "string"
    ? sanitizeDisplayContent(raw.content)
    : "";
  const metadata = raw.metadata && typeof raw.metadata === "object"
    ? { ...raw.metadata }
    : undefined;
  if (metadata?.kind === "thinking" && isThinkingPlaceholderContent(content)) {
    return null;
  }
  if (metadata?.kind === "tool_call" && metadata?.stage === "planning") {
    return null;
  }
  return createUiMessage(
    role,
    content,
    metadata,
    raw.id || `restored-${index}`,
    typeof raw.timestamp === "number" ? raw.timestamp : Date.now()
  );
}

function normalizeRestoredMessages(messages: UIMessage[]): UIMessage[] {
  const normalized: UIMessage[] = [];

  for (const message of messages) {
    if (message.metadata?.kind === "thinking" && isThinkingPlaceholderContent(message.content)) {
      continue;
    }

    if (isSameMessage(normalized[normalized.length - 1], message)) {
      continue;
    }

    const last = normalized[normalized.length - 1];
    const previous = normalized[normalized.length - 2];
    if (
      message.role === "agent" &&
      last?.role === "system" &&
      last.metadata?.kind === "thinking" &&
      previous?.role === "agent" &&
      isSameMessage(previous, message) &&
      (last.metadata?.source ?? "agent") === (message.metadata?.source ?? "agent")
    ) {
      normalized.splice(normalized.length - 2, 1);
      normalized.push(message);
      continue;
    }

    normalized.push(message);
  }

  return normalized;
}

/** 处理各类 ServerMessage，更新状态 */
function handleServerMessage(
  state: SessionState,
  msg: ServerMessage
): SessionState {
  switch (msg.type) {
    // ── 会话就绪 ──
    case "session.ready": {
      const p = msg.payload;
      const timeline = Array.isArray(p.timeline)
        ? normalizeRestoredMessages(
            p.timeline
            .map((item, index) => normalizeTimelineMessage(item, index))
            .filter((item): item is UIMessage => item !== null)
          )
        : [];
      const history: UIMessage[] = timeline.length > 0
        ? timeline
        : (p.history ?? [])
            .filter((h) => h.role !== "system")
            .map((h, i) => createUiMessage(
              h.role === "user" ? "user" : "agent",
              sanitizeDisplayContent(h.content),
              undefined,
              `hist-${i}`
            ));
      const mismatch = p.working_directory_mismatch?.trim();
      const restoredMessages = mismatch
        ? [
            ...history,
            createUiMessage("system", mismatch, {
              kind: "link_result",
              success: false,
              status: "warning",
            }),
          ]
        : history;
      const pendingLocal = state.messages.filter((m) => m.metadata?.local_pending);
      // 确保当前会话出现在侧栏列表中（新建会话时 session.list_result 可能还没到）
      const alreadyInList = state.sessions.some((s) => s.session_id === p.session_id);
      const updatedSessions = alreadyInList
        ? state.sessions.map((s) =>
            s.session_id === p.session_id
              ? { ...s, title: p.title || s.title, phase: p.phase ?? s.phase }
              : s
          )
        : [
            {
              session_id: p.session_id,
              title: p.title || p.session_id.slice(0, 8),
              created_at: Date.now() / 1000,
              last_active_at: Date.now() / 1000,
              message_count: p.checkpoints?.length ?? 0,
              phase: p.phase ?? "init",
            },
            ...state.sessions,
          ];
      return {
        ...state,
        connectionState: "open",
        isConnected: true,
        sessionId: p.session_id,
        lastSessionId: p.session_id,
        projectName: p.project_name,
        lastWorkDir: p.working_directory || state.lastWorkDir,
        title: p.title,
        phase: p.phase ?? state.phase,
        phaseDetail: "",
        soloMode: p.solo_mode,
        autoReview: Boolean(p.auto_review_enabled),
        yoloMode: Boolean(p.yolo_mode),
        messages: normalizeRestoredMessages([...restoredMessages, ...pendingLocal]),
        checkpoints: p.checkpoints ?? [],
        pendingApproval: null,
        contextUsage: null,
        sessionUsage: p.usage_total
          ? (p.usage_total as Record<string, SessionUsageStats>)
          : (state.sessionId === p.session_id ? state.sessionUsage : {}),
        sourceModels: state.sessionId === p.session_id ? state.sourceModels : {},
        activeStreamId: null,
        waitingForBot: false,
        availableModels: p.available_models ?? state.availableModels,
        activeModel: p.active_model ?? state.activeModel,
        sessions: updatedSessions,
      };
    }

    // ── 项目打开 ──
    case "project.opened": {
      const p = msg.payload;
      const wd = normalizePath(p.working_directory);
      const newRecent = wd
        ? [wd, ...state.recentProjects.filter((pr) => normalizePath(pr) !== wd)].slice(0, 10)
        : state.recentProjects;
      return {
        ...state,
        connectionState: "open",
        isConnected: true,
        lastWorkDir: wd,
        projectName: p.project_name,
        sessions: p.sessions,
        sessionId: "",
        messages: [],
        checkpoints: [],
        pendingApproval: null,
        contextUsage: null,
        sessionUsage: {},
        sourceModels: {},
        activeStreamId: null,
        phaseDetail: "",
        phase: "init",
        recentProjects: newRecent,
      };
    }

    // ── Agent 状态变化 ──
    case "agent.status": {
      const source = msg.payload.source ?? "agent";
      if (msg.payload.phase !== "thinking") {
        // 当离开 thinking 阶段时，把所有 pending=true 的 thinking 消息改成 pending=false（即完成思考，折叠面板）
        let nextMsgs = state.messages.map(m => {
          if (m.role === "system" && m.metadata?.kind === "thinking" && m.metadata?.source === source && m.metadata?.pending) {
            return {
              ...m,
              metadata: { ...m.metadata, pending: false, thinking_elapsed: Date.now() - (m.timestamp ?? 0) }
            };
          }
          return m;
        });

        // 如果阶段发生了改变（例如从 thinking 变成 ready/coding 等），也将还在 streaming 的文本块封口
        nextMsgs = closeStreamingForSource(nextMsgs, source);

        // 过滤掉空内容且已关闭的 thinking 气泡（残留清理）
        nextMsgs = nextMsgs.filter(m => {
          if (m.role === "system" && m.metadata?.kind === "thinking" && !m.metadata?.pending && isThinkingPlaceholderContent(m.content)) {
            return false;
          }
          return true;
        });

        return {
          ...state,
          phase: msg.payload.phase,
          phaseDetail: msg.payload.detail ?? "",
          waitingForBot: false,
          messages: nextMsgs,
          activeStreamId: msg.payload.phase === "ready" ? null : state.activeStreamId,
        };
      }

      // 如果进入了 thinking 阶段，也给先前的文本流封口
      // 不再无条件创建空 thinking bubble（留给后续 agent.thinking 消息处理）
      const nextMsgs = closeStreamingForSource(state.messages, source);

      return {
        ...state,
        phase: msg.payload.phase,
        phaseDetail: msg.payload.detail ?? "",
        waitingForBot: false,
        messages: nextMsgs,
      };
    }

    // ── Agent 文本流 ──
    case "agent.text": {
      const p = msg.payload;
      const source = p.source ?? p.stream_id ?? "agent";
      const text = p.content ?? p.text ?? "";
      const isFinal = Boolean(p.is_final);
      const msgs = [...state.messages];
      const existingIdx = findLastStreamingAgentIndex(msgs, source);

      if (text) {
        if (existingIdx >= 0) {
          // 追加到当前正在流式的同一气泡
          const existing = msgs[existingIdx];
          const nextContent = (isFinal && text.startsWith(existing.content))
            ? text   // 最终块通常包含完整文本，直接替换
            : existing.content + text;
          msgs[existingIdx] = {
            ...existing,
            content: nextContent,
            metadata: {
              ...existing.metadata,
              source,
              streaming: !isFinal,
              ...(p.forkable !== undefined ? { forkable: Boolean(p.forkable) } : {}),
              ...(isFinal && typeof p.message_id === "string" && p.message_id ? { message_id: p.message_id } : {}),
            },
          };
        } else {
          // 没有正在流式的消息 → 创建新气泡
          msgs.push(createUiMessage("agent", text, {
            source,
            streaming: !isFinal,
            ...(p.forkable !== undefined ? { forkable: Boolean(p.forkable) } : {}),
          }, typeof p.message_id === "string" && p.message_id ? p.message_id : undefined));
        }
      }

      if (isFinal) {
        const finalIdx = findLastStreamingAgentIndex(msgs, source);
        if (finalIdx >= 0) {
          msgs[finalIdx] = {
            ...msgs[finalIdx],
            metadata: {
              ...msgs[finalIdx].metadata,
              source,
              streaming: false,
            },
          };
        }
        return {
          ...state,
          activeStreamId: null,
          waitingForBot: false,
          messages: msgs,
        };
      }

      if (!text) {
        return { ...state, waitingForBot: false };
      }

      return {
        ...state,
        activeStreamId: source,
        waitingForBot: false,
        messages: msgs,
      };
    }

    // ── 用户消息落库确认 ──
    case "user.message_recorded": {
      const { client_message_id, message_id, checkpoint_id } = msg.payload;
      let changed = false;
      const nextMessages = state.messages.map((message) => {
        if (message.role !== "user") return message;
        if (message.metadata?.client_message_id !== client_message_id) return message;
        changed = true;
        return {
          ...message,
          metadata: {
            ...message.metadata,
            message_id: message_id || message.metadata?.message_id,
            local_pending: false,
            checkpoint_id: checkpoint_id || message.metadata?.checkpoint_id,
            revocable: Boolean(checkpoint_id || message.metadata?.checkpoint_id),
          },
        };
      });
      return changed ? { ...state, messages: nextMessages } : state;
    }

    // ── Agent 思考过程 ──
    case "agent.thinking": {
      const content = msg.payload.content ?? msg.payload.text ?? "";
      const source = msg.payload.source ?? "agent";
      if (!content.trim()) return { ...state, waitingForBot: false };
      const msgs = [...state.messages];
      const thinkingIdx = findLastThinkingIndex(msgs, source, { pendingOnly: true });
      if (thinkingIdx >= 0) {
        msgs[thinkingIdx] = {
          ...msgs[thinkingIdx],
          content,
          metadata: {
            ...msgs[thinkingIdx].metadata,
            // 保持 pending 为 true，由 agent.status 结束阶段时再置为 false
            pending: true,
          },
        };
        return { ...state, waitingForBot: false, messages: msgs };
      }
      return {
        ...state,
        waitingForBot: false,
        messages: [
          ...msgs,
          createUiMessage("system", content, {
            kind: "thinking",
            source,
            pending: true,
          }),
        ],
      };
    }

    // ── 上下文用量 ──
    case "agent.context_usage": {
      return {
        ...state,
        contextUsage: normalizeContextUsage(msg.payload),
        sessionUsage: mergeSessionUsage(state.sessionUsage, msg.payload),
        sourceModels: mergeSourceModels(state.sourceModels, msg.payload),
      };
    }

    // ── 上下文压缩中 ──
    case "agent.context_compressing": {
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: `compress-${Date.now()}`,
            role: "system",
            content: "正在压缩上下文...",
            timestamp: Date.now(),
            metadata: { kind: "compressing" },
          },
        ],
      };
    }

    // ── 工具调用 ──
    case "tool.call": {
      const p = msg.payload;
      const source = p.source ?? "agent";

      let nextMsgs = closePendingThinkingForSource(state.messages, source);
      nextMsgs = closeStreamingForSource(nextMsgs, source);

      const callId = typeof p.call_id === "string" ? p.call_id : "";
      if (callId) {
        const existingIdx = nextMsgs.findIndex(
          (m) => m.role === "system" && m.metadata?.kind === "tool_call" && m.metadata?.call_id === callId
        );
        if (existingIdx >= 0) {
          const existing = nextMsgs[existingIdx];
          nextMsgs[existingIdx] = {
            ...existing,
            content: p.args_summary || p.name || p.tool_name || existing.content,
            metadata: {
              ...existing.metadata,
              call_id: callId,
              tool_name: p.name || p.tool_name || existing.metadata?.tool_name || "unknown",
              args: p.args ?? existing.metadata?.args ?? {},
              args_summary: p.args_summary ?? existing.metadata?.args_summary ?? "",
              source,
              stage: p.stage ?? p.status ?? existing.metadata?.stage ?? "running",
            },
          };
          return {
            ...state,
            activeStreamId: null,
            messages: nextMsgs,
          };
        }
      }

      // 将之前所有 running 状态的 tool_call 标记为 completed
      nextMsgs = nextMsgs.map((m) => {
        if (m.role === "system" && m.metadata?.kind === "tool_call" && m.metadata?.stage === "running") {
          return { ...m, metadata: { ...m.metadata, stage: "completed" } };
        }
        return m;
      });
      
      return {
        ...state,
        activeStreamId: null,
        messages: [
          ...nextMsgs,
          createUiMessage("system", p.args_summary || p.name || p.tool_name || "", {
            call_id: callId,
            kind: "tool_call",
            tool_name: p.name || p.tool_name || "unknown",
            args: p.args ?? {},
            args_summary: p.args_summary ?? "",
            source,
            stage: p.stage ?? p.status ?? "running",
          }, `tool-${p.call_id ?? Date.now()}`),
        ],
      };
    }

    // ── Console 审批请求 ──
    case "console.approval_request": {
      const p = msg.payload;
      return {
        ...state,
        pendingApproval: {
          request_id: p.request_id,
          command: p.command,
          working_dir: p.working_dir,
          context: p.context,
          auto_review_result: p.auto_review_result,
        },
      };
    }

    // ── Console 输出 ──
    case "console.output": {
      const p = msg.payload;
      const content = p.content ?? p.output ?? "";
      if (!content) return state;
      // 将最近一个 stage 为 "running" 的 tool_call 标记为 "completed"
      const updatedMessages = [...state.messages];
      for (let i = updatedMessages.length - 1; i >= 0; i -= 1) {
        const m = updatedMessages[i];
        if (m.role === "system" && m.metadata?.kind === "tool_call" && m.metadata?.stage === "running") {
          updatedMessages[i] = { ...m, metadata: { ...m.metadata, stage: "completed" } };
          break;
        }
      }
      return {
        ...state,
        messages: [
          ...updatedMessages,
          createUiMessage("system", content, {
            kind: "console_output",
            exit_code: p.exit_code,
            stream: p.stream ?? "stdout",
          }, `console-${p.call_id ?? Date.now()}`),
        ],
      };
    }

    // ── 检查点创建 ──
    case "checkpoint.created": {
      const checkpoint = msg.payload;
      const alreadyTracked = state.checkpoints.some((cp) => cp.id === checkpoint.id);
      return {
        ...state,
        checkpoints: alreadyTracked ? state.checkpoints : [...state.checkpoints, checkpoint],
        messages: alreadyTracked
          ? state.messages
          : [
              ...state.messages,
              createUiMessage("system", checkpoint.description, {
                kind: "checkpoint_created",
                ...checkpoint,
              }, `checkpoint-${checkpoint.id}`),
            ],
      };
    }

    // ── 检查点列表结果 ──
    case "checkpoint.list_result": {
      return {
        ...state,
        checkpoints: msg.payload.checkpoints,
      };
    }

    // ── 检查点回滚结果 ──
    case "checkpoint.rollback_result": {
      const p = msg.payload;
      return {
        ...state,
        checkpoints: state.checkpoints.filter(
          (cp) => !p.rolled_back.includes(cp.id)
        ),
        messages: [
          ...state.messages,
          createUiMessage(
            "system",
            `回滚完成\n恢复文件: ${p.restored_files.join(", ") || "无"}\n警告: ${p.warnings.join(", ") || "无"}`,
            { kind: "rollback_result" },
            `rollback-${Date.now()}`
          ),
        ],
      };
    }

    // ── 文件变更 ──
    case "file.change": {
      const p = msg.payload;
      const changeType = p.action ?? p.change_type ?? "modify";
      return {
        ...state,
        messages: [
          ...state.messages,
          createUiMessage(
            "system",
            `文件变更 [${changeType}]: ${p.path}${p.diff ? `\n\`\`\`diff\n${p.diff}\n\`\`\`` : ""}`,
            {
              kind: "file_change",
              change_type: changeType,
              path: p.path,
              diff: p.diff,
              content: p.content,
            },
            `file-${Date.now()}`
          ),
        ],
      };
    }

    // ── 研究进度 ──
    case "research.progress": {
      const p = msg.payload;
      const normalized = normalizeResearchProgress(p);
      const nextMetadata = {
        kind: "research_progress",
        total: normalized.total,
        completed: normalized.completed,
        percent: normalized.percent,
        current_module: normalized.currentModule,
        status: normalized.status,
        active_agents: normalized.activeAgents ?? [],
        scope_summary: normalized.scopeSummary,
        ignored_patterns_count: normalized.ignoredPatternsCount,
        in_progress: normalized.inProgress,
      };

      const nextMessages = [...state.messages];
      let existingIdx = -1;
      for (let i = nextMessages.length - 1; i >= 0; i -= 1) {
        const message = nextMessages[i];
        if (message.role === "system" && message.metadata?.kind === "research_progress" && message.metadata?.in_progress !== false) {
          existingIdx = i;
          break;
        }
      }

      if (existingIdx >= 0) {
        nextMessages[existingIdx] = {
          ...nextMessages[existingIdx],
          content: normalized.summary,
          metadata: {
            ...nextMessages[existingIdx].metadata,
            ...nextMetadata,
          },
        };
        return {
          ...state,
          messages: nextMessages,
        };
      }

      return {
        ...state,
        messages: [
          ...nextMessages,
          createUiMessage(
            "system",
            normalized.summary,
            nextMetadata,
            `research-${Date.now()}`
          ),
        ],
      };
    }

    // ── 目标完成 ──
    case "goal.complete": {
      return {
        ...state,
        goalMode: false,
        messages: [
          ...state.messages,
          createUiMessage("system", "目标已完成", { kind: "goal_complete" }, `goal-${Date.now()}`),
        ],
      };
    }

    // ── Link 结果 ──
    case "link.result": {
      const p = msg.payload;
      const newDirs = p.directories ?? [];
      const success = p.success ?? (p.status === "ok" || p.status === "already_linked");
      return {
        ...state,
        linkedDirs: success
          ? [...new Set([...state.linkedDirs, ...newDirs])]
          : state.linkedDirs,
        messages: [
          ...state.messages,
          createUiMessage(
            "system",
            p.message ?? (success ? "目录关联成功" : "目录关联失败"),
            { kind: "link_result", ...p, success },
            `link-${Date.now()}`
          ),
        ],
      };
    }

    // ── 会话列表结果 ──
    case "session.list_result": {
      return {
        ...state,
        sessions: msg.payload.sessions,
      };
    }
    // ── 多项目历史会话列表 ──
    case "session.list_multi_result": {
      return {
        ...state,
        multiSessions: msg.payload.projects || {},
      };
    }
    // ── 会话删除结果 ──
    case "session.delete_result": {
      return state;
    }
    // ── 会话重命名结果 ──
    case "session.rename_result": {
      const p = msg.payload;
      const renamedId = p.session_id;
      const renamedTitle = p.title;
      return {
        ...state,
        // 更新 sessions 列表中对应会话的标题
        sessions: state.sessions.map((s) =>
          s.session_id === renamedId ? { ...s, title: renamedTitle } : s
        ),
        // 如果是当前会话，同步更新顶部标题
        ...(state.sessionId === renamedId ? { title: renamedTitle } : {}),
      };
    }
    // ── 模型列表 ──
    case "model.list_result": {
      const p = msg.payload;
      return {
        ...state,
        availableModels: p.models ?? [],
      };
    }
    // ── 模型选择确认 ──
    case "model.selected": {
      const p = msg.payload;
      return {
        ...state,
        activeModel: p.model_name ?? state.activeModel,
      };
    }

    // ── 错误消息 ──
    case "error": {
      const p = msg.payload;
      const errorMsg = p.message || "未知错误";
      return {
        ...state,
        messages: [
          ...state.messages,
          createUiMessage("system", `❌ ${errorMsg}`, { kind: "error" }, `error-${Date.now()}`),
        ],
      };
    }

    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────

const SessionStateContext = createContext<SessionState | null>(null);
const SessionDispatchContext = createContext<React.Dispatch<SessionAction> | null>(null);

export { SessionStateContext, SessionDispatchContext };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sessionReducer, initialState);

  return (
    <SessionDispatchContext.Provider value={dispatch}>
      <SessionStateContext.Provider value={state}>
        {children}
      </SessionStateContext.Provider>
    </SessionDispatchContext.Provider>
  );
}
