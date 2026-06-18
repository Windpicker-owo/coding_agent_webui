/**
 * 消息工具函数 — 供 SessionContext 与 UI 组件共享
 */

import type { UIMessage } from "../types/messages";

const TOOL_PREFIX_PATTERN = /^(?:tool|action|agent)-+/i;

// ─── 指纹与去重 ──────────────────────────────────────────

export function getMessageFingerprint(message: UIMessage): string {
  return JSON.stringify({
    role: message.role,
    content: message.content,
    kind: message.metadata?.kind ?? "",
    source: message.metadata?.source ?? "",
    stage: message.metadata?.stage ?? "",
    tool_name: message.metadata?.tool_name ?? "",
    args_summary: message.metadata?.args_summary ?? "",
    call_id: message.metadata?.call_id ?? "",
    path: message.metadata?.path ?? "",
    step: message.metadata?.step ?? "",
  });
}

export function isSameMessage(left: UIMessage | undefined, right: UIMessage): boolean {
  if (!left) return false;
  return getMessageFingerprint(left) === getMessageFingerprint(right);
}

export function normalizeToolName(name: string): string {
  return String(name ?? "").trim().replace(TOOL_PREFIX_PATTERN, "");
}

// ─── 内容清理 ────────────────────────────────────────────

export function sanitizeDisplayContent(text: string): string {
  let clean = String(text ?? "");
  let previous = "";

  while (clean !== previous) {
    previous = clean;
    clean = clean
      .replace(
        /^\s*(?:【\d{1,2}:\d{2}(?::\d{2})?】|^\d{1,2}:\d{2}(?::\d{2})?\s*)?(?:<成员>|【成员】)\s*[^\n]*?[：:]\s*/,
        ""
      )
      .replace(/【工作中追加引导】\n/g, "")
      .replace(/<system_reminder>[\s\S]*?<\/system_reminder>/g, "");
  }

  return clean.trim();
}

export function isThinkingPlaceholderContent(text: string): boolean {
  const clean = sanitizeDisplayContent(text);
  return clean === "" || clean === "正在思考...";
}

// ─── 消息工厂 ────────────────────────────────────────────

export function createUiMessage(
  role: UIMessage["role"],
  content: string,
  metadata?: Record<string, unknown>,
  id?: string,
  timestamp?: number
): UIMessage {
  const msg: UIMessage = {
    id: id ?? `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    timestamp: timestamp ?? Date.now(),
  };
  if (metadata && Object.keys(metadata).length > 0) {
    msg.metadata = metadata;
  }
  return msg;
}

// ─── 流式/思考索引查找 ──────────────────────────────────

export function findLastStreamingAgentIndex(messages: UIMessage[], source: string): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg.role !== "agent") continue;
    if (msg.metadata?.source !== source) continue;
    if (msg.metadata?.streaming) return i;
  }
  return -1;
}

export function findLastThinkingIndex(
  messages: UIMessage[],
  source: string,
  options?: { pendingOnly?: boolean }
): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg.role !== "system") continue;
    if (msg.metadata?.kind !== "thinking") continue;
    if ((msg.metadata?.source ?? "agent") !== source) continue;
    if (options?.pendingOnly && msg.metadata?.pending !== true) continue;
    return i;
  }
  return -1;
}

// ─── 关闭流/思考状态 ─────────────────────────────────────

export function closePendingThinkingForSource(messages: UIMessage[], source: string): UIMessage[] {
  return messages.map((msg) => {
    if (
      msg.role === "system" &&
      msg.metadata?.kind === "thinking" &&
      (msg.metadata?.source ?? "agent") === source &&
      msg.metadata?.pending === true
    ) {
      return { ...msg, metadata: { ...msg.metadata, pending: false, thinking_elapsed: Date.now() - (msg.timestamp ?? 0) } };
    }
    return msg;
  });
}

export function closeStreamingForSource(messages: UIMessage[], source: string): UIMessage[] {
  return messages.map((msg) => {
    if (msg.role === "agent" && msg.metadata?.source === source && msg.metadata?.streaming) {
      return { ...msg, metadata: { ...msg.metadata, streaming: false } };
    }
    return msg;
  });
}
