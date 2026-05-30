import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Background,
  Controls,
  type Edge,
  type Node,
  type NodeChange,
  ReactFlow,
  applyNodeChanges,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";
import type {
  NovelCharacterRecord,
  WorldEntryRecord,
  WorldGraphEndpointKind,
  WorldRelationshipRecord,
  WorldRelationshipSaveInput,
} from "@inkforge/shared";
import {
  novelCharacterApi,
  worldApi,
  worldRelationshipApi,
} from "../../lib/api";

interface NodeData extends Record<string, unknown> {
  kind: WorldGraphEndpointKind;
  label: string;
  category?: string;
}

interface EdgeData extends Record<string, unknown> {
  relId: string;
  label: string | null;
  weight: number;
}

const NODE_W = 160;
const NODE_H = 56;

const CATEGORY_COLOR: Record<string, string> = {
  place: "#7c3aed",
  item: "#f59e0b",
  faction: "#ef4444",
  event: "#06b6d4",
  concept: "#8b5cf6",
  organization: "#ec4899",
};

function categoryColor(category?: string): string {
  if (!category) return "#475569";
  return CATEGORY_COLOR[category] ?? "#475569";
}

function makeNodeId(kind: WorldGraphEndpointKind, id: string): string {
  return `${kind}:${id}`;
}

function parseNodeId(nodeId: string): {
  kind: WorldGraphEndpointKind;
  id: string;
} | null {
  const idx = nodeId.indexOf(":");
  if (idx < 0) return null;
  const kind = nodeId.slice(0, idx) as WorldGraphEndpointKind;
  if (kind !== "character" && kind !== "world_entry") return null;
  return { kind, id: nodeId.slice(idx + 1) };
}

function layoutWithDagre(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  overrides: Map<string, { x: number; y: number }>,
): Node<NodeData>[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 120 });

  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_W, height: NODE_H });
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }
  dagre.layout(g);

  return nodes.map((n) => {
    const override = overrides.get(n.id);
    if (override) return { ...n, position: override };
    const pos = g.node(n.id);
    return {
      ...n,
      position: pos
        ? { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 }
        : n.position,
    };
  });
}

interface WorldGraphProps {
  projectId: string;
}

