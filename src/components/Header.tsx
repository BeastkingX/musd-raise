import { MEZO_TESTNET_CHAIN_ID } from '../lib/constants'

interface HeaderProps {
  walletAddress: string | null
  onConnect: () => void
  connecting: boolean
  walletError: string | null
}

export default function Header({
  walletAddress,
  onConnect,
  connecting,
  walletError,
}: HeaderProps) {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            ₿
          </span>
          <span className="brand-text">
            MUSD Raise
            <small>Fundraise in MUSD</small>
          </span>
        </a>

        <div className="header-actions">
          <span className="testnet-badge" title={`Chain ID ${MEZO_TESTNET_CHAIN_ID}`}>
            ● Testnet only — not real money
          </span>
          {walletAddress ? (
            <span className="wallet-chip" title={walletAddress}>
              {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
            </span>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onConnect}
              disabled={connecting}
            >
              {connecting ? 'Connecting…' : 'Connect wallet'}
            </button>
          )}
        </div>
      </div>
      {walletError && (
        <div className="container">
          <p className="alert alert-error" role="alert">
            {walletError}
          </p>
        </div>
      )}
    </header>
  )
}
