/**
 * StepPersonality — Bot 人设配置步骤
 */

import { Bot } from "lucide-react";
import type { PersonalityConfig } from "../../hooks/useSetup.ts";

interface StepPersonalityProps {
  personality: PersonalityConfig;
  onUpdate: (partial: Partial<PersonalityConfig>) => void;
}

export function StepPersonality({
  personality,
  onUpdate,
}: StepPersonalityProps) {
  const fieldClass =
    "w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm transition-all";
  const labelClass =
    "block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5";
  const hintClass = "text-xs text-gray-400 dark:text-gray-500 mt-1.5";

  return (
    <div className="space-y-10 animate-fade-in">
      <div className="space-y-2">
        <h2 className="text-3xl font-extrabold tracking-tight">专属 AI 助手</h2>
        <p className="text-gray-500 dark:text-gray-400 text-lg">
          自定义您的 AI 助手的人设，让结对编程体验更加生动有趣。
        </p>
      </div>

      <div className="bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100 dark:border-gray-800/60">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-xl text-blue-500">
            <Bot className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold">基本信息</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 昵称 */}
          <div>
            <label className={labelClass}>助手昵称</label>
            <input
              type="text"
              value={personality.nickname}
              onChange={(e) => onUpdate({ nickname: e.target.value })}
              placeholder="如: 小狐狸, CodeBot..."
              className={fieldClass}
            />
            <p className={hintClass}>你希望如何称呼它？</p>
          </div>

          {/* 身份 */}
          <div>
            <label className={labelClass}>社会身份</label>
            <input
              type="text"
              value={personality.identity}
              onChange={(e) => onUpdate({ identity: e.target.value })}
              placeholder="AI助手, 资深架构师..."
              className={fieldClass}
            />
            <p className={hintClass}>赋予它一个职业或身份。</p>
          </div>

          {/* 核心人格 */}
          <div className="md:col-span-2">
            <label className={labelClass}>核心性格特征</label>
            <textarea
              value={personality.personality_core}
              onChange={(e) => onUpdate({ personality_core: e.target.value })}
              placeholder="友好、活泼、乐于助人、专业、严谨..."
              rows={2}
              className={`${fieldClass} resize-none`}
            />
            <p className={hintClass}>描述助手的基本性格，它将影响 AI 的言行举止。</p>
          </div>

          {/* 回复风格 */}
          <div className="md:col-span-2">
            <label className={labelClass}>对话风格</label>
            <textarea
              value={personality.reply_style}
              onChange={(e) => onUpdate({ reply_style: e.target.value })}
              placeholder="自然口语化、少说废话直接给代码、幽默风趣..."
              rows={2}
              className={`${fieldClass} resize-none`}
            />
            <p className={hintClass}>控制它的语言习惯（例如：简明扼要，直接输出代码等）。</p>
          </div>

          {/* 背景故事 */}
          <div className="md:col-span-2">
            <label className={labelClass}>背景设定 (可选)</label>
            <textarea
              value={personality.background_story}
              onChange={(e) => onUpdate({ background_story: e.target.value })}
              placeholder="为它编写一段属于它的背景故事..."
              rows={3}
              className={`${fieldClass} resize-none`}
            />
            <p className={hintClass}>AI 会在对话中隐性地参考这些背景信息，让交流更有深度。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
