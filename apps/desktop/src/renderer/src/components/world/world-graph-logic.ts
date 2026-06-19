import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";
import type { WorldGraphEndpointKind } from "@inkforge/shared";
import { pickStableColor } from "../../lib/stable-color";

export interface NodeData extends Record<string, unknown> {
  kind: WorldGraphEndpointKind;
  label: string;
  category?: string;
}

export interface EdgeData extends Record<string, unknown> {
  relId: string;
  label: string | null;
  weight: number;
}

export interface GraphPathStep {
  edgeId: string;
  fromId: string;
  toId: string;
  label: string | null;
  weight: number;
}

export interface GraphPathResult {
  nodeIds: string[];
  edgeIds: string[];
  steps: GraphPathStep[];
}

export interface GraphCommunity {
  id: string;
  nodeIds: string[];
  edgeIds: string[];
  nodeCount: number;
  edgeCount: number;
  characterCount: number;
  worldEntryCount: number;
  averageWeight: number;
  strongestNodeId: string | null;
  strongestNodeLabel: string | null;
  previewLabels: string[];
}

export interface GraphIsolatedNode {
  id: string;
  label: string;
  kind: WorldGraphEndpointKind;
  category?: string;
}

export interface GraphBridgeNode {
  id: string;
  label: string;
  kind: WorldGraphEndpointKind;
  category?: string;
  degree: number;
  separatedGroupCount: number;
  affectedNodeCount: number;
  previewLabels: string[];
}

export type GraphRelationshipIssueReason = "missing_label" | "weak_weight";

export interface GraphRelationshipIssue {
  id: string;
  sourceId: string;
  targetId: string;
  sourceLabel: string;
  targetLabel: string;
  label: string | null;
  weight: number;
  reasons: GraphRelationshipIssueReason[];
}

export type GraphMaturityFocus =
  | "connect_isolated"
  | "name_relationships"
  | "strengthen_ties"
  | "keep_expanding";

export interface GraphMaturitySummary {
  score: number;
  connectedRatio: number;
  namedRelationshipRatio: number;
  strongRelationshipRatio: number;
  connectedNodeCount: number;
  totalNodeCount: number;
  namedRelationshipCount: number;
  totalRelationshipCount: number;
  strongRelationshipCount: number;
  focus: GraphMaturityFocus;
}

export interface GraphCommunitySummary {
  communities: GraphCommunity[];
  isolatedNodes: GraphIsolatedNode[];
  bridgeNodes: GraphBridgeNode[];
  relationshipIssues: GraphRelationshipIssue[];
  maturity: GraphMaturitySummary;
}

export const NODE_W = 160;
export const NODE_H = 56;

export type FocusDepth = "all" | "one" | "two";
export type GraphLayoutMode = "layers" | "radial";
export type NodeKindFilter = "all" | WorldGraphEndpointKind;

export const FOCUS_OPTIONS: Array<{ value: FocusDepth; label: string }> = [
  { value: "all", label: "全图" },
  { value: "one", label: "一跳" },
  { value: "two", label: "二跳" },
];

export const KIND_OPTIONS: Array<{ value: NodeKindFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "character", label: "人物" },
  { value: "world_entry", label: "条目" },
];

export const LAYOUT_OPTIONS: Array<{ value: GraphLayoutMode; label: string }> = [
  { value: "layers", label: "层级" },
  { value: "radial", label: "放射" },
];

export function categoryColor(category?: string): string {
  if (!category) return "#64748b";
  return pickStableColor(category);
}

export function makeNodeId(kind: WorldGraphEndpointKind, id: string): string {
  return `${kind}:${id}`;
}

export function parseNodeId(nodeId: string): {
  kind: WorldGraphEndpointKind;
  id: string;
} | null {
  const idx = nodeId.indexOf(":");
  if (idx < 0) return null;
  const kind = nodeId.slice(0, idx) as WorldGraphEndpointKind;
  if (kind !== "character" && kind !== "world_entry") return null;
  return { kind, id: nodeId.slice(idx + 1) };
}

