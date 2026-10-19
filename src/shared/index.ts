/**
 * Shared types between the API service and (future, Phase 2) TypeScript SDK.
 * Webhook payload shape is versioned via `api_version` — additive changes only
 * within a version; breaking changes bump the version string.
 */

export const API_VERSION = '2026-08';
export { PRODUCT } from './product.js';

export type Network = 'mainnet' | 'nile';

export type Asset = 'USDT' | 'TRX';

export type AssetFilter = 'USDT' | 'TRX' | 'ALL';

/**
 * A confirmed on-chain transfer matched against a customer watch.
 *
 * `event_index`: index of the Transfer log within the transaction receipt.
 * Native TRX transfers produce no logs, so their event_index is fixed at 0
 * by convention (documented in README).
 */
export interface TransferEventPayload {
  api_version: typeof API_VERSION;
  event_id: string;
  type: 'transfer.confirmed';
  /** which side of the transfer the watch matched (additive, 2026-08) */
  direction?: 'incoming' | 'outgoing';
  network: Network;
  asset: Asset;
  /** TRC-20 contract address (base58), null for native TRX */
  contract: string | null;
  tx_id: string;
  event_index: number;
  block_number: number;
  block_timestamp: string; // ISO-8601
  from: string; // base58
  to: string; // base58
  /** integer amount in the asset's smallest unit, as a decimal string */
  amount_raw: string;
  /** human-readable amount (USDT: 6 decimals, TRX: 6 decimals) */
  amount: string;
  watch_id: string;
}

export interface WebhookHeaders {
  /** hex(hmac-sha256(secret, rawBody)) */
  'x-signature': string;
  'x-event-id': string;
}
export { approvalLink, readApprovalFragment, validateApproval } from './approval.js';
export type { ApprovalConfig, ApprovalDraft } from './approval.js';
