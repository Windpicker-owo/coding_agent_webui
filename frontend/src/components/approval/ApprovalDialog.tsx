/** Console 审批弹窗 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useSession, useSessionDispatch } from "../../hooks/useSession.ts";
import { getWSClient } from "../../utils/ws-client.ts";

export function ApprovalDialog() {
  const { pendingApproval } = useSession();
  const dispatch = useSessionDispatch();
  const [prefix, setPrefix] = useState("");
  const [reason, setReason] = useState("");
  const [countdown, setCountdown] = useState(300);
  const approvalRequestId = pendingApproval?.request_id ?? "";

  // 用 ref 存储可变状态，避免 effect 依赖重建
  const prefixRef = useRef(prefix);
  const reasonRef = useRef(reason);
  const pendingRef = useRef(pendingApproval);

  useEffect(() => { prefixRef.current = prefix; }, [prefix]);
  useEffect(() => { reasonRef.current = reason; }, [reason]);
  useEffect(() => { pendingRef.current = pendingApproval; }, [pendingApproval]);

  const handleDecision = useCallback((decision: "approve" | "deny") => {
    const approval = pendingRef.current;
    if (!approval) return;

    getWSClient().send("console.approval", {
      request_id: approval.request_id,
      decision,
      prefix: prefixRef.current,
      reason: decision === "deny" ? reasonRef.current : "",
    });

    dispatch({ type: "CLEAR_PENDING_APPROVAL" });
  }, [dispatch]);

  // 300s 倒计时，超时自动拒绝
  useEffect(() => {
    if (!approvalRequestId) return;

    setTimeout(() => {
      setCountdown(300);
      setPrefix("");
      setReason("");
    }, 0);

    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          handleDecision("deny");
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [approvalRequestId, handleDecision]);

  if (!pendingApproval) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 p-4 overflow-y-auto">
      <div className="min-h-full flex items-start justify-center sm:items-center">
        <div className="my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl">
          {/* Header */}
          <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-200 dark:border-gray-800">
            <h2 className="text-sm font-semibold text-yellow-600 dark:text-yellow-400 flex items-center gap-2">
              ⚠ Console 命令审批
            </h2>
            <span className="text-xs text-gray-500 shrink-0">
              {countdown}s 后自动拒绝
            </span>
          </div>

          {/* Body */}
          <div className="min-h-0 overflow-y-auto px-5 py-4 space-y-4">
            {/* 工作目录 */}
            <div>
              <div className="text-xs text-gray-500 mb-1">工作目录</div>
              <code className="block text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded font-mono break-all">
                {pendingApproval.working_dir}
              </code>
            </div>

            {/* 命令 */}
            <div>
              <div className="text-xs text-gray-500 mb-1">命令</div>
              <pre className="max-h-64 overflow-auto p-3 bg-gray-100 dark:bg-gray-950 rounded text-sm text-green-700 dark:text-green-400 font-mono whitespace-pre-wrap break-all">
                {pendingApproval.command}
              </pre>
            </div>

            {/* 上下文 */}
            {pendingApproval.context && (
              <div>
                <div className="text-xs text-gray-500 mb-1">上下文</div>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-h-24 overflow-y-auto break-words">
                  {pendingApproval.context}
                </p>
              </div>
            )}

            {/* 自动审查结果 */}
            {(pendingApproval.auto_review_result != null) && (
              <div className="max-h-32 overflow-auto p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs text-gray-500 dark:text-gray-400 break-all">
                📋 自动审查:{" "}
                {JSON.stringify(pendingApproval.auto_review_result)}
              </div>
            )}

            {/* Prefix 输入 */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">
                Prefix（可选，如 sudo）
              </label>
              <input
                type="text"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder="sudo"
                className="w-full px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>

            {/* 拒绝原因 */}
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <button
                  onClick={() => setReason("")}
                  className={`text-xs px-2 py-0.5 rounded ${
                    reason === ""
                      ? "bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-500"
                  }`}
                >
                  无
                </button>
                {["太危险", "不需要", "范围太大", "手动执行"].map((r) => (
                  <button
                    key={r}
                    onClick={() => setReason(r)}
                    className={`text-xs px-2 py-0.5 rounded ${
                      reason === r
                        ? "bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="自定义拒绝原因..."
                className="w-full px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 flex gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <button
              onClick={() => handleDecision("approve")}
              className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg text-sm transition-colors"
            >
              ✅ 批准
            </button>
            <button
              onClick={() => handleDecision("deny")}
              className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg text-sm transition-colors"
            >
              ❌ 拒绝
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
