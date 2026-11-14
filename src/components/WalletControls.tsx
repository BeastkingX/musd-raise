import { MEZO_EXPLORER_URL, MEZO_RPC_URL, MEZO_TESTNET_CHAIN_ID } from '../lib/constants'
import { useWallet } from '../lib/WalletContext'
import type { WalletError } from '../lib/wallet'

export function ErrorNotice({ error }: { error: WalletError }) {
  return <div className="alert alert-error" role="alert"><div>{error.message}</div><div className="small error-details">Details: {error.details}</div></div>
}
export function WalletControls() {
  const { wallets, choosing, choose, cancelChoose, error, address, chainId, switchNetwork, switching } = useWallet()
  return <div className="container wallet-controls">
    {choosing && <section className="card wallet-picker" aria-label="Choose a wallet">
      <h2>Choose your wallet</h2>
      <p>Select the wallet you want to use on this site.</p>
      {wallets.map(w => <button className="btn btn-secondary" key={w.id} onClick={() => choose(w)}>{w.name}</button>)}{' '}
      <button className="btn btn-ghost" onClick={cancelChoose}>Cancel</button>
    </section>}
    {error && <ErrorNotice error={error} />}
    {address && chainId !== MEZO_TESTNET_CHAIN_ID && <section className="alert alert-warning" role="alert">
      <strong>Wrong network{chainId === null ? ' (could not determine network)' : ` (chain ${chainId})`}</strong>
      <p>Your wallet is connected. Switch to Mezo Testnet before donating.</p>
      <button className="btn btn-secondary" onClick={switchNetwork} disabled={switching}>{switching ? 'Switching…' : 'Switch to Mezo Testnet'}</button>
      <p className="small">To add it manually: <strong>Mezo Testnet</strong> · RPC: <span className="mono">{MEZO_RPC_URL}</span> · Chain ID: <strong>31611</strong> · Currency: <strong>BTC</strong> · Explorer: <span className="mono">{MEZO_EXPLORER_URL}</span></p>
    </section>}
  </div>
}
