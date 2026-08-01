import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { Download, Code, Eye, Maximize2, Minimize2, ZoomIn, ZoomOut, RefreshCw, Copy, Check } from "lucide-react";

interface MermaidViewerProps {
  chart: string;
  explanation?: string;
  title?: string;
}

// Diagram datang dari keluaran LLM dan SVG hasilnya dipasang lewat
// dangerouslySetInnerHTML, jadi securityLevel "strict" (bukan "loose") dipakai
// agar Mermaid menyanitasi labelnya. Konsekuensinya htmlLabels harus mati.
mermaid.initialize({
  startOnLoad: false,
  theme: "neutral",
  securityLevel: "strict",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  flowchart: {
    useMaxWidth: false,
    htmlLabels: false,
    curve: "basis",
  },
});

export const MermaidViewer: React.FC<MermaidViewerProps> = ({ chart, explanation, title }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"visual" | "code">("visual");
  const [zoom, setZoom] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    const renderDiagram = async () => {
      if (!chart) return;
      setError(null);
      
      try {
        const id = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
        // Clean chart string
        let cleanedChart = chart.trim();
        if (cleanedChart.startsWith("```mermaid")) {
          cleanedChart = cleanedChart.replace(/^```mermaid\n?/, "").replace(/```$/, "");
        } else if (cleanedChart.startsWith("```")) {
          cleanedChart = cleanedChart.replace(/^```\n?/, "").replace(/```$/, "");
        }

        const { svg } = await mermaid.render(id, cleanedChart);
        if (isMounted) {
          setSvgContent(svg);
        }
      } catch (err: any) {
        console.error("Mermaid rendering error:", err);
        if (isMounted) {
          setError("Gagal merender diagram Mermaid. Silakan periksa sintaks di bawah.");
        }
      }
    };

    renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [chart]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(chart);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSvg = () => {
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(title || "diagram_logika").toLowerCase().replace(/[^a-z0-9]/g, "_")}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all ${isFullscreen ? "fixed inset-4 z-50 flex flex-col shadow-lg" : ""}`}>
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-5 py-3.5 bg-slate-50 border-b border-slate-200 gap-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
          <h4 className="font-semibold text-slate-800 text-sm">{title || "Diagram Logika Sistem"}</h4>
        </div>

        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="bg-slate-200/80 p-1 rounded-lg flex items-center text-xs font-medium">
            <button
              onClick={() => setActiveTab("visual")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all ${activeTab === "visual" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
            >
              <Eye className="w-3.5 h-3.5" />
              Diagram
            </button>
            <button
              onClick={() => setActiveTab("code")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all ${activeTab === "code" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
            >
              <Code className="w-3.5 h-3.5" />
              Mermaid Code
            </button>
          </div>

          {activeTab === "visual" && (
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 text-slate-600">
              <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))} className="p-1 hover:bg-slate-100 rounded text-slate-600" title="Zoom Out">
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs px-1 font-mono font-medium">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))} className="p-1 hover:bg-slate-100 rounded text-slate-600" title="Zoom In">
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setZoom(1)} className="p-1 hover:bg-slate-100 rounded text-slate-600" title="Reset Zoom">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-medium transition-all"
            title="Salin Kode Mermaid"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Tersalin!" : "Copy Code"}
          </button>

          <button
            onClick={handleDownloadSvg}
            disabled={!svgContent}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
            title="Unduh SVG"
          >
            <Download className="w-3.5 h-3.5" />
            Export SVG
          </button>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
            title={isFullscreen ? "Keluar Layar Penuh" : "Layar Penuh"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className={`p-6 bg-slate-50/50 overflow-auto flex-1 min-h-[320px] max-h-[600px] flex justify-center items-center ${isFullscreen ? "max-h-none h-full" : ""}`}>
        {activeTab === "visual" ? (
          error ? (
            <div className="text-center p-6 bg-amber-50 rounded-xl border border-amber-200 max-w-lg">
              <p className="text-amber-800 text-sm font-medium mb-2">{error}</p>
              <p className="text-xs text-amber-700 mb-3">Anda tetap dapat melihat dan menyalin sintaks Mermaid dalam mode 'Mermaid Code'.</p>
              <button
                onClick={() => setActiveTab("code")}
                className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700"
              >
                Lihat Sintaks Kode
              </button>
            </div>
          ) : (
            <div
              ref={containerRef}
              style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
              className="transition-transform duration-200 ease-out p-4 flex justify-center items-center w-full min-w-max"
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          )
        ) : (
          <div className="w-full h-full bg-slate-900 text-slate-100 font-mono text-xs p-4 rounded-xl overflow-auto leading-relaxed border border-slate-800">
            <pre>{chart}</pre>
          </div>
        )}
      </div>

      {explanation && (
        <div className="p-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-600 leading-relaxed">
          <strong className="text-slate-800 font-semibold block mb-1">Penjelasan Alur Logika:</strong>
          {explanation}
        </div>
      )}
    </div>
  );
};
