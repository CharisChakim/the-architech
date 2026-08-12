import React, { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useT } from "../lib/i18n";

interface GenerationProgressProps {
  active: boolean;
  label: string;
  /** Perkiraan lama proses, dipakai untuk mengatur kecuraman kurva. */
  expectedMs?: number;
}

export const GenerationProgress: React.FC<GenerationProgressProps> = ({
  active,
  label,
  expectedMs = 30000,
}) => {
  const { t } = useT();
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    startedAt.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Date.now() - startedAt.current), 200);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return null;

  // Endpoint LLM mengembalikan satu respons utuh dan tidak melaporkan kemajuan
  // apa pun, jadi persentase yang sebenarnya tidak ada. Kurva ini murni fungsi
  // waktu tempuh: cepat di awal lalu melandai, dan sengaja berhenti di 95%
  // supaya tidak pernah menampilkan "100%" sementara jawabannya belum tiba.
  const percent = Math.min(95, Math.round((1 - Math.exp(-elapsed / (expectedMs / 2.5))) * 100));
  const seconds = Math.floor(elapsed / 1000);

  return (
    <div className="card p-4 space-y-2.5" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-ink">
          <RefreshCw className="w-4 h-4 animate-spin text-accent shrink-0" />
          {label}
        </span>
        <span
          className="text-xs text-faint tabular-nums shrink-0"
          title={t("Estimated from elapsed time — the model does not report real progress.")}
        >
          {t("{percent}% · {seconds}s", { percent, seconds })}
        </span>
      </div>

      <div className="h-1.5 rounded-full bg-subtle overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-[width] duration-200 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};
