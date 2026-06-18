/**
 * Tauri v2 全局 API 类型声明
 *
 * 当桌面应用运行时，Tauri 会在 window 上注入 __TAURI__ 对象。
 * 前端通过检测 window.__TAURI__ 是否存在来判断是否运行在 Tauri 环境。
 */

interface TauriCore {
  invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

interface TauriGlobal {
  core: TauriCore;
}

declare global {
  interface Window {
    /** Tauri v2 全局 API（仅在 Tauri 桌面环境中存在） */
    __TAURI__?: TauriGlobal;
  }
}

export {};
