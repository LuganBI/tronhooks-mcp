import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PRODUCT, approvalLink, validateApproval } from './shared/index.js';
const ORIGIN = 'https://tronhooks.com';
const description = 'TRON mainnet USDT/TRX confirmed transfer notifications via webhook or Telegram. No balance thresholds, arbitrary tokens, other chains or funds transfer.';
const configSchema = { address: z.string().min(1).max(44), asset_filter: z.enum(['USDT', 'TRX', 'ALL']).default('USDT'), direction: z.enum(['incoming', 'outgoing', 'both']).default('incoming'), channel: z.enum(['webhook', 'telegram']), webhook_url: z.string().max(2048).default('') };
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
class ReadError extends Error {}
const errorResult = (error: unknown) => safeError(error instanceof ReadError ? error.message : 'Unexpected account response; no write was attempted.');
const addressValue = z.string().regex(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
const watchResponse = z.object({ data: z.array(z.object({ id, address: addressValue, asset_filter: z.enum(['USDT', 'TRX', 'ALL']), direction: z.enum(['incoming', 'outgoing', 'both']), channel: z.enum(['webhook', 'telegram']), webhook_url: z.string().url().max(2048).nullable(), status: z.enum(['ACTIVE', 'PAUSED']), created_at: z.string().datetime() })) });
const eventResponse = z.object({ data: z.array(z.object({
  api_version: z.string().max(30), event_id: id, type: z.literal('transfer.confirmed'), network: z.literal('mainnet'), asset: z.enum(['USDT', 'TRX']), contract: addressValue.nullable(), tx_id: z.string().min(1).max(128), event_index: z.number().int().nonnegative(), block_number: z.number().int().nonnegative(), block_timestamp: z.string().datetime(), from: addressValue, to: addressValue, amount_raw: z.string().regex(/^\d{1,100}$/), amount: z.string().regex(/^\d{1,100}(?:\.\d{1,30})?$/), watch_id: id, direction: z.enum(['incoming', 'outgoing']).optional(),
  delivery: z.object({ notification_id: id, status: z.enum(['PENDING', 'DELIVERED', 'DEAD']), attempts: z.number().int().nonnegative(), created_at: z.string().datetime() }),
})), next_cursor: z.string().min(1).max(512).nullable() });

function result(value: Record<string, unknown>) { return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: value }; }
const safeError = (message: string) => ({ isError: true, content: [{ type: 'text' as const, text: message }] });
function cleanWatch(row: Record<string, unknown>) {
  const { id, address, asset_filter, direction, channel, status, created_at } = row;
  let origin: string | null = null;
  try { origin = typeof row.webhook_url === 'string' ? new URL(row.webhook_url).origin : null; } catch { /* do not return raw receiver */ }
  return { id, address, asset_filter, direction, channel, status, created_at, webhook_origin: origin, receiver_details: 'View the full receiver privately in the console; credentials and paths are omitted here.' };
}
export function createServer(options: { apiKey?: string; fetchImpl?: typeof fetch } = {}) {
  const server = new McpServer({ name: 'tronhooks', version: '0.1.0' }, { instructions: `${description} Account calls are GET-only. Prepared changes are not executed: the owner must log in to the official console, review the full configuration and confirm there. Never claim pending approval means success. API/signing keys stay local. No test-notification or wallet-signing tools exist.` });
  const get = async (route: string) => {
    if (!options.apiKey || !/^tw_live_[0-9a-f]{40}$/.test(options.apiKey)) throw new ReadError('Set a mainnet TRONHOOKS_API_KEY in your local environment; never paste it into chat. No request made.');
    let response: Response;
    try { response = await (options.fetchImpl ?? fetch)(ORIGIN + route, { method: 'GET', headers: { Authorization: `Bearer ${options.apiKey}`, 'User-Agent': 'Tronhooks-MCP/0.1.0' }, redirect: 'error', signal: AbortSignal.timeout(10000) }); }
    catch { throw new ReadError('Read failed or timed out. No write was attempted. Check local connectivity.'); }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new ReadError('Account read denied. Check the local key; no write was attempted.');
      if (response.status === 429) throw new ReadError('Read rate limited (429). Wait before another read; no automatic retry.');
      throw new ReadError(`Account read failed (HTTP ${response.status}); no automatic retry.`);
    }
    let body: unknown; try { body = await response.json(); } catch { throw new ReadError('Unexpected account response; no write was attempted.'); }
    const parsed = (route.startsWith('/v1/events?') ? eventResponse : watchResponse).safeParse(body);
    if (!parsed.success) throw new ReadError('Unexpected account response; no write was attempted.');
    return parsed.data as { data: Array<Record<string, unknown>>; next_cursor?: string | null };
  };
  const annotations = (external = false) => ({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: external });
  server.registerTool('get_capabilities', { description: `${description} Return official capability facts and documentation; no account key needed.`, inputSchema: {}, annotations: annotations() }, async () => result({ capabilities: PRODUCT, documentation: ORIGIN + '/docs/ai/', billing_open: false, transport: 'local_stdio', writes: 'owner_confirmed_console_only' }));
  server.registerTool('validate_watch_config', { description: 'Validate a TRON USDT/TRX watch draft without DNS lookup, account change or notification. Address shape is checked; the service checks checksum, receiver policy, quota and Telegram binding during confirmed creation.', inputSchema: z.object(configSchema).strict(), annotations: annotations() }, async input => {
    try { const draft = validateApproval({ version: 1, operation: 'create', config: input }); return result({ valid_shape: true, draft, account_checks: 'pending_owner_confirmation', executed: false }); } catch { return safeError('Invalid draft. Use a TRON address, supported asset/direction and one target. For webhook use a credential-free HTTP(S) URL without query/fragment; enter private details directly in the console.'); }
  });
  server.registerTool('list_watches', { description: 'Read watches scoped to your local mainnet API key. Receiver paths, query strings and secrets are omitted. Does not create, delete or send.', inputSchema: {}, annotations: annotations(true) }, async () => {
    try { const body = await get('/v1/watches'); return result({ data: body.data.map(cleanWatch), read_only: true }); } catch (e) { return errorResult(e); }
  });
  server.registerTool('list_events', { description: 'Read retained TRON delivery records for your account. Follow next_cursor unchanged; deleted-watch history is unavailable. This is reconciliation data, not a balance or funds-transfer tool.', inputSchema: { limit: z.number().int().min(1).max(200).default(50), cursor: z.string().max(512).optional(), watch_id: id.optional(), since: z.string().datetime().optional() }, annotations: annotations(true) }, async input => {
    try {
      const query = new URLSearchParams({ limit: String(input.limit) }); for (const key of ['cursor', 'watch_id', 'since'] as const) if (input[key]) query.set(key, input[key]);
      const body = await get('/v1/events?' + query);
      // Explicit wire-field allowlist; never forward unexpected server fields such as secrets.
      const fields = ['api_version', 'event_id', 'type', 'network', 'asset', 'contract', 'tx_id', 'event_index', 'block_number', 'block_timestamp', 'from', 'to', 'amount_raw', 'amount', 'watch_id', 'direction'];
      const data = body.data.map(row => { const event = row; const d = row.delivery && typeof row.delivery === 'object' ? row.delivery as Record<string, unknown> : {}; return { ...Object.fromEntries(fields.filter(key => key in event).map(key => [key, event[key]])), delivery: Object.fromEntries(['notification_id', 'status', 'attempts', 'created_at', 'updated_at'].filter(key => key in d).map(key => [key, d[key]])) }; });
      return result({ data, next_cursor: body.next_cursor ?? null, read_only: true });
    } catch (e) { return errorResult(e); }
  });
  server.registerTool('prepare_create_watch', { description: 'Prepare (DO NOT EXECUTE) a TRON USDT/TRX watch creation. Returns a private browser-fragment draft for the owner to review and confirm in the official console. No key or secret in the link. Does not send a notification or create a watch.', inputSchema: z.object(configSchema).strict(), annotations: annotations() }, async input => {
    try {
      const draft = validateApproval({ version: 1, operation: 'create', config: input });
      return result({ status: 'requires_owner_action', executed: false, preview: draft, approval_url: approvalLink(draft), quota_effect: 'One active-watch slot; Free has 3. Billing is closed.', next_step: 'Open privately, verify the logged-in account and full target, review then confirm. Future real transfers may notify after creation. Save any one-time secret in local storage, never chat. Reconcile the watch list after timeout; do not repeat a write blindly.' });
    } catch { return safeError('Invalid or credential-bearing draft. Enter private receiver details in the console instead. No write occurred.'); }
  });
  server.registerTool('prepare_delete_watch', { description: 'Prepare (DO NOT EXECUTE) deletion of an owned watch after a scoped GET. Owner confirms in the console. Deletion removes notification/attempt history; an in-flight delivery may finish. This tool never calls DELETE.', inputSchema: { watch_id: id }, annotations: annotations(true) }, async ({ watch_id }) => {
    try {
      const owned = (await get('/v1/watches')).data.find(row => row.id === watch_id); if (!owned) return safeError('Watch not found in the current account. Nothing prepared or deleted.');
      return result({ status: 'requires_owner_action', executed: false, preview: cleanWatch(owned), approval_url: approvalLink({ version: 1, operation: 'delete', watch_id }), next_step: 'Verify the logged-in account and full receiver in the console before confirming. Deleting cascades delivery history; in-flight delivery may finish. Verify absence in a subsequent list_watches call.' });
    } catch (e) { return errorResult(e); }
  });
  return server;
}
