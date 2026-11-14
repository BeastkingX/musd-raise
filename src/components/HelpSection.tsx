import { MEZO_FAUCET_URL } from '../lib/constants'

export default function HelpSection() {
  return (
    <section className="card help-card" aria-labelledby="help-heading">
      <h2 id="help-heading">Need test MUSD?</h2>
      <p>This app uses Mezo Testnet, a practice network. Test tokens have no real-world value; make sure your wallet is on Mezo Testnet, not mainnet.</p>
      <ol className="steps">
        <li><a href={MEZO_FAUCET_URL} target="_blank" rel="noreferrer">Get test BTC from the Mezo faucet ↗</a> using the wallet you plan to donate from. The faucet provides test BTC and MEZO, not MUSD. Keep some BTC for network fees.</li>
        <li><a href="https://testnet.mezo.org/feature/borrow" target="_blank" rel="noreferrer">Borrow test MUSD on Mezo ↗</a>: sign in, connect your wallet, and use test BTC as collateral. Review the loan terms before confirming. See Mezo’s <a href="https://mezo.org/docs/users/borrow/mint-musd/" target="_blank" rel="noreferrer">borrowing guide ↗</a>.</li>
        <li><a href="#donate-heading">Come back to this campaign and donate</a> with the same wallet.</li>
      </ol>
    </section>
  )
}
