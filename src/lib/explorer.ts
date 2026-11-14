import { createPublicClient, http, parseAbiItem, type Address } from 'viem'
import {
  MEZO_EXPLORER_API_URL,
  MEZO_RPC_URL,
  MUSD_CONTRACT_ADDRESS,
  mezoTestnet,
} from './constants'

export interface Donation {
  /** Sender wallet address */
  from: string
  /** Recipient wallet address */
  to: string
  /** Amount in smallest units (18 decimals) as BigInt */
  value: bigint
  blockNumber: number
  logIndex: number
  transactionHash: string
  /** ISO timestamp from the explorer, if available */
  timestamp: string | null
}

export interface DonationResult {
  donations: Donation[]
  /** Sum of all donation values, in smallest units */
  total: bigint
  /** Number of unique sender addresses */
  supporterCount: number
  /** Where the data came from — useful for debugging / transparency */
  source: 'explorer' | 'rpc-fallback'
  /** True if we stopped early because there were too many pages/chunks */
  truncated: boolean
}

/**
 * ---------------------------------------------------------------------------
 * How "raised" is calculated
 * ---------------------------------------------------------------------------
 * There is no custom smart contract, so the app cannot ask a contract
 * "how much has this campaign raised?". Instead it asks the block explorer:
 *
 *   GET https://api.explorer.test.mezo.org/api/v2/addresses/{recipient}/token-transfers
 *
 * That endpoint (Blockscout v2 API) returns token transfers for an address,
 * newest first, 50 per page, with `next_page_params` for pagination.
 * We filter to:
 *   - token address == MUSD contract (case-insensitive)
 *   - `to` == recipient (case-insensitive)
 *   - block_number >= campaign start block
 *   - type == "token_transfer" (excludes mint/burn bookkeeping entries)
 * and sum the values.
 *
 * CORS: verified 2026-11-14 — the API replies with
 * `Access-Control-Allow-Origin: *` (including on OPTIONS preflight), so a
 * browser fetch works with no proxy and no API key. Tested against live
 * data: /api/v2/stats, /api/v2/tokens/{MUSD}/transfers and
 * /api/v2/addresses/{addr}/token-transfers all returned 200 with real
 * MUSD transfers, and pagination via ?index=...&block_number=... works.
 *
 * Fallback: if the explorer API fails (network error, 429, 5xx), we fall
 * back to eth_getLogs on the RPC. The RPC only allows a 10,000-block range
 * per call, so we page through in 10,000-block chunks from the campaign
 * start block to the current block, asking for Transfer events from the
 * MUSD contract where `to` == recipient.
 * ---------------------------------------------------------------------------
 */

const MAX_EXPLORER_PAGES = 40 // 40 × 50 = 2,000 transfers max via explorer
const RPC_CHUNK_SIZE = 10_000 // RPC limit per eth_getLogs call

interface ExplorerTransferItem {
  block_number?: number
  log_index?: number
  timestamp?: string
  transaction_hash?: string
  type?: string
  from?: { hash?: string }
  to?: { hash?: string }
  token?: { address_hash?: string }
  total?: { value?: string }
}

interface ExplorerPage {
  items?: ExplorerTransferItem[]
  next_page_params?: { index?: number; block_number?: number } | null
}

function sameAddress(a: string | undefined, b: string): boolean {
  return !!a && a.toLowerCase() === b.toLowerCase()
}

function toDonation(
  item: ExplorerTransferItem,
  recipient: string,
): Donation | null {
  if (!sameAddress(item.to?.hash, recipient)) return null
  if (!item.from?.hash || !item.transaction_hash || !item.total?.value) return null
  if (item.block_number === undefined) return null
  // Only real transfers count — skip minting/burning bookkeeping.
  if (item.type && item.type !== 'token_transfer') return null
  let value: bigint
  try {
    value = BigInt(item.total.value)
  } catch {
    return null
  }
  if (value <= BigInt(0)) return null
  return {
    from: item.from.hash,
    to: recipient,
    value,
    blockNumber: item.block_number,
    logIndex: item.log_index ?? 0,
    transactionHash: item.transaction_hash,
    timestamp: item.timestamp ?? null,
  }
}