export function normalizeGraphText(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

export function nodeMatchesSearch(node: Node<NodeData>, query: string): boolean {
  return (
    normalizeGraphText(node.data.label).includes(query) ||
    normalizeGraphText(node.data.category).includes(query)
  );
}

export function edgeMatchesSearch(edge: Edge<EdgeData>, query: string): boolean {
  return normalizeGraphText(edge.data?.label).includes(query);
}

export function intersectIds(source: Set<string>, keep: Set<string>): Set<string> {
  const next = new Set<string>();
  for (const id of source) {
    if (keep.has(id)) next.add(id);
  }
  return next;
}

export function collectNodeIdsWithinDepth(
  startId: string,
  edges: Edge<EdgeData>[],
  maxDepth: number,
): Set<string> {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  const seen = new Set<string>([startId]);
  let frontier = new Set<string>([startId]);
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const next = new Set<string>();
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          next.add(neighbor);
        }
      }
    }
    frontier = next;
    if (frontier.size === 0) break;
  }
  return seen;
}

export function findShortestRelationshipPath(
  startId: string,
  endId: string,
  edges: Edge<EdgeData>[],
): GraphPathResult | null {
  if (!startId || !endId) return null;
  if (startId === endId) {
    return { nodeIds: [startId], edgeIds: [], steps: [] };
  }

  const adjacency = new Map<string, GraphPathStep[]>();
  for (const edge of edges) {
    const label = edge.data?.label ?? null;
    const weight = edge.data?.weight ?? 1;
    const forward: GraphPathStep = {
      edgeId: edge.id,
      fromId: edge.source,
      toId: edge.target,
      label,
      weight,
    };
    const backward: GraphPathStep = {
      edgeId: edge.id,
      fromId: edge.target,
      toId: edge.source,
      label,
      weight,
    };
    adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), forward]);
    adjacency.set(edge.target, [...(adjacency.get(edge.target) ?? []), backward]);
  }

  for (const [nodeId, steps] of adjacency) {
    adjacency.set(
      nodeId,
      [...steps].sort((a, b) => {
        const weightDiff = b.weight - a.weight;
        if (weightDiff !== 0) return weightDiff;
        const labelDiff = String(a.label ?? "").localeCompare(
          String(b.label ?? ""),
          "zh-Hans-CN",
        );
        if (labelDiff !== 0) return labelDiff;
        return a.toId.localeCompare(b.toId, "zh-Hans-CN");
      }),
    );
  }

  const visited = new Set<string>([startId]);
  const queue = [startId];
  const previous = new Map<string, { prevId: string; step: GraphPathStep }>();

  for (let index = 0; index < queue.length; index += 1) {
    const currentId = queue[index];
    for (const step of adjacency.get(currentId) ?? []) {
      if (visited.has(step.toId)) continue;
      visited.add(step.toId);
      previous.set(step.toId, { prevId: currentId, step });
      if (step.toId === endId) {
        const nodeIds = [endId];
        const steps: GraphPathStep[] = [];
        let cursor = endId;
        while (cursor !== startId) {
          const prev = previous.get(cursor);
          if (!prev) return null;
          steps.push(prev.step);
          cursor = prev.prevId;
          nodeIds.push(cursor);
        }
        steps.reverse();
        nodeIds.reverse();
        return {
          nodeIds,
          edgeIds: steps.map((item) => item.edgeId),
          steps,
        };
      }
      queue.push(step.toId);
    }
  }

  return null;
}

