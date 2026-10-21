import type { WorkstateInput } from '@pd/contracts';

interface WorkstateDraft {
  input: WorkstateInput;
  owner: string;
  document: string;
  tab: number;
  window: number;
  expires: number;
}

/** Memory only: a sleeping worker discards the preview rather than replaying it. */
export const workstateState: { revision: number; draft: WorkstateDraft | null } = {
  revision: 0,
  draft: null,
};

export function clearWorkstatePreview(): void {
  workstateState.revision++;
  workstateState.draft = null;
}
