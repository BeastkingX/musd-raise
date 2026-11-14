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
  MEZO_TESTNET_CHAIN_ID,
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

export function hasInjectedWallet(): boolean {
  return typeof window !== 'undefined' && !!window.ethereum
}

export function getInjectedProvider(): EIP1193Provider {
  if (!window.ethereum) {
    throw new Error(
      'No wallet found in this browser. Please install MetaMask (or another wallet) and try again.',
    )
  }
  return window.ethereum
}

export const publicClient = createPublicClient({
  chain: mezoTestnet,
  transport: http(MEZO_RPC_URL),
})

/** Ask MetaMask to switch to Mezo Testnet, adding the network if needed. */
export async function ensureMezoNetwork(): Promise<void> {
  const provider = getInjectedProvider()
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: MEZO_TESTNET_CHAIN_ID_HEX }],
    })
  } catch (error) {
    const code = (error as { code?: number })?.code
    if (code === 4902) {
      // Network not added yet — add it.
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: MEZO_TESTNET_CHAIN_ID_HEX,
            chainName: 'Mezo Testnet',
            nativeCurrency: { name: 'BTC', symbol: 'BTC', decimals: 18 },
            rpcUrls: [MEZO_RPC_URL],
            blockExplorerUrls: [MEZO_EXPLORER_URL],
          },
        ],
      })
    } else {
      throw error
    }
  }
}

export async function getConnectedChainId(): Promise<number | null> {
  if (!hasInjectedWallet()) return null
  try {
    const hex = (await getInjectedProvider().request({
      method: 'eth_chainId',
    })) as string
    return parseInt(hex, 16)
  } catch {
    return null
  }
}

export async function getConnectedAccounts(): Promise<string[]> {
  if (!hasInjectedWallet()) return []
  try {
    const accounts = (await getInjectedProvider().request({
      method: 'eth_accounts',
    })) as string[]
    return accounts ?? []
  } catch {
    return []
  }
}

/**
 * Connect the wallet: request accounts, then make sure we're on
 * Mezo Testnet (switching / adding the network automatically).
 * Returns the connected address and the chain id after switching.
 */
export async function connectWallet(): Promise<{
  address: string
  chainId: number
}> {
  const provider = getInjectedProvider()
  const accounts = (await provider.request({
    method: 'eth_requestAccounts',
  })) as string[]
  if (!accounts || accounts.length === 0) {
    throw new Error('No account was returned by the wallet.')
  }
  await ensureMezoNetwork()
  const chainId = (await getConnectedChainId()) ?? MEZO_TESTNET_CHAIN_ID
  return { address: accounts[0], chainId }
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
}): Promise<string> {
  const provider = getInjectedProvider()
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

export function isUserRejection(error: unknown): boolean {
  const code = (error as { code?: number })?.code
  const message = (error as Error)?.message ?? ''
  return (
    code === 4001 ||
    code === -32603 && /rejected|denied|user/i.test(message) ||
    /user rejected|user denied|rejected the request/i.test(message)
  )
}

export function friendlyWalletError(error: unknown): string {
  if (isUserRejection(error)) {
    return 'You rejected the transaction in your wallet. No MUSD was sent. You can try again whenever you are ready.'
  }
  const message = (error as Error)?.message ?? 'Something went wrong.'
  // Keep wallet errors short and plain-language where possible.
  if (/insufficient funds/i.test(message)) {
    return 'Your wallet does not have enough BTC (testnet) to pay the network fee for this transaction. Get some test BTC from the faucet below.'
  }
  if (/insufficient/i.test(message) && /balance/i.test(message)) {
    return 'Your MUSD balance is too low for this donation.'
  }
  return message
}