export function summarizeGraphCommunities(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
): GraphCommunitySummary {
  const knownIds = new Set(nodes.map((node) => node.id));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, Set<string>>();
  const degreeById = new Map<string, number>();

  for (const node of nodes) {
    adjacency.set(node.id, new Set());
    degreeById.set(node.id, 0);
  }

  const validEdges = edges.filter(
    (edge) => knownIds.has(edge.source) && knownIds.has(edge.target),
  );
  for (const edge of validEdges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
    degreeById.set(edge.source, (degreeById.get(edge.source) ?? 0) + 1);
    degreeById.set(edge.target, (degreeById.get(edge.target) ?? 0) + 1);
  }

  const visited = new Set<string>();
  const communities: GraphCommunity[] = [];
  const isolatedNodes: GraphIsolatedNode[] = [];
  const bridgeNodes: GraphBridgeNode[] = [];
  const relationshipIssues: GraphRelationshipIssue[] = [];
  const sortedNodes = [...nodes].sort((a, b) =>
    String(a.data.label).localeCompare(String(b.data.label), "zh-Hans-CN"),
  );

  for (const node of sortedNodes) {
    if (visited.has(node.id)) continue;
    const neighbors = adjacency.get(node.id) ?? new Set<string>();
    if (neighbors.size === 0) {
      visited.add(node.id);
      isolatedNodes.push({
        id: node.id,
        label: node.data.label,
        kind: node.data.kind,
        category: node.data.category,
      });
      continue;
    }

    const nodeIds: string[] = [];
    const queue = [node.id];
    visited.add(node.id);

    for (let index = 0; index < queue.length; index += 1) {
      const currentId = queue[index];
      nodeIds.push(currentId);
      for (const neighborId of adjacency.get(currentId) ?? []) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        queue.push(neighborId);
      }
    }

    const componentIds = new Set(nodeIds);
    const componentEdges = validEdges.filter(
      (edge) => componentIds.has(edge.source) && componentIds.has(edge.target),
    );
    const sortedComponentNodes = nodeIds
      .map((id) => nodeById.get(id))
      .filter((item): item is Node<NodeData> => item !== undefined)
      .sort((a, b) => {
        const degreeDiff = (degreeById.get(b.id) ?? 0) - (degreeById.get(a.id) ?? 0);
        if (degreeDiff !== 0) return degreeDiff;
        return String(a.data.label).localeCompare(String(b.data.label), "zh-Hans-CN");
      });
    const totalWeight = componentEdges.reduce(
      (sum, edge) => sum + (edge.data?.weight ?? 1),
      0,
    );

    communities.push({
      id: `community:${[...nodeIds].sort().join("|")}`,
      nodeIds: [...nodeIds].sort(),
      edgeIds: componentEdges.map((edge) => edge.id).sort(),
      nodeCount: nodeIds.length,
      edgeCount: componentEdges.length,
      characterCount: sortedComponentNodes.filter(
        (item) => item.data.kind === "character",
      ).length,
      worldEntryCount: sortedComponentNodes.filter(
        (item) => item.data.kind === "world_entry",
      ).length,
      averageWeight:
        componentEdges.length > 0
          ? Math.round((totalWeight / componentEdges.length) * 10) / 10
          : 0,
      strongestNodeId: sortedComponentNodes[0]?.id ?? null,
      strongestNodeLabel: sortedComponentNodes[0]?.data.label ?? null,
      previewLabels: sortedComponentNodes.slice(0, 3).map((item) => item.data.label),
    });
  }

  for (const edge of validEdges) {
    const reasons: GraphRelationshipIssueReason[] = [];
    const label = edge.data?.label ?? null;
    const weight = edge.data?.weight ?? 1;
    if (!label?.trim()) reasons.push("missing_label");
    if (weight <= 2) reasons.push("weak_weight");
    if (reasons.length === 0) continue;

    relationshipIssues.push({
      id: edge.id,
      sourceId: edge.source,
      targetId: edge.target,
      sourceLabel: nodeById.get(edge.source)?.data.label ?? "未命名资料",
      targetLabel: nodeById.get(edge.target)?.data.label ?? "未命名资料",
      label,
      weight,
      reasons,
    });
  }

  for (const node of sortedNodes) {
    const neighbors = [...(adjacency.get(node.id) ?? [])];
    if (neighbors.length < 2) continue;

    const seenWithoutNode = new Set<string>([node.id]);
    const separatedGroups: string[][] = [];
    for (const neighborId of neighbors) {
      if (seenWithoutNode.has(neighborId)) continue;
      const group: string[] = [];
      const queue = [neighborId];
      seenWithoutNode.add(neighborId);

      for (let index = 0; index < queue.length; index += 1) {
        const currentId = queue[index];
        group.push(currentId);
        for (const nextId of adjacency.get(currentId) ?? []) {
          if (seenWithoutNode.has(nextId)) continue;
          seenWithoutNode.add(nextId);
          queue.push(nextId);
        }
      }

      separatedGroups.push(group);
    }

    if (separatedGroups.length < 2) continue;

    const previewLabels = separatedGroups
      .flatMap((group) =>
        group
          .map((id) => nodeById.get(id))
          .filter((item): item is Node<NodeData> => item !== undefined)
          .sort((a, b) => {
            const degreeDiff =
              (degreeById.get(b.id) ?? 0) - (degreeById.get(a.id) ?? 0);
            if (degreeDiff !== 0) return degreeDiff;
            return String(a.data.label).localeCompare(
              String(b.data.label),
              "zh-Hans-CN",
            );
          })
          .slice(0, 1),
      )
      .map((item) => item.data.label)
      .slice(0, 3);

    bridgeNodes.push({
      id: node.id,
      label: node.data.label,
      kind: node.data.kind,
      category: node.data.category,
      degree: degreeById.get(node.id) ?? neighbors.length,
      separatedGroupCount: separatedGroups.length,
      affectedNodeCount: separatedGroups.reduce(
        (sum, group) => sum + group.length,
        0,
      ),
      previewLabels,
    });
  }

  communities.sort((a, b) => {
    const nodeDiff = b.nodeCount - a.nodeCount;
    if (nodeDiff !== 0) return nodeDiff;
    const edgeDiff = b.edgeCount - a.edgeCount;
    if (edgeDiff !== 0) return edgeDiff;
    return String(a.strongestNodeLabel ?? "").localeCompare(
      String(b.strongestNodeLabel ?? ""),
      "zh-Hans-CN",
    );
  });
  bridgeNodes.sort((a, b) => {
    const groupDiff = b.separatedGroupCount - a.separatedGroupCount;
    if (groupDiff !== 0) return groupDiff;
    const affectedDiff = b.affectedNodeCount - a.affectedNodeCount;
    if (affectedDiff !== 0) return affectedDiff;
    const degreeDiff = b.degree - a.degree;
    if (degreeDiff !== 0) return degreeDiff;
    return a.label.localeCompare(b.label, "zh-Hans-CN");
  });
  relationshipIssues.sort((a, b) => {
    const reasonDiff = b.reasons.length - a.reasons.length;
    if (reasonDiff !== 0) return reasonDiff;
    const weightDiff = a.weight - b.weight;
    if (weightDiff !== 0) return weightDiff;
    const sourceDiff = a.sourceLabel.localeCompare(b.sourceLabel, "zh-Hans-CN");
    if (sourceDiff !== 0) return sourceDiff;
    return a.targetLabel.localeCompare(b.targetLabel, "zh-Hans-CN");
  });

  const connectedNodeCount = Math.max(0, nodes.length - isolatedNodes.length);
  const namedRelationshipCount = validEdges.filter((edge) =>
    Boolean(edge.data?.label?.trim()),
  ).length;
  const strongRelationshipCount = validEdges.filter(
    (edge) => (edge.data?.weight ?? 1) >= 7,
  ).length;
  const connectedRatio =
    nodes.length > 0 ? Math.round((connectedNodeCount / nodes.length) * 100) : 0;
  const namedRelationshipRatio =
    validEdges.length > 0
      ? Math.round((namedRelationshipCount / validEdges.length) * 100)
      : 0;
  const strongRelationshipRatio =
    validEdges.length > 0
      ? Math.round((strongRelationshipCount / validEdges.length) * 100)
      : 0;
  const score = Math.round(
    connectedRatio * 0.4 +
      namedRelationshipRatio * 0.35 +
      strongRelationshipRatio * 0.25,
  );
  const focus: GraphMaturityFocus =
    isolatedNodes.length > 0
      ? "connect_isolated"
      : namedRelationshipRatio < 85
        ? "name_relationships"
        : strongRelationshipRatio < 35 && validEdges.length > 0
          ? "strengthen_ties"
          : "keep_expanding";

  return {
    communities,
    isolatedNodes,
    bridgeNodes,
    relationshipIssues,
    maturity: {
      score,
      connectedRatio,
      namedRelationshipRatio,
      strongRelationshipRatio,
      connectedNodeCount,
      totalNodeCount: nodes.length,
      namedRelationshipCount,
      totalRelationshipCount: validEdges.length,
      strongRelationshipCount,
      focus,
    },
  };
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

