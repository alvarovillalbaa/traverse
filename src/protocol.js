export const ERROR_CODES = Object.freeze([
  "invalid_options", "invalid_driver", "invalid_target", "invalid_action", "invalid_assertion",
  "invalid_observation", "observation_too_large", "invalid_goal", "invalid_executor_result",
  "invalid_replay", "replay_store_failed", "executor_required", "executor_blocked",
  "assertion_failed", "assertion_actions_forbidden", "driver_setup_failed", "driver_failed",
  "target_not_found", "target_ambiguous", "origin_denied", "executor_failed", "action_limit",
  "agent_step_limit", "step_limit", "operation_in_progress", "step_inactive", "session_closed",
  "session_cancelled", "session_timeout", "step_timeout", "cleanup_timeout", "cleanup_failed",
  "incomplete_work", "replay_diverged", "evidence_failed", "internal_error",
]);
const codes = new Set(ERROR_CODES);

export class TraverseError extends Error {
  constructor(code) {
    const safe = codes.has(code) ? code : "internal_error";
    super(safe);
    this.name = "TraverseError";
    this.code = safe;
  }
}

export const SUPPORTED_KEYS = Object.freeze([
  "Enter", "Tab", "Escape", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Home", "End", "PageUp", "PageDown", "Backspace", "Delete",
]);
export const MAX_OBSERVATION_BYTES = 65_536;
export const MAX_OBSERVATION_URL_LENGTH = 2_048;
export const MAX_TARGET_LENGTH = 256;
export const MAX_ACTION_VALUE_LENGTH = 4_096;

export function safeError(error, fallback = "internal_error") {
  try {
    if (error instanceof TraverseError && codes.has(error.code)) return new TraverseError(error.code);
  } catch { /* An opaque error must not escape through an accessor or proxy. */ }
  return new TraverseError(fallback);
}

export function record(value, allowed, required, code = "invalid_options") {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TraverseError(code);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TraverseError(code);
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string" || !allowed.includes(key))) throw new TraverseError(code);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TraverseError(code);
    }
    if (required.some((key) => !Object.hasOwn(value, key))) throw new TraverseError(code);
    return value;
  } catch {
    throw new TraverseError(code);
  }
}

export function text(value, maximum, code, empty = false) {
  if (typeof value !== "string" || value.length > maximum || (!empty && !value.trim())) throw new TraverseError(code);
  return value;
}

export function validateTarget(value) {
  record(value, ["by", "role", "name", "value"], ["by"], "invalid_target");
  if (value.by === "role") {
    record(value, ["by", "role", "name"], ["by", "role", "name"], "invalid_target");
    return Object.freeze({ by: "role", role: text(value.role, 64, "invalid_target"), name: text(value.name, MAX_TARGET_LENGTH, "invalid_target", true) });
  }
  if (!["label", "text", "testId"].includes(value.by)) throw new TraverseError("invalid_target");
  record(value, ["by", "value"], ["by", "value"], "invalid_target");
  return Object.freeze({ by: value.by, value: text(value.value, MAX_TARGET_LENGTH, "invalid_target") });
}

export function validateAction(value) {
  record(value, ["kind", "target", "value"], ["kind", "target"], "invalid_action");
  if (!["click", "fill", "press"].includes(value.kind)) throw new TraverseError("invalid_action");
  const target = validateTarget(value.target);
  if (value.kind === "click") {
    if (Object.hasOwn(value, "value")) throw new TraverseError("invalid_action");
    return Object.freeze({ kind: "click", target });
  }
  if (!Object.hasOwn(value, "value")) throw new TraverseError("invalid_action");
  const input = text(value.value, MAX_ACTION_VALUE_LENGTH, "invalid_action", value.kind === "fill");
  if (value.kind === "press" && !SUPPORTED_KEYS.includes(input)) throw new TraverseError("invalid_action");
  return Object.freeze({ kind: value.kind, target, value: input });
}

export function validateAssertion(value) {
  record(value, ["kind", "target", "expected"], ["kind", "target"], "invalid_assertion");
  if (!["visible", "text", "value", "count"].includes(value.kind)) throw new TraverseError("invalid_assertion");
  const target = validateTarget(value.target);
  if (value.kind === "visible") {
    if (Object.hasOwn(value, "expected")) throw new TraverseError("invalid_assertion");
    return Object.freeze({ kind: "visible", target });
  }
  if (!Object.hasOwn(value, "expected")) throw new TraverseError("invalid_assertion");
  if (value.kind === "count") {
    if (!Number.isSafeInteger(value.expected) || value.expected < 0 || value.expected > 10_000) throw new TraverseError("invalid_assertion");
    return Object.freeze({ kind: "count", target, expected: value.expected });
  }
  return Object.freeze({ kind: value.kind, target, expected: text(value.expected, MAX_ACTION_VALUE_LENGTH, "invalid_assertion", true) });
}

export function validateObservation(value) {
  record(value, ["url", "content"], ["url", "content"], "invalid_observation");
  const url = text(value.url, MAX_OBSERVATION_URL_LENGTH, "invalid_observation");
  if (typeof value.content !== "string") throw new TraverseError("invalid_observation");
  if (value.content.length > MAX_OBSERVATION_BYTES || new TextEncoder().encode(value.content).byteLength > MAX_OBSERVATION_BYTES) throw new TraverseError("observation_too_large");
  return Object.freeze({ url, content: value.content });
}
