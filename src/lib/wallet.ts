import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseUnits,
  type Address,
  type EIP1193Provider,
} from 'viem'
import {
  MEZO_EXPLORER_URL,
  MEZO_RPC_URL,
  MEZO_TESTNET_CHAIN_ID_HEX,
  MUSD_CONTRACT_ADDRESS,
  MUSD_DECIMALS,
  erc20Abi,
  mezoTestnet,
} from './constants'

declare global {
  interface Window {
    ethereum?: EIP1193Provider
  }
}

export function getInjectedProvider(): EIP1193Provider {
  if (!window.ethereum) throw new Error('No wallet found in this browser.')
  return window.ethereum
}

export const publicClient = createPublicClient({
  chain: mezoTestnet,
  transport: http(MEZO_RPC_URL),
})

/** Check nested wallet error codes, including MetaMask's originalError. */
export function hasErrorCode(error: unknown, code: number): boolean {
  const seen = new Set<unknown>()
  function walk(value: unknown): boolean {
    if (!value || typeof value !== 'object' || seen.has(value)) return false
    seen.add(value)
    const e = value as Record<string, unknown>
    return Number(e.code) === code || walk(e.data) || walk(e.originalError) || walk(e.cause)
  }
  return walk(error)
}

export async function ensureMezoNetwork(provider: EIP1193Provider): Promise<void> {
  const switchChain = () => provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: MEZO_TESTNET_CHAIN_ID_HEX }] })
  try { await switchChain(); return } catch (error) {
    if (hasErrorCode(error, 4001)) throw error
    try {
      await provider.request({ method: 'wallet_addEthereumChain', params: [{
        chainId: MEZO_TESTNET_CHAIN_ID_HEX, chainName: 'Mezo Testnet',
        nativeCurrency: { name: 'BTC', symbol: 'BTC', decimals: 18 },
        rpcUrls: [MEZO_RPC_URL], blockExplorerUrls: [MEZO_EXPLORER_URL],
      }] })
      await switchChain()
    } catch (addError) {
      // Preserve a pending request code if the follow-up fails differently.
      if (hasErrorCode(error, -32002) && !hasErrorCode(addError, 4001) && !hasErrorCode(addError, -32002)) throw error
      throw addError
    }
  }
}

export async function getConnectedChainId(provider: EIP1193Provider): Promise<number> {
  const hex = await provider.request({ method: 'eth_chainId' }) as string
  const id = Number.parseInt(hex, 16)
  if (!Number.isFinite(id)) throw new Error(`Invalid wallet chain ID: ${hex}`)
  return id
}

export async function fetchMusdBalance(address: string): Promise<bigint> {
  return publicClient.readContract({
    address: MUSD_CONTRACT_ADDRESS as Address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address as Address],
  })
}

export function parseMusdAmount(amount: string): bigint {
  return parseUnits(amount.trim(), MUSD_DECIMALS)
}

/**
 * Send `amount` MUSD to `recipient` from `from`.
 * Returns the transaction hash once the wallet has signed and the
 * transaction has been broadcast. Callers should then wait for the
 * receipt to know it was actually mined.
 */
export async function donateMusd(params: {
  from: string
  recipient: string
  amount: bigint
  provider: EIP1193Provider
}): Promise<string> {
  const provider = params.provider
  const walletClient = createWalletClient({
    chain: mezoTestnet,
    transport: custom(provider),
  })

  const hash = await walletClient.writeContract({
    account: params.from as Address,
    address: MUSD_CONTRACT_ADDRESS as Address,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [params.recipient as Address, params.amount],
  })
  return hash
}

export async function waitForReceipt(txHash: string) {
  return publicClient.waitForTransactionReceipt({
    hash: txHash as `0x${string}`,
  })
}

export type ErrorAction = 'connection' | 'network' | 'signature' | 'donation'
export interface WalletError { message: string; details: string }
export function walletError(error: unknown, action: ErrorAction): WalletError {
  const e = error as { message?: unknown; shortMessage?: unknown; code?: unknown } | null
  let details = typeof e?.message === 'string' ? e.message : typeof error === 'string' ? error : ''
  if (!details) { try { details = JSON.stringify(error) || String(error) } catch { details = String(error) } }
  if (e?.code !== undefined) details += ` (code: ${String(e.code)})`
  const original = (error as { data?: { originalError?: { code?: number; message?: string } } })?.data?.originalError
  if (original) details += `; original error: ${original.message ?? ''}${original.code !== undefined ? ` (code: ${original.code})` : ''}`
  const rejected = hasErrorCode(error, 4001) || /user rejected|user denied|rejected the request/i.test(details)
  let message: string
  if (hasErrorCode(error, -32002)) message = 'A connection request is already open. Click the MetaMask icon in your browser toolbar to approve it.'
  else if (rejected) message = {
    connection: 'Wallet connection cancelled. Please try again when you are ready.',
    network: 'Network switch cancelled. Your wallet is still connected; switch to Mezo Testnet to donate.',
    signature: 'Signature cancelled. Your campaign was not created.',
    donation: 'Donation cancelled in your wallet. No MUSD was sent.',
  }[action]
  else if (action === 'donation' && /insufficient funds/i.test(details)) message = 'Not enough test BTC for the network fee. Get test BTC from the faucet below.'
  else message = { connection: 'Could not connect the wallet.', network: 'Could not switch to Mezo Testnet. Try the button again or add the network manually.', signature: 'Could not sign the campaign.', donation: 'The donation could not be completed.' }[action]
  return { message, details }
}