function layoutWithRadial(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  overrides: Map<string, { x: number; y: number }>,
  centerNodeId?: string | null,
): Node<NodeData>[] {
  if (nodes.length === 0) return [];

  const nodeIds = new Set(nodes.map((node) => node.id));
  const adjacency = new Map<string, Set<string>>();
  for (const node of nodes) {
    adjacency.set(node.id, new Set());
  }
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  const center =
    centerNodeId && nodeIds.has(centerNodeId)
      ? centerNodeId
      : [...nodes]
          .sort((a, b) => {
            const degreeDiff =
              (adjacency.get(b.id)?.size ?? 0) - (adjacency.get(a.id)?.size ?? 0);
            if (degreeDiff !== 0) return degreeDiff;
            return String(a.data.label).localeCompare(String(b.data.label), "zh-Hans-CN");
          })[0]?.id;

  const depthById = new Map<string, number>();
  if (center) {
    depthById.set(center, 0);
    let frontier = new Set<string>([center]);
    for (let depth = 1; frontier.size > 0; depth += 1) {
      const next = new Set<string>();
      for (const id of frontier) {
        for (const neighbor of adjacency.get(id) ?? []) {
          if (depthById.has(neighbor)) continue;
          depthById.set(neighbor, depth);
          next.add(neighbor);
        }
      }
      frontier = next;
    }
  }

  const maxConnectedDepth = Math.max(0, ...depthById.values());
  const groups = new Map<number, Node<NodeData>[]>();
  for (const node of nodes) {
    const depth = depthById.get(node.id) ?? maxConnectedDepth + 1;
    const bucket = groups.get(depth) ?? [];
    bucket.push(node);
    groups.set(depth, bucket);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [depth, group] of groups) {
    const sorted = [...group].sort((a, b) => {
      const categoryDiff = String(a.data.category ?? "").localeCompare(
        String(b.data.category ?? ""),
        "zh-Hans-CN",
      );
      if (categoryDiff !== 0) return categoryDiff;
      return String(a.data.label).localeCompare(String(b.data.label), "zh-Hans-CN");
    });

    if (depth === 0) {
      for (const node of sorted) {
        positions.set(node.id, { x: -NODE_W / 2, y: -NODE_H / 2 });
      }
      continue;
    }

    const radius = 190 + (depth - 1) * 170 + Math.min(sorted.length, 10) * 8;
    const angleOffset = depth % 2 === 0 ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / sorted.length;
    sorted.forEach((node, index) => {
      const angle = angleOffset + (Math.PI * 2 * index) / sorted.length;
      positions.set(node.id, {
        x: Math.cos(angle) * radius - NODE_W / 2,
        y: Math.sin(angle) * radius - NODE_H / 2,
      });
    });
  }

  return nodes.map((node) => ({
    ...node,
    position: overrides.get(node.id) ?? positions.get(node.id) ?? node.position,
  }));
}

export function layoutGraph(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  mode: GraphLayoutMode,
  overrides: Map<string, { x: number; y: number }>,
  centerNodeId?: string | null,
): Node<NodeData>[] {
  if (mode === "radial") {
    return layoutWithRadial(nodes, edges, overrides, centerNodeId);
  }
  return layoutWithDagre(nodes, edges, overrides);
}
