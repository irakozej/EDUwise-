import { useRef, useState } from "react";
import { api } from "../lib/api";

type Props = {
  onUpload: (url: string, filename: string) => void;
  accept?: string;
  label?: string;
};

export default function FileUpload({ onUpload, accept, label = "Upload file" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState("");
  const [error, setError] = useState("");

  async function handleFile(file: File) {
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post<{ url: string; filename: string }>("/api/v1/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const name = res.data.filename || file.name;
      setUploaded(name);
      onUpload(res.data.url, name);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(e?.response?.data?.detail || e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
      >
        {uploading ? "Uploading…" : uploaded ? `✓ ${uploaded}` : label}
      </button>
      {error && <div className="mt-1 text-xs text-rose-600">{error}</div>}
    </div>
  );
}
