import React, { useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { FileText, LayoutGrid, Layers, ChevronRight } from "lucide-react";
import { FeatureSpec } from "../types";

// Metrik tata letak. Node selebar 224 (w-56) dengan kolom di x 0 / 420 / 780 dan
// fitur berjarak 200 secara vertikal — diambil dari mengukur kanvas referensi.
const COLUMN_X = [0, 420, 780];
const ROW_GAP = 200;
const SUB_FEATURES_SHOWN = 3;

const CARD =
  "w-56 rounded-2xl px-3.5 py-3 bg-white ring-1 ring-slate-200 shadow-sm " +
  "dark:bg-[#2f3546] dark:ring-[#3f4557] dark:shadow-none";

const PRIORITY_LABEL: Record<string, string> = { P0: "MVP", P1: "PENTING", P2: "LANJUTAN" };

function PlanRootNode({ data }: NodeProps) {
  const { title } = data as { title: string };
  return (
    <div className={CARD}>
      <div className="flex items-center gap-2.5">
        <span className="w-7 h-7 shrink-0 rounded-lg bg-indigo-50 text-indigo-600 grid place-items-center dark:bg-indigo-500/15 dark:text-indigo-300">
          <FileText className="w-4 h-4" />
        </span>
        <span className="font-semibold text-slate-900 truncate dark:text-slate-100">{title}</span>
      </div>
      <p className="text-xs text-slate-500 mt-2 dark:text-slate-400">Perencanaan</p>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function FeatureNode({ data }: NodeProps) {
  const { name, description, priority } = data as {
    name: string;
    description: string;
    priority: string;
  };
  return (
    <div className={`${CARD} relative`}>
      {priority && (
        <span className="absolute -top-2 right-3 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide bg-indigo-600 text-white">
          {PRIORITY_LABEL[priority] || priority}
        </span>
      )}
      <div className="flex items-center gap-2.5">
        <span className="w-7 h-7 shrink-0 rounded-lg bg-slate-100 text-slate-500 grid place-items-center dark:bg-slate-700/50 dark:text-slate-300">
          <LayoutGrid className="w-4 h-4" />
        </span>
        <span className="font-semibold text-slate-900 truncate dark:text-slate-100">{name}</span>
      </div>
      <p className="text-xs text-slate-500 mt-2 line-clamp-2 dark:text-slate-400">{description}</p>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function SubFeaturesNode({ data }: NodeProps) {
  const { items } = data as { items: string[] };
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, SUB_FEATURES_SHOWN);
  const hidden = items.length - visible.length;

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2 mb-2.5">
        <Layers className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Sub fitur
        </span>
      </div>

      <ul className="space-y-1.5">
        {visible.map((item, idx) => (
          <li
            key={idx}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0 dark:bg-slate-500" />
            <span className="text-xs truncate">{item}</span>
          </li>
        ))}
      </ul>

      {(hidden > 0 || expanded) && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 transition-colors dark:text-slate-400 dark:hover:text-slate-100"
        >
          {expanded ? "Tampilkan lebih sedikit" : `Lihat semua (${items.length})`}
          <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
      )}

      <Handle type="target" position={Position.Left} />
    </div>
  );
}

const nodeTypes = {
  planRoot: PlanRootNode,
  feature: FeatureNode,
  subFeatures: SubFeaturesNode,
};

interface PlanCanvasProps {
  title: string;
  features: FeatureSpec[];
}

export const PlanCanvas: React.FC<PlanCanvasProps> = ({ title, features }) => {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Root diletakkan sejajar dengan tengah kolom fitur.
    const centerY = ((features.length - 1) * ROW_GAP) / 2;

    nodes.push({
      id: "root",
      type: "planRoot",
      position: { x: COLUMN_X[0], y: centerY },
      data: { title },
      draggable: false,
    });

    features.forEach((feature, idx) => {
      const featureId = `feature-${idx}`;
      nodes.push({
        id: featureId,
        type: "feature",
        position: { x: COLUMN_X[1], y: idx * ROW_GAP },
        data: { name: feature.name, description: feature.description, priority: feature.priority },
      });
      edges.push({ id: `root-${featureId}`, source: "root", target: featureId });

      const subFeatures = feature.subFeatures || [];
      if (subFeatures.length === 0) return;

      const subId = `sub-${idx}`;
      nodes.push({
        id: subId,
        type: "subFeatures",
        position: { x: COLUMN_X[2], y: idx * ROW_GAP },
        data: { items: subFeatures },
      });
      edges.push({ id: `${featureId}-${subId}`, source: featureId, target: subId });
    });

    return { nodes, edges };
  }, [title, features]);

  return (
    <div className="h-[600px] rounded-2xl overflow-hidden ring-1 ring-slate-200 bg-[#e9ecef] dark:ring-[#3f4557] dark:bg-[#262c3b]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={1.75}
        proOptions={{ hideAttribution: false }}
        nodesConnectable={false}
        edgesFocusable={false}
        nodeOrigin={[0, 0.5]}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#91919a" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
    </div>
  );
};
