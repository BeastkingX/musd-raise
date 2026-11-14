import { useCallback, useEffect, useRef, useState } from 'react'
import { formatUnits, isAddress, parseUnits, recoverMessageAddress, type Hex } from 'viem'
import { campaignMessage, type Campaign } from '../lib/campaign'
import { fetchDonations, type Donation, type DonationResult } from '../lib/explorer'
import {
  MUSD_DECIMALS,
  explorerAddressUrl,
  explorerTxUrl,
  shortenAddress,
} from '../lib/constants'
import DonateBox from './DonateBox'
import SharePanel from './SharePanel'

const REFRESH_MS = 20_000

interface CampaignPageProps {
  campaign: Campaign
}

export default function CampaignPage({ campaign }: CampaignPageProps) {
  const [result, setResult] = useState<DonationResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [showShare, setShowShare] = useState(false)
  const [verification, setVerification] = useState<'checking' | 'verified' | 'invalid' | 'unsigned'>(campaign.signature === undefined ? 'unsigned' : 'checking')

  useEffect(() => {
    let cancelled = false
    if (campaign.signature === undefined) { setVerification('unsigned'); return }
    setVerification('checking')
    async function check() {
      try {
        const signer = await recoverMessageAddress({ message: campaignMessage(campaign), signature: campaign.signature as Hex })
        if (!cancelled) setVerification(isAddress(campaign.recipient) && signer.toLowerCase() === campaign.recipient.toLowerCase() ? 'verified' : 'invalid')
      } catch { if (!cancelled) setVerification('invalid') }
    }
    void check()
    return () => { cancelled = true }
  }, [campaign])
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const load = useCallback(async () => {
    if (!isAddress(campaign.recipient)) {
      setError(
        'The recipient address in this link does not look valid, so donations cannot be counted. Please check the link with the organiser.',
      )
      setLoading(false)
      return
    }
    try {
      const data = await fetchDonations(campaign.recipient, campaign.startBlock)
      if (!mountedRef.current) return
      setResult(data)
      setError(null)
      setLastUpdated(new Date())
    } catch {
      if (!mountedRef.current) return
      setError(
        'Could not load donation totals right now. The explorer may be busy — please wait a moment and tap Refresh. You can still donate below.',
      )
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [campaign.recipient, campaign.startBlock])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => {
      void load()
    }, REFRESH_MS)
    return () => window.clearInterval(id)
  }, [load])

  let goalWei: bigint
  try {
    goalWei = parseUnits(campaign.goal, MUSD_DECIMALS)
  } catch {
    goalWei = BigInt(0)
  }

  const raised = result?.total ?? BigInt(0)
  const percent =
    goalWei > BigInt(0)
      ? Math.min(100, Number((raised * BigInt(10000)) / goalWei) / 100)
      : 0
  const goalReached = goalWei > BigInt(0) && raised >= goalWei

  return (
    <div className="stack">
      <article className="card campaign-hero">
        <p className="eyebrow">Fundraising campaign · Mezo Testnet</p>
        <h1>{campaign.title}</h1>
        <p className="organiser">
          Organised by <strong>{campaign.organiser}</strong>
        </p>
        {verification === 'verified' && <p className="alert alert-success">✓ Verified: signed by the recipient wallet</p>}
        {verification === 'unsigned' && <p className="alert alert-neutral">Unverified campaign — there is no recipient signature. Check the recipient independently before donating.</p>}
        {verification === 'checking' && <p className="muted" role="status">Checking campaign signature…</p>}
        {verification === 'invalid' && <p className="alert alert-error" role="alert">Warning: this signature does not match the campaign or recipient. The link may have been altered. Donations are disabled.</p>}
        <p className="story">{campaign.story}</p>

        <div className="recipient-line">
          <span className="muted">Recipient wallet:</span>{' '}
          <a
            className="mono"
            href={explorerAddressUrl(campaign.recipient)}
            target="_blank"
            rel="noreferrer"
          >
            {shortenAddress(campaign.recipient)} ↗
          </a>

        </div>

        {goalReached && (
          <div className="alert alert-success goal-banner" role="status">
            <strong>🎉 Goal reached!</strong> This campaign has raised{' '}
            {formatUnits(raised, MUSD_DECIMALS)} MUSD — thank you to everyone
            who supported it. Further donations are still welcome.
          </div>
        )}

        <div className="progress-block">
          <div className="progress-numbers">
            <span>
              <strong>{formatUnits(raised, MUSD_DECIMALS)} MUSD</strong> raised
            </span>
            <span className="muted">goal {campaign.goal} MUSD</span>
          </div>
          <div
            className="progress-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
            aria-label={`${percent.toFixed(0)}% of goal raised`}
          >
            <div className="progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <div className="progress-meta">
            <span>{percent.toFixed(percent % 1 === 0 ? 0 : 1)}% of goal</span>
            <span>
              {result
                ? `${result.supporterCount} supporter${result.supporterCount === 1 ? '' : 's'}`
                : '— supporters'}
            </span>
          </div>
        </div>

        {loading && !result ? (
          <p className="muted" role="status">
            Loading donations from the explorer…
          </p>
        ) : error ? (
          <div>
            <p className="alert alert-error" role="alert">
              {error}
            </p>
            <button type="button" className="btn btn-secondary" onClick={() => void load()}>
              Refresh
            </button>
          </div>
        ) : (
          <p className="muted small">
            {lastUpdated && <>Updated {lastUpdated.toLocaleTimeString()} · </>}
            <button type="button" className="link-button" onClick={() => void load()}>Refresh</button>
            {result?.truncated && <> · Totals are incomplete because there are too many transfers.</>}
          </p>
        )}

        <details className="technical-details">
          <summary>Technical details</summary>
          <p className="small muted">Start block: {campaign.startBlock.toLocaleString()}. Totals count incoming MUSD transfers from this block, including unrelated transfers. Progress refreshes every 20 seconds. Data source: {result?.source === 'rpc-fallback' ? 'RPC fallback' : 'Blockscout explorer'}.</p>
          <p className="small muted">A signature proves control of the recipient address at signing time, not the organiser’s identity or trustworthiness. Anyone can remove a signature, making a link unverified.</p>
        </details>
        <div className="campaign-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setShowShare((s) => !s)}>
            {showShare ? 'Hide share link' : 'Share this campaign'}
          </button>
          <a className="btn btn-ghost" href="/">
            ← Create your own campaign
          </a>
        </div>
      </article>

      {showShare && <SharePanel campaign={campaign} />}

      <div className="campaign-grid">
        <DonateBox recipient={campaign.recipient} disabled={verification === 'invalid' || verification === 'checking' || !isAddress(campaign.recipient)} onDonationSuccess={() => void load()} />
        <SupporterList donations={result?.donations ?? []} loading={loading && !result} />
      </div>
    </div>
  )
}

