export type Target = Readonly<
  { by: 'role'; role: string; name: string }
  | { by: 'label' | 'text' | 'testId'; value: string }
>;
export type Action = Readonly<
  { kind: 'click'; target: Target }
  | { kind: 'fill' | 'press'; target: Target; value: string }
>;
export type Assertion = Readonly<
  { kind: 'visible'; target: Target }
  | { kind: 'text' | 'value'; target: Target; expected: string }
  | { kind: 'count'; target: Target; expected: number }
>;
export interface Observation { readonly url: string; readonly content: string }
export interface OperationOptions { readonly signal: AbortSignal; readonly timeoutMs: number }
export interface Driver {
  open(path: string, options: OperationOptions): Promise<void>;
  observe(options: OperationOptions): Promise<Observation>;
  perform(action: Action, options: OperationOptions): Promise<void>;
  check(assertion: Assertion, options: OperationOptions): Promise<boolean>;
  close(): Promise<void>;
}
export interface ExecutorInput {
  readonly mode: 'act' | 'assert';
  readonly goal: string;
  readonly observation: Observation;
  readonly signal: AbortSignal;
  /** Returns fresh bounded UI data. Mutation is forbidden in assertion mode. */
  readonly act: (action: Action) => Promise<Observation>;
}
export type ExecutorResult = Readonly<{ status: 'done' | 'passed' | 'failed' | 'blocked' }>;
export type Executor = (input: ExecutorInput) => ExecutorResult | Promise<ExecutorResult>;
export interface ReplayStore {
  get(key: string): unknown;
  set(key: string, record: unknown): void;
  delete(key: string): void;
}
export interface SessionOptions {
  createDriver(input: { readonly signal: AbortSignal }): Driver | Promise<Driver>;
  executor?: Executor;
  signal?: AbortSignal;
  sessionTimeoutMs?: number;
  stepTimeoutMs?: number;
  cleanupTimeoutMs?: number;
  maxActions?: number;
  maxAgentSteps?: number;
  replay?: { readonly scope: string; readonly store: ReplayStore };
}
export interface Locator {
  click(): Promise<void>;
  fill(value: string): Promise<void>;
  press(key: string): Promise<void>;
}
export interface Checks {
  isVisible(): Promise<void>;
  hasText(expected: string): Promise<void>;
  hasValue(expected: string): Promise<void>;
  count(expected: number): Promise<void>;
}
export interface StepEvidence {
  readonly sequence: number;
  readonly type: 'open' | 'click' | 'fill' | 'press' | 'check' | 'agent_act' | 'agent_assert' | 'close';
  readonly status: 'passed' | 'failed' | 'cancelled';
  readonly durationMs: number;
  readonly code: string | null;
}
export interface SessionEvidence {
  readonly schemaVersion: 1;
  readonly lifecycle: 'open' | 'closing' | 'closed' | 'cancelled' | 'timed_out' | 'failed';
  readonly actions: number;
  readonly agentSteps: number;
  readonly steps: readonly StepEvidence[];
}
export interface Session {
  readonly app: { open(path: string): Promise<void> };
  readonly screen: {
    getByRole(role: string, options: { name: string }): Locator;
    getByLabel(text: string): Locator;
    getByText(text: string): Locator;
    getByTestId(id: string): Locator;
  };
  check(locator: Locator): Checks;
  readonly agent: { act(goal: string): Promise<void>; assert(goal: string): Promise<void> };
  evidence(): SessionEvidence;
  close(): Promise<void>;
}
export class TraverseError extends Error { readonly code: string; constructor(code: string) }
export function openSession(options: SessionOptions): Promise<Session>;
export function createMemoryReplayStore(): ReplayStore;
