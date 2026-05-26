# packages/auto-writer-engine — 4-Agent Novel Writing Pipeline

> Orchestrates Planner / Writer / Critic / Reflector LLM agents to produce a chapter from user ideas. Engine is provider-agnostic; the desktop wrapper supplies the LLM call adapter.

## Public API

```ts
import {
  runAutoWriterPipeline,           // main entry
  UserInterruptQueue,
  makeRoleResolver,
  type AutoWriterAgentRole,        // 'planner' | 'writer' | 'critic' | 'reflector'
  type AutoWriterAgentBinding,     // {role, providerId, model, temperature, maxTokens}
  type AgentCallInput,             // {role, binding, systemPrompt, userPrompt}
  type AgentCallOutput,            // {text, tokensIn, tokensOut}
} from "@inkforge/auto-writer-engine";
```

(Canonical role names live in `packages/shared/src/domain.ts` as `AutoWriterAgentRole`. System prompts per role live in `packages/auto-writer-engine/src/agent-roles.ts` `AGENT_SYSTEM_PROMPTS`.)

## Pipeline Flow

1. **Planner**（提纲师）— given user ideas + chapter context → emits beat plan (segments to write)
2. **Writer**（写手）— for each beat, generates a draft segment (~targetSegmentLength chars)
3. **Critic**（审稿员）— reads segment, scores 0-10. Below threshold → loop back to Writer (max `maxRewritesPerSegment` retries)
4. **Reflector**（反思员）— after the chapter is assembled, updates long-term memory (chapter summary, character state hints) so the next chapter inherits context

OOC gate (when enabled): semantic check on character voice consistency, runs alongside Critic.

## Inputs (apps/desktop side)

`AutoWriterStartInput` (from `@inkforge/shared`):
- `projectId: string`
- `chapterId: string` — **must already exist** (engine writes into existing chapter)
- `userIdeas: string` — free-form prompt: what should happen this chapter
- `agents: AutoWriterAgentBinding[]` — 1 (uniform) or 4 (per-role) bindings
- `targetSegmentLength?: number` — default 400
- `maxSegments?: number` — default 12
- `maxRewritesPerSegment?: number` — default 3
- `enableOocGate?: boolean` — default true

## Outputs (events)

Streamed to renderer via `auto-writer:phase` / `auto-writer:chunk` / `auto-writer:done` / `auto-writer:snapshot`:
- phase events report which agent is running
- chunk events stream partial text (delta)
- snapshot events emit completed segment + diff for replay
- done event has final usage + status

## Adapter Pattern (where desktop hooks LLM)

Engine doesn't know about providers/keys. Caller supplies an `AgentCaller`:
```ts
async function callAgent(input: AgentCallInput): Promise<AgentCallOutput> {
  // resolve provider via input.binding.providerId
  // call streamText, accumulate, return
}
```

`apps/desktop/src/main/services/auto-writer-service.ts` `invokeOneAgent` is this adapter.

## When NOT to use AutoWriter

- One-shot single-step generation (no Critic loop) → use `streamText` directly
- Selection-toolbar quick-actions (polish/critique/continue) → `quick-action-service`
- 200-char analysis → `analysis-service`

For Module 6 (ainovel-style chained outline+chapter generation), AutoWriter's full 4-Agent loop is **overkill**. Build new lightweight services that call `streamText` directly:
- `generateMasterOutline` (single LLM call)
- `generateChapterOutlines` (single LLM call → JSON array → outline_cards)
- `generateChapterFromOutline` (single LLM call, optional N-candidate parallel)
