import { useCallback, useEffect, useState } from 'react'
import Header from './components/Header'
import CreateCampaign from './components/CreateCampaign'
import CampaignPage from './components/CampaignPage'
import HelpSection from './components/HelpSection'
import { campaignFromSearchParams, type Campaign } from './lib/campaign'
import {
  connectWallet,
  friendlyWalletError,
  getConnectedAccounts,
  hasInjectedWallet,
} from './lib/wallet'

function campaignFromLocation(): Campaign | null {
  return campaignFromSearchParams(window.location.search)
}

export default function App() {
  const [campaign, setCampaign] = useState<Campaign | null>(() =>
    campaignFromLocation(),
  )
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [walletError, setWalletError] = useState<string | null>(null)

  // Notice an already-connected wallet on load (without forcing a popup).
  useEffect(() => {
    let cancelled = false
    async function check() {
      if (!hasInjectedWallet()) return
      const accounts = await getConnectedAccounts()
      if (!cancelled && accounts.length > 0) setWalletAddress(accounts[0])
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const provider = window.ethereum
    if (!provider?.on) return
    const onAccounts = (accounts: readonly `0x${string}`[]) => setWalletAddress(accounts[0] ?? null)
    provider.on('accountsChanged', onAccounts)
    return () => provider.removeListener('accountsChanged', onAccounts)
  }, [])

  // Re-read the URL on back/forward navigation.
  useEffect(() => {
    const onPop = () => setCampaign(campaignFromLocation())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const handleConnect = useCallback(async () => {
    setConnecting(true)
    setWalletError(null)
    try {
      const { address } = await connectWallet()
      setWalletAddress(address)
    } catch (error) {
      setWalletError(friendlyWalletError(error))
    } finally {
      setConnecting(false)
    }
  }, [])

  return (
    <div className="app">
      <Header
        walletAddress={walletAddress}
        onConnect={handleConnect}
        connecting={connecting}
        walletError={walletError}
      />

      <main className="container main">
        {campaign ? (
          <CampaignPage key={window.location.search} campaign={campaign} />
        ) : (
          <CreateCampaign
            walletAddress={walletAddress}
            onConnect={handleConnect}
            connecting={connecting}
          />
        )}

        <HelpSection />

        <section className="card how-it-works" aria-labelledby="how-heading">
          <h2 id="how-heading">How does this work, in plain English?</h2>
          <ul>
            <li>
              <strong>No middleman.</strong> Donations are MUSD tokens sent
              directly from the supporter&apos;s wallet to the recipient&apos;s
              wallet on the Mezo test network.
            </li>
            <li>
              <strong>The link is the campaign.</strong> Your title, story,
              goal and recipient wallet are stored in the shareable link
              itself — there is no database to hack or lose.
            </li>
            <li>
              <strong>Totals are counted on-chain.</strong> The app asks the
              public block explorer how much MUSD arrived at the recipient
              wallet since the campaign started, and shows that as “raised”.
            </li>
            <li>
              <strong>Testnet only.</strong> Everything here uses free test
              tokens. Please never send real money to any address shown here.
            </li>
          </ul>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container">
          <p>
            MUSD Raise · Mezo Testnet (chain 31611) ·{' '}
            <span className="testnet-badge">Testnet only — not real money</span>
          </p>
          <p className="muted small">
            Built with React, TypeScript and viem. No backend, no database, no
            custom smart contract.
          </p>
        </div>
      </footer>
    </div>
  )
}
