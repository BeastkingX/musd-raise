import { useCallback, useEffect, useState } from 'react'
import { formatUnits } from 'viem'
import {
  MEZO_TESTNET_CHAIN_ID,
  MUSD_DECIMALS,
  explorerTxUrl,
} from '../lib/constants'
import {
  connectWallet,
  donateMusd,
  fetchMusdBalance,
  friendlyWalletError,
  getConnectedAccounts,
  getConnectedChainId,
  hasInjectedWallet,
  isUserRejection,
  parseMusdAmount,
  waitForReceipt,
} from '../lib/wallet'

type DonateStatus =
  | 'idle'
  | 'waiting' // waiting for wallet approval
  | 'confirming' // tx broadcast, waiting to be mined
  | 'success'
  | 'failed'

const PRESETS = ['10', '25', '50', '100']

interface DonateBoxProps {
  recipient: string
  onDonationSuccess: () => void
}

export default function DonateBox({ recipient, onDonationSuccess }: DonateBoxProps) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [balance, setBalance] = useState<bigint | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [amount, setAmount] = useState('25')
  const [status, setStatus] = useState<DonateStatus>('idle')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  const wrongNetwork = chainId !== null && chainId !== MEZO_TESTNET_CHAIN_ID
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

  // On load, notice if a wallet is already connected (but don't force it).
  useEffect(() => {
    let cancelled = false
    async function checkExisting() {
      if (!hasInjectedWallet()) return
      const accounts = await getConnectedAccounts()
      const id = await getConnectedChainId()
      if (cancelled) return
      setChainId(id)
      if (accounts.length > 0) {
        setWalletAddress(accounts[0])
        void refreshBalance(accounts[0])
      }
    }
    void checkExisting()
    return () => {
      cancelled = true
    }
  }, [refreshBalance])

  // Keep chain / account in sync if the user switches in MetaMask.
  useEffect(() => {
    if (!hasInjectedWallet()) return
    const provider = window.ethereum
    if (!provider?.on) return

    const onAccounts = async () => {
      const accounts = await getConnectedAccounts()
      if (accounts.length > 0) {
        setWalletAddress(accounts[0])
        void refreshBalance(accounts[0])
      } else {
        setWalletAddress(null)
        setBalance(null)
      }
    }
    const onChain = async () => {
      setChainId(await getConnectedChainId())
    }
    provider.on('accountsChanged', onAccounts)
    provider.on('chainChanged', onChain)
    return () => {
      provider.removeListener?.('accountsChanged', onAccounts)
      provider.removeListener?.('chainChanged', onChain)
    }
  }, [refreshBalance])

  async function handleConnect() {
    setConnecting(true)
    setErrorMessage(null)
    try {
      const { address, chainId: id } = await connectWallet()
      setWalletAddress(address)
      setChainId(id)
      await refreshBalance(address)
    } catch (error) {
      setErrorMessage(friendlyWalletError(error))
    } finally {
      setConnecting(false)
    }
  }

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
        error: `That is more than your balance (${formatUnits(balance, MUSD_DECIMALS)} MUSD). Please donate a smaller amount, or get more test MUSD from the faucet below.`,
      }
    }
    return { wei }
  }

  async function handleDonate() {
    setErrorMessage(null)
    setTxHash(null)

    if (!walletAddress) {
      await handleConnect()
      return
    }
    if (wrongNetwork) {
      setErrorMessage(
        'Your wallet is on the wrong network. Please switch to Mezo Testnet — the Connect button will do it for you.',
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
      // Make sure we're on Mezo Testnet before sending.
      const { chainId: id } = await connectWallet().catch(() => ({
        chainId: chainId ?? MEZO_TESTNET_CHAIN_ID,
      }))
      setChainId(id)
      if (id !== MEZO_TESTNET_CHAIN_ID) {
        throw new Error('Wallet is not on Mezo Testnet.')
      }

      const hash = await donateMusd({
        from: walletAddress,
        recipient,
        amount: validation.wei,
      })
      setTxHash(hash)
      setStatus('confirming')

      await waitForReceipt(hash)
      setStatus('success')
      // Refresh balance + campaign totals/supporters.
      await refreshBalance(walletAddress)
      onDonationSuccess()
    } catch (error) {
      setStatus('failed')
      if (isUserRejection(error)) {
        setErrorMessage(friendlyWalletError(error))
      } else {
        setErrorMessage(friendlyWalletError(error))
      }
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

      {!hasInjectedWallet() && (
        <p className="alert alert-warning">
          No wallet detected in this browser. Please install{' '}
          <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">
            MetaMask
          </a>{' '}
          to donate. You can still read this campaign without a wallet.
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
          {wrongNetwork && (
            <p className="alert alert-warning" role="alert">
              ⚠️ Your wallet is on the wrong network (chain {chainId}). Donations
              only work on <strong>Mezo Testnet</strong> (chain {MEZO_TESTNET_CHAIN_ID}).{' '}
              <button type="button" className="link-button" onClick={handleConnect} disabled={connecting}>
                Switch to Mezo Testnet
              </button>
            </p>
          )}
          {balance !== null && !wrongNetwork && (
            <BalanceHint balance={balance} amount={amount} />
          )}
        </div>
      ) : (
        <p className="muted">
          Connect your wallet to donate. The button will automatically add
          Mezo Testnet to MetaMask if it is not there yet.
        </p>
      )}

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
        disabled={busy || !hasInjectedWallet()}
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
        Your MUSD balance is 0. Get some free test MUSD from the faucet below
        before donating.
      </p>
    )
  }
  return null
}
