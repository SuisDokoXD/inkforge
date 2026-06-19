import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import {
  NODE_H,
  NODE_W,
  collectNodeIdsWithinDepth,
  findShortestRelationshipPath,
  layoutGraph,
  makeNodeId,
  parseNodeId,
  summarizeGraphCommunities,
} from "../world-graph-logic";
import type { EdgeData, NodeData } from "../world-graph-logic";

function graphNode(id: string, label: string): Node<NodeData> {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { kind: "world_entry", label, category: "地点" },
  };
}

function graphEdge(
  id: string,
  source: string,
  target: string,
  weight = 5,
  label: string | null = null,
): Edge<EdgeData> {
  return {
    id,
    source,
    target,
    data: { relId: id, label, weight },
  };
}

describe("world graph logic", () => {
  it("parses and rejects endpoint node ids", () => {
    expect(parseNodeId(makeNodeId("character", "char-1"))).toEqual({
      kind: "character",
      id: "char-1",
    });
    expect(parseNodeId("world_entry:sect-1")).toEqual({
      kind: "world_entry",
      id: "sect-1",
    });
    expect(parseNodeId("chapter:1")).toBeNull();
    expect(parseNodeId("loose-id")).toBeNull();
  });

  it("collects neighboring node ids within graph depth", () => {
    const edges = [
      graphEdge("a-b", "a", "b"),
      graphEdge("b-c", "b", "c"),
      graphEdge("c-d", "c", "d"),
    ];

    expect([...collectNodeIdsWithinDepth("a", edges, 1)].sort()).toEqual(["a", "b"]);
    expect([...collectNodeIdsWithinDepth("a", edges, 2)].sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("finds the shortest relationship path and prefers stronger ties", () => {
    const edges = [
      graphEdge("a-b", "a", "b", 3, "旧识"),
      graphEdge("a-c", "a", "c", 8, "同盟"),
      graphEdge("b-d", "b", "d", 8, "师承"),
      graphEdge("c-d", "c", "d", 4, "误会"),
      graphEdge("d-e", "d", "e", 7, "守护"),
    ];

    const path = findShortestRelationshipPath("a", "d", edges);

    expect(path?.nodeIds).toEqual(["a", "c", "d"]);
    expect(path?.edgeIds).toEqual(["a-c", "c-d"]);
    expect(path?.steps.map((step) => step.label)).toEqual(["同盟", "误会"]);
  });

  it("returns null when no relationship path connects the selected nodes", () => {
    const edges = [graphEdge("a-b", "a", "b"), graphEdge("c-d", "c", "d")];

    expect(findShortestRelationshipPath("a", "d", edges)).toBeNull();
  });

  it("summarizes connected communities and isolated nodes", () => {
    const nodes = [
      graphNode("a", "A"),
      graphNode("b", "B"),
      graphNode("c", "C"),
      graphNode("d", "D"),
      graphNode("e", "E"),
      graphNode("f", "F"),
    ];
    const edges = [
      graphEdge("a-b", "a", "b", 8),
      graphEdge("b-c", "b", "c", 4),
      graphEdge("d-e", "d", "e", 6),
      graphEdge("ghost", "a", "missing", 10),
    ];

    const summary = summarizeGraphCommunities(nodes, edges);

    expect(summary.communities).toHaveLength(2);
    expect(summary.communities[0]).toMatchObject({
      nodeIds: ["a", "b", "c"],
      edgeIds: ["a-b", "b-c"],
      nodeCount: 3,
      edgeCount: 2,
      averageWeight: 6,
      strongestNodeId: "b",
      strongestNodeLabel: "B",
    });
    expect(summary.communities[1]).toMatchObject({
      nodeIds: ["d", "e"],
      edgeIds: ["d-e"],
      nodeCount: 2,
    });
    expect(summary.isolatedNodes).toEqual([
      {
        id: "f",
        label: "F",
        kind: "world_entry",
        category: "地点",
      },
    ]);
  });

  it("finds key bridge nodes without flagging closed loops", () => {
    const nodes = [
      graphNode("a", "A"),
      graphNode("b", "B"),
      graphNode("c", "C"),
      graphNode("d", "D"),
      graphNode("e", "E"),
      graphNode("f", "F"),
    ];
    const edges = [
      graphEdge("a-b", "a", "b"),
      graphEdge("b-c", "b", "c"),
      graphEdge("d-e", "d", "e"),
      graphEdge("e-f", "e", "f"),
      graphEdge("f-d", "f", "d"),
    ];

    const summary = summarizeGraphCommunities(nodes, edges);

    expect(summary.bridgeNodes).toHaveLength(1);
    expect(summary.bridgeNodes[0]).toMatchObject({
      id: "b",
      label: "B",
      degree: 2,
      separatedGroupCount: 2,
      affectedNodeCount: 2,
      previewLabels: ["A", "C"],
    });
  });

  it("summarizes relationships that need clearer labels or stronger ties", () => {
    const nodes = [graphNode("a", "A"), graphNode("b", "B"), graphNode("c", "C")];
    const edges = [
      graphEdge("a-b", "a", "b", 1, null),
      graphEdge("b-c", "b", "c", 5, ""),
      graphEdge("a-c", "a", "c", 8, "同盟"),
    ];

    const summary = summarizeGraphCommunities(nodes, edges);

    expect(summary.relationshipIssues).toEqual([
      {
        id: "a-b",
        sourceId: "a",
        targetId: "b",
        sourceLabel: "A",
        targetLabel: "B",
        label: null,
        weight: 1,
        reasons: ["missing_label", "weak_weight"],
      },
      {
        id: "b-c",
        sourceId: "b",
        targetId: "c",
        sourceLabel: "B",
        targetLabel: "C",
        label: "",
        weight: 5,
        reasons: ["missing_label"],
      },
    ]);
  });

  it("scores graph maturity from connection and relationship quality", () => {
    const nodes = [
      graphNode("a", "A"),
      graphNode("b", "B"),
      graphNode("c", "C"),
      graphNode("d", "D"),
    ];
    const edges = [
      graphEdge("a-b", "a", "b", 8, "同盟"),
      graphEdge("b-c", "b", "c", 2, null),
    ];

    const summary = summarizeGraphCommunities(nodes, edges);

    expect(summary.maturity).toEqual({
      score: 60,
      connectedRatio: 75,
      namedRelationshipRatio: 50,
      strongRelationshipRatio: 50,
      connectedNodeCount: 3,
      totalNodeCount: 4,
      namedRelationshipCount: 1,
      totalRelationshipCount: 2,
      strongRelationshipCount: 1,
      focus: "connect_isolated",
    });
  });

  it("centers radial layout on the selected node and preserves overrides", () => {
    const nodes = [graphNode("a", "A"), graphNode("b", "B"), graphNode("c", "C")];
    const edges = [graphEdge("a-b", "a", "b"), graphEdge("b-c", "b", "c")];
    const overrides = new Map<string, { x: number; y: number }>([
      ["c", { x: 42, y: 24 }],
    ]);

    const laidOut = layoutGraph(nodes, edges, "radial", overrides, "b");
    const center = laidOut.find((node) => node.id === "b");
    const overridden = laidOut.find((node) => node.id === "c");

    expect(center?.position).toEqual({ x: -NODE_W / 2, y: -NODE_H / 2 });
    expect(overridden?.position).toEqual({ x: 42, y: 24 });
  });
});
