import React, { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import Button from './ui/Button';
import { InlineError, InlineSuccess } from './ui/InlineStatus';
import StatItem from './ui/StatItem';
import Skeleton from './ui/Skeleton';
import { useToast } from './ui/ToastProvider';
import { getFriendlyError } from '../utils/friendlyError';
import { useAutoDismiss } from '../hooks/useAutoDismiss';

const WalletHubCard = ({ account, gameTokenAddress, gameTokenAbi }) => {
  const [tokenBalance, setTokenBalance] = useState('0');
  const [isMinting, setIsMinting] = useState(false);
  const [mintTarget, setMintTarget] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isRechargeView, setIsRechargeView] = useState(false);
  const { showToast } = useToast();
  const rechargeOptions = [
    { key: 'starter', title: 'Starter', amount: '5000' },
    { key: 'quick', title: 'Quick', amount: '10000' },
    { key: 'pro', title: 'Pro', amount: '20000' },
    { key: 'max', title: 'Max', amount: '50000' }
  ];

  useAutoDismiss(error, setError, '');
  useAutoDismiss(success, setSuccess, '');

  const gameTokenContract = useMemo(() => {
    if (!window.ethereum || !gameTokenAddress || !gameTokenAbi) return null;
    const provider = new ethers.BrowserProvider(window.ethereum);
    return new ethers.Contract(gameTokenAddress, gameTokenAbi, provider);
  }, [gameTokenAddress, gameTokenAbi]);

  useEffect(() => {
    const loadTokenBalance = async () => {
      if (!account || !gameTokenContract) return;
      setLoading(true);
      try {
        const balance = await gameTokenContract.balanceOf(account);
        setTokenBalance(ethers.formatEther(balance.toString()));
      } catch (e) {
        setError('Failed to load GT balance');
      } finally {
        setLoading(false);
      }
    };

    loadTokenBalance();
  }, [account, gameTokenContract]);

  const handleMintWithEth = async (amount, source = 'tier') => {
    if (!account || !gameTokenContract) return;
    setIsMinting(true);
    setMintTarget(`${source}-${amount}`);
    setError('');
    setSuccess('');

    try {
      const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
      const tokenWithSigner = gameTokenContract.connect(signer);
      const mintAmount = ethers.parseEther(amount);
      const fee = ethers.parseEther('0.01');
      const tx = await tokenWithSigner.mintWithEth(mintAmount, { value: fee });
      await tx.wait();
      const updatedBalance = await gameTokenContract.balanceOf(account);
      setTokenBalance(ethers.formatEther(updatedBalance.toString()));
      setSuccess(`Recharge successful: +${amount} GT`);
      setIsRechargeView(false);
      showToast('Recharge successful', 'success');
    } catch (e) {
      const message = getFriendlyError(e, 'Recharge failed. Please try again.');
      setError(message);
      showToast(message, 'error');
    } finally {
      setIsMinting(false);
      setMintTarget('');
    }
  };

  return (
    <section className="wallet-hub-card game-card">
      <div className="wallet-hub-header">
        <h2>💎 GT Wallet Hub</h2>
        <button
          type="button"
          className="card-link-btn"
          onClick={() => setIsRechargeView((prev) => !prev)}
        >
          {isRechargeView ? 'Return' : 'Recharge Plans'}
        </button>
      </div>

      {!account ? (
        <p className="connect-prompt">Please connect your wallet to view balance and recharge.</p>
      ) : loading ? (
        <Skeleton lines={2} />
      ) : (
        <>
          <div className="token-balance">
            <span className="token-balance-label">GT Balance</span>
            <span className="token-balance-value">{parseFloat(tokenBalance || '0').toFixed(2)} GT</span>
          </div>

          <div className="wallet-hub-actions">
            {isRechargeView ? (
              <>
                <StatItem label="Recharge Fee" value="Each recharge costs 0.01 ETH" />
                <div className="wallet-hub-tier-grid">
                  {rechargeOptions.map((option) => (
                    <Button
                      key={option.key}
                      variant={option.key === 'quick' ? 'accent' : 'secondary'}
                      onClick={() => handleMintWithEth(option.amount, 'tier')}
                      disabled={isMinting}
                      loading={isMinting && mintTarget === `tier-${option.amount}`}
                    >
                      {`${option.title} • ${option.amount} GT`}
                    </Button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <StatItem label="Recharge Channel" value="Quick: 0.01 ETH => 10000 GT (instant)" />
                <Button
                  variant="accent"
                  onClick={() => handleMintWithEth('10000', 'quick')}
                  disabled={isMinting}
                  loading={isMinting && mintTarget === 'quick-10000'}
                >
                  Quick Recharge GT
                </Button>
              </>
            )}
          </div>
        </>
      )}

      <InlineError message={error} />
      <InlineSuccess message={success} />
    </section>
  );
};

export default WalletHubCard;
