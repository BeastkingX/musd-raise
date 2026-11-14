# MUSD Raise

A GoFundMe-style fundraising page where donations are made in **MUSD** (a
Bitcoin-backed stablecoin) on **Mezo Testnet**.

Create a campaign, share the link, and supporters donate MUSD straight from
their wallet to the recipient wallet. No backend, no database, no custom
smart contract — it deploys on Vercel as a static site.

> **⚠️ Testnet only.** Everything here uses free test tokens with no real-world
> value. Never send real money to any address shown in this app.

---

## What it does

### 1. Create a campaign (home page)

- Short intro explaining the product, then a form:
  - campaign title
  - story
  - goal amount in MUSD
  - organiser name
  - recipient wallet address (auto-filled if a wallet is connected)
- The address and goal are validated in plain language before anything is
  created.
- On create, the app records the **current block number** as the campaign
  start block, then produces a **shareable link** with all campaign data in
  the URL, plus a **copy button** and a **QR code** (generated locally in
  the browser).

### 2. Campaign page (the shared link)

- Shows title, story, organiser, goal, a **progress bar** (raised vs goal),
  the **number of supporters**, and a **supporter list** — shortened address,
  amount, time, and a link to the transaction on the explorer — newest first.
- **“Raised”** is the sum of MUSD `Transfer` events to the recipient wallet
  from the campaign start block onwards, read from the Blockscout explorer
  API (see [How “raised” is calculated](#how-raised-is-calculated)).
- Loads and shows progress **without any wallet connected**.
- **Donate box:** preset amounts (10 / 25 / 50 / 100 MUSD) plus a custom
  amount. Connect wallet, see your MUSD balance, get a warning if it is too
  low or your wallet is on the wrong network. “Donate” calls `transfer()` on
  the MUSD contract to send MUSD to the recipient.
- Clear states: waiting for wallet approval, confirming, success, failed /
  rejected. On success you get a thank-you with the transaction link, and
  the progress bar and supporter list refresh.
- **Auto-refreshes** every 20 seconds.
- When the goal is reached, a **“Goal reached”** banner appears.

### 3. “Need test MUSD?” help section

Links to the [Mezo testnet faucet](https://faucet.test.mezo.org) and explains
in plain English that this runs on a test network with free, worthless tokens.

---

## How it uses MUSD

MUSD is an ERC-20 token on Mezo Testnet:

- **Contract:** `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`
- **Decimals:** 18 (so `1 MUSD = 1,000,000,000,000,000,000` smallest units)
- **Donating** = calling the standard ERC-20 `transfer(recipient, amount)`
  function on that contract from the donor’s wallet. The app uses
  [viem](https://viem.sh) to build and send that transaction via MetaMask
  (`window.ethereum`).
- **Reading balances** = calling `balanceOf(donor)` on the same contract.
- **Counting donations** = reading past `Transfer` events where the token is
  MUSD and `to` is the campaign recipient (see below). The app never holds,
  custodies, or moves anyone’s funds — wallets talk directly to the token
  contract.

There is **no custom smart contract** in this project. That keeps it simple
and auditable, but it also creates the limitations listed at the bottom.

---

## How “raised” is calculated

The app asks the Blockscout explorer API for the recipient’s token transfers:

```
GET https://api.explorer.test.mezo.org/api/v2/addresses/{recipient}/token-transfers
```

It keeps only transfers where:

- the token address is the MUSD contract (case-insensitive),
- `to` is the campaign recipient,
- `block_number >= startBlock` (the block recorded at creation),
- `type == "token_transfer"` (mint/burn bookkeeping is excluded),

then sums the values. Results are paginated (50 per page, following
`next_page_params` with `?index=…&block_number=…`) and sorted newest first.
The supporter count is the number of **unique sender addresses**.

**CORS check (done before relying on it):** the API returns
`Access-Control-Allow-Origin: *`, including on `OPTIONS` preflight requests,
so a browser `fetch` works directly with no proxy and no API key. This was
verified against live data on 2026-11-14 (`/api/v2/stats`,
`/api/v2/tokens/{MUSD}/transfers`, and
`/api/v2/addresses/{addr}/token-transfers` all returned real MUSD transfers,
and pagination worked).

**Fallback:** if the explorer API fails (network error, rate limit, 5xx), the
app falls back to `eth_getLogs` on the RPC. The RPC only allows a
**10,000-block range per call**, so the fallback pages through in
10,000-block chunks from the start block to the current block, asking for
`Transfer` events from the MUSD contract with `to == recipient`.

---

## Network details

| Item | Value |
|---|---|
| Network name | Mezo Testnet |
| Chain ID | `31611` (`0x7b7b`) |
| RPC URL | `https://rpc.test.mezo.org` |
| Block explorer | `https://explorer.test.mezo.org` |
| Explorer API (Blockscout) | `https://api.explorer.test.mezo.org/api/v2` |
| Native currency | BTC, 18 decimals |
| MUSD token contract | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` (ERC-20, 18 decimals) |
| Faucet | `https://faucet.test.mezo.org` |

The “Connect wallet” button automatically switches MetaMask to Mezo Testnet,
adding the network first if it is not already there
(`wallet_switchEthereumChain`, falling back to `wallet_addEthereumChain` on
error 4902).

---

## Tech stack

- **Vite + React + TypeScript**
- **[viem](https://viem.sh)** for all blockchain calls (reads, writes, chain
  definition, address/amount parsing)
- **[qrcode](https://www.npmjs.com/package/qrcode)** for locally generated
  QR codes
- **Vercel** static hosting, with a `vercel.json` rewrite so page refreshes
  and shared links work (every path serves `index.html`, and the app reads
  the campaign from the URL query string)

Campaign data lives **in the URL** (title, story, goal, organiser, recipient,
start block). That is why there is no database: the link *is* the campaign.

---

## How to test it step by step

You will need [MetaMask](https://metamask.io/download/) installed in your
browser. Everything is on the test network, so use a throwaway wallet if you
can.

1. **Run it locally**

   ```bash
   npm install
   npm run dev
   ```

   Open the URL Vite prints (usually `http://localhost:5173`).

2. **Get test tokens**

   - Go to the [faucet](https://faucet.test.mezo.org), connect your wallet,
     and claim test BTC and/or test MUSD. Wait until the tokens appear in
     MetaMask (you may need to add the MUSD token manually with the contract
     address above).

3. **Create a campaign**

   - On the home page, fill in title, story, goal (e.g. `100`), organiser
     name, and recipient wallet. If you connect your wallet first, the
     recipient field fills in automatically.
   - Click **“Create campaign & get my link”**. The app records the current
     block number, then shows your shareable link, a copy button, and a QR
     code. The address bar updates to the campaign URL.

4. **Open the campaign page**

   - Copy the link and open it in a private/incognito window (no wallet
     connected). You should see the title, story, goal, progress bar, and an
     empty supporter list — proving the page works without a wallet.

5. **Donate**

   - Click **“Connect wallet to donate”**. MetaMask should offer to switch
     to (or add) Mezo Testnet automatically.
   - Pick a preset amount (or type your own), check your MUSD balance is
     shown, and click **“Donate MUSD”**.
   - Approve the transaction in MetaMask. Watch the states change:
     *waiting for wallet approval → confirming → success*.
   - On success, click the explorer link to see your transaction, and check
     that the progress bar and supporter list now include your donation.
     (If you reject in MetaMask, you should see a friendly “you rejected”
     message and no MUSD is sent.)

6. **Check the edge cases**

   - Try donating more than your balance — you should get a clear warning.
   - Switch MetaMask to a different network and try again — you should be
     warned that the wallet is on the wrong network.
   - Wait 20 seconds — the totals should auto-refresh.
   - Set a small goal (e.g. `1` MUSD) and donate past it — the
     “Goal reached” banner should appear.

7. **Deploy to Vercel (optional)**

   - Push this repo to GitHub, then import it at
     [vercel.com/new](https://vercel.com/new) with no build settings changed
     (Vite preset). `vercel.json` already handles refreshes/shared links.
   - Share the deployed campaign link with anyone.

8. **Production build check**

   ```bash
   npm run build
   ```

   This must pass with no errors before pushing.

---

## Project structure

```
.
├── index.html
├── vercel.json            # SPA rewrite for Vercel
├── src/
│   ├── App.tsx            # routing (home vs campaign, from the URL)
│   ├── main.tsx
│   ├── index.css          # warm, mobile-friendly styling
│   ├── lib/
│   │   ├── constants.ts   # network + MUSD contract details, chain def
│   │   ├── campaign.ts    # campaign <-> URL encoding
│   │   ├── explorer.ts    # Blockscout API + RPC fallback (chunked)
│   │   └── wallet.ts      # MetaMask connect / switch network / donate
│   └── components/
│       ├── Header.tsx
│       ├── CreateCampaign.tsx
│       ├── CampaignPage.tsx
│       ├── DonateBox.tsx
│       ├── SharePanel.tsx # copy link + QR code
│       └── HelpSection.tsx
└── README.md
```

---

## Limitations (honest list)

- **Any MUSD sent to the recipient wallet after the campaign starts counts
  toward the total.** Because there is no custom contract, the app cannot
  tell a campaign donation apart from any other MUSD transfer to that
  address. If the recipient wallet is also used for other things, unrelated
  incoming MUSD will inflate the total. Use a fresh wallet per campaign to
  keep totals accurate.
- **The campaign lives in the URL.** Very long stories make very long links.
  Anyone with the link can view the campaign, and there is no way to edit a
  campaign after creating it (create a new link instead). There is also no
  way to delete or hide a campaign.
- **No identity or trust.** Anyone can create a campaign claiming any
  recipient address, and anyone can send MUSD to any address. Always check
  the recipient address on the explorer before donating.
- **Explorer dependence.** Totals come from the public Blockscout API. If it
  is down or rate-limits you, the app falls back to chunked `eth_getLogs`,
  which is slower for old campaigns. Either way, totals are only as fresh
  as the last successful fetch (auto-refresh is every 20 seconds).
- **Pagination cap.** The explorer reader stops after 40 pages (2,000
  transfers). Campaigns with more donations than that will show a
  “truncated” note and under-count. This is a testnet demo trade-off.
- **Supporter count = unique senders.** If one person donates twice, they
  count as one supporter (each donation is still listed separately).
- **Testnet only.** Tokens have no real-world value, the network can reset
  or be unreliable, and nothing here is financial advice. Never use this
  code with real funds without a proper audit and a custom contract.
- **Wallet required to donate.** The campaign page is readable without a
  wallet, but donating needs MetaMask (or another injected wallet) and test
  MUSD from the faucet.

---

## License

Testnet demo — use freely, at your own risk. Not financial advice.
