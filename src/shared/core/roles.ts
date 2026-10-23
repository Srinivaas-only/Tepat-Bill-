// Two roles. Staff record deliveries; only the owner approves, sends, settles or releases anything.
export type Role = 'owner' | 'staff';
export const ACTIONS = ['view', 'upload_document', 'correct_extraction', 'record_count',
  'approve_flag', 'dismiss_flag', 'send_message', 'dispute_flag', 'settle_flag', 'mark_correct',
  'set_agreed_price', 'mark_paid', 'edit_supplier', 'approve_einvoice', 'release_einvoice', 'export_csv'] as const;
export type Action = typeof ACTIONS[number];
const STAFF: ReadonlySet<Action> = new Set(['view', 'upload_document', 'correct_extraction', 'record_count']);
export const can = (role: Role, action: Action): boolean => role === 'owner' || STAFF.has(action);
