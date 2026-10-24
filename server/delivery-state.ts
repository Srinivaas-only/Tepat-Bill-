import type * as S from '../shared/schema';

const LIVE = ['proposed', 'open', 'disputed'];
type FlagRow = typeof S.flags.$inferSelect;

/**
 * issue = unresolved delivery flags; billed = its flags moved to the invoice; correct = the OWNER confirmed it;
 * confirm = nothing unresolved (linked to an invoice, or a flag was settled/redelivered) but the owner has not yet confirmed completion; else waiting.
 * Linking an invoice or a redelivery never marks a delivery correct by itself.
 */
export const stateOf = (d: { ownerMarkedCorrect: boolean; invoiceId: string | null }, flags: FlagRow[]) =>
  flags.some(f => LIVE.includes(f.status) && !f.supersededBy) ? 'issue'
    : flags.some(f => f.supersededBy) ? 'billed'
    : d.ownerMarkedCorrect ? 'correct'
    : d.invoiceId || flags.some(f => f.status === 'settled') ? 'confirm' : 'waiting';

