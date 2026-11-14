import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { EIP1193Provider } from 'viem'
import { ensureMezoNetwork, getConnectedChainId, walletError, type WalletError } from './wallet'
import { MEZO_TESTNET_CHAIN_ID } from './constants'

interface WalletOption { id: string; name: string; provider: EIP1193Provider }
interface WalletState {
  wallets: WalletOption[]; provider: EIP1193Provider | null; address: string | null; chainId: number | null
  connecting: boolean; switching: boolean; error: WalletError | null; choosing: boolean
  connect: () => void; choose: (wallet: WalletOption) => void; switchNetwork: () => void; cancelChoose: () => void
}
const Context = createContext<WalletState | null>(null)
export function useWallet() { const value = useContext(Context); if (!value) throw new Error('Wallet context missing'); return value }

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<WalletOption[]>([])
  const [provider, setProvider] = useState<EIP1193Provider | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [error, setError] = useState<WalletError | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const active = useRef<EIP1193Provider | null>(null)
  useEffect(() => {
    function announce(event: Event) {
      const detail = (event as CustomEvent<{ info: { uuid: string; name: string }; provider: EIP1193Provider }>).detail
      if (!detail?.info?.uuid || !detail.info.name || typeof detail.provider?.request !== 'function') return
      setWallets(prev => {
        const filtered = prev.filter(w => w.id !== 'injected' || w.provider !== detail.provider)
        return filtered.some(w => w.id === detail.info.uuid || w.provider === detail.provider) ? filtered : [...filtered, { id: detail.info.uuid, name: detail.info.name, provider: detail.provider }]
      })
    }
    window.addEventListener('eip6963:announceProvider', announce)
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    const timer = window.setTimeout(() => {
      if (window.ethereum) setWallets(prev => prev.some(w => w.provider === window.ethereum) ? prev : prev.length ? prev : [{ id: 'injected', name: 'Browser wallet', provider: window.ethereum! }])
    }, 300)
    return () => { window.clearTimeout(timer); window.removeEventListener('eip6963:announceProvider', announce) }
  }, [])

  // Restore a previously authorised single wallet without opening a popup.
  useEffect(() => {
    if (wallets.length !== 1 || active.current || connecting) return
    let alive = true
    const p = wallets[0].provider
    void (async () => {
      try {
        const accounts = await p.request({ method: 'eth_accounts' }) as string[]
        if (!alive || active.current || !accounts?.length) return
        active.current = p; setProvider(p); setAddress(accounts[0])
        try { const id = await getConnectedChainId(p); if (alive && active.current === p) setChainId(id) } catch (e) { if (alive) setError(walletError(e, 'network')) }
      } catch (e) { if (alive) setError(walletError(e, 'connection')) }
    })()
    return () => { alive = false }
  }, [wallets, connecting])

  const switchWith = useCallback(async (p: EIP1193Provider) => {
    setSwitching(true); setError(null)
    try {
      await ensureMezoNetwork(p)
      const id = await getConnectedChainId(p)
      if (active.current === p) setChainId(id)
      if (id !== MEZO_TESTNET_CHAIN_ID) throw new Error(`Wallet reports chain ${id} after switching.`)
    } catch (e) {
      if (active.current === p) {
        try { setChainId(await getConnectedChainId(p)) } catch { setChainId(null) }
        setError(walletError(e, 'network'))
      }
    } finally { setSwitching(false) }
  }, [])
  const choose = useCallback(async (option: WalletOption) => {
    setChoosing(false); setConnecting(true); setError(null)
    try {
      const accounts = await option.provider.request({ method: 'eth_requestAccounts' }) as string[]
      if (!accounts?.length) throw new Error('No account was returned by the wallet.')
      active.current = option.provider; setProvider(option.provider); setAddress(accounts[0]); setChainId(null)
      let id: number | null = null
      try { id = await getConnectedChainId(option.provider); setChainId(id) } catch (e) { setError(walletError(e, 'network')) }
      if (id !== MEZO_TESTNET_CHAIN_ID) await switchWith(option.provider)
    } catch (e) { setError(walletError(e, 'connection')) } finally { setConnecting(false) }
  }, [switchWith])
  const connect = useCallback(() => {
    if (wallets.length > 1) { setChoosing(true); return }
    if (wallets.length === 1) { void choose(wallets[0]); return }
    if (window.ethereum) { void choose({ id: 'injected', name: 'Browser wallet', provider: window.ethereum }); return }
    setError(walletError(new Error('No injected wallet was found.'), 'connection'))
  }, [wallets, choose])

  useEffect(() => {
    if (!provider) return
    let alive = true
    const onAccounts = (accounts: readonly `0x${string}`[]) => { if (alive) setAddress(accounts[0] ?? null) }
    const onChain = (hex: string) => { if (alive) { const id = Number.parseInt(hex, 16); setChainId(Number.isFinite(id) ? id : null); if (id === MEZO_TESTNET_CHAIN_ID) setError(null) } }
    provider.on('accountsChanged', onAccounts); provider.on('chainChanged', onChain)
    return () => { alive = false; provider.removeListener('accountsChanged', onAccounts); provider.removeListener('chainChanged', onChain) }
  }, [provider])

  return <Context.Provider value={{ wallets, provider, address, chainId, connecting, switching, error, choosing, connect, choose: option => void choose(option), switchNetwork: () => { if (provider) void switchWith(provider) }, cancelChoose: () => setChoosing(false) }}>{children}</Context.Provider>
}
