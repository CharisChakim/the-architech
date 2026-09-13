import React from "react";
import { GenerationProgress } from "./GenerationProgress";
import { useT } from "../lib/i18n";

interface GenerationDialogProps {
  open: boolean;
  title: string;
  label: string;
  expectedMs?: number;
  onCancel: () => void;
}

// Perpindahan antar langkah menunggu satu panggilan LLM yang bisa memakan
// menitan. Dialog dipakai supaya penantian itu punya tempatnya sendiri: halaman
// di belakangnya tidak setengah berubah, dan pembatalan selalu terjangkau.
export const GenerationDialog: React.FC<GenerationDialogProps> = ({
  open,
  title,
  label,
  expectedMs,
  onCancel,
}) => {
  const { t } = useT();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="card shadow-lg w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div>
          <h3 className="font-semibold text-ink">{title}</h3>
          <p className="text-xs text-faint mt-1 leading-relaxed">
            {t("This usually takes a minute or two. You can cancel and stay on this page.")}
          </p>
        </div>

        {/* Bar-nya sendiri sudah membawa label, persentase, dan detik berjalan. */}
        <GenerationProgress active plain label={label} expectedMs={expectedMs} />

        <div className="flex justify-end">
          <button onClick={onCancel} className="btn-outline">
            {t("Cancel")}
          </button>
        </div>
      </div>
    </div>
  );
};
