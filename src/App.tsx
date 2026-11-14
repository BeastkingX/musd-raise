import { useEffect, useState } from 'react'
import Header from './components/Header'
import CreateCampaign from './components/CreateCampaign'
import CampaignPage from './components/CampaignPage'
import HelpSection from './components/HelpSection'
import { campaignFromSearchParams, type Campaign } from './lib/campaign'
import { WalletProvider, useWallet } from './lib/WalletContext'
import { WalletControls } from './components/WalletControls'

function campaignFromLocation(): Campaign | null {
  return campaignFromSearchParams(window.location.search)
}

export default function App() { return <WalletProvider><AppContent /></WalletProvider> }

function AppContent() {
  const [campaign, setCampaign] = useState<Campaign | null>(() =>
    campaignFromLocation(),
  )
  const { address: walletAddress, connect: handleConnect, connecting } = useWallet()

  // Re-read the URL on back/forward navigation.
  useEffect(() => {
    const onPop = () => setCampaign(campaignFromLocation())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return (
    <div className="app">
      <Header
        walletAddress={walletAddress}
        onConnect={handleConnect}
        connecting={connecting}
      />

      <WalletControls />
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