export function WorldGraph({ projectId }: WorldGraphProps): JSX.Element {
  const queryClient = useQueryClient();

  const charactersQuery = useQuery({
    queryKey: ["world-graph-characters", projectId],
    queryFn: () => novelCharacterApi.list({ projectId }),
  });
  const worldsQuery = useQuery({
    queryKey: ["world-graph-entries", projectId],
    queryFn: () => worldApi.list({ projectId }),
  });
  const relationshipsQuery = useQuery({
    queryKey: ["world-relationships", projectId],
    queryFn: () => worldRelationshipApi.list({ projectId }),
  });

  const saveMutation = useMutation({
    mutationFn: (input: WorldRelationshipSaveInput) =>
      worldRelationshipApi.save(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["world-relationships"] }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => worldRelationshipApi.delete({ id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["world-relationships"] }),
  });

  const dragOverridesRef = useRef<Map<string, { x: number; y: number }>>(
    new Map(),
  );
  const [nodes, setNodes] = useState<Node<NodeData>[]>([]);
  const [edges, setEdges] = useState<Edge<EdgeData>[]>([]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pendingSrcId, setPendingSrcId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState<{
    src: { kind: WorldGraphEndpointKind; id: string; label: string };
    dst: { kind: WorldGraphEndpointKind; id: string; label: string };
  } | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editWeight, setEditWeight] = useState(5);

  const characters = charactersQuery.data ?? [];
  const worldEntries = worldsQuery.data ?? [];
  const relationships = relationshipsQuery.data ?? [];

  // Build raw nodes + edges from query data
  useEffect(() => {
    const rawNodes: Node<NodeData>[] = [
      ...characters.map<Node<NodeData>>((c: NovelCharacterRecord) => ({
        id: makeNodeId("character", c.id),
        type: "default",
        position: { x: 0, y: 0 },
        data: { kind: "character", label: c.name },
        style: {
          width: NODE_W,
          background: "#3b82f6",
          color: "#fff",
          border: "2px solid #1e40af",
          borderRadius: 999,
          padding: 8,
          fontSize: 12,
        },
      })),
      ...worldEntries.map<Node<NodeData>>((w: WorldEntryRecord) => ({
        id: makeNodeId("world_entry", w.id),
        type: "default",
        position: { x: 0, y: 0 },
        data: { kind: "world_entry", label: w.title, category: w.category },
        style: {
          width: NODE_W,
          background: categoryColor(w.category),
          color: "#fff",
          border: "2px solid #1f2937",
          borderRadius: 8,
          padding: 8,
          fontSize: 12,
        },
      })),
    ];
    const rawEdges: Edge<EdgeData>[] = relationships.map((r: WorldRelationshipRecord) => ({
      id: r.id,
      source: makeNodeId(r.srcKind, r.srcId),
      target: makeNodeId(r.dstKind, r.dstId),
      label: r.label ?? "",
      type: "default",
      animated: false,
      style: { strokeWidth: 1 + r.weight * 0.4, stroke: "#94a3b8" },
      labelStyle: { fontSize: 11, fill: "#cbd5e1" },
      data: { relId: r.id, label: r.label, weight: r.weight },
    }));
    const laid = layoutWithDagre(rawNodes, rawEdges, dragOverridesRef.current);
    setNodes(laid);
    setEdges(rawEdges);
  }, [characters, worldEntries, relationships]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => {
      const updated = applyNodeChanges(changes, nds) as Node<NodeData>[];
      // Persist drag end positions in session-only override map
      for (const change of changes) {
        if (change.type === "position" && change.dragging === false) {
          const node = updated.find((n) => n.id === change.id);
          if (node) {
            dragOverridesRef.current.set(node.id, node.position);
          }
        }
      }
      return updated;
    });
  }, []);

  const onNodeClick = useCallback(
    (_evt: React.MouseEvent, node: Node<NodeData>) => {
      setSelectedEdgeId(null);
      if (pendingSrcId && pendingSrcId !== node.id) {
        // Build relationship: pendingSrc → this
        const src = parseNodeId(pendingSrcId);
        const dst = parseNodeId(node.id);
        if (src && dst) {
          const srcNode = nodes.find((n) => n.id === pendingSrcId);
          setShowCreateForm({
            src: { ...src, label: (srcNode?.data.label as string) ?? "?" },
            dst: { ...dst, label: (node.data.label as string) ?? "?" },
          });
          setEditLabel("");
          setEditWeight(5);
        }
        setPendingSrcId(null);
        setSelectedNodeId(node.id);
      } else {
        setSelectedNodeId(node.id);
      }
    },
    [nodes, pendingSrcId],
  );

  const onEdgeClick = useCallback(
    (_evt: React.MouseEvent, edge: Edge<EdgeData>) => {
      setSelectedNodeId(null);
      setPendingSrcId(null);
      setSelectedEdgeId(edge.id);
      setEditLabel(edge.data?.label ?? "");
      setEditWeight(edge.data?.weight ?? 5);
    },
    [],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setPendingSrcId(null);
  }, []);

  const handleStartLink = () => {
    if (selectedNodeId) setPendingSrcId(selectedNodeId);
  };

  const handleCreateRelationship = () => {
    if (!showCreateForm) return;
    saveMutation.mutate({
      projectId,
      srcKind: showCreateForm.src.kind,
      srcId: showCreateForm.src.id,
      dstKind: showCreateForm.dst.kind,
      dstId: showCreateForm.dst.id,
      label: editLabel.trim() || null,
      weight: editWeight,
    });
    setShowCreateForm(null);
  };

  const handleUpdateRelationship = () => {
    if (!selectedEdgeId) return;
    const rel = relationships.find((r) => r.id === selectedEdgeId);
    if (!rel) return;
    saveMutation.mutate({
      id: rel.id,
      projectId,
      srcKind: rel.srcKind,
      srcId: rel.srcId,
      dstKind: rel.dstKind,
      dstId: rel.dstId,
      label: editLabel.trim() || null,
      weight: editWeight,
    });
  };

  const handleDeleteRelationship = () => {
    if (!selectedEdgeId) return;
    if (!confirm("删除这条关系？")) return;
    deleteMutation.mutate(selectedEdgeId);
    setSelectedEdgeId(null);
  };

  const handleRelayout = () => {
    dragOverridesRef.current.clear();
    setNodes((nds) => layoutWithDagre(nds, edges, new Map()));
  };

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId),
    [nodes, selectedNodeId],
  );

  return (
    <div className="flex h-full w-full">
      <div className="relative flex-1 bg-ink-950">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          fitView
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#334155" gap={24} />
          <Controls position="bottom-right" showInteractive={false} />
        </ReactFlow>
        <div className="absolute left-3 top-3 flex gap-2 text-xs">
          <button
            className="rounded-md border border-ink-600 bg-ink-800/80 px-2 py-1 text-ink-200 backdrop-blur hover:bg-ink-700"
            onClick={handleRelayout}
          >
            重排布局
          </button>
          {pendingSrcId ? (
            <span className="rounded-md bg-accent-500/90 px-2 py-1 text-ink-900">
              点击目标节点完成连线 ESC 取消
            </span>
          ) : null}
        </div>
      </div>

      <aside className="w-[300px] shrink-0 border-l border-ink-700 bg-ink-900 p-3 text-xs text-ink-100">
        {showCreateForm ? (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-accent-300">建立关系</h3>
            <div className="text-ink-300">
              <span className="font-medium">{showCreateForm.src.label}</span> →{" "}
              <span className="font-medium">{showCreateForm.dst.label}</span>
            </div>
            <input
              type="text"
              placeholder="关系类型（如 师徒/掌门/属于）"
              className="w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-1"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
            />
            <label className="block">
              强度 {editWeight}
              <input
                type="range"
                min={1}
                max={10}
                value={editWeight}
                onChange={(e) => setEditWeight(Number(e.target.value))}
                className="w-full"
              />
            </label>
            <div className="flex gap-2">
              <button
                className="rounded-md bg-accent-500 px-3 py-1 text-ink-900 hover:bg-accent-400"
                onClick={handleCreateRelationship}
              >
                创建
              </button>
              <button
                className="rounded-md border border-ink-600 px-3 py-1 hover:bg-ink-700"
                onClick={() => setShowCreateForm(null)}
              >
                取消
              </button>
            </div>
          </div>
        ) : selectedEdgeId ? (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-accent-300">编辑关系</h3>
            <input
              type="text"
              placeholder="关系类型"
              className="w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-1"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
            />
            <label className="block">
              强度 {editWeight}
              <input
                type="range"
                min={1}
                max={10}
                value={editWeight}
                onChange={(e) => setEditWeight(Number(e.target.value))}
                className="w-full"
              />
            </label>
            <div className="flex gap-2">
              <button
                className="rounded-md bg-accent-500 px-3 py-1 text-ink-900 hover:bg-accent-400"
                onClick={handleUpdateRelationship}
              >
                保存
              </button>
              <button
                className="rounded-md border border-red-500/40 px-3 py-1 text-red-400 hover:bg-red-500/10"
                onClick={handleDeleteRelationship}
              >
                删除
              </button>
            </div>
          </div>
        ) : selectedNode ? (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-accent-300">
              {selectedNode.data.label}
            </h3>
            <p className="text-ink-400">
              {selectedNode.data.kind === "character" ? "人物" : `世界条目 (${selectedNode.data.category ?? "—"})`}
            </p>
            <button
              className="rounded-md bg-accent-500 px-3 py-1 text-ink-900 hover:bg-accent-400"
              onClick={handleStartLink}
            >
              开始建立关系
            </button>
            <p className="text-ink-500">
              点击此按钮后再点另一个节点以连线
            </p>
          </div>
        ) : (
          <div className="space-y-2 text-ink-400">
            <p>点击节点选择 · 已选中后点「开始建立关系」</p>
            <p>点击边可编辑/删除</p>
            <p>拖动节点可调整位置（保留至会话结束）</p>
            <hr className="border-ink-700" />
            <p>
              人物 {characters.length} · 世界条目 {worldEntries.length} · 关系 {relationships.length}
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
