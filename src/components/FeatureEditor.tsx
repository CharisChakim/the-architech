import React from "react";
import { Plus, Trash2, X } from "lucide-react";
import { FeatureSpec } from "../types";

// Bukan kelas .field global: yang itu memaksa w-full, sedangkan di sini isian
// dipakai sebagai flex item yang lebarnya ditentukan pemakainya.
const field =
  "px-3 py-2 bg-surface border border-strong rounded-lg text-sm text-ink " +
  "placeholder:text-faint focus:outline-hidden focus:ring-2 focus:ring-accent focus:border-accent";

const PRIORITY_OPTIONS: { value: FeatureSpec["priority"]; label: string }[] = [
  { value: "P0", label: "P0 · MVP" },
  { value: "P1", label: "P1 · Penting" },
  { value: "P2", label: "P2 · Lanjutan" },
];

interface FeatureEditorProps {
  features: FeatureSpec[];
  onChange: (features: FeatureSpec[]) => void;
}

export const FeatureEditor: React.FC<FeatureEditorProps> = ({ features, onChange }) => {
  const patch = (idx: number, changes: Partial<FeatureSpec>) =>
    onChange(features.map((f, i) => (i === idx ? { ...f, ...changes } : f)));

  return (
    <div className="card p-5 space-y-3">
      {features.map((feature, idx) => {
        const subs = feature.subFeatures || [];
        const setSubs = (next: string[]) => patch(idx, { subFeatures: next });

        return (
          <div key={idx} className="rounded-lg border border-line p-4 space-y-3">
            <div className="flex items-start gap-2">
              <input
                value={feature.name}
                onChange={(e) => patch(idx, { name: e.target.value })}
                placeholder="Nama fitur"
                className={`${field} flex-1 min-w-0 font-medium`}
              />
              <select
                value={feature.priority}
                onChange={(e) => patch(idx, { priority: e.target.value as FeatureSpec["priority"] })}
                className={`${field} shrink-0`}
              >
                {PRIORITY_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => onChange(features.filter((_, i) => i !== idx))}
                title="Hapus fitur"
                className="p-2 shrink-0 text-faint hover:text-danger rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <textarea
              rows={2}
              value={feature.description}
              onChange={(e) => patch(idx, { description: e.target.value })}
              placeholder="Deskripsi fitur"
              className={`${field} w-full leading-relaxed resize-y`}
            />

            <div className="space-y-2">
              <span className="block text-xs font-medium text-faint">Sub fitur</span>

              {subs.map((sub, sIdx) => (
                <div key={sIdx} className="flex items-center gap-2">
                  <input
                    value={sub}
                    onChange={(e) => setSubs(subs.map((s, i) => (i === sIdx ? e.target.value : s)))}
                    placeholder="misal: Tampilan Candlestick"
                    className={`${field} flex-1 min-w-0 text-xs`}
                  />
                  <button
                    onClick={() => setSubs(subs.filter((_, i) => i !== sIdx))}
                    title="Hapus sub fitur"
                    className="p-1.5 shrink-0 text-faint hover:text-danger rounded-lg transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              <button
                onClick={() => setSubs([...subs, ""])}
                className="flex items-center gap-1.5 text-xs text-faint hover:text-ink transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Tambah sub fitur
              </button>
            </div>
          </div>
        );
      })}

      <button
        onClick={() => onChange([...features, { name: "", description: "", priority: "P1", subFeatures: [] }])}
        className="btn-primary"
      >
        <Plus className="w-4 h-4" /> Tambah fitur
      </button>
    </div>
  );
};
