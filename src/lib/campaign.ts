export interface Campaign {
  title: string
  story: string
  /** Goal in whole MUSD as a decimal string, e.g. "1000" or "250.5" */
  goal: string
  organiser: string
  /** Recipient wallet address (checksummed or as entered) */
  recipient: string
  /** Block number when the campaign was created — donations before this don't count */
  startBlock: number
  signature?: string
}

/**
 * Campaign data lives entirely in the URL query string, e.g.
 *   /?title=...&story=...&goal=1000&organiser=...&recipient=0x...&startBlock=16778409
 *
 * Why in the URL? There is no backend and no database. The link *is* the
 * campaign: anyone who opens it sees the same title, story, goal and
 * recipient, and the app counts MUSD transfers to that recipient from
 * `startBlock` onwards. Trade-off: very long stories make very long links.
 */
const PARAMS = ['title', 'story', 'goal', 'organiser', 'recipient', 'startBlock'] as const

export function campaignToSearchParams(campaign: Campaign): URLSearchParams {
  const params = new URLSearchParams()
  params.set('title', campaign.title)
  params.set('story', campaign.story)
  params.set('goal', campaign.goal)
  params.set('organiser', campaign.organiser)
  params.set('recipient', campaign.recipient)
  params.set('startBlock', String(campaign.startBlock))
  if (campaign.signature !== undefined) params.set('signature', campaign.signature)
  return params
}

export function campaignToUrl(campaign: Campaign): string {
  const params = campaignToSearchParams(campaign)
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`
}

export function campaignFromSearchParams(
  search: string | URLSearchParams,
): Campaign | null {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search
  const values = PARAMS.map((key) => params.get(key))
  if (values.some((v) => v === null || v === '')) return null

  const [title, story, goal, organiser, recipient, startBlockRaw] = values as [
    string,
    string,
    string,
    string,
    string,
    string,
  ]
  const startBlock = Number(startBlockRaw)
  if (!Number.isFinite(startBlock) || startBlock < 0) return null

  return { title, story, goal, organiser, recipient, startBlock, signature: params.has('signature') ? params.get('signature') ?? '' : undefined }
}

export function hasCampaignParams(search: string): boolean {
  return campaignFromSearchParams(search) !== null
}

/** Unambiguous, versioned message: JSON preserves every field exactly. */
export function campaignMessage(c: Campaign): string {
  return 'MUSD Raise campaign signature v1\n' + JSON.stringify([c.title, c.story, c.goal, c.organiser, c.recipient, c.startBlock])
}
