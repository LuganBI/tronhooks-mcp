/** A browser fragment is an untrusted draft, never an authorization or server write. */
export interface ApprovalConfig { address: string; asset_filter: 'USDT' | 'TRX' | 'ALL'; direction: 'incoming' | 'outgoing' | 'both'; channel: 'webhook' | 'telegram'; webhook_url: string }
export type ApprovalDraft = { version: 1; operation: 'create'; config: ApprovalConfig } | { version: 1; operation: 'delete'; watch_id: string };
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const hasOnly = (value: object, keys: string[]) => Object.keys(value).every(k => keys.includes(k));
export function validateApproval(value: unknown): ApprovalDraft {
  if (!value || typeof value !== 'object') throw new Error('Invalid approval draft');
  const v = value as Record<string, unknown>;
  if (v.version !== 1) throw new Error('Unsupported approval version');
  if (v.operation === 'delete' && hasOnly(v, ['version', 'operation', 'watch_id']) && typeof v.watch_id === 'string' && ID.test(v.watch_id)) return { version: 1, operation: 'delete', watch_id: v.watch_id };
  if (v.operation !== 'create' || !hasOnly(v, ['version', 'operation', 'config']) || !v.config || typeof v.config !== 'object') throw new Error('Invalid approval operation');
  const c = v.config as Record<string, unknown>;
  if (!hasOnly(c, ['address', 'asset_filter', 'direction', 'channel', 'webhook_url']) || typeof c.address !== 'string' || !/^(T[1-9A-HJ-NP-Za-km-z]{33}|(?:0x)?41[\da-fA-F]{40})$/.test(c.address) || (typeof c.asset_filter !== 'string' || !['USDT', 'TRX', 'ALL'].includes(c.asset_filter)) || (typeof c.direction !== 'string' || !['incoming', 'outgoing', 'both'].includes(c.direction)) || (typeof c.channel !== 'string' || !['webhook', 'telegram'].includes(c.channel)) || typeof c.webhook_url !== 'string') throw new Error('Invalid watch configuration');
  if (c.channel === 'telegram' && c.webhook_url !== '') throw new Error('Telegram has no webhook URL');
  if (c.channel === 'webhook') {
    const u = new URL(c.webhook_url);
    // Credential-bearing receiver URLs must be entered privately in the console, never in an AI draft.
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.search || u.hash || c.webhook_url.length > 2048 || /(?:tw_live_|tw_test_|whsec_|sk-)/i.test(c.webhook_url)) throw new Error('AI drafts require a credential-free HTTP(S) receiver URL without query or fragment; enter private receiver details in the console');
  }
  return { version: 1, operation: 'create', config: { address: c.address, asset_filter: c.asset_filter, direction: c.direction, channel: c.channel, webhook_url: c.webhook_url } as ApprovalConfig };
}
export function approvalLink(draft: ApprovalDraft): string { return 'https://tronhooks.com/app#tronhooks=' + encodeURIComponent(JSON.stringify(validateApproval(draft))); }
export function readApprovalFragment(fragment: string): ApprovalDraft | null {
  if (!fragment.startsWith('#tronhooks=')) return null;
  if (fragment.length > 12000) throw new Error('Approval draft too long');
  return validateApproval(JSON.parse(decodeURIComponent(fragment.slice('#tronhooks='.length))));
}
