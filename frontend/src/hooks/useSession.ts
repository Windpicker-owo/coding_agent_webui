/**
 * Session React Hooks
 *
 * 从 SessionContext 中提取出的独立 hooks，避免 fast-refresh 问题。
 */

import { useContext, useCallback } from "react";
import { SessionDispatchContext, SessionStateContext } from "../contexts/SessionContext.tsx";
import { getWSClient } from "../utils/ws-client.ts";
import type { SessionState, SessionAction } from "../contexts/SessionContext.tsx";

/** 使用会话状态 */
export function useSession(): SessionState {
  const state = useContext(SessionStateContext);
  if (!state) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return state;
}

/** 使用会话 dispatch */
export function useSessionDispatch(): React.Dispatch<SessionAction> {
  const dispatch = useContext(SessionDispatchContext);
  if (!dispatch) {
    throw new Error("useSessionDispatch must be used within SessionProvider");
  }
  return dispatch;
}

/** 发送用户消息的便捷 hook */
export function useSendUserMessage(): (content: string, kind?: "message" | "guidance") => void {
  return useCallback((content: string, kind: "message" | "guidance" = "message") => {
    const client = getWSClient();
    try {
      client.send("user.message", { content, kind });
    } catch (err) {
      console.error("发送消息失败:", err);
    }
  }, []);
}
