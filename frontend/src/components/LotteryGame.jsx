import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { InlineError, InlineSuccess } from './ui/InlineStatus';
import Skeleton from './ui/Skeleton';
import EmptyState from './ui/EmptyState';
import { useToast } from './ui/ToastProvider';

const LotteryGame = ({ account, contractAddress, abi, gameTokenAddress, gameTokenAbi }) => {
  const [lotteryInfo, setLotteryInfo] = useState(null);
  const [isLoadingLottery, setIsLoadingLottery] = useState(true);
  const [ticketCount, setTicketCount] = useState(1);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [contract, setContract] = useState(null);
  const [gameTokenContract, setGameTokenContract] = useState(null);
  const [allowance, setAllowance] = useState('0');
  const [tokenBalance, setTokenBalance] = useState('0');
  const { showToast } = useToast();

  useEffect(() => {
    if (window.ethereum && account && contractAddress && abi) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const lotteryContract = new ethers.Contract(contractAddress, abi, provider);
      setContract(lotteryContract);
      loadLotteryInfo(lotteryContract);
    }
    if (window.ethereum && account && gameTokenAddress && gameTokenAbi) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const gameToken = new ethers.Contract(gameTokenAddress, gameTokenAbi, provider);
      setGameTokenContract(gameToken);
      loadAllowance(gameToken);
      loadTokenBalance(gameToken);
    }
  }, [account, contractAddress, abi, gameTokenAddress, gameTokenAbi]);

  const loadLotteryInfo = async (lotteryContract) => {
    try {
      setIsLoadingLottery(true);
      const currentLotteryId = await lotteryContract.currentLotteryId();
      const info = await lotteryContract.getLotteryInfo(currentLotteryId);
      setLotteryInfo({
        id: currentLotteryId.toString(),
        startTime: new Date(Number(info.startTime) * 1000).toLocaleString(),
        endTime: new Date(Number(info.endTime) * 1000).toLocaleString(),
        prizePool: ethers.formatEther(info.prizePool),
        totalTickets: info.totalTickets.toString(),
        isActive: info.isActive,
        isDrawn: info.isDrawn,
        winner: info.winner,
        winningNumber: info.winningNumber.toString()
      });
    } catch (error) {
      console.error('Error loading lottery info:', error);
      setError('Failed to load lottery information');
      showToast('Failed to load lottery information', 'error');
    } finally {
      setIsLoadingLottery(false);
    }
  };

  const handleApprove = async () => {
      if (!gameTokenContract || !account) return;
  
      setIsApproving(true);
      setError(null);
      setSuccess(null);
  
      try {
        const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
        const gameTokenWithSigner = gameTokenContract.connect(signer);
  
        // Approve a large amount (10000 tokens)
        const approveAmount = ethers.parseEther('10000');
        const tx = await gameTokenWithSigner.approve(contractAddress, approveAmount);
        await tx.wait();
  
        setSuccess('Approval successful! You can now play the game.');
        showToast('Approval successful', 'success');
        await loadAllowance(gameTokenContract);
      } catch (error) {
        console.error('Error approving tokens:', error);
        setError(error.message || 'Failed to approve tokens');
        showToast('Approval failed', 'error');
      } finally {
        setIsApproving(false);
      }
    };

  const loadAllowance = async (gameToken) => {
      try {
        if (account && contractAddress) {
          const allowanceAmount = await gameToken.allowance(account, contractAddress);
          setAllowance(ethers.formatEther(allowanceAmount.toString()));
        }
      } catch (error) {
        console.error('Error loading allowance:', error);
      }
    };

  const loadTokenBalance = async (gameToken) => {
    if (!account) return;
    try {
      const balance = await gameToken.balanceOf(account);
      setTokenBalance(ethers.formatEther(balance.toString()));
    } catch (error) {
      console.error('Error loading token balance:', error);
    }
  };

  const handleMintWithEth = async () => {
    if (!gameTokenContract || !account) return;

    setIsMinting(true);
    setError(null);
    setSuccess(null);

    try {
      const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
      const tokenWithSigner = gameTokenContract.connect(signer);

      const mintAmount = ethers.parseEther('10000');
      const fee = ethers.parseEther('0.01');

      const tx = await tokenWithSigner.mintWithEth(mintAmount, { value: fee });
      await tx.wait();

      setSuccess('Successfully got 10000 GT!');
      showToast('Successfully got 10000 GT', 'success');
      await loadTokenBalance(gameTokenContract);
    } catch (error) {
      console.error('Error minting tokens:', error);
      setError(error.message || 'Failed to get GT');
      showToast('Failed to get GT', 'error');
    } finally {
      setIsMinting(false);
    }
  };

  const handlePurchase = async () => {
    if (!contract || !account) return;

    setIsPurchasing(true);
    setError(null);
    setSuccess(null);

    try {
      const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
      const contractWithSigner = contract.connect(signer);

      const tx = await contractWithSigner.purchaseTickets(ticketCount);
      await tx.wait();

      setSuccess(`Successfully purchased ${ticketCount} ticket(s)!`);
      showToast(`Purchased ${ticketCount} ticket(s)`, 'success');
      await loadLotteryInfo(contract);
    } catch (error) {
      console.error('Error purchasing tickets:', error);
      setError(error.message || 'Failed to purchase tickets');
      showToast('Ticket purchase failed', 'error');
    } finally {
      setIsPurchasing(false);
    }
  };

  if (isLoadingLottery) {
    return (
      <div className="game-card">
        <h2>🎰 Lottery Game</h2>
        <Skeleton lines={6} />
      </div>
    );
  }

  if (!lotteryInfo) {
    return (
      <div className="game-card">
        <h2>🎰 Lottery Game</h2>
        <EmptyState
          title="Lottery data unavailable"
          description="Please refresh or reconnect your wallet."
        />
      </div>
    );
  }

  return (
    <div className="game-card">
      <h2>🎰 Lottery Game</h2>

      {account && (
        <div className="token-balance">
          <p><strong>Your GT Balance:</strong> {parseFloat(tokenBalance || '0').toFixed(2)} GT</p>
        </div>
      )}

      {parseFloat(tokenBalance) === 0 && account && (
        <div className="mint-section">
          <p className="mint-info">Get 10000 GT for 0.01 ETH</p>
          <button
            className="button mint-button"
            onClick={handleMintWithEth}
            disabled={!account || isMinting}
          >
            {isMinting ? <span className="loading"></span> : 'Get GT'}
          </button>
        </div>
      )}

      <div className="info-box">
        <p><strong>Lottery ID:</strong> #{lotteryInfo.id}</p>
        <p><strong>Start Time:</strong> {lotteryInfo.startTime}</p>
        <p><strong>End Time:</strong> {lotteryInfo.endTime}</p>
        <p><strong>Prize Pool:</strong> {parseFloat(lotteryInfo.prizePool).toFixed(2)} GT</p>
        <p><strong>Total Tickets:</strong> {lotteryInfo.totalTickets}</p>
        <p><strong>Status:</strong> {lotteryInfo.isActive ? 'Active' : 'Ended'}</p>
        {lotteryInfo.isDrawn && (
          <>
            <p><strong>Winner:</strong> {lotteryInfo.winner}</p>
            <p><strong>Winning Number:</strong> {lotteryInfo.winningNumber}</p>
          </>
        )}
      </div>

      <InlineError message={error} />
      <InlineSuccess message={success} />

      <div className="payout-info">
        <p><strong>Allowance:</strong> {parseFloat(allowance || '0').toFixed(4)} GT</p>
      </div>

      {lotteryInfo.isActive && (
        <div className="purchase-section">
          <h3>Purchase Tickets (1 Ticket = 1000 GT)</h3>
          <div className="input-group">
            <label htmlFor="ticketCount">Number of Tickets:</label>
            <input
              type="number"
              id="ticketCount"
              className="input"
              min="1"
              max="10"
              value={ticketCount}
              onChange={(e) => setTicketCount(parseInt(e.target.value))}
            />
          </div>
          <p className="cost-info">Total Cost: {ticketCount * 1000} GT</p>
          {parseFloat(allowance) < (ticketCount * 1000) ? (
            <button
              className="button"
              onClick={handleApprove}
              disabled={!account || isApproving}
            >
              {isApproving ? (
                <span className="loading"></span>
              ) : (
                'Approve Tokens'
              )}
            </button>
          ) : (
            <button
              className="button"
              onClick={handlePurchase}
              disabled={!account || isPurchasing}
            >
              {isPurchasing ? (
                <span className="loading"></span>
              ) : (
                `Purchase ${ticketCount} Ticket(s)`
              )}
            </button>
          )}
        </div>
      )}

      {!account && (
        <p className="connect-prompt">Please connect your wallet to participate</p>
      )}
    </div>
  );
};

export default LotteryGame;
