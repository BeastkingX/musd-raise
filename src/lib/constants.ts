import { defineChain } from 'viem'

/**
 * Network details for Mezo Testnet — used exactly as specified.
 * Do not change these without updating the README.
 */
export const MEZO_TESTNET_CHAIN_ID = 31611
export const MEZO_TESTNET_CHAIN_ID_HEX = '0x7b7b' // 31611 in hex
export const MEZO_RPC_URL = 'https://rpc.test.mezo.org'
export const MEZO_EXPLORER_URL = 'https://explorer.test.mezo.org'
export const MEZO_EXPLORER_API_URL = 'https://api.explorer.test.mezo.org/api/v2'
export const MEZO_FAUCET_URL = 'https://faucet.test.mezo.org'

export const MUSD_CONTRACT_ADDRESS =
  '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503' as const
export const MUSD_DECIMALS = 18
export const MUSD_SYMBOL = 'MUSD'

export const mezoTestnet = defineChain({
  id: MEZO_TESTNET_CHAIN_ID,
  name: 'Mezo Testnet',
  nativeCurrency: { name: 'BTC', symbol: 'BTC', decimals: 18 },
  rpcUrls: {
    default: { http: [MEZO_RPC_URL] },
  },
  blockExplorers: {
    default: {
      name: 'Mezo Testnet Explorer',
      url: MEZO_EXPLORER_URL,
    },
  },
  testnet: true,
})

/** Minimal ERC-20 ABI — only what this app needs. */
export const erc20Abi = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const

export function shortenAddress(address: string): string {
  if (!address) return ''
  if (address.length <= 10) return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function explorerTxUrl(txHash: string): string {
  return `${MEZO_EXPLORER_URL}/tx/${txHash}`
}

export function explorerAddressUrl(address: string): string {
  return `${MEZO_EXPLORER_URL}/address/${address}`
}
