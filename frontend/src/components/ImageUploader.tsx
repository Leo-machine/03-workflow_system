import { useRef, useState } from "react";
import { uploadImage } from "../api/client";
import AuthenticatedImage from "./AuthenticatedImage";

interface Props {
  value: string | null;
  onChange: (path: string | null) => void;
  label?: string;
}

/** 管理员上传操作图示；路径写入定义，用户侧可打开查看。 */
export default function ImageUploader({ value, onChange, label = "操作图示" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await uploadImage(file);
      onChange(result.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-md border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => void onPick(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={busy}
          className="btn-ghost px-2 py-1 text-xs"
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "上传中…" : value ? "更换图片" : "上传图片"}
        </button>
        {value && (
          <>
            <button
              type="button"
              className="text-xs text-slate-400 hover:text-red-600"
              onClick={() => onChange(null)}
            >
              清除
            </button>
          </>
        )}
      </div>
      {value && (
        <AuthenticatedImage
          path={value}
          alt="操作图示预览"
          linkClassName="mt-2 block"
          className="max-h-28 rounded border border-slate-200 object-contain"
        />
      )}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      <p className="mt-1 text-[11px] text-slate-400">支持 JPG / PNG / WEBP / GIF，最大 5MB</p>
    </div>
  );
}
