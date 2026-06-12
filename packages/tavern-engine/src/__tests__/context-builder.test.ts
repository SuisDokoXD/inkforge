import { describe, expect, it } from "vitest";
import type { TavernCardRecord, TavernMessageRecord } from "@inkforge/shared";
import { ContextBuilder } from "../context-builder";

const NOW = "2026-06-12T00:00:00.000Z";

function card(id: string, name: string, persona = ""): TavernCardRecord {
  return {
    id,
    name,
    persona,
    avatarPath: null,
    providerId: "provider-1",
    model: "model-1",
    temperature: 0.7,
    linkedNovelCharacterId: null,
    syncMode: "detached",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function message(
  id: string,
  role: TavernMessageRecord["role"],
  content: string,
  characterId: string | null = null,
): TavernMessageRecord {
  return {
    id,
    sessionId: "session-1",
    characterId,
    role,
    content,
    tokensIn: 0,
    tokensOut: 0,
    createdAt: NOW,
  };
}

describe("ContextBuilder", () => {
  it("builds persona context, summaries, visible ids, and last-k history", () => {
    const alice = card("alice", "Alice", "Careful investigator");
    const bob = card("bob", "Bob", "Direct rival");
    const builder = new ContextBuilder();

    const result = builder.build({
      speakerCard: alice,
      allCards: [alice, bob],
      topic: "locked room",
      mode: "director",
      lastK: 2,
      directorMessage: "Keep it tense",
      history: [
        message("summary-1", "summary", "Earlier case notes."),
        message("m1", "director", "Start the exchange."),
        message("m2", "character", "I found the key.", "bob"),
        message("m3", "character", "I will inspect the window.", "alice"),
      ],
      extraSystem: "Prefer short replies.",
    });

    expect(result.systemPrompt).toContain("Alice");
    expect(result.systemPrompt).toContain("Bob");
    expect(result.systemPrompt).toContain("Prefer short replies.");
    expect(result.visibleMessageIds).toEqual(["summary-1", "m2", "m3"]);
    expect(result.messages.map((msg) => msg.role)).toEqual([
      "user",
      "user",
      "assistant",
      "user",
    ]);
    expect(result.messages[0]?.content).toContain("Earlier case notes.");
    expect(result.messages.at(-1)?.content).toContain("Keep it tense");
  });

  it("starts a new conversation when there is no usable history", () => {
    const alice = card("alice", "Alice");
    const result = new ContextBuilder().build({
      speakerCard: alice,
      allCards: [alice],
      topic: "first contact",
      mode: "auto",
      lastK: 3,
      history: [],
    });

    expect(result.visibleMessageIds).toEqual([]);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.role).toBe("user");
    expect(result.messages[0]?.content).toContain("first contact");
  });
});
