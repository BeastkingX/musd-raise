import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { Campaign } from '../lib/campaign'
import { campaignToUrl } from '../lib/campaign'

interface SharePanelProps {
  campaign: Campaign
}

export default function SharePanel({ campaign }: SharePanelProps) {
  const url = campaignToUrl(campaign)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [qrError, setQrError] = useState(false)

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(url, { width: 220, margin: 1 })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setQrError(true)
      })
    return () => {
      cancelled = true
    }
  }, [url])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Clipboard API can fail in some browsers / insecure contexts.
      const textarea = document.createElement('textarea')
      textarea.value = url
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2500)
  }

  return (
    <section className="card share-card" aria-labelledby="share-heading">
      <h2 id="share-heading">🎉 Your campaign link is ready</h2>
      <p>
        Share this link with anyone you want to support you. It contains your
        campaign details, so anyone who opens it sees this exact campaign —
        no account or sign-up needed.
      </p>

      <label className="field-label" htmlFor="share-url">
        Campaign link
      </label>
      <div className="share-row">
        <input
          id="share-url"
          className="input mono share-input"
          type="text"
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
        />
        <button type="button" className="btn btn-primary" onClick={copyLink}>
          {copied ? '✓ Copied!' : 'Copy link'}
        </button>
      </div>
      {copied && (
        <p className="success-text" role="status">
          Link copied — paste it anywhere to share.
        </p>
      )}

      <div className="qr-block">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt={`QR code for ${campaign.title}`} width={180} height={180} />
        ) : qrError ? (
          <p className="muted">QR code could not be generated — the copy button above still works.</p>
        ) : (
          <p className="muted">Generating QR code…</p>
        )}
        <p className="muted">Scan with a phone camera to open this campaign.</p>
      </div>

      <p className="muted small">
        Started at block <span className="mono">{campaign.startBlock.toLocaleString()}</span>.
        Only MUSD sent to the recipient wallet from this block onwards counts
        toward the total.
      </p>
    </section>
  )
}
