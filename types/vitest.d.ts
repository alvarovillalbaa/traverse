import type { Driver, Session, SessionEvidence, SessionOptions } from './index.js';

export interface TaskLike {
  readonly id?: string;
  readonly result?: { readonly state?: string };
}
export interface FixtureContext { readonly task: TaskLike; readonly signal: AbortSignal }
export interface UiFixtureOptions extends Omit<SessionOptions, 'createDriver'> {
  createDriver(input: FixtureContext): Driver | Promise<Driver>;
  onEvidence?: (
    evidence: SessionEvidence,
    /** Runner state observed during teardown; not its final post-cleanup verdict. */
    context: { readonly taskId: string | null; readonly testState: string | null },
  ) => void | Promise<void>;
}
export type UiFixture = (context: FixtureContext, use: (session: Session) => Promise<void>) => Promise<void>;
export function createUiFixture(options: UiFixtureOptions): UiFixture;
