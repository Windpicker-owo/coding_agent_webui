/** AvatarUpload — 头像裁剪上传组件 */
import { useState, useRef, useCallback, useEffect } from "react";

interface AvatarUploadProps {
  open: boolean;
  onClose: () => void;
  onUploaded: (url: string) => void;
}

const OUTPUT_SIZE = 256;
const PREVIEW_SIZE = 300;

export function AvatarUpload({ open, onClose, onUploaded }: AvatarUploadProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropSize, setCropSize] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragStart, setDragStart] = useState<{ x: number; y: number; cropX: number; cropY: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 重置状态
  const reset = useCallback(() => {
    setImage(null);
    setCropX(0);
    setCropY(0);
    setCropSize(0);
    setDragging(false);
    setError("");
    setDragStart(null);
  }, []);

  // Modal 关闭时重置
  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  // 选择图片
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 大小检查
    if (file.size > 5 * 1024 * 1024) {
      setError("图片大小不能超过 5MB");
      return;
    }

    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = Math.min(img.naturalWidth, img.naturalHeight);
        setImage(img);
        setCropSize(size);
        // 初始居中
        setCropX((img.naturalWidth - size) / 2);
        setCropY((img.naturalHeight - size) / 2);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);

    // 清空 input 以便重复选择同一文件
    e.target.value = "";
  }, []);

  // Canvas 渲染预览
  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const displayW = PREVIEW_SIZE;
    const displayH = PREVIEW_SIZE;
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    canvas.style.width = `${displayW}px`;
    canvas.style.height = `${displayH}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, displayW, displayH);

    // 绘制裁剪后的方形图
    ctx.save();
    ctx.beginPath();
    const cx = displayW / 2;
    const cy = displayH / 2;
    const cr = displayW / 2;
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      image,
      cropX, cropY, cropSize, cropSize,
      0, 0, displayW, displayH,
    );
    ctx.restore();

    // 圆形外部半透明遮罩
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, displayW, displayH);
    ctx.arc(cx, cy, cr, 0, Math.PI * 2, true);
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fill();
    ctx.restore();

    // 圆形边框
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }, [image, cropX, cropY, cropSize]);

  // 图片变化时重绘
  useEffect(() => {
    if (image) drawPreview();
  }, [image, drawPreview]);

  // 鼠标拖动
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!image) return;
    setDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY, cropX, cropY });
  }, [image, cropX, cropY]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging || !image || !dragStart) return;

    const scale = cropSize / PREVIEW_SIZE;
    const dx = (e.clientX - dragStart.x) * scale;
    const dy = (e.clientY - dragStart.y) * scale;

    let newX = dragStart.cropX - dx;
    let newY = dragStart.cropY - dy;

    // 边界限制
    const maxX = image.naturalWidth - cropSize;
    const maxY = image.naturalHeight - cropSize;
    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));

    setCropX(newX);
    setCropY(newY);
  }, [dragging, image, dragStart, cropSize]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
    setDragStart(null);
  }, []);

  // 导出 256x256 圆形 PNG 并上传
  const handleConfirm = useCallback(async () => {
    if (!image) return;

    setUploading(true);
    setError("");

    try {
      // 创建离屏 canvas 导出 256x256
      const offCanvas = document.createElement("canvas");
      offCanvas.width = OUTPUT_SIZE;
      offCanvas.height = OUTPUT_SIZE;
      const ctx = offCanvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 不可用");

      // 圆形 clip
      ctx.beginPath();
      ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(
        image,
        cropX, cropY, cropSize, cropSize,
        0, 0, OUTPUT_SIZE, OUTPUT_SIZE,
      );

      const dataUrl = offCanvas.toDataURL("image/png");

      const res = await fetch("/api/avatar/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: "上传失败" }));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }

      const result = await res.json();
      onUploaded(result.avatar_url);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }, [image, cropX, cropY, cropSize, onUploaded, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">更换头像</h2>

        {!image ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              选择一张图片，裁剪为正方形后上传。
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              选择图片
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        ) : (
          <>
            <div className="flex justify-center">
              <canvas
                ref={canvasRef}
                width={PREVIEW_SIZE}
                height={PREVIEW_SIZE}
                className="cursor-grab active:cursor-grabbing rounded-lg"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
              拖动图片调整裁剪位置
            </p>
          </>
        )}

        {error && (
          <div className="p-2.5 bg-red-900/30 border border-red-700/50 rounded-lg text-red-200 text-xs">
            {error}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={uploading}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-300 disabled:opacity-50"
          >
            取消
          </button>
          {image && (
            <button
              onClick={handleConfirm}
              disabled={uploading}
              className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              {uploading ? "上传中..." : "确认"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
