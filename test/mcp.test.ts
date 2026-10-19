import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createServer } from '../src/index.js';
import { approvalLink, readApprovalFragment } from '../src/shared/index.js';
import path from 'node:path';
const key = 'tw_live_' + 'a'.repeat(40), address = 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8';
const watch = { id: 'w1', address, asset_filter: 'USDT', direction: 'incoming', channel: 'webhook', webhook_url: 'https://receiver.example/private/path?token=secret', status: 'ACTIVE', created_at: '2026-10-19T00:00:00Z' };
const event = { api_version: '2026-08', event_id: 'e1', type: 'transfer.confirmed', network: 'mainnet', asset: 'USDT', contract: address, tx_id: 't1', event_index: 0, block_number: 1, block_timestamp: '2026-10-19T00:00:00Z', from: address, to: address, amount_raw: '999999999999999999999999', amount: '999999999999999999.999999', watch_id: 'w1', direction: 'incoming', delivery: { notification_id: 'n1', status: 'DEAD', attempts: 6, created_at: '2026-10-19T00:00:00Z' } };
const config = { address, asset_filter: 'USDT', direction: 'incoming', channel: 'telegram', webhook_url: '' };
const open: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.all(open.splice(0).map(close => close())); });
async function connect(fetchImpl = vi.fn<typeof fetch>(), apiKey: string | undefined = key) {
  const server = createServer({ fetchImpl, ...(apiKey ? { apiKey } : {}) });
  const client = new Client({ name: 'acceptance', version: '1' }); const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a); await client.connect(b); open.push(() => client.close(), () => server.close());
  return { client, fetchImpl, tools: (await client.listTools()).tools };
}
const body = (r: Awaited<ReturnType<Client['callTool']>>) => JSON.parse((r.content as Array<{ text: string }>)[0]!.text);
describe('MCP protocol and permission boundary', () => {
  it('exposes exactly six described tools, no send/write/funds tool, honest annotations', async () => {
    const { client, tools, fetchImpl } = await connect();
    expect(tools.map(t => t.name).sort()).toEqual(['get_capabilities', 'list_events', 'list_watches', 'prepare_create_watch', 'prepare_delete_watch', 'validate_watch_config']);
    expect(tools.every(t => t.annotations?.readOnlyHint === true)).toBe(true);
    const r = body(await client.callTool({ name: 'get_capabilities', arguments: {} })); expect(r.capabilities.assets).toEqual(['USDT', 'TRX']); expect(r.billing_open).toBe(false); expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('prepares but never executes creation; fragment roundtrip does not include key', async () => {
    const { client, fetchImpl } = await connect();
    const r = body(await client.callTool({ name: 'prepare_create_watch', arguments: config }));
    expect(r).toMatchObject({ status: 'requires_owner_action', executed: false });
    expect(readApprovalFragment(new URL(r.approval_url).hash)).toMatchObject({ operation: 'create', config });
    expect(new URL(r.approval_url).search).toBe(''); expect(JSON.stringify(r)).not.toContain(key); expect(fetchImpl).not.toHaveBeenCalled();
    const again = body(await client.callTool({ name: 'prepare_create_watch', arguments: config })); expect(again.approval_url).toBe(r.approval_url);
  });
  it.each([{ asset_filter: 'USDC' }, { channel: 'balance' }, { address: 'ETH' }, { channel: 'webhook', webhook_url: 'https://u:secret@receiver.example/hook' }, { channel: 'webhook', webhook_url: 'https://receiver.example/hook?token=secret' }, { channel: 'webhook', webhook_url: 'https://receiver.example/whsec_secret' }, { confirmed: true }, { secret: 'never' }])('rejects invalid or overclaimed draft %j without network', async override => {
    const { client, fetchImpl } = await connect(); const r = await client.callTool({ name: 'prepare_create_watch', arguments: { ...config, ...override } }); expect(r.isError).toBe(true); expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('blocks missing/test/malformed local keys before account requests', async () => {
    for (const apiKey of ['', 'tw_test_' + 'a'.repeat(40), 'bad\r\nkey']) {
      const { client, fetchImpl } = await connect(vi.fn<typeof fetch>(), apiKey);
      expect((await client.callTool({ name: 'list_watches', arguments: {} })).isError).toBe(true); expect(fetchImpl).not.toHaveBeenCalled();
    }
  });
  it('reads scoped watches and prepares owned deletion via GET only, redacting receiver details and extra fields', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: [{ ...watch, secret: 'PRIVATE_SECRET' }] })));
    const { client } = await connect(fetchImpl);
    const list = body(await client.callTool({ name: 'list_watches', arguments: {} })); expect(JSON.stringify(list)).not.toMatch(/private\/path|token=|PRIVATE_SECRET/);
    // Each GET needs its own response body.
    fetchImpl.mockResolvedValue(new Response(JSON.stringify({ data: [watch] })));
    const prepared = body(await client.callTool({ name: 'prepare_delete_watch', arguments: { watch_id: 'w1' } })); expect(prepared.executed).toBe(false); expect(prepared.preview.id).toBe('w1'); expect(prepared.approval_url).not.toContain(key);
    fetchImpl.mockResolvedValue(new Response(JSON.stringify({ data: [] })));
    expect((await client.callTool({ name: 'prepare_delete_watch', arguments: { watch_id: 'not-owned' } })).isError).toBe(true);
    for (const [url, options] of fetchImpl.mock.calls) { expect(url).toBe('https://tronhooks.com/v1/watches'); expect(options?.method).toBe('GET'); expect(options?.redirect).toBe('error'); expect((options?.headers as Record<string,string>).Authorization).toBe('Bearer ' + key); }
  });
  it('preserves event amount precision and cursor while omitting unknown data', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: [{ ...event, secret: 'PRIVATE', delivery: { ...event.delivery, secret: 'PRIVATE' } }], next_cursor: 'v1.cursor' })));
    const { client } = await connect(fetchImpl); const r = body(await client.callTool({ name: 'list_events', arguments: { limit: 1, cursor: 'v1.previous', watch_id: 'w1' } }));
    expect(r.data[0].amount_raw).toBe('999999999999999999999999'); expect(r.next_cursor).toBe('v1.cursor'); expect(JSON.stringify(r)).not.toContain('PRIVATE');
    const url = new URL(String(fetchImpl.mock.calls[0]![0])); expect(url.searchParams.get('cursor')).toBe('v1.previous'); expect(url.searchParams.get('limit')).toBe('1');
  });
  it.each([401,403,429,500])('does not echo error payload or retry status %i', async status => {
    const fn = vi.fn<typeof fetch>().mockResolvedValue(new Response('PRIVATE_KEY_AND_BODY', { status })); const { client } = await connect(fn);
    const result = await client.callTool({ name: 'list_events', arguments: {} }); expect(result.isError).toBe(true); expect(JSON.stringify(result)).not.toContain('PRIVATE_KEY_AND_BODY'); expect(fn).toHaveBeenCalledTimes(1);
  });
  it('sanitizes network errors and rejects malformed read responses', async () => {
    const fn = vi.fn<typeof fetch>().mockRejectedValue(new Error('PRIVATE URL/key')); const { client } = await connect(fn);
    expect(JSON.stringify(await client.callTool({ name: 'list_watches', arguments: {} }))).not.toContain('PRIVATE');
    fn.mockResolvedValue(new Response('bad json')); expect((await client.callTool({ name: 'list_watches', arguments: {} })).isError).toBe(true);
  });
  it('rejects malformed rows/nested fields without echoing raw data or exceptions', async () => {
    for (const data of [{ data: ['PRIVATE_RESPONSE_MARKER'], next_cursor: null }, { data: [{ ...event, event_id: { secret: 'PRIVATE_RESPONSE_MARKER' } }], next_cursor: null }, { data: [event], next_cursor: { secret: 'PRIVATE_RESPONSE_MARKER' } }]) {
      const fn = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(data))); const { client } = await connect(fn);
      const result = await client.callTool({ name: 'list_events', arguments: {} }); expect(result.isError).toBe(true); expect(JSON.stringify(result)).not.toContain('PRIVATE_RESPONSE_MARKER');
    }
    const fn = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: [{ ...watch, id: { secret: 'PRIVATE_RESPONSE_MARKER' } }] })));
    const { client } = await connect(fn); const r = await client.callTool({ name: 'list_watches', arguments: {} }); expect(r.isError).toBe(true); expect(JSON.stringify(r)).not.toContain('PRIVATE_RESPONSE_MARKER');
  });
  it('rejects array/object enum coercion in browser fragments', () => {
    for (const field of ['asset_filter', 'direction', 'channel'] as const) expect(() => readApprovalFragment('#tronhooks=' + encodeURIComponent(JSON.stringify({ version: 1, operation: 'create', config: { ...config, [field]: [config[field]] } })))).toThrow();
  });
  it('rejects unknown/excessive fragment payload and performs no operation', () => {
    for (const hash of ['#tronhooks=%', '#tronhooks=' + encodeURIComponent(JSON.stringify({ version: 1, operation: 'transfer' })), '#tronhooks=' + 'x'.repeat(13000)]) expect(() => readApprovalFragment(hash)).toThrow();
    expect(readApprovalFragment('#unrelated')).toBeNull(); expect(() => approvalLink({ version: 1, operation: 'delete', watch_id: '../not-owned' })).toThrow();
  });
  it('runs the built stdio executable through an independent SDK client with no key/network', async () => {
    const transport = new StdioClientTransport({ command: process.execPath, args: [path.resolve('dist/cli.js')], env: { PATH: process.env.PATH ?? '' }, stderr: 'pipe' });
    const client = new Client({ name: 'stdio-acceptance', version: '1' }); open.push(() => client.close());
    await client.connect(transport); expect((await client.listTools()).tools).toHaveLength(6);
    expect(body(await client.callTool({ name: 'get_capabilities', arguments: {} })).billing_open).toBe(false);
    expect((await client.callTool({ name: 'list_watches', arguments: {} })).isError).toBe(true);
  });
});
