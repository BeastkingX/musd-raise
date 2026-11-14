import { MEZO_FAUCET_URL } from '../lib/constants'

export default function HelpSection() {
  return (
    <section className="card help-card" aria-labelledby="help-heading">
      <h2 id="help-heading">Need test MUSD?</h2>
      <p>
        This app runs on the Mezo <strong>test network</strong> — a practice
        network where the BTC and MUSD are free and have no real-world value.
        Nothing here is real money, and no real funds can be lost.
      </p>
      <p>
        To get free test MUSD, visit the faucet, connect the same wallet you
        use here, and claim some tokens. Then come back and try donating.
      </p>
      <a
        className="btn btn-secondary"
        href={MEZO_FAUCET_URL}
        target="_blank"
        rel="noreferrer"
      >
        Get test MUSD from the faucet ↗
      </a>
      <p className="help-note">
        Faucet: <span className="mono">{MEZO_FAUCET_URL}</span>
      </p>
    </section>
  )
}
