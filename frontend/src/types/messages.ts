/**
 * WebSocket 消息类型系统
 *
 * 覆盖 Coding Agent 后端 adapter.py 中所有入站(服务器→客户端)和出站(客户端→服务器)消息类型。
 *
 * 入站:  18 种 ServerMessage
 * 出站:  13 种 ClientMessage
 */

// ─── 基础结构 ───────────────────────────────────────────

export interface BaseMessage {
  type: string;
  id?: string;
  session_id?: string;
  payload?: Record<string, unknown>;
  timestamp?: number;
}

// ─── 共享数据结构 ─────────────────────────────────────────

export interface HistoryItem {
  role: string;
  content: string;
}

export interface SessionSummary {
  session_id: string;
  title: string;
  created_at: number;
  last_active_at: number;
  message_count: number;
  phase: string;
}

export interface CheckpointInfo {
  id: string;
  step: number;
  tool: string;
  description: string;
  files_affected: number;
  reversible: boolean;
  timestamp?: number;
  agent?: string;
}

export interface ContextUsage {
  used?: number;
  total?: number;
  percent: number;
  total_tokens?: number;
  max_context?: number;
  source?: string;
  model_name?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  cache_hit_tokens?: number;
  cache_write_tokens?: number;
  reasoning_tokens?: number;
  cost?: number;
  request_count?: number;
  is_cumulative?: boolean;
}

export interface SessionUsageStats {
  prompt_tokens: number;
  completion_tokens: number;
  cache_hit_tokens: number;
  cost: number;
}

export interface ToolCallPayload {
  name?: string;
  tool_name?: string;
  args?: Record<string, unknown>;
  args_summary?: string;
  source?: string;
  stage?: string;
  call_id?: string;
  status?: string;
}

export interface ConsoleApprovalRequestPayload {
  request_id: string;
  command: string;
  working_dir: string;
  working_directory: string;
  context: string;
  auto_review_result?: unknown;
}

export interface ConsoleOutputPayload {
  content?: string;
  output?: string;
  stream?: string;
  is_final?: boolean;
  exit_code?: number;
  call_id?: string;
}

export interface FileChangePayload {
  path: string;
  action?: string;
  change_type?: string;
  diff?: string;
  content?: string;
}

export interface ResearchAgentProgress {
  name?: string;
  module_path?: string;
  focus?: string;
}

export interface ResearchProgressPayload {
  total?: number;
  completed?: number;
  current_module?: string;
  active_agents?: ResearchAgentProgress[];
  scope_summary?: string;
  ignored_patterns_count?: number;
  module?: string;
  status?: string;
  percent?: number;
}

export interface LinkResultPayload {
  path?: string;
  status?: string;
  project_name?: string;
  virtual_environment?: string;
  research_triggered?: boolean;
  message?: string;
  success?: boolean;
  directories?: string[];
}

export interface RollbackResultPayload {
  rolled_back: string[];
  restored_files: string[];
  warnings: string[];
}

export interface UserMessageRecordedPayload {
  client_message_id: string;
  message_id: string;
  checkpoint_id?: string;
}

export interface ContentPreviewInfo {
  type: "code" | "markdown";
  content: string;
  language?: string;
  path?: string;
  title?: string;
  messageId?: string; // Add messageId to uniquely identify which message opened this
}

// ─── 入站消息(服务器→客户端) ─────────────────────────────

export interface SessionReadyMessage {
  type: "session.ready";
  payload: {
    session_id: string;
    project_name: string;
    working_directory?: string;
    title: string;
    phase?: string;
    solo_mode: boolean;
    active_model?: string;
    available_models?: string[];
    auto_review_enabled?: boolean;
    yolo_mode?: boolean;
    checkpoints?: CheckpointInfo[];
    history?: HistoryItem[];
    timeline?: UIMessage[];
    working_directory_mismatch?: string;
    usage_total?: Record<string, { prompt_tokens: number; completion_tokens: number; cache_hit_tokens: number; cost: number; }>;
  };
}

export interface SessionListResultMessage {
  type: "session.list_result";
  payload: {
    sessions: SessionSummary[];
  };
}

export interface ProjectOpenedMessage {
  type: "project.opened";
  payload: {
    working_directory: string;
    project_name: string;
    sessions: SessionSummary[];
  };
}

export interface SessionListMultiResultMessage {
  type: "session.list_multi_result";
  payload: {
    projects: Record<string, SessionSummary[]>;
  };
}

export interface SessionDeleteResultMessage {
  type: "session.delete_result";
  payload: {
    session_id: string;
    success: boolean;
  };
}

export interface SessionRenameResultMessage {
  type: "session.rename_result";
  payload: {
    session_id: string;
    title: string;
    success: boolean;
  };
}

export interface AgentStatusMessage {
  type: "agent.status";
  payload: {
    phase: string;
    detail?: string;
    source?: string;
  };
}

export interface AgentTextMessage {
  type: "agent.text";
  payload: {
    content?: string;
    text?: string;
    is_final?: boolean;
    source?: string;
    stream_id?: string;
    message_id?: string;
    forkable?: boolean;
  };
}

export interface AgentThinkingMessage {
  type: "agent.thinking";
  payload: {
    content?: string;
    text?: string;
    source?: string;
  };
}

export interface UserMessageRecordedMessage {
  type: "user.message_recorded";
  payload: UserMessageRecordedPayload;
}

export interface AgentContextUsageMessage {
  type: "agent.context_usage";
  payload: ContextUsage;
}

export interface AgentContextCompressingMessage {
  type: "agent.context_compressing";
  payload: Record<string, never>;
}

export interface ToolCallMessage {
  type: "tool.call";
  payload: ToolCallPayload;
}