async function fetchViaExplorer(
  recipient: string,
  startBlock: number,
): Promise<DonationResult> {
  const donations: Donation[] = []
  let url: string | null =
    `${MEZO_EXPLORER_API_URL}/addresses/${recipient}/token-transfers`
  let truncated = false

  for (let page = 0; page < MAX_EXPLORER_PAGES; page++) {
    if (!url) break
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) {
      throw new Error(`Explorer API returned ${res.status} ${res.statusText}`)
    }
    const data = (await res.json()) as ExplorerPage
    const items = data.items ?? []
    if (items.length === 0) break

    let sawOlderThanStart = false
    for (const item of items) {
      const blockNumber = item.block_number ?? 0
      if (blockNumber < startBlock) {
        sawOlderThanStart = true
        continue
      }
      if (!sameAddress(item.token?.address_hash, MUSD_CONTRACT_ADDRESS)) continue
      const donation = toDonation(item, recipient)
      if (donation) donations.push(donation)
    }

    // Items are newest-first, so once a whole page is older than the
    // campaign start, older pages will only be older still.
    if (sawOlderThanStart && items.every((i) => (i.block_number ?? 0) < startBlock)) {
      break
    }

    const next = data.next_page_params
    if (!next || next.block_number === undefined || next.index === undefined) {
      break
    }
    if (page === MAX_EXPLORER_PAGES - 1) {
      truncated = true
      break
    }
    url =
      `${MEZO_EXPLORER_API_URL}/addresses/${recipient}/token-transfers` +
      `?index=${encodeURIComponent(String(next.index))}` +
      `&block_number=${encodeURIComponent(String(next.block_number))}`
  }

  donations.sort(
    (a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex,
  )
  return summarise(donations, 'explorer', truncated)
}

const publicClient = createPublicClient({
  chain: mezoTestnet,
  transport: http(MEZO_RPC_URL),
})

const transferEvent = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
)

async function fetchViaRpcFallback(
  recipient: string,
  startBlock: number,
): Promise<DonationResult> {
  const donations: Donation[] = []
  const latest = await publicClient.getBlockNumber()
  const end = Number(latest)
  let truncated = false

  // Page through in 10,000-block chunks — the RPC rejects wider ranges.
  for (let from = startBlock; from <= end; from += RPC_CHUNK_SIZE) {
    const to = Math.min(from + RPC_CHUNK_SIZE - 1, end)
    const logs = await publicClient.getLogs({
      address: MUSD_CONTRACT_ADDRESS as Address,
      event: transferEvent,
      args: { to: recipient as Address },
      fromBlock: BigInt(from),
      toBlock: BigInt(to),
    })
    for (const log of logs) {
      if (!log.args?.from || !log.args?.value) continue
      donations.push({
        from: log.args.from,
        to: recipient,
        value: log.args.value,
        blockNumber: Number(log.blockNumber),
        logIndex: log.logIndex ?? 0,
        transactionHash: log.transactionHash,
        timestamp: null,
      })
    }
    // Safety valve: avoid an unbounded loop for very old campaigns.
    if (donations.length > 5000) {
      truncated = true
      break
    }
  }

  donations.sort(
    (a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex,
  )
  return summarise(donations, 'rpc-fallback', truncated)
}

function summarise(
  donations: Donation[],
  source: DonationResult['source'],
  truncated: boolean,
): DonationResult {
  const total = donations.reduce((sum, d) => sum + d.value, BigInt(0))
  const supporterCount = new Set(
    donations.map((d) => d.from.toLowerCase()),
  ).size
  return { donations, total, supporterCount, source, truncated }
}

/**
 * Fetch all MUSD donations to `recipient` from `startBlock` onwards.
 * Tries the explorer API first, falls back to chunked eth_getLogs.
 */
export async function fetchDonations(
  recipient: string,
  startBlock: number,
): Promise<DonationResult> {
  try {
    return await fetchViaExplorer(recipient, startBlock)
  } catch (explorerError) {
    // Explorer unavailable — try the RPC fallback before giving up.
    try {
      return await fetchViaRpcFallback(recipient, startBlock)
    } catch {
      // Surface the original explorer error — it's usually more informative.
      throw explorerError
    }
  }
}

export async function fetchCurrentBlockNumber(): Promise<number> {
  const block = await publicClient.getBlockNumber()
  return Number(block)
}
