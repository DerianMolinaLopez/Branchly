import type { CommitDraft } from '@/stores/drafts';

/** Conventional soft limit for the first line of a commit message. */
export const SUMMARY_SOFT_LIMIT = 72;

/** Joins summary and description with the blank line Git expects. */
export function composeMessage(draft: Pick<CommitDraft, 'summary' | 'description'>): string {
  const summary = draft.summary.trim();
  const description = draft.description.trim();
  return description ? `${summary}\n\n${description}` : summary;
}

/** Splits a full commit message back into summary and description. */
export function splitMessage(message: string): Pick<CommitDraft, 'summary' | 'description'> {
  const [summary = '', ...rest] = message.trim().split('\n');
  return { summary: summary.trim(), description: rest.join('\n').trim() };
}
