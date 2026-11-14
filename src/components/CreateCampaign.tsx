import { useState, type FormEvent } from 'react'
import { createWalletClient, custom, isAddress, parseUnits, type Address } from 'viem'
import { campaignMessage, campaignToSearchParams, type Campaign } from '../lib/campaign'
import { LIVE_EXAMPLE_URL } from '../lib/constants'
import { fetchCurrentBlockNumber } from '../lib/explorer'
import { MUSD_DECIMALS } from '../lib/constants'
import SharePanel from './SharePanel'

interface CreateCampaignProps {
  walletAddress: string | null
  onConnect: () => void
  connecting: boolean
}

interface FormState {
  title: string
  story: string
  goal: string
  organiser: string
  recipient: string
}

interface FormErrors {
  title?: string
  story?: string
  goal?: string
  organiser?: string
  recipient?: string
  form?: string
}

export default function CreateCampaign({
  walletAddress,
  onConnect,
  connecting,
}: CreateCampaignProps) {
  const [form, setForm] = useState<FormState>({
    title: '',
    story: '',
    goal: '',
    organiser: '',
    recipient: walletAddress ?? '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<Campaign | null>(null)

  // If the wallet connects after the form has loaded, fill the recipient
  // field for them (only if they haven't typed something else already).
  const [lastWallet, setLastWallet] = useState<string | null>(walletAddress)
  if (walletAddress && walletAddress !== lastWallet) {
    setLastWallet(walletAddress)
    setForm((prev) =>
      prev.recipient.trim() === '' ? { ...prev, recipient: walletAddress } : prev,
    )
  }

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined, form: undefined }))
  }

  function validate(): FormErrors {
    const next: FormErrors = {}

    if (form.title.trim().length < 3) {
      next.title = 'Please give your campaign a short title (at least 3 characters).'
    }
    if (form.story.trim().length < 10) {
      next.story =
        'Please tell your story in a sentence or two (at least 10 characters) so supporters know what this is for.'
    }
    const goalTrimmed = form.goal.trim()
    if (!goalTrimmed) {
      next.goal = 'Please enter how much MUSD you want to raise.'
    } else {
      try {
        const goalWei = parseUnits(goalTrimmed, MUSD_DECIMALS)
        if (goalWei <= BigInt(0)) {
          next.goal = 'The goal must be more than 0 MUSD.'
        }
      } catch {
        next.goal = 'Please enter a number, for example 1000 or 250.5'
      }
    }
    if (form.organiser.trim().length < 2) {
      next.organiser = 'Please enter the organiser name.'
    }
    const recipient = form.recipient.trim()
    if (!recipient) {
      next.recipient = 'Please enter the wallet address that should receive the MUSD.'
    } else if (!isAddress(recipient)) {
      next.recipient =
        'That does not look like a wallet address. It should start with 0x and be 42 characters long. Please check it and try again.'
    } else if (recipient.toLowerCase() === '0x0000000000000000000000000000000000000000') {
      next.recipient = 'Please use a real wallet address, not the zero address.'
    }

    return next
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const validationErrors = validate()
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) return

    setCreating(true)
    setErrors({})
    try {
      // Record the current block as the campaign start. Only MUSD
      // transfers to the recipient from this block onwards will count.
      const startBlock = await fetchCurrentBlockNumber()
      const campaign: Campaign = {
        title: form.title.trim(),
        story: form.story.trim(),
        goal: form.goal.trim(),
        organiser: form.organiser.trim(),
        recipient: form.recipient.trim(),
        startBlock,
      }
      if (walletAddress) {
        if (walletAddress.toLowerCase() !== campaign.recipient.toLowerCase()) {
          throw new Error('To create a verified campaign, connect the recipient wallet. Disconnect it to create an unverified campaign.')
        }
        if (!window.ethereum) throw new Error('Wallet not found. Please reconnect and try again.')
        const client = createWalletClient({ transport: custom(window.ethereum) })
        campaign.signature = await client.signMessage({ account: walletAddress as Address, message: campaignMessage(campaign) })
      }
      setCreated(campaign)
      // Update the URL so a refresh keeps this campaign, and the address
      // bar shows the shareable link.
      const params = campaignToSearchParams(campaign)
      window.history.pushState({}, '', `?${params.toString()}`)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      const message = (error as Error)?.message || ''
      setErrors({ form: /reject|denied/i.test(message) ? 'Signature rejected. Your campaign was not created; please try again.' : message || 'Could not create the campaign. Please check your connection and try again.' })
    } finally {
      setCreating(false)
    }
  }

  function startAnother() {
    setCreated(null)
    setForm({ title: '', story: '', goal: '', organiser: '', recipient: walletAddress ?? '' })
    window.history.pushState({}, '', window.location.pathname)
  }

  if (created) {
    return (
      <div className="stack">
        <SharePanel campaign={created} />
        <button type="button" className="btn btn-ghost" onClick={startAnother}>
          ← Create a different campaign
        </button>
      </div>
    )
  }

  return (
    <div className="stack">
      <section className="hero">
        <h1>Raise MUSD for what matters</h1>
        <p className="hero-lead">
          MUSD Raise is a simple fundraising page for the Mezo test network.
          Create a campaign in under a minute, share the link, and supporters
          can donate in <strong>MUSD</strong> — a dollar-like token backed by
          Bitcoin — straight from their wallet. No sign-up, no fees from us,
          no real money involved.
        </p>
        <ol className="steps">
          <li>
            <strong>Create</strong> — fill in the form below.
          </li>
          <li>
            <strong>Share</strong> — send your link to anyone.
          </li>
          <li>
            <strong>Donate</strong> — supporters send MUSD to your wallet.
          </li>
        </ol>
        {LIVE_EXAMPLE_URL && <a className="btn btn-secondary" href={LIVE_EXAMPLE_URL}>See a live example →</a>}
      </section>

      <section className="card" aria-labelledby="create-heading">
        <h2 id="create-heading">Create a campaign</h2>
        <p className="muted">
          If a wallet is connected, you will be asked to sign a free message (not a transaction). To verify the campaign, connect the recipient wallet. Donations go directly to the recipient wallet address below. Make
          sure that address is correct — MUSD sent to the wrong address cannot
          be taken back.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label className="field-label" htmlFor="title">
              Campaign title
            </label>
            <input
              id="title"
              className="input"
              type="text"
              placeholder="e.g. Help Maya fix her bike"
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              aria-invalid={!!errors.title}
            />
            {errors.title && <p className="field-error">{errors.title}</p>}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="story">
              Your story
            </label>
            <textarea
              id="story"
              className="input textarea"
              rows={5}
              placeholder="Tell supporters why you are fundraising and what the MUSD will be used for…"
              value={form.story}
              onChange={(e) => update('story', e.target.value)}
              aria-invalid={!!errors.story}
            />
            {errors.story && <p className="field-error">{errors.story}</p>}
          </div>

          <div className="field-row">
            <div className="field">
              <label className="field-label" htmlFor="goal">
                Goal (MUSD)
              </label>
              <input
                id="goal"
                className="input"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 1000"
                value={form.goal}
                onChange={(e) => update('goal', e.target.value)}
                aria-invalid={!!errors.goal}
              />
              {errors.goal && <p className="field-error">{errors.goal}</p>}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="organiser">
                Organiser name
              </label>
              <input
                id="organiser"
                className="input"
                type="text"
                placeholder="e.g. Maya Okafor"
                value={form.organiser}
                onChange={(e) => update('organiser', e.target.value)}
                aria-invalid={!!errors.organiser}
              />
              {errors.organiser && <p className="field-error">{errors.organiser}</p>}
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="recipient">
              Recipient wallet address
            </label>
            <input
              id="recipient"
              className="input mono"
              type="text"
              placeholder="0x…"
              value={form.recipient}
              onChange={(e) => update('recipient', e.target.value)}
              aria-invalid={!!errors.recipient}
            />
            {errors.recipient && <p className="field-error">{errors.recipient}</p>}
            {!walletAddress && (
              <p className="field-hint">
                Tip: connect your wallet and this field fills in automatically.{' '}
                <button type="button" className="link-button" onClick={onConnect} disabled={connecting}>
                  {connecting ? 'Connecting…' : 'Connect wallet'}
                </button>
              </p>
            )}
            {walletAddress && (
              <p className="field-hint">
                Wallet connected: <span className="mono">{walletAddress}</span>
              </p>
            )}
          </div>

          {errors.form && (
            <p className="alert alert-error" role="alert">
              {errors.form}
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={creating}>
            {creating ? 'Creating… (recording start block)' : 'Create campaign & get my link'}
          </button>
          <p className="muted small center">
            Creating a campaign is free. It records the current block number
            so only donations after this moment count toward your total.
          </p>
        </form>
      </section>
    </div>
  )
}
