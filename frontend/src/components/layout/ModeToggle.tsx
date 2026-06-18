/** 模式切换开关 */
interface ModeToggleProps {
  label: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  danger?: boolean;
}

export function ModeToggle({ label, enabled, onToggle, danger = false }: ModeToggleProps) {
  return (
    <label className="flex items-center justify-between gap-2 cursor-pointer">
      <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">{label}</span>
      <button
        onClick={() => onToggle(!enabled)}
        className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${
          enabled
            ? (danger ? "bg-red-600" : "bg-blue-600")
            : "bg-gray-300 dark:bg-gray-700"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
            enabled ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}
