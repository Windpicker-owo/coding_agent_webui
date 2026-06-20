/**
 * WebSocket 客户端封装
 *
 * 功能:
 * - 连接管理 (connect/disconnect)
 * - 自动重连 (最多 5 次, 指数退避)
 * - 消息发送 (send)
 * - 观察者模式事件分发 (on/off)
 * - 消息 ID 生成和 session_id 自动注入
 */

import type { ServerMessage, ClientMessage } from "../types/messages";

let _singleton: WSClient | null = null;

/** 获取全局 WSClient 单例 */
export function getWSClient(): WSClient {
  if (!_singleton) {
    _singleton = new WSClient();
  }
  return _singleton;
}

/** 生成 UUID v4 */
function generateUUID(): string {
  return crypto.randomUUID();
}

/** 消息处理器类型 */
export type MessageHandler = (msg: ServerMessage) => void;

export class WSClient {
  private _ws: WebSocket | null = null;
  private _url = "";
  private _sessionId = "";
  private _handlers: Map<string, Set<MessageHandler>> = new Map();
  private _allHandlers: Set<MessageHandler> = new Set();
  private _reconnectCount = 0;
  private _maxReconnect = 5;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _listeners = new Set<(state: "open" | "closed" | "error") => void>();
  private _pingInterval: ReturnType<typeof setInterval> | null = null;
  private _lastPongTime = 0;

  /** 当前连接状态 */
  get readyState(): number {
    return this._ws?.readyState ?? WebSocket.CLOSED;
  }

  get isConnected(): boolean {
    return this._ws?.readyState === WebSocket.OPEN;
  }

  get sessionId(): string {
    return this._sessionId;
  }

  setSessionId(id: string): void {
    this._sessionId = id;
  }

  /** 建立 WebSocket 连接 */
  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this._ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this._url = url;
      this._reconnectCount = 0;

      try {
        this._ws = new WebSocket(url);

        this._ws.onopen = () => {
          this._reconnectCount = 0;
          this._lastPongTime = Date.now();
          this._startHeartbeat();
          this._notifyStateChange("open");
          resolve();
        };

        this._ws.onmessage = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data as string) as ServerMessage;
            if (data.type === "pong") {
              this._lastPongTime = Date.now();
            }
            this._dispatch(data);
          } catch {
            // JSON 解析失败 — 静默丢弃无效消息
          }
        };

        this._ws.onerror = () => {
          this._notifyStateChange("error");
          reject(new Error("WebSocket connection error"));
        };

        this._ws.onclose = () => {
          this._ws = null;
          this._notifyStateChange("closed");
          this._scheduleReconnect();
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  /** 断开连接 */
  disconnect(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._stopHeartbeat();
    this._reconnectCount = this._maxReconnect; // 阻止自动重连

    if (this._ws) {
      const ws = this._ws;
      this._ws = null;
      ws.onclose = null; // 移除 onclose 避免触发重连
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }
  }

  /** 发送消息到服务器 */
  send<T extends ClientMessage["type"]>(
    type: T,
    payload: Record<string, unknown>
  ): string {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }

    const message: ClientMessage = {
      type: type as ClientMessage["type"],
      id: generateUUID(),
      session_id: this._sessionId,
      payload,
      timestamp: Date.now(),
    };

    this._ws.send(JSON.stringify(message));
    return message.id!;
  }

  /** 注册特定类型的消息处理器 */
  on(type: string, handler: MessageHandler): void {
    if (!this._handlers.has(type)) {
      this._handlers.set(type, new Set());
    }
    this._handlers.get(type)!.add(handler);
  }

  /** 注销特定类型的消息处理器 */
  off(type: string, handler: MessageHandler): void {
    const set = this._handlers.get(type);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        this._handlers.delete(type);
      }
    }
  }

  /** 注册所有消息的处理器 */
  onAny(handler: MessageHandler): void {
    this._allHandlers.add(handler);
  }

  /** 注销所有消息的处理器 */
  offAny(handler: MessageHandler): void {
    this._allHandlers.delete(handler);
  }

  /** 订阅连接状态变化 */
  onStateChange(callback: (state: "open" | "closed" | "error") => void): () => void {
    this._listeners.add(callback);
    return () => {
      this._listeners.delete(callback);
    };
  }

  // ─── 内部方法 ──────────────────────────────────────────

  private _startHeartbeat(): void {
    this._stopHeartbeat();
    this._lastPongTime = Date.now();
    this._pingInterval = setInterval(() => {
      if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
        this._stopHeartbeat();
        return;
      }
      // 60 秒未收到 pong 则主动断开触发重连
      if (Date.now() - this._lastPongTime > 60_000) {
        this._stopHeartbeat();
        this._ws.close();
        return;
      }
      this._ws.send(JSON.stringify({ type: "ping", id: generateUUID(), timestamp: Date.now() }));
    }, 30_000);
  }

  private _stopHeartbeat(): void {
    if (this._pingInterval !== null) {
      clearInterval(this._pingInterval);
      this._pingInterval = null;
    }
  }

  private _dispatch(msg: ServerMessage): void {
    // 通知通用处理器
    for (const handler of this._allHandlers) {
      try {
        handler(msg);
      } catch {
        // 忽略处理器异常
      }
    }

    // 通知类型特定处理器
    const handlers = this._handlers.get(msg.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(msg);
        } catch {
          // 忽略处理器异常
        }
      }
    }
  }

  private _notifyStateChange(state: "open" | "closed" | "error"): void {
    for (const listener of this._listeners) {
      try {
        listener(state);
      } catch {
        // 忽略监听器异常
      }
    }
  }

  private _scheduleReconnect(): void {
    if (this._reconnectCount >= this._maxReconnect) {
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this._reconnectCount), 30000);
    this._reconnectCount++;

    this._reconnectTimer = setTimeout(() => {
      if (!this._url) return;
      this._reconnectTimer = null;
      this.connect(this._url).catch(() => {
        // 连接失败 — onclose 会再次触发重连调度
      });
    }, delay);
  }
}
