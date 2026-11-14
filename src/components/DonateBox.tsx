import { useCallback, useEffect, useState } from 'react'
import { formatUnits } from 'viem'
import {
  MEZO_TESTNET_CHAIN_ID,
  MUSD_DECIMALS,
  explorerTxUrl,
} from '../lib/constants'
import { donateMusd, fetchMusdBalance, getConnectedChainId, parseMusdAmount, waitForReceipt, walletError, type WalletError } from '../lib/wallet'
import { useWallet } from '../lib/WalletContext'
import { ErrorNotice } from './WalletControls' 

type DonateStatus =
  | 'idle'
  | 'waiting' // waiting for wallet approval
  | 'confirming' // tx broadcast, waiting to be mined
  | 'success'
  | 'failed'

const PRESETS = ['1', '5', '10', '25', '50', '100']

interface DonateBoxProps {
  recipient: string
  onDonationSuccess: () => void
  disabled?: boolean
}

export default function DonateBox({ recipient, onDonationSuccess, disabled = false }: DonateBoxProps) {
  const { address: walletAddress, chainId, provider, wallets, connecting, connect } = useWallet()
  const [balance, setBalance] = useState<bigint | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [amount, setAmount] = useState('25')
  const [status, setStatus] = useState<DonateStatus>('idle')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [donationError, setDonationError] = useState<WalletError | null>(null)

  const wrongNetwork = chainId !== MEZO_TESTNET_CHAIN_ID
  const busy = status === 'waiting' || status === 'confirming' || connecting

  const refreshBalance = useCallback(async (address: string) => {
    setBalanceLoading(true)
    try {
      const bal = await fetchMusdBalance(address)
      setBalance(bal)
    } catch {
      setBalance(null)
    } finally {
      setBalanceLoading(false)
    }
  }, [])

  useEffect(() => {
    let alive = true
    setBalance(null)
    if (walletAddress) {
      setBalanceLoading(true)
      void fetchMusdBalance(walletAddress).then(value => { if (alive) setBalance(value) }).catch(() => { if (alive) setBalance(null) }).finally(() => { if (alive) setBalanceLoading(false) })
    } else setBalanceLoading(false)
    return () => { alive = false }
  }, [walletAddress])

  function validateAmount(): { wei: bigint } | { error: string } {
    const trimmed = amount.trim()
    if (!trimmed) return { error: 'Please choose or enter an amount to donate.' }
    let wei: bigint
    try {
      wei = parseMusdAmount(trimmed)
    } catch {
      return { error: 'Please enter a number, for example 25 or 10.5' }
    }
    if (wei <= BigInt(0)) return { error: 'The amount must be more than 0 MUSD.' }
    if (balance !== null && wei > balance) {
      return {
        error: `That is more than your balance (${formatUnits(balance, MUSD_DECIMALS)} MUSD). Please donate a smaller amount, or borrow test MUSD as explained below.`,
      }
    }
    return { wei }
  }

  async function handleDonate() {
    if (disabled) return
    setErrorMessage(null)
    setDonationError(null)
    setTxHash(null)

    if (!walletAddress) {
      connect()
      return
    }
    if (wrongNetwork) {
      setErrorMessage(
        'Please switch to Mezo Testnet using the network banner above.',
      )
      return
    }

    const validation = validateAmount()
    if ('error' in validation) {
      setErrorMessage(validation.error)
      return
    }

    setStatus('waiting')
    try {
      if (!provider) throw new Error('No wallet is selected.')
      const id = await getConnectedChainId(provider)
      if (id !== MEZO_TESTNET_CHAIN_ID) throw new Error('Wallet is not on Mezo Testnet.')
      const accounts = await provider.request({ method: 'eth_accounts' }) as string[]
      if (!accounts[0] || accounts[0].toLowerCase() !== walletAddress.toLowerCase()) throw new Error('Wallet account changed. Please review and try again.')

      const hash = await donateMusd({
        from: walletAddress,
        recipient,
        amount: validation.wei,
        provider,
      })
      setTxHash(hash)
      setStatus('confirming')

      const receipt = await waitForReceipt(hash)
      if (receipt.status !== 'success') throw new Error('The transaction failed on the network. No donation was sent.')
      setStatus('success')
      // Refresh balance + campaign totals/supporters.
      await refreshBalance(walletAddress)
      onDonationSuccess()
    } catch (error) {
      setStatus('failed')
      setDonationError(walletError(error, 'donation'))
    }
  }

  const balanceText =
    balance === null
      ? balanceLoading
        ? 'Checking your MUSD balance…'
        : 'Balance unavailable right now'
      : `${formatUnits(balance, MUSD_DECIMALS)} MUSD`

  return (
    <section className="card donate-card" aria-labelledby="donate-heading">
      <h2 id="donate-heading">Donate MUSD</h2>

      {!provider && wallets.length === 0 && !window.ethereum && (
        <p className="alert alert-warning">
          {/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? <>
            Open this page inside the MetaMask app's browser to donate.{' '}
            <a href={`https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`}>Open in MetaMask ↗</a>
          </> : <>No wallet detected in this browser. Please install <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">MetaMask</a> to donate.</>}
        </p>
      )}

      {walletAddress ? (
        <div className="wallet-status">
          <p>
            Donating from <span className="mono">{walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}</span>
          </p>
          <p className="balance-line">
            Your MUSD balance: <strong>{balanceText}</strong>
          </p>
          {balance !== null && !wrongNetwork && (
            <BalanceHint balance={balance} amount={amount} />
          )}
        </div>
      ) : (wallets.length > 0 || !!window.ethereum) ? (
        <p className="muted">
          Connect your wallet to donate. The button will automatically add
          Mezo Testnet to MetaMask if it is not there yet.
        </p>
      ) : null}

      <div className="preset-row" role="group" aria-label="Preset amounts">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`preset-btn ${amount === preset ? 'preset-btn-active' : ''}`}
            onClick={() => setAmount(preset)}
            disabled={busy}
          >
            {preset} MUSD
          </button>
        ))}
      </div>

      <div className="field">
        <label className="field-label" htmlFor="donate-amount">
          Or enter your own amount (MUSD)
        </label>
        <input
          id="donate-amount"
          className="input"
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={busy}
        />
      </div>

      {donationError && <ErrorNotice error={donationError} />}
      {errorMessage && (
        <p className="alert alert-error" role="alert">
          {errorMessage}
        </p>
      )}

      {status === 'waiting' && (
        <p className="status-line" role="status">
          ⏳ Waiting for you to approve the transaction in your wallet…
        </p>
      )}
      {status === 'confirming' && (
        <p className="status-line" role="status">
          ⏳ Transaction sent — waiting for the network to confirm it…
          {txHash && (
            <>
              {' '}
              <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer">
                View on explorer ↗
              </a>
            </>
          )}
        </p>
      )}
      {status === 'success' && txHash && (
        <div className="alert alert-success" role="status">
          <p>
            <strong>🎉 Thank you for donating!</strong> Your MUSD is on its way
            to the recipient.
          </p>
          <p>
            <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer">
              View your transaction on the explorer ↗
            </a>
          </p>
          <p className="small">The progress bar and supporter list have been refreshed below.</p>
        </div>
      )}
      {status === 'failed' && !errorMessage && (
        <p className="alert alert-error" role="alert">
          The donation did not go through. Please try again.
        </p>
      )}

      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={handleDonate}
        disabled={busy || disabled || (!provider && wallets.length === 0 && !window.ethereum) || (!!walletAddress && wrongNetwork)}
      >
        {!walletAddress
          ? connecting
            ? 'Connecting…'
            : 'Connect wallet to donate'
          : status === 'waiting'
            ? 'Waiting for wallet approval…'
            : status === 'confirming'
              ? 'Confirming…'
              : 'Donate MUSD'}
      </button>
      <p className="muted small center">
        Donating sends MUSD directly from your wallet to the recipient wallet
        on Mezo Testnet. It cannot be undone.
      </p>
    </section>
  )
}

function BalanceHint({ balance, amount }: { balance: bigint; amount: string }) {
  let wei: bigint | null = null
  try {
    wei = parseMusdAmount(amount)
  } catch {
    wei = null
  }
  if (wei !== null && wei > balance) {
    return (
      <p className="alert alert-warning" role="alert">
        ⚠️ This amount is more than your MUSD balance. You will need more test
        MUSD before donating this much — see “Need test MUSD?” below.
      </p>
    )
  }
  if (balance === BigInt(0)) {
    return (
      <p className="alert alert-warning" role="alert">
        Your MUSD balance is 0. Borrow test MUSD using the steps below
        before donating.
      </p>
    )
  }
  return null
}
