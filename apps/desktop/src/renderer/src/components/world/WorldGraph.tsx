import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  type NodeChange,
  ReactFlow,
  applyNodeChanges,
} from "@xyflow/react";
import {
  ArrowRight,
  Focus,
  Network,
  Route,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
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
import { friendlyErrorMessage } from "../../lib/friendly-error";
import { fadeOnly, fadeSlideUp, hoverLift, tapPress } from "../../lib/motion-tokens";
import { useTimedStatus } from "../../lib/use-timed-status";
import {
  FOCUS_OPTIONS,
  KIND_OPTIONS,
  LAYOUT_OPTIONS,
  NODE_W,
  categoryColor,
  collectNodeIdsWithinDepth,
  edgeMatchesSearch,
  findShortestRelationshipPath,
  intersectIds,
  layoutGraph,
  makeNodeId,
  nodeMatchesSearch,
  normalizeGraphText,
  parseNodeId,
  summarizeGraphCommunities,
} from "./world-graph-logic";
import type {
  EdgeData,
  FocusDepth,
  GraphMaturityFocus,
  GraphRelationshipIssueReason,
  GraphLayoutMode,
  NodeData,
  NodeKindFilter,
} from "./world-graph-logic";

interface WorldGraphProps {
  projectId: string;
}

type StatusMessage = {
  kind: "success" | "error";
  text: string;
};

const RELATIONSHIP_ISSUE_TEXT: Record<GraphRelationshipIssueReason, string> = {
  missing_label: "补关系类型",
  weak_weight: "强度偏低",
};

const MATURITY_FOCUS_TEXT: Record<GraphMaturityFocus, string> = {
  connect_isolated: "先连接未接入资料",
  name_relationships: "补清关系类型",
  strengthen_ties: "加固关键关系",
  keep_expanding: "继续扩展关系网",
};

type WorldGraphViewState = {
  searchText: string;
  layoutMode: GraphLayoutMode;
  focusDepth: FocusDepth;
  nodeKindFilter: NodeKindFilter;
  selectedCategory: string;
  minWeight: number;
  showOnlyConnected: boolean;
};

type ScopedWorldGraphViewState = {
  projectId: string;
  values: WorldGraphViewState;
};

const WORLD_GRAPH_VIEW_STORAGE_PREFIX = "inkforge.world.graph.view.";
const DEFAULT_WORLD_GRAPH_VIEW_STATE: WorldGraphViewState = {
  searchText: "",
  layoutMode: "layers",
  focusDepth: "all",
  nodeKindFilter: "all",
  selectedCategory: "all",
  minWeight: 1,
  showOnlyConnected: false,
};

function graphViewStorageKey(projectId: string): string {
  return `${WORLD_GRAPH_VIEW_STORAGE_PREFIX}${projectId}`;
}

function isGraphLayoutMode(value: unknown): value is GraphLayoutMode {
  return value === "layers" || value === "radial";
}

function isFocusDepth(value: unknown): value is FocusDepth {
  return value === "all" || value === "one" || value === "two";
}

function isNodeKindFilter(value: unknown): value is NodeKindFilter {
  return value === "all" || value === "character" || value === "world_entry";
}

function clampGraphWeight(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_WORLD_GRAPH_VIEW_STATE.minWeight;
  return Math.min(10, Math.max(1, Math.round(numeric)));
}

function cleanStoredText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function loadWorldGraphViewState(projectId: string): WorldGraphViewState {
  if (typeof window === "undefined") return DEFAULT_WORLD_GRAPH_VIEW_STATE;

  try {
    const raw = window.localStorage.getItem(graphViewStorageKey(projectId));
    if (!raw) return DEFAULT_WORLD_GRAPH_VIEW_STATE;
    const parsed = JSON.parse(raw) as Partial<WorldGraphViewState>;
    const selectedCategory = cleanStoredText(parsed.selectedCategory, 96).trim();
    return {
      searchText: cleanStoredText(parsed.searchText, 160),
      layoutMode: isGraphLayoutMode(parsed.layoutMode)
        ? parsed.layoutMode
        : DEFAULT_WORLD_GRAPH_VIEW_STATE.layoutMode,
      focusDepth: isFocusDepth(parsed.focusDepth)
        ? parsed.focusDepth
        : DEFAULT_WORLD_GRAPH_VIEW_STATE.focusDepth,
      nodeKindFilter: isNodeKindFilter(parsed.nodeKindFilter)
        ? parsed.nodeKindFilter
        : DEFAULT_WORLD_GRAPH_VIEW_STATE.nodeKindFilter,
      selectedCategory: selectedCategory || DEFAULT_WORLD_GRAPH_VIEW_STATE.selectedCategory,
      minWeight: clampGraphWeight(parsed.minWeight),
      showOnlyConnected: parsed.showOnlyConnected === true,
    };
  } catch {
    return DEFAULT_WORLD_GRAPH_VIEW_STATE;
  }
}

function saveWorldGraphViewState(
  projectId: string,
  values: WorldGraphViewState,
): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      graphViewStorageKey(projectId),
      JSON.stringify({ version: 1, ...values }),
    );
  } catch {
    // Best-effort view memory; graph controls still work if storage is unavailable.
  }
}

