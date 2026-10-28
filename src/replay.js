import { createHash } from "node:crypto";
import { TraverseError, record, validateAction, validateAssertion } from "./protocol.js";

const MAX_RECORDS = 128;
const MAX_ACTIONS = 200;
const MAX_RECORD_BYTES = 262_144;
const hashPattern = /^[a-f0-9]{64}$/;

function hash(value) {
  // JSON preserves isolated UTF-16 code units that a raw UTF-8 encoder replaces.
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function replayFingerprint(observation) {
  return Object.freeze({ urlHash: hash(observation.url), contentHash: hash(observation.content) });
}

export function replayIdentity(scope, goal, observation) {
  const scopeHash = hash(scope);
  const goalHash = hash(goal);
  const start = replayFingerprint(observation);
  return Object.freeze({ key: hash(JSON.stringify([scopeHash, goalHash, start.urlHash, start.contentHash])), scopeHash, goalHash, start });
}

function keyFrom(value) {
  if (typeof value !== "string" || !hashPattern.test(value)) throw new TraverseError("invalid_replay");
  return value;
}

function replayRecordFrom(value, expectedKey) {
  record(value, ["schemaVersion", "key", "scopeHash", "goalHash", "start", "end", "actions", "check", "outcome"], ["schemaVersion", "key", "scopeHash", "goalHash", "start", "end", "actions", "check", "outcome"], "invalid_replay");
  if (value.schemaVersion !== 1 || value.outcome !== true) throw new TraverseError("invalid_replay");
  const key = keyFrom(value.key);
  const scopeHash = keyFrom(value.scopeHash);
  const goalHash = keyFrom(value.goalHash);
  record(value.start, ["urlHash", "contentHash"], ["urlHash", "contentHash"], "invalid_replay");
  const start = Object.freeze({ urlHash: keyFrom(value.start.urlHash), contentHash: keyFrom(value.start.contentHash) });
  record(value.end, ["urlHash", "contentHash"], ["urlHash", "contentHash"], "invalid_replay");
  const end = Object.freeze({ urlHash: keyFrom(value.end.urlHash), contentHash: keyFrom(value.end.contentHash) });
  if (start.urlHash === end.urlHash && start.contentHash === end.contentHash) throw new TraverseError("invalid_replay");
  const expected = hash(JSON.stringify([scopeHash, goalHash, start.urlHash, start.contentHash]));
  if (key !== expected || (expectedKey !== undefined && key !== keyFrom(expectedKey))) throw new TraverseError("invalid_replay");
  if (!Array.isArray(value.actions) || value.actions.length < 1 || value.actions.length > MAX_ACTIONS) throw new TraverseError("invalid_replay");
  if (Reflect.ownKeys(value.actions).length !== value.actions.length + 1) throw new TraverseError("invalid_replay");
  for (let index = 0; index < value.actions.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value.actions, String(index));
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TraverseError("invalid_replay");
  }
  const actions = value.actions.map((action) => {
    const validated = validateAction(action);
    if (validated.kind === "fill") throw new TraverseError("invalid_replay");
    return validated;
  });
  const check = validateAssertion(value.check);
  if (check.kind === "value") throw new TraverseError("invalid_replay");
  const detached = { schemaVersion: 1, key, scopeHash, goalHash, start, end, actions: Object.freeze(actions), check, outcome: true };
  if (new TextEncoder().encode(JSON.stringify(detached)).byteLength > MAX_RECORD_BYTES) throw new TraverseError("invalid_replay");
  return Object.freeze(detached);
}

export function validateReplayRecord(value, expectedKey) {
  try { return replayRecordFrom(value, expectedKey); }
  catch { throw new TraverseError("invalid_replay"); }
}

export function createMemoryReplayStore() {
  const entries = new Map();
  return Object.freeze({
    get(key) {
      keyFrom(key);
      const value = entries.get(key);
      return value === undefined ? undefined : validateReplayRecord(value, key);
    },
    set(key, value) {
      keyFrom(key);
      const validated = validateReplayRecord(value, key);
      if (!entries.has(key) && entries.size >= MAX_RECORDS) entries.delete(entries.keys().next().value);
      entries.set(key, validated);
    },
    delete(key) { return entries.delete(keyFrom(key)); },
  });
}