export interface ConsoleApprovalRequestMessage {
  type: "console.approval_request";
  payload: ConsoleApprovalRequestPayload;
}

export interface ConsoleOutputMessage {
  type: "console.output";
  payload: ConsoleOutputPayload;
}

export interface CheckpointCreatedMessage {
  type: "checkpoint.created";
  payload: CheckpointInfo;
}

export interface CheckpointListResultMessage {
  type: "checkpoint.list_result";
  payload: {
    checkpoints: CheckpointInfo[];
  };
}

export interface CheckpointRollbackResultMessage {
  type: "checkpoint.rollback_result";
  payload: RollbackResultPayload;
}

export interface FileChangeMessage {
  type: "file.change";
  payload: FileChangePayload;
}

export interface ResearchProgressMessage {
  type: "research.progress";
  payload: ResearchProgressPayload;
}

export interface ErrorMessage {
  type: "error";
  payload: {
    message?: string;
  };
}

export interface GoalCompleteMessage {
  type: "goal.complete";
  payload: Record<string, never>;
}

export interface LinkResultMessage {
  type: "link.result";
  payload: LinkResultPayload;
}

export interface BrowseDirectoryResultMessage {
  type: "browse.directory_result";
  payload: BrowseDirectoryResultPayload;
}

export interface ModelListResultMessage {
  type: "model.list_result";
  payload: {
    models: string[];
  };
}

export interface ModelSelectedMessage {
  type: "model.selected";
  payload: {
    model_name: string;
  };
}

export interface PongMessage {
  type: "pong";
  id?: string;
  payload: Record<string, never>;
}

// ─── Skill ───────────────────────────────────────────────

export interface SkillInfo {
  name: string;
  description: string;
}

export interface SkillListResultMessage {
  type: "skill.list_result";
  payload: {
    skills: SkillInfo[];
  };
}

/** 所有入站消息类型的联合 */
export type ServerMessage =
  | SessionReadyMessage
  | SessionListResultMessage
  | SessionListMultiResultMessage
  | SessionDeleteResultMessage
  | SessionRenameResultMessage
  | AgentStatusMessage
  | AgentTextMessage
  | AgentThinkingMessage
  | UserMessageRecordedMessage
  | AgentContextUsageMessage
  | AgentContextCompressingMessage
  | ToolCallMessage
  | ConsoleApprovalRequestMessage
  | ConsoleOutputMessage
  | CheckpointCreatedMessage
  | CheckpointListResultMessage
  | CheckpointRollbackResultMessage
  | FileChangeMessage
  | ResearchProgressMessage
  | ErrorMessage
  | GoalCompleteMessage
  | LinkResultMessage
  | BrowseDirectoryResultMessage
  | ProjectOpenedMessage
  | ModelListResultMessage
  | ModelSelectedMessage
  | PongMessage
  | SkillListResultMessage;

// ─── 出站消息(客户端→服务器) ─────────────────────────────

export interface SessionInitPayload {
  working_directory: string;
  session_id?: string;
  solo_mode?: boolean;
  solo_model?: string;
}

export interface UserMessagePayload {
  content: string;
  kind?: "message" | "guidance";
}

export interface SessionListPayload {
  working_directory?: string;
}

export interface SessionDeletePayload {
  session_id: string;
}

export interface ConsoleApprovalPayload {
  request_id: string;
  decision: "approve" | "deny";
  prefix?: string;
  reason?: string;
}

export interface UserInterruptPayload {
  reason?: string;
}

export interface AutoReviewTogglePayload {
  enabled: boolean;
}

export interface YoloTogglePayload {
  enabled: boolean;
}

export interface GoalSetPayload {
  text: string;
}

export interface CheckpointRollbackPayload {
  mode: "last" | "to";
  checkpoint_id?: string;
}

export interface CheckpointListPayload {
  session_id?: string;
}

export interface SessionLinkPayload {
  path: string;
}

export interface SessionClosePayload {
  session_id?: string;
}

export interface SessionUndoUserMessagePayload {
  message_id: string;
}

export interface SessionForkPayload {
  anchor_message_id: string;
}

export interface SessionRenamePayload {
  session_id: string;
  title: string;
}

export interface BrowseDirectoryResultPayload {
  path: string;
  parent: string | null;
  entries: Array<{ name: string; is_dir: boolean }>;
  error?: string;
}

export interface ClientMessage {
  type:
    | "session.init"
    | "project.open"
    | "user.message"
    | "session.list"
    | "session.list_multi"
    | "session.delete"
    | "session.rename"
    | "console.approval"
    | "user.interrupt"
    | "auto_review.toggle"
    | "yolo.toggle"
    | "solo.toggle"
    | "goal.set"
    | "checkpoint.rollback"
    | "checkpoint.list"
    | "session.link"
    | "session.undo_user_message"
    | "session.fork"
    | "session.close"
    | "browse.directory"
    | "model.list"
    | "model.select"
    | "skill.list";
  id?: string;
  session_id?: string;
  payload: unknown;
  timestamp?: number;
}

// ─── UI 消息模型 ─────────────────────────────────────────

export type MessageRole = "user" | "agent" | "system";

export interface UIMessage {
  id: string;
  role: MessageRole;
  content: string;
  stream_id?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface PendingApproval {
  request_id: string;
  command: string;
  working_dir: string;
  context: string;
  auto_review_result?: unknown;
}

export type ConnectionState =
  | "connecting"
  | "open"
  | "closing"
  | "closed"
  | "reconnecting";

// ─── UI 配置 ─────────────────────────────────────────────

export interface UIConfig {
  title: string;
  default_theme: string;
  avatar_url: string;
  desktop_mode?: boolean;
}