function SupporterList({
  donations,
  loading,
}: {
  donations: Donation[]
  loading: boolean
}) {
  return (
    <section className="card" aria-labelledby="supporters-heading">
      <h2 id="supporters-heading">Supporters</h2>
      {loading ? (
        <p className="muted">Loading supporters…</p>
      ) : donations.length === 0 ? (
        <p className="muted">
          No donations yet. Be the first to support this campaign — every
          donation, big or small, helps.
        </p>
      ) : (
        <ul className="supporter-list">
          {donations.map((d, index) => (
            <li key={`${d.transactionHash}-${d.logIndex}-${index}`} className="supporter-item">
              <div className="supporter-main">
                <span className="supporter-address mono" title={d.from}>
                  {shortenAddress(d.from)}
                </span>
                <span className="supporter-amount">
                  {formatUnits(d.value, MUSD_DECIMALS)} MUSD
                </span>
              </div>
              <div className="supporter-meta">
                <span>
                  {d.timestamp
                    ? new Date(d.timestamp).toLocaleString()
                    : `Block ${d.blockNumber.toLocaleString()}`}
                </span>
                <a href={explorerTxUrl(d.transactionHash)} target="_blank" rel="noreferrer">
                  View transaction ↗
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">
        Newest donations first. A supporter who donates more than once appears
        once in the supporter count, but each donation is listed here.
      </p>
    </section>
  )
}