export function WorldGraph({ projectId }: WorldGraphProps): JSX.Element {
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion() === true;
  const sideMotion = reduceMotion ? fadeOnly : fadeSlideUp;

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
  const { status, showStatus } = useTimedStatus<StatusMessage>();

  const saveMutation = useMutation({
    mutationFn: (input: WorldRelationshipSaveInput) =>
      worldRelationshipApi.save(input),
    onMutate: () => showStatus(null),
    onSuccess: () => {
      setShowCreateForm(null);
      showStatus({ kind: "success", text: "关系已保存" }, 2200);
      return queryClient.invalidateQueries({ queryKey: ["world-relationships"] });
    },
    onError: (err) => {
      showStatus({
        kind: "error",
        text: friendlyErrorMessage(err, "关系保存失败，请稍后重试。"),
      });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => worldRelationshipApi.delete({ id }),
    onMutate: () => showStatus(null),
    onSuccess: () => {
      setDeleteConfirming(false);
      setSelectedEdgeId(null);
      showStatus({ kind: "success", text: "关系已删除" }, 2200);
      return queryClient.invalidateQueries({ queryKey: ["world-relationships"] });
    },
    onError: (err) => {
      showStatus({
        kind: "error",
        text: friendlyErrorMessage(err, "关系删除失败，请稍后重试。"),
      });
    },
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
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [editLabel, setEditLabel] = useState("");
  const [editWeight, setEditWeight] = useState(5);
  const [graphViewState, setGraphViewState] = useState<ScopedWorldGraphViewState>(
    () => ({
      projectId,
      values: loadWorldGraphViewState(projectId),
    }),
  );
  const [pathStartId, setPathStartId] = useState<string | null>(null);
  const [pathEndId, setPathEndId] = useState<string | null>(null);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(
    null,
  );
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const {
    searchText,
    layoutMode,
    focusDepth,
    nodeKindFilter,
    selectedCategory,
    minWeight,
    showOnlyConnected,
  } = graphViewState.values;

  const updateGraphViewState = useCallback(
    (patch: Partial<WorldGraphViewState>) => {
      setGraphViewState((current) => {
        const base =
          current.projectId === projectId
            ? current.values
            : loadWorldGraphViewState(projectId);
        return {
          projectId,
          values: { ...base, ...patch },
        };
      });
    },
    [projectId],
  );
  const setSearchText = useCallback(
    (value: string) => updateGraphViewState({ searchText: value }),
    [updateGraphViewState],
  );
  const setFocusDepth = useCallback(
    (value: FocusDepth) => updateGraphViewState({ focusDepth: value }),
    [updateGraphViewState],
  );
  const setNodeKindFilter = useCallback(
    (value: NodeKindFilter) => updateGraphViewState({ nodeKindFilter: value }),
    [updateGraphViewState],
  );
  const setSelectedCategory = useCallback(
    (value: string) => updateGraphViewState({ selectedCategory: value }),
    [updateGraphViewState],
  );
  const setMinWeight = useCallback(
    (value: number) => updateGraphViewState({ minWeight: clampGraphWeight(value) }),
    [updateGraphViewState],
  );
  const setShowOnlyConnected = useCallback(
    (value: boolean) => updateGraphViewState({ showOnlyConnected: value }),
    [updateGraphViewState],
  );

  const characters = charactersQuery.data ?? [];
  const worldEntries = worldsQuery.data ?? [];
  const relationships = relationshipsQuery.data ?? [];

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const entry of worldEntries) {
      const category = entry.category.trim();
      if (category) set.add(category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  }, [worldEntries]);

  useEffect(() => {
    setGraphViewState({
      projectId,
      values: loadWorldGraphViewState(projectId),
    });
    dragOverridesRef.current.clear();
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setPendingSrcId(null);
    setShowCreateForm(null);
    setPathStartId(null);
    setPathEndId(null);
    setSelectedCommunityId(null);
    setHoveredNodeId(null);
  }, [projectId]);

  useEffect(() => {
    if (graphViewState.projectId !== projectId) return;
    saveWorldGraphViewState(projectId, graphViewState.values);
  }, [graphViewState, projectId]);

  useEffect(() => {
    if (!worldsQuery.isSuccess || selectedCategory === "all") return;
    if (!categoryOptions.includes(selectedCategory)) setSelectedCategory("all");
  }, [
    categoryOptions,
    selectedCategory,
    setSelectedCategory,
    worldsQuery.isSuccess,
  ]);

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
    const laid = layoutGraph(
      rawNodes,
      rawEdges,
      layoutMode,
      dragOverridesRef.current,
      selectedNodeId,
    );
    setNodes(laid);
    setEdges(rawEdges);
  }, [characters, layoutMode, relationships, worldEntries]);

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
  const onNodeMouseEnter = useCallback(
    (_evt: React.MouseEvent, node: Node<NodeData>) => {
      setHoveredNodeId(node.id);
    },
    [],
  );
  const onNodeMouseLeave = useCallback(
    (_evt: React.MouseEvent, _node: Node<NodeData>) => {
      setHoveredNodeId(null);
    },
    [],
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
    setHoveredNodeId(null);
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
    deleteMutation.mutate(selectedEdgeId);
  };

  useEffect(() => {
    setDeleteConfirming(false);
  }, [selectedEdgeId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setPendingSrcId(null);
      setShowCreateForm(null);
      setDeleteConfirming(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const availableIds = new Set(nodes.map((node) => node.id));
    setPathStartId((current) =>
      current && !availableIds.has(current) ? null : current,
    );
    setPathEndId((current) =>
      current && !availableIds.has(current) ? null : current,
    );
  }, [nodes]);

  const handleRelayout = () => {
    dragOverridesRef.current.clear();
    setNodes((nds) => layoutGraph(nds, edges, layoutMode, new Map(), selectedNodeId));
  };

  const handleLayoutModeChange = (nextMode: GraphLayoutMode): void => {
    updateGraphViewState({ layoutMode: nextMode });
    dragOverridesRef.current.clear();
    setNodes((nds) => layoutGraph(nds, edges, nextMode, new Map(), selectedNodeId));
  };

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId),
    [nodes, selectedNodeId],
  );

  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId),
    [edges, selectedEdgeId],
  );

  const nodeLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of nodes) {
      map.set(node.id, node.data.label);
    }
    return map;
  }, [nodes]);

  const degreeByNode = useMemo(() => {
    const map = new Map<string, number>();
    for (const edge of edges) {
      map.set(edge.source, (map.get(edge.source) ?? 0) + 1);
      map.set(edge.target, (map.get(edge.target) ?? 0) + 1);
    }
    return map;
  }, [edges]);

  const hubNodes = useMemo(() => {
    return [...nodes]
      .map((node) => ({
        id: node.id,
        label: node.data.label,
        kind: node.data.kind,
        category: node.data.category,
        degree: degreeByNode.get(node.id) ?? 0,
      }))
      .filter((item) => item.degree > 0)
      .sort((a, b) => {
        const degreeDiff = b.degree - a.degree;
        if (degreeDiff !== 0) return degreeDiff;
        return a.label.localeCompare(b.label, "zh-Hans-CN");
      })
      .slice(0, 5);
  }, [degreeByNode, nodes]);

  const selectedNodeLinks = useMemo(() => {
    if (!selectedNodeId) return [];
    return edges
      .filter((edge) => edge.source === selectedNodeId || edge.target === selectedNodeId)
      .map((edge) => {
        const otherId = edge.source === selectedNodeId ? edge.target : edge.source;
        return {
          id: edge.id,
          otherId,
          otherLabel: nodeLabelById.get(otherId) ?? "未命名资料",
          label: edge.data?.label ?? "关系",
          weight: edge.data?.weight ?? 1,
        };
      })
      .sort((a, b) => b.weight - a.weight);
  }, [edges, nodeLabelById, selectedNodeId]);

  const communitySummary = useMemo(
    () =>
      summarizeGraphCommunities(
        nodes,
        edges.filter((edge) => (edge.data?.weight ?? 1) >= minWeight),
      ),
    [edges, minWeight, nodes],
  );
  const selectedCommunity = useMemo(
    () =>
      selectedCommunityId
        ? (communitySummary.communities.find(
            (community) => community.id === selectedCommunityId,
          ) ?? null)
        : null,
    [communitySummary.communities, selectedCommunityId],
  );
  const selectedNodeCommunity = useMemo(() => {
    if (!selectedNodeId) return null;
    return (
      communitySummary.communities.find((community) =>
        community.nodeIds.includes(selectedNodeId),
      ) ?? null
    );
  }, [communitySummary.communities, selectedNodeId]);
  const topCommunities = communitySummary.communities.slice(0, 4);
  const topBridgeNodes = communitySummary.bridgeNodes.slice(0, 4);
  const topIsolatedNodes = communitySummary.isolatedNodes.slice(0, 5);
  const topRelationshipIssues = communitySummary.relationshipIssues.slice(0, 5);
  const selectedBridgeNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return (
      communitySummary.bridgeNodes.find((bridge) => bridge.id === selectedNodeId) ??
      null
    );
  }, [communitySummary.bridgeNodes, selectedNodeId]);
  const selectedIsolatedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return (
      communitySummary.isolatedNodes.find((node) => node.id === selectedNodeId) ??
      null
    );
  }, [communitySummary.isolatedNodes, selectedNodeId]);
  const selectedRelationshipIssue = useMemo(() => {
    if (!selectedEdgeId) return null;
    return (
      communitySummary.relationshipIssues.find((issue) => issue.id === selectedEdgeId) ??
      null
    );
  }, [communitySummary.relationshipIssues, selectedEdgeId]);

  useEffect(() => {
    setSelectedCommunityId((current) =>
      current &&
      !communitySummary.communities.some((community) => community.id === current)
        ? null
        : current,
    );
  }, [communitySummary.communities]);

  const pathStartLabel = pathStartId
    ? nodeLabelById.get(pathStartId) ?? "未命名资料"
    : null;
  const pathEndLabel = pathEndId
    ? nodeLabelById.get(pathEndId) ?? "未命名资料"
    : null;
  const pathResult = useMemo(() => {
    if (!pathStartId || !pathEndId) return null;
    return findShortestRelationshipPath(
      pathStartId,
      pathEndId,
      edges.filter((edge) => (edge.data?.weight ?? 1) >= minWeight),
    );
  }, [edges, minWeight, pathEndId, pathStartId]);

  const clearPathSelection = (): void => {
    setPathStartId(null);
    setPathEndId(null);
  };

  const setSelectedAsPathStart = (): void => {
    if (!selectedNode) return;
    setPathStartId(selectedNode.id);
    setPathEndId((current) => (current === selectedNode.id ? null : current));
  };

  const setSelectedAsPathEnd = (): void => {
    if (!selectedNode) return;
    setPathEndId(selectedNode.id);
    setPathStartId((current) => (current === selectedNode.id ? null : current));
  };

  const focusCommunity = (
    communityId: string,
    preferredNodeId?: string | null,
  ): void => {
    const community = communitySummary.communities.find(
      (item) => item.id === communityId,
    );
    if (!community) return;

    setSelectedCommunityId(community.id);
    setSelectedEdgeId(null);
    setPendingSrcId(null);
    const nextNodeId =
      preferredNodeId && community.nodeIds.includes(preferredNodeId)
        ? preferredNodeId
        : community.strongestNodeId;
    if (!nextNodeId) return;

    setSelectedNodeId(nextNodeId);
    if (layoutMode === "radial") {
      setNodes((nds) =>
        layoutGraph(nds, edges, "radial", dragOverridesRef.current, nextNodeId),
      );
    }
  };

  const clearCommunityFocus = (): void => {
    setSelectedCommunityId(null);
  };

  const focusBridgeNode = (nodeId: string): void => {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setPendingSrcId(null);
    setSelectedCommunityId(null);
    if (layoutMode === "radial") {
      setNodes((nds) =>
        layoutGraph(nds, edges, "radial", dragOverridesRef.current, nodeId),
      );
    }
  };

  const focusIsolatedNode = (nodeId: string): void => {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setPendingSrcId(null);
    setSelectedCommunityId(null);
  };

  const focusRelationshipIssue = (edgeId: string): boolean => {
    const edge = edges.find((item) => item.id === edgeId);
    if (!edge) return false;
    setSelectedNodeId(null);
    setPendingSrcId(null);
    setSelectedCommunityId(null);
    setSelectedEdgeId(edge.id);
    setEditLabel(edge.data?.label ?? "");
    setEditWeight(edge.data?.weight ?? 5);
    return true;
  };

  const graphFiltersActive =
    searchText.trim().length > 0 ||
    focusDepth !== "all" ||
    nodeKindFilter !== "all" ||
    selectedCategory !== "all" ||
    minWeight > 1 ||
    showOnlyConnected ||
    selectedCommunityId !== null;

  const resetGraphFilters = (): void => {
    updateGraphViewState({
      searchText: "",
      focusDepth: "all",
      nodeKindFilter: "all",
      selectedCategory: "all",
      minWeight: 1,
      showOnlyConnected: false,
    });
    setSelectedCommunityId(null);
  };

  const handleMaturityFocusAction = (): void => {
    resetGraphFilters();

    if (communitySummary.maturity.focus === "connect_isolated") {
      const isolatedNode = communitySummary.isolatedNodes[0];
      if (isolatedNode) {
        focusIsolatedNode(isolatedNode.id);
        showStatus(
          {
            kind: "success",
            text: "已定位一份未接入资料，可以从右侧开始建立关系。",
          },
          2600,
        );
        return;
      }
    }

    if (communitySummary.maturity.focus === "name_relationships") {
      const issue =
        communitySummary.relationshipIssues.find((item) =>
          item.reasons.includes("missing_label"),
        ) ?? communitySummary.relationshipIssues[0];
      if (issue && focusRelationshipIssue(issue.id)) {
        showStatus(
          {
            kind: "success",
            text: "已打开一段待补类型的关系。",
          },
          2600,
        );
        return;
      }
    }

    if (communitySummary.maturity.focus === "strengthen_ties") {
      const weakIssue =
        communitySummary.relationshipIssues.find((item) =>
          item.reasons.includes("weak_weight"),
        ) ??
        [...edges].sort(
          (left, right) =>
            (left.data?.weight ?? 1) - (right.data?.weight ?? 1),
        )[0];
      if (weakIssue && focusRelationshipIssue(weakIssue.id)) {
        showStatus(
          {
            kind: "success",
            text: "已打开一段强度偏低的关系。",
          },
          2600,
        );
        return;
      }
    }

    const largestCommunity = communitySummary.communities[0];
    if (largestCommunity) {
      focusCommunity(largestCommunity.id, largestCommunity.strongestNodeId);
      showStatus(
        {
          kind: "success",
          text: "已聚焦最大的关系社群，可以继续向外补新连接。",
        },
        2600,
      );
      return;
    }

    if (nodes[0]) {
      focusIsolatedNode(nodes[0].id);
      showStatus(
        {
          kind: "success",
          text: "先从这份资料开始建立第一段关系。",
        },
        2600,
      );
      return;
    }

    showStatus({
      kind: "success",
      text: "先添加人物或世界条目，图谱会在这里生长。",
    });
  };

  const filteredGraph = useMemo(() => {
    const query = normalizeGraphText(searchText);
    const weightedEdges = edges.filter((edge) => (edge.data?.weight ?? 1) >= minWeight);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const pathNodeIds = new Set(pathResult?.nodeIds ?? []);
    const pathEdgeIds = new Set(pathResult?.edgeIds ?? []);
    if (pathStartId) pathNodeIds.add(pathStartId);
    if (pathEndId) pathNodeIds.add(pathEndId);
    const communityNodeIds = new Set(selectedCommunity?.nodeIds ?? []);
    const communityEdgeIds = new Set(selectedCommunity?.edgeIds ?? []);
    const bridgeNodeIds = new Set(
      communitySummary.bridgeNodes.map((bridge) => bridge.id),
    );
    const isolatedNodeIds = new Set(
      communitySummary.isolatedNodes.map((node) => node.id),
    );
    const relationshipIssueEdgeIds = new Set(
      communitySummary.relationshipIssues.map((issue) => issue.id),
    );
    const connectedIds = new Set<string>();
    for (const edge of weightedEdges) {
      connectedIds.add(edge.source);
      connectedIds.add(edge.target);
    }

    let allowedIds = new Set(nodes.map((node) => node.id));

    if (nodeKindFilter !== "all") {
      allowedIds = intersectIds(
        allowedIds,
        new Set(
          nodes
            .filter((node) => node.data.kind === nodeKindFilter)
            .map((node) => node.id),
        ),
      );
    }

    if (selectedCategory !== "all") {
      const categoryEntryIds = new Set(
        nodes
          .filter(
            (node) =>
              node.data.kind === "world_entry" && node.data.category === selectedCategory,
          )
          .map((node) => node.id),
      );
      const relatedIds = new Set<string>(categoryEntryIds);
      if (nodeKindFilter !== "world_entry") {
        for (const edge of weightedEdges) {
          if (categoryEntryIds.has(edge.source)) {
            const targetNode = nodeById.get(edge.target);
            if (targetNode?.data.kind === "character") relatedIds.add(edge.target);
          }
          if (categoryEntryIds.has(edge.target)) {
            const sourceNode = nodeById.get(edge.source);
            if (sourceNode?.data.kind === "character") relatedIds.add(edge.source);
          }
        }
      }
      allowedIds = intersectIds(allowedIds, relatedIds);
    }

    if (showOnlyConnected) {
      allowedIds = intersectIds(allowedIds, connectedIds);
    }

    const searchHitIds = new Set<string>();
    const searchHitEdgeIds = new Set<string>();
    if (query) {
      for (const node of nodes) {
        if (nodeMatchesSearch(node, query)) searchHitIds.add(node.id);
      }
      for (const edge of weightedEdges) {
        if (edgeMatchesSearch(edge, query)) {
          searchHitEdgeIds.add(edge.id);
          searchHitIds.add(edge.source);
          searchHitIds.add(edge.target);
        }
      }
      allowedIds = intersectIds(allowedIds, searchHitIds);
    }

    if (focusDepth !== "all" && selectedNodeId) {
      const depth = focusDepth === "one" ? 1 : 2;
      const focusIds = collectNodeIdsWithinDepth(selectedNodeId, weightedEdges, depth);
      allowedIds = intersectIds(allowedIds, focusIds);
      if (allowedIds.size === 0 && nodeById.has(selectedNodeId)) {
        allowedIds.add(selectedNodeId);
      }
    }

    if (selectedCommunity) {
      allowedIds = intersectIds(allowedIds, communityNodeIds);
    }

    for (const id of pathNodeIds) {
      if (nodeById.has(id)) allowedIds.add(id);
    }

    const visibleEdgesBase = weightedEdges.filter(
      (edge) => allowedIds.has(edge.source) && allowedIds.has(edge.target),
    );
    const selectedNeighborIds = selectedNodeId
      ? collectNodeIdsWithinDepth(selectedNodeId, visibleEdgesBase, 1)
      : new Set<string>();
    const hoveredNeighborIds = hoveredNodeId
      ? collectNodeIdsWithinDepth(hoveredNodeId, visibleEdgesBase, 1)
      : new Set<string>();
    const hoveredEdgeIds = new Set<string>();
    if (hoveredNodeId) {
      for (const edge of visibleEdgesBase) {
        if (edge.source === hoveredNodeId || edge.target === hoveredNodeId) {
          hoveredEdgeIds.add(edge.id);
        }
      }
    }

    const graphNodes = nodes
      .filter((node) => allowedIds.has(node.id))
      .map<Node<NodeData>>((node) => {
        const isSelected = node.id === selectedNodeId;
        const isSearchHit = query.length > 0 && searchHitIds.has(node.id);
        const isPathNode = pathNodeIds.has(node.id);
        const isHoveredNode = node.id === hoveredNodeId;
        const isCommunityNode = communityNodeIds.has(node.id);
        const isBridgeNode = bridgeNodeIds.has(node.id);
        const isIsolatedNode = isolatedNodeIds.has(node.id);
        const isHoveredNeighbor =
          hoveredNodeId !== null &&
          node.id !== hoveredNodeId &&
          hoveredNeighborIds.has(node.id);
        const isSelectedNeighbor =
          selectedNodeId !== null && node.id !== selectedNodeId && selectedNeighborIds.has(node.id);
        const baseBorder = String(node.style?.border ?? "2px solid #1f2937");
        const border = isSelected
          ? "2px solid #38bdf8"
          : isPathNode
            ? "2px solid #34d399"
          : isSearchHit
            ? "2px solid #facc15"
            : isHoveredNode
              ? "2px solid #93c5fd"
              : isBridgeNode
                  ? "2px solid #7dd3fc"
                  : isCommunityNode
                    ? "2px solid #a78bfa"
                    : isIsolatedNode
                      ? "2px dashed #fbbf24"
                      : baseBorder;
        const boxShadow = isSelected
          ? "0 0 0 3px rgba(56, 189, 248, 0.28), 0 10px 30px rgba(14, 165, 233, 0.18)"
          : isPathNode
            ? "0 0 0 3px rgba(52, 211, 153, 0.2), 0 10px 28px rgba(16, 185, 129, 0.12)"
            : isSearchHit
              ? "0 0 0 3px rgba(250, 204, 21, 0.22)"
              : isHoveredNode
                ? "0 0 0 3px rgba(147, 197, 253, 0.28), 0 10px 30px rgba(59, 130, 246, 0.16)"
                : isBridgeNode
                  ? "0 0 0 3px rgba(125, 211, 252, 0.22), 0 10px 28px rgba(14, 165, 233, 0.12)"
                  : isCommunityNode
                    ? "0 0 0 3px rgba(167, 139, 250, 0.18), 0 10px 28px rgba(124, 58, 237, 0.12)"
                    : isHoveredNeighbor
                      ? "0 0 0 2px rgba(147, 197, 253, 0.2)"
                      : isSelectedNeighbor
                        ? "0 0 0 2px rgba(125, 211, 252, 0.16)"
                        : isIsolatedNode
                          ? "0 0 0 3px rgba(251, 191, 36, 0.16)"
                          : node.style?.boxShadow;
        const dimmedBySelection =
          selectedNodeId !== null &&
          !selectedNeighborIds.has(node.id) &&
          !isPathNode &&
          !isCommunityNode &&
          !isBridgeNode &&
          !isIsolatedNode;
        const dimmedByHover =
          hoveredNodeId !== null &&
          !hoveredNeighborIds.has(node.id) &&
          !isSelected &&
          !isSearchHit &&
          !isPathNode &&
          !isCommunityNode &&
          !isBridgeNode &&
          !isIsolatedNode;

        return {
          ...node,
          style: {
          ...node.style,
          border,
          boxShadow,
          opacity: dimmedBySelection || dimmedByHover ? 0.64 : 1,
          transition: reduceMotion
            ? undefined
            : "border-color 160ms ease, box-shadow 220ms ease, opacity 160ms ease",
        },
      };
    });

    const graphEdges = visibleEdgesBase.map<Edge<EdgeData>>((edge) => {
      const weight = edge.data?.weight ?? 1;
      const isSelected = edge.id === selectedEdgeId;
      const isSearchHit = query.length > 0 && searchHitEdgeIds.has(edge.id);
      const isPathEdge = pathEdgeIds.has(edge.id);
      const isCommunityEdge = communityEdgeIds.has(edge.id);
      const isRelationshipIssue = relationshipIssueEdgeIds.has(edge.id);
      const isHoverEdge = hoveredEdgeIds.has(edge.id);
      const stroke = isSelected
        ? "#38bdf8"
        : isPathEdge
          ? "#34d399"
          : isSearchHit
            ? "#facc15"
            : isCommunityEdge
              ? "#a78bfa"
              : isRelationshipIssue
                ? "#fbbf24"
                : isHoverEdge
                  ? "#93c5fd"
                  : weight >= 7
                    ? "#e2e8f0"
                    : "#94a3b8";
      return {
        ...edge,
        animated: !reduceMotion && (isSelected || isPathEdge || isCommunityEdge),
        style: {
          ...edge.style,
          stroke,
          strokeWidth:
            isSelected || isPathEdge || isCommunityEdge || isHoverEdge
              ? 2.6 + weight * 0.35
              : isRelationshipIssue
                ? 1.8 + weight * 0.35
                : 1 + weight * 0.35,
          opacity:
            isSelected ||
            isSearchHit ||
            isPathEdge ||
            isCommunityEdge ||
            isHoverEdge ||
            isRelationshipIssue
              ? 1
              : hoveredNodeId
                ? 0.44
                : 0.82,
          transition: reduceMotion
            ? undefined
            : "stroke 180ms ease, stroke-width 180ms ease, opacity 160ms ease",
        },
        labelStyle: {
          ...edge.labelStyle,
          fill:
            isSelected ||
            isPathEdge ||
            isSearchHit ||
            isCommunityEdge ||
            isHoverEdge ||
            isRelationshipIssue
              ? "#e0f2fe"
              : "#cbd5e1",
          fontWeight:
            isSelected ||
            isPathEdge ||
            isSearchHit ||
            isCommunityEdge ||
            isHoverEdge ||
            isRelationshipIssue
              ? 700
              : 500,
        },
      };
    });

    return {
      nodes: graphNodes,
      edges: graphEdges,
      connectedCount: connectedIds.size,
      visibleNodeCount: graphNodes.length,
      visibleEdgeCount: graphEdges.length,
      totalNodeCount: nodes.length,
      totalEdgeCount: edges.length,
    };
  }, [
    edges,
    focusDepth,
    hoveredNodeId,
    communitySummary.bridgeNodes,
    communitySummary.isolatedNodes,
    communitySummary.relationshipIssues,
    minWeight,
    nodeKindFilter,
    nodes,
    pathEndId,
    pathResult,
    pathStartId,
    reduceMotion,
    searchText,
    selectedCategory,
    selectedCommunity,
    selectedEdgeId,
    selectedNodeId,
    showOnlyConnected,
  ]);

  const renderPathPanel = (): JSX.Element => (
    <div className="space-y-2 rounded-md border border-ink-700 bg-ink-950/50 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink-400">
          <Route aria-hidden className="h-3.5 w-3.5 text-emerald-300" />
          路径分析
        </div>
        {pathStartId || pathEndId ? (
          <button
            type="button"
            onClick={clearPathSelection}
            className="rounded px-1.5 py-0.5 text-[10px] text-ink-500 hover:bg-ink-800 hover:text-ink-200"
          >
            清除
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5 text-ink-300">
        <span className="min-w-0 flex-1 truncate">
          {pathStartLabel ?? "选择起点"}
        </span>
        <ArrowRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-600" />
        <span className="min-w-0 flex-1 truncate text-right">
          {pathEndLabel ?? "选择终点"}
        </span>
      </div>
      {pathStartId && pathEndId ? (
        pathResult ? (
          <div className="space-y-1">
            <p className="text-ink-500">
              最短路径包含 {pathResult.steps.length} 段关系，已在图谱中高亮。
            </p>
            {pathResult.steps.map((step, index) => (
              <button
                key={`${step.edgeId}-${index}`}
                type="button"
                onClick={() => {
                  const edge = edges.find((item) => item.id === step.edgeId);
                  setPendingSrcId(null);
                  setSelectedEdgeId(step.edgeId);
                  setSelectedNodeId(null);
                  setEditLabel(edge?.data?.label ?? step.label ?? "");
                  setEditWeight(edge?.data?.weight ?? step.weight);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-left hover:border-emerald-400/40 hover:bg-emerald-500/20"
              >
                <span className="min-w-0 truncate text-ink-200">
                  {nodeLabelById.get(step.fromId) ?? "未命名资料"} →{" "}
                  {nodeLabelById.get(step.toId) ?? "未命名资料"}
                </span>
                <span className="shrink-0 rounded bg-ink-900 px-1.5 py-[1px] text-[10px] text-emerald-200">
                  {step.label ?? "关系"} · {step.weight}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-ink-700 px-2 py-2 text-ink-500">
            当前最低强度下没有可达路径；降低强度，或补一条关键关系会更清楚。
          </p>
        )
      ) : (
        <p className="text-ink-500">
          选择两个资料点后，会标出它们之间最短的关系链。
        </p>
      )}
    </div>
  );

  return (
    <div className="flex h-full w-full">
      <div className="relative flex-1 bg-ink-950">
        <ReactFlow
          nodes={filteredGraph.nodes}
          edges={filteredGraph.edges}
          onNodesChange={onNodesChange}
          onNodeClick={onNodeClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          fitView
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#334155" gap={24} />
          <MiniMap
            position="bottom-left"
            pannable
            zoomable
            maskColor="rgba(2, 6, 23, 0.58)"
            nodeColor={(node) => {
              const data = node.data as NodeData;
              return data.kind === "character" ? "#60a5fa" : categoryColor(data.category);
            }}
            nodeStrokeWidth={3}
            className="!border !border-ink-700 !bg-ink-900/85"
          />
          <Controls position="bottom-right" showInteractive={false} />
        </ReactFlow>
        <div className="absolute left-3 top-3 z-10 w-[330px] rounded-lg border border-ink-700/80 bg-ink-900/88 p-3 text-xs text-ink-200 shadow-xl shadow-ink-950/35 backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-medium text-ink-100">
              <Network aria-hidden className="h-4 w-4 text-accent-300" />
              关系图谱
            </div>
            <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[11px] text-ink-400">
              {filteredGraph.visibleNodeCount}/{filteredGraph.totalNodeCount} 资料点 ·{" "}
              {filteredGraph.visibleEdgeCount}/{filteredGraph.totalEdgeCount} 关系
            </span>
          </div>

          <label className="relative block" htmlFor="world-graph-search">
            <span className="sr-only">搜索关系图谱</span>
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500"
            />
            <input
              id="world-graph-search"
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="搜索人物、条目或关系"
              className="h-8 w-full rounded-md border border-ink-700 bg-ink-950 px-7 text-ink-100 outline-none placeholder:text-ink-500 focus:border-accent-500/70"
            />
            {searchText ? (
              <button
                type="button"
                onClick={() => setSearchText("")}
                className="absolute right-1.5 top-1/2 rounded p-1 text-ink-500 hover:bg-ink-800 hover:text-ink-200"
                aria-label="清空图谱搜索"
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </label>

          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-[46px_1fr] items-center gap-2">
              <span className="text-ink-500">布局</span>
              <div className="grid grid-cols-2 gap-1 rounded-md border border-ink-700 bg-ink-950 p-0.5">
                {LAYOUT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleLayoutModeChange(option.value)}
                    aria-pressed={layoutMode === option.value}
                    className={`rounded px-2 py-1 transition-colors ${
                      layoutMode === option.value
                        ? "bg-accent-500/25 text-accent-200"
                        : "text-ink-400 hover:bg-ink-800 hover:text-ink-100"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Focus aria-hidden className="h-3.5 w-3.5 text-ink-500" />
              {FOCUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFocusDepth(option.value)}
                  disabled={option.value !== "all" && !selectedNodeId}
                  className={`rounded px-2 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    focusDepth === option.value
                      ? "bg-accent-500/25 text-accent-200"
                      : "text-ink-400 hover:bg-ink-800 hover:text-ink-100"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <SlidersHorizontal aria-hidden className="h-3.5 w-3.5 text-ink-500" />
              {KIND_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setNodeKindFilter(option.value)}
                  className={`rounded px-2 py-1 transition-colors ${
                    nodeKindFilter === option.value
                      ? "bg-accent-500/25 text-accent-200"
                      : "text-ink-400 hover:bg-ink-800 hover:text-ink-100"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-[82px_1fr] items-center gap-2">
              <label htmlFor="world-graph-category" className="text-ink-500">
                分类
              </label>
              <select
                id="world-graph-category"
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value)}
                className="h-7 rounded-md border border-ink-700 bg-ink-950 px-2 text-ink-100 outline-none focus:border-accent-500/70"
              >
                <option value="all">全部分类</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>

              <label htmlFor="world-graph-min-weight" className="text-ink-500">
                最低强度
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="world-graph-min-weight"
                  type="range"
                  min={1}
                  max={10}
                  value={minWeight}
                  onChange={(event) => setMinWeight(Number(event.target.value))}
                  className="min-w-0 flex-1"
                />
                <span className="w-4 text-right tabular-nums text-ink-300">{minWeight}</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 text-ink-400">
                <input
                  id="world-graph-connected-only"
                  type="checkbox"
                  checked={showOnlyConnected}
                  onChange={(event) => setShowOnlyConnected(event.target.checked)}
                  aria-label="只看已相连的资料点"
                  className="h-3.5 w-3.5 accent-accent-500"
                />
                <label htmlFor="world-graph-connected-only">
                  只看已相连
                </label>
              </div>
              <div className="flex gap-1">
                {graphFiltersActive ? (
                  <button
                    type="button"
                    onClick={resetGraphFilters}
                    className="rounded border border-ink-700 px-2 py-1 text-ink-300 hover:bg-ink-800"
                  >
                    清除筛选
                  </button>
                ) : null}
                <motion.button
                  className="rounded border border-ink-700 px-2 py-1 text-ink-300 hover:bg-ink-800"
                  type="button"
                  onClick={handleRelayout}
                  whileHover={reduceMotion ? undefined : hoverLift}
                  whileTap={reduceMotion ? undefined : tapPress}
                >
                  重排
                </motion.button>
              </div>
            </div>
          </div>

          {pendingSrcId ? (
            <motion.div
              className="mt-2 flex items-center justify-between gap-2 rounded-md bg-accent-500/90 px-2 py-1 text-ink-900"
              variants={sideMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <span>正在选择目标资料点</span>
              <button
                type="button"
                onClick={() => setPendingSrcId(null)}
                className="rounded px-1.5 py-0.5 text-ink-900/80 hover:bg-ink-900/10 hover:text-ink-950"
              >
                取消
              </button>
            </motion.div>
          ) : null}
          {selectedCommunity ? (
            <motion.div
              className="mt-2 flex items-center justify-between gap-2 rounded-md border border-violet-400/30 bg-violet-500/15 px-2 py-1 text-violet-100"
              variants={sideMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <Network aria-hidden className="h-3.5 w-3.5 shrink-0 text-violet-200" />
                <span className="min-w-0 truncate">
                  正在查看 {selectedCommunity.previewLabels.join("、")} 等{" "}
                  {selectedCommunity.nodeCount} 份资料
                </span>
              </div>
              <button
                type="button"
                onClick={clearCommunityFocus}
                className="shrink-0 rounded px-1.5 py-0.5 text-violet-100/75 hover:bg-violet-400/10 hover:text-violet-50"
              >
                显示全部
              </button>
            </motion.div>
          ) : null}
          {pathStartId || pathEndId ? (
            <motion.div
              className="mt-2 flex items-center justify-between gap-2 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-emerald-100"
              variants={sideMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <Route aria-hidden className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                <span className="min-w-0 truncate">
                  {pathStartLabel ?? "选择起点"} → {pathEndLabel ?? "选择终点"}
                </span>
              </div>
              <button
                type="button"
                onClick={clearPathSelection}
                className="shrink-0 rounded px-1.5 py-0.5 text-emerald-100/75 hover:bg-emerald-400/10 hover:text-emerald-50"
              >
                清除
              </button>
            </motion.div>
          ) : null}
        </div>
      </div>

      <aside className="w-[300px] shrink-0 border-l border-ink-700 bg-ink-900 p-3 text-xs text-ink-100">
        <AnimatePresence mode="wait" initial={false}>
          {showCreateForm ? (
            <motion.div
              key="create"
              className="space-y-2"
              variants={sideMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <h3 className="text-sm font-semibold text-accent-300">建立关系</h3>
              <div className="flex items-center gap-1.5 text-ink-300">
                <span className="font-medium">{showCreateForm.src.label}</span>
                <ArrowRight aria-hidden className="h-3.5 w-3.5 text-ink-500" />
                <span className="font-medium">{showCreateForm.dst.label}</span>
              </div>
              <label className="block space-y-1" htmlFor="world-graph-create-label">
                <span className="text-ink-300">关系类型</span>
                <input
                  id="world-graph-create-label"
                  type="text"
                  placeholder="例如：师徒、掌门、属于"
                  className="w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-1"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                />
              </label>
              <label className="block space-y-1" htmlFor="world-graph-create-weight">
                <span className="text-ink-300">强度 {editWeight}</span>
                <input
                  id="world-graph-create-weight"
                  type="range"
                  min={1}
                  max={10}
                  value={editWeight}
                  onChange={(e) => setEditWeight(Number(e.target.value))}
                  className="w-full"
                />
              </label>
              <div className="flex gap-2">
                <motion.button
                  className="rounded-md bg-accent-500 px-3 py-1 text-ink-900 hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={handleCreateRelationship}
                  disabled={saveMutation.isPending}
                  whileHover={reduceMotion ? undefined : hoverLift}
                  whileTap={reduceMotion ? undefined : tapPress}
                >
                  {saveMutation.isPending ? "创建中" : "创建"}
                </motion.button>
                <motion.button
                  className="rounded-md border border-ink-600 px-3 py-1 hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                  onClick={() => setShowCreateForm(null)}
                  disabled={saveMutation.isPending}
                  whileHover={reduceMotion ? undefined : hoverLift}
                  whileTap={reduceMotion ? undefined : tapPress}
                >
                  取消
                </motion.button>
              </div>
            </motion.div>
          ) : selectedEdgeId ? (
            <motion.div
              key="edit"
              className="space-y-2"
              variants={sideMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <h3 className="text-sm font-semibold text-accent-300">编辑关系</h3>
              {selectedEdge ? (
                <div className="flex items-center gap-1.5 text-ink-400">
                  <span className="min-w-0 truncate">
                    {nodeLabelById.get(selectedEdge.source) ?? "未命名资料"}
                  </span>
                  <ArrowRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-600" />
                  <span className="min-w-0 truncate">
                    {nodeLabelById.get(selectedEdge.target) ?? "未命名资料"}
                  </span>
                </div>
              ) : null}
              {selectedRelationshipIssue ? (
                <div className="rounded-md border border-amber-400/25 bg-amber-500/10 p-2">
                  <div className="text-[11px] font-medium text-amber-100">
                    关系待完善
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectedRelationshipIssue.reasons.map((reason) => (
                      <span
                        key={reason}
                        className="rounded bg-amber-400/10 px-1.5 py-[1px] text-[10px] text-amber-100/80"
                      >
                        {RELATIONSHIP_ISSUE_TEXT[reason]}
                      </span>
                    ))}
                  </div>
                  <div className="mt-1 text-[11px] text-amber-100/65">
                    补清关系类型或提高强度后，图谱会更容易读出资料之间的主线。
                  </div>
                </div>
              ) : null}
              <label className="block space-y-1" htmlFor="world-graph-edit-label">
                <span className="text-ink-300">关系类型</span>
                <input
                  id="world-graph-edit-label"
                  type="text"
                  placeholder="关系类型"
                  className="w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-1"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                />
              </label>
              <label className="block space-y-1" htmlFor="world-graph-edit-weight">
                <span className="text-ink-300">强度 {editWeight}</span>
                <input
                  id="world-graph-edit-weight"
                  type="range"
                  min={1}
                  max={10}
                  value={editWeight}
                  onChange={(e) => setEditWeight(Number(e.target.value))}
                  className="w-full"
                />
              </label>
              <div className="flex gap-2">
                <motion.button
                  className="rounded-md bg-accent-500 px-3 py-1 text-ink-900 hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={handleUpdateRelationship}
                  disabled={saveMutation.isPending || deleteMutation.isPending}
                  whileHover={reduceMotion ? undefined : hoverLift}
                  whileTap={reduceMotion ? undefined : tapPress}
                >
                  {saveMutation.isPending ? "保存中" : "保存"}
                </motion.button>
                <AnimatePresence initial={false} mode="wait">
                  {deleteConfirming ? (
                    <motion.div
                      key="delete-confirm"
                      variants={reduceMotion ? fadeOnly : fadeSlideUp}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      className="flex gap-1"
                    >
                      <button
                        className="rounded-md border border-ink-700 px-2 py-1 text-ink-300 hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50"
                        type="button"
                        onClick={() => setDeleteConfirming(false)}
                        disabled={deleteMutation.isPending}
                      >
                        取消
                      </button>
                      <button
                        className="rounded-md border border-red-500/40 px-2 py-1 text-red-400 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                        type="button"
                        onClick={handleDeleteRelationship}
                        disabled={deleteMutation.isPending}
                      >
                        {deleteMutation.isPending ? "删除中" : "确认删除"}
                      </button>
                    </motion.div>
                  ) : (
                    <motion.button
                      key="delete-start"
                      className="rounded-md border border-red-500/40 px-3 py-1 text-red-400 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                      type="button"
                      onClick={() => setDeleteConfirming(true)}
                      disabled={saveMutation.isPending || deleteMutation.isPending}
                      whileHover={reduceMotion ? undefined : hoverLift}
                      whileTap={reduceMotion ? undefined : tapPress}
                    >
                      删除
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ) : selectedNode ? (
            <motion.div
              key="node"
              className="space-y-2"
              variants={sideMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <h3 className="text-sm font-semibold text-accent-300">
                {selectedNode.data.label}
              </h3>
              <p className="text-ink-400">
                {selectedNode.data.kind === "character"
                  ? "人物"
                  : `世界条目 · ${selectedNode.data.category ?? "未分类"}`}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border border-ink-700 bg-ink-950/50 p-2">
                  <div className="text-[11px] text-ink-500">全部连接</div>
                  <div className="mt-0.5 text-lg font-semibold text-ink-100">
                    {degreeByNode.get(selectedNode.id) ?? 0}
                  </div>
                </div>
                <div className="rounded-md border border-ink-700 bg-ink-950/50 p-2">
                  <div className="text-[11px] text-ink-500">强关系</div>
                  <div className="mt-0.5 text-lg font-semibold text-ink-100">
                    {selectedNodeLinks.filter((link) => link.weight >= 7).length}
                  </div>
                </div>
              </div>
              {selectedNodeCommunity ? (
                <div className="rounded-md border border-violet-400/25 bg-violet-500/10 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] text-violet-200/80">所在社群</div>
                      <div className="mt-0.5 truncate text-ink-100">
                        {selectedNodeCommunity.previewLabels.join("、")}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        focusCommunity(selectedNodeCommunity.id, selectedNode.id)
                      }
                      aria-pressed={selectedCommunityId === selectedNodeCommunity.id}
                      className="shrink-0 rounded-md border border-violet-300/30 px-2 py-1 text-violet-100 hover:bg-violet-400/10"
                    >
                      查看这组
                    </button>
                  </div>
                  <div className="mt-1 text-[11px] text-violet-100/65">
                    {selectedNodeCommunity.nodeCount} 份资料 ·{" "}
                    {selectedNodeCommunity.edgeCount} 条关系 · 平均强度{" "}
                    {selectedNodeCommunity.averageWeight}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-amber-400/35 bg-amber-500/10 px-2 py-2 text-amber-100/80">
                  <div className="text-[11px] font-medium text-amber-100">
                    未接入资料
                  </div>
                  <div className="mt-1 text-[11px] text-amber-100/70">
                    {selectedIsolatedNode
                      ? "这份资料还没有任何关系，适合先建立第一条连接。"
                      : "这份资料还没有接入任何关系团。"}
                  </div>
                </div>
              )}
              {selectedBridgeNode ? (
                <div className="rounded-md border border-sky-400/25 bg-sky-500/10 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] text-sky-200/80">关键连接点</div>
                      <div className="mt-0.5 truncate text-ink-100">
                        连接 {selectedBridgeNode.separatedGroupCount} 组资料
                      </div>
                    </div>
                    <span className="shrink-0 rounded bg-sky-400/10 px-1.5 py-[1px] text-[10px] text-sky-100">
                      影响 {selectedBridgeNode.affectedNodeCount}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-sky-100/65">
                    关联到 {selectedBridgeNode.previewLabels.join("、")}
                  </div>
                </div>
              ) : null}
              <motion.button
                className="rounded-md bg-accent-500 px-3 py-1 text-ink-900 hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={handleStartLink}
                disabled={saveMutation.isPending || deleteMutation.isPending}
                whileHover={reduceMotion ? undefined : hoverLift}
                whileTap={reduceMotion ? undefined : tapPress}
              >
                开始建立关系
              </motion.button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={setSelectedAsPathStart}
                  aria-pressed={selectedNode.id === pathStartId}
                  className={`rounded-md border px-2 py-1 text-left transition-colors ${
                    selectedNode.id === pathStartId
                      ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-100"
                      : "border-ink-700 text-ink-300 hover:bg-ink-800"
                  }`}
                >
                  设为起点
                </button>
                <button
                  type="button"
                  onClick={setSelectedAsPathEnd}
                  aria-pressed={selectedNode.id === pathEndId}
                  className={`rounded-md border px-2 py-1 text-left transition-colors ${
                    selectedNode.id === pathEndId
                      ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-100"
                      : "border-ink-700 text-ink-300 hover:bg-ink-800"
                  }`}
                >
                  设为终点
                </button>
              </div>
              {pathStartId || pathEndId ? renderPathPanel() : null}
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-ink-500">相邻资料</div>
                {selectedNodeLinks.length > 0 ? (
                  <div className="space-y-1">
                    {selectedNodeLinks.slice(0, 6).map((link) => (
                      <button
                        key={link.id}
                        type="button"
                        onClick={() => {
                          setSelectedNodeId(link.otherId);
                          setSelectedEdgeId(null);
                          if (layoutMode === "radial") {
                            setNodes((nds) =>
                              layoutGraph(
                                nds,
                                edges,
                                "radial",
                                dragOverridesRef.current,
                                link.otherId,
                              ),
                            );
                          }
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-md border border-ink-800 bg-ink-950/35 px-2 py-1 text-left hover:border-accent-500/30 hover:bg-ink-800"
                      >
                        <span className="min-w-0 truncate text-ink-200">
                          {link.otherLabel}
                        </span>
                        <span className="shrink-0 rounded bg-ink-800 px-1.5 py-[1px] text-[10px] text-ink-400">
                          {link.label} · {link.weight}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed border-ink-700 px-2 py-2 text-ink-500">
                    暂无相邻资料
                  </p>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              className="space-y-3 text-ink-400"
              variants={sideMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <div>
                <h3 className="text-sm font-semibold text-accent-300">图谱概览</h3>
                <p className="mt-1 text-ink-500">
                  选择资料点后，可以查看相邻资料并切换一跳或二跳焦点范围。
                </p>
              </div>
              {pathStartId || pathEndId ? renderPathPanel() : null}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border border-ink-700 bg-ink-950/50 p-2">
                  <div className="text-[11px] text-ink-500">资料点</div>
                  <div className="mt-0.5 text-lg font-semibold text-ink-100">
                    {filteredGraph.totalNodeCount}
                  </div>
                </div>
                <div className="rounded-md border border-ink-700 bg-ink-950/50 p-2">
                  <div className="text-[11px] text-ink-500">关系</div>
                  <div className="mt-0.5 text-lg font-semibold text-ink-100">
                    {filteredGraph.totalEdgeCount}
                  </div>
                </div>
                <div className="rounded-md border border-ink-700 bg-ink-950/50 p-2">
                  <div className="text-[11px] text-ink-500">已相连</div>
                  <div className="mt-0.5 text-lg font-semibold text-ink-100">
                    {filteredGraph.connectedCount}
                  </div>
                </div>
                <div className="rounded-md border border-ink-700 bg-ink-950/50 p-2">
                  <div className="text-[11px] text-ink-500">可见</div>
                  <div className="mt-0.5 text-lg font-semibold text-ink-100">
                    {filteredGraph.visibleNodeCount}
                  </div>
                </div>
              </div>
              <div className="space-y-2 rounded-md border border-ink-700 bg-ink-950/50 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] text-ink-500">图谱成熟度</div>
                    <div className="mt-0.5 text-xl font-semibold text-ink-100">
                      {communitySummary.maturity.score}
                    </div>
                  </div>
                  <span className="rounded-md border border-accent-300/25 bg-accent-500/10 px-2 py-1 text-[10px] text-accent-100">
                    {MATURITY_FOCUS_TEXT[communitySummary.maturity.focus]}
                  </span>
                </div>
                {[
                  {
                    label: "连接度",
                    value: communitySummary.maturity.connectedRatio,
                    detail: `${communitySummary.maturity.connectedNodeCount}/${communitySummary.maturity.totalNodeCount}`,
                    color: "bg-accent-300",
                  },
                  {
                    label: "关系类型",
                    value: communitySummary.maturity.namedRelationshipRatio,
                    detail: `${communitySummary.maturity.namedRelationshipCount}/${communitySummary.maturity.totalRelationshipCount}`,
                    color: "bg-emerald-300",
                  },
                  {
                    label: "强关系",
                    value: communitySummary.maturity.strongRelationshipRatio,
                    detail: `${communitySummary.maturity.strongRelationshipCount}/${communitySummary.maturity.totalRelationshipCount}`,
                    color: "bg-violet-300",
                  },
                ].map((item) => (
                  <div key={item.label} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="text-ink-400">{item.label}</span>
                      <span className="text-ink-500">
                        {item.value}% · {item.detail}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
                      <motion.div
                        className={`h-full rounded-full ${item.color}`}
                        initial={reduceMotion ? false : { width: 0 }}
                        animate={{ width: `${item.value}%` }}
                        transition={
                          reduceMotion
                            ? { duration: 0 }
                            : { duration: 0.45, ease: "easeOut" }
                        }
                      />
                    </div>
                  </div>
                ))}
                <motion.button
                  type="button"
                  onClick={handleMaturityFocusAction}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-accent-300/25 bg-accent-500/10 px-2 py-1.5 text-[11px] font-medium text-accent-100 hover:border-accent-300/45 hover:bg-accent-500/20"
                  whileHover={reduceMotion ? undefined : hoverLift}
                  whileTap={reduceMotion ? undefined : tapPress}
                >
                  <Focus aria-hidden className="h-3.5 w-3.5" />
                  开始处理
                </motion.button>
              </div>
              {topRelationshipIssues.length > 0 ? (
                <div className="space-y-1">
                  <div className="text-[11px] font-medium text-ink-500">
                    待完善关系
                  </div>
                  <div className="space-y-1">
                    {topRelationshipIssues.map((issue) => (
                      <motion.button
                        key={issue.id}
                        type="button"
                        onClick={() => focusRelationshipIssue(issue.id)}
                        className="w-full rounded-md border border-amber-400/20 bg-amber-500/10 px-2 py-1.5 text-left text-amber-50 hover:border-amber-300/35 hover:bg-amber-500/15"
                        whileHover={reduceMotion ? undefined : hoverLift}
                        whileTap={reduceMotion ? undefined : tapPress}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1">
                            <span className="truncate">{issue.sourceLabel}</span>
                            <ArrowRight
                              aria-hidden
                              className="h-3 w-3 shrink-0 text-amber-100/45"
                            />
                            <span className="truncate">{issue.targetLabel}</span>
                          </span>
                          <span className="shrink-0 rounded bg-amber-400/10 px-1.5 py-[1px] text-[10px] text-amber-100/75">
                            {issue.weight}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-amber-100/60">
                          {issue.reasons
                            .map((reason) => RELATIONSHIP_ISSUE_TEXT[reason])
                            .join(" · ")}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              ) : null}
              {topIsolatedNodes.length > 0 ? (
                <div className="space-y-1">
                  <div className="text-[11px] font-medium text-ink-500">
                    未接入资料
                  </div>
                  <div className="space-y-1">
                    {topIsolatedNodes.map((node) => (
                      <motion.button
                        key={node.id}
                        type="button"
                        onClick={() => focusIsolatedNode(node.id)}
                        className="flex w-full items-center justify-between gap-2 rounded-md border border-amber-400/20 bg-amber-500/10 px-2 py-1.5 text-left text-amber-50 hover:border-amber-300/35 hover:bg-amber-500/15"
                        whileHover={reduceMotion ? undefined : hoverLift}
                        whileTap={reduceMotion ? undefined : tapPress}
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{node.label}</span>
                          <span className="block truncate text-[10px] text-amber-100/60">
                            {node.kind === "character"
                              ? "人物"
                              : node.category ?? "世界条目"}
                          </span>
                        </span>
                        <span className="shrink-0 rounded bg-amber-400/10 px-1.5 py-[1px] text-[10px] text-amber-100/75">
                          待连接
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-medium text-ink-500">结构社群</div>
                  <span className="text-[10px] text-ink-600">
                    孤立 {communitySummary.isolatedNodes.length}
                  </span>
                </div>
                {topCommunities.length > 0 ? (
                  <div className="space-y-1">
                    {topCommunities.map((community) => (
                      <motion.button
                        key={community.id}
                        type="button"
                        onClick={() =>
                          focusCommunity(community.id, community.strongestNodeId)
                        }
                        aria-pressed={selectedCommunityId === community.id}
                        className={`w-full rounded-md border px-2 py-1.5 text-left ${
                          selectedCommunityId === community.id
                            ? "border-violet-300/40 bg-violet-500/15 text-violet-50"
                            : "border-ink-800 bg-ink-950/35 text-ink-200 hover:border-violet-400/30 hover:bg-ink-800"
                        }`}
                        whileHover={reduceMotion ? undefined : hoverLift}
                        whileTap={reduceMotion ? undefined : tapPress}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate">
                            {community.previewLabels.join("、")}
                          </span>
                          <span className="shrink-0 rounded bg-ink-800 px-1.5 py-[1px] text-[10px] text-ink-400">
                            {community.nodeCount} 点
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-ink-500">
                          {community.characterCount} 人物 ·{" "}
                          {community.worldEntryCount} 条目 ·{" "}
                          {community.edgeCount} 条关系 · 平均强度{" "}
                          {community.averageWeight}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed border-ink-700 px-2 py-2 text-ink-500">
                    还没有形成关系社群。
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-ink-500">关键连接点</div>
                {topBridgeNodes.length > 0 ? (
                  <div className="space-y-1">
                    {topBridgeNodes.map((bridge) => (
                      <motion.button
                        key={bridge.id}
                        type="button"
                        onClick={() => focusBridgeNode(bridge.id)}
                        className="w-full rounded-md border border-ink-800 bg-ink-950/35 px-2 py-1.5 text-left text-ink-200 hover:border-sky-400/30 hover:bg-ink-800"
                        whileHover={reduceMotion ? undefined : hoverLift}
                        whileTap={reduceMotion ? undefined : tapPress}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate">{bridge.label}</span>
                          <span className="shrink-0 rounded bg-sky-400/10 px-1.5 py-[1px] text-[10px] text-sky-100">
                            {bridge.separatedGroupCount} 组
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-ink-500">
                          影响 {bridge.affectedNodeCount} 份资料 · 关联到{" "}
                          {bridge.previewLabels.join("、")}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed border-ink-700 px-2 py-2 text-ink-500">
                    当前关系团比较稳定，没有明显的单点连接。
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-ink-500">关系枢纽</div>
                {hubNodes.length > 0 ? (
                  <div className="space-y-1">
                    {hubNodes.map((hub) => (
                      <button
                        key={hub.id}
                        type="button"
                        onClick={() => {
                          setSelectedNodeId(hub.id);
                          setSelectedEdgeId(null);
                          if (layoutMode === "radial") {
                            setNodes((nds) =>
                              layoutGraph(nds, edges, "radial", dragOverridesRef.current, hub.id),
                            );
                          }
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-md border border-ink-800 bg-ink-950/35 px-2 py-1 text-left hover:border-accent-500/30 hover:bg-ink-800"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-ink-200">{hub.label}</span>
                          <span className="block truncate text-[10px] text-ink-500">
                            {hub.kind === "character" ? "人物" : hub.category ?? "世界条目"}
                          </span>
                        </span>
                        <span className="shrink-0 rounded bg-ink-800 px-1.5 py-[1px] text-[10px] text-ink-400">
                          {hub.degree} 连接
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed border-ink-700 px-2 py-2 text-ink-500">
                    暂无已连接的资料点
                  </p>
                )}
              </div>
              <hr className="border-ink-700" />
              <p>
                人物 {characters.length} · 世界条目 {worldEntries.length} · 关系 {relationships.length}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {status ? (
            <motion.div
              role={status.kind === "error" ? "alert" : "status"}
              className={`mt-3 rounded-md border px-2 py-1.5 text-[11px] ${
                status.kind === "error"
                  ? "border-red-500/30 bg-red-500/10 text-red-200"
                  : "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
              }`}
              variants={sideMotion}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {status.text}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </aside>
    </div>
  );
}
