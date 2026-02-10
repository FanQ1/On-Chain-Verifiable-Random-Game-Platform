import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { InlineError, InlineSuccess } from './ui/InlineStatus';
import Skeleton from './ui/Skeleton';
import EmptyState from './ui/EmptyState';
import { useToast } from './ui/ToastProvider';
import Button from './ui/Button';
import Card from './ui/Card';
import Input from './ui/Input';
import StatItem from './ui/StatItem';
import StatusTag from './ui/StatusTag';
import TransactionStepper from './ui/TransactionStepper';
import { getFriendlyError } from '../utils/friendlyError';
import { useAutoDismiss } from '../hooks/useAutoDismiss';

const LotteryGame = ({
  account,
  contractAddress,
  abi,
  gameTokenAddress,
  gameTokenAbi,
  onToggleView,
  toggleLabel = 'Lottery Game'
}) => {
  const [lotteryInfo, setLotteryInfo] = useState(null);
  const [isLoadingLottery, setIsLoadingLottery] = useState(true);
  const [ticketCount, setTicketCount] = useState(1);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [contract, setContract] = useState(null);
  const [gameTokenContract, setGameTokenContract] = useState(null);
  const [allowance, setAllowance] = useState('0');
  const [flowStage, setFlowStage] = useState('idle');
  const { showToast } = useToast();

  useAutoDismiss(error, setError, null);
  useAutoDismiss(success, setSuccess, null);

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
    }
  }, [account, contractAddress, abi, gameTokenAddress, gameTokenAbi]);

  useEffect(() => {
    if (!account) {
      setFlowStage('idle');
      return;
    }

    if (!isApproving && !isPurchasing) {
      const requiredAllowance = ticketCount * 1000;
      setFlowStage(parseFloat(allowance || '0') >= requiredAllowance ? 'ready' : 'idle');
    }
  }, [account, allowance, ticketCount, isApproving, isPurchasing]);

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
      setFlowStage('approving');
      setError(null);
      setSuccess(null);
  
      try {
        const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
        const gameTokenWithSigner = gameTokenContract.connect(signer);
  
        // Approve a large amount (10000 tokens)
        const approveAmount = ethers.parseEther('10000');
        const tx = await gameTokenWithSigner.approve(contractAddress, approveAmount);
        setFlowStage('confirming');
        await tx.wait();
  
        setSuccess('Approval successful! You can now play the game.');
        setFlowStage('ready');
        showToast('Approval successful', 'success');
        await loadAllowance(gameTokenContract);
      } catch (error) {
        console.error('Error approving tokens:', error);
        const message = getFriendlyError(error, 'Approval failed. Please try again.');
        setError(message);
        setFlowStage('error');
        showToast(message, 'error');
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

  const handlePurchase = async () => {
    if (!contract || !account) return;

    setIsPurchasing(true);
    setFlowStage('submitting');
    setError(null);
    setSuccess(null);

    try {
      const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
      const contractWithSigner = contract.connect(signer);

      const tx = await contractWithSigner.purchaseTickets(ticketCount);
      setFlowStage('confirming');
      await tx.wait();

      setSuccess(`Successfully purchased ${ticketCount} ticket(s)!`);
      setFlowStage('done');
      showToast(`Purchased ${ticketCount} ticket(s)`, 'success');
      await loadLotteryInfo(contract);
    } catch (error) {
      console.error('Error purchasing tickets:', error);
      const message = getFriendlyError(error, 'Ticket purchase failed. Please try again.');
      setError(message);
      setFlowStage('error');
      showToast(message, 'error');
    } finally {
      setIsPurchasing(false);
    }
  };

  const renderHeaderActions = () => (
    <button type="button" className="card-link-btn" onClick={onToggleView}>
      {toggleLabel}
    </button>
  );

  if (isLoadingLottery) {
    return (
      <Card title="Lottery Game" icon="🎰" className="game-card" headerActions={renderHeaderActions()}>
        <Skeleton lines={6} />
      </Card>
    );
  }

  if (!lotteryInfo) {
    return (
      <Card title="Lottery Game" icon="🎰" className="game-card" headerActions={renderHeaderActions()}>
        <EmptyState
          title="Lottery data unavailable"
          description="Please refresh or reconnect your wallet."
        />
      </Card>
    );
  }

  return (
    <Card
      title="Lottery Game"
      icon="🎰"
      className="game-card lottery-card"
      headerActions={renderHeaderActions()}
    >
      <div className="info-box">
        <StatItem label="Lottery ID" value={`#${lotteryInfo.id}`} />
        <StatItem label="Start Time" value={lotteryInfo.startTime} />
        <StatItem label="End Time" value={lotteryInfo.endTime} />
        <StatItem label="Prize Pool" value={`${parseFloat(lotteryInfo.prizePool).toFixed(2)} GT`} />
        <StatItem label="Total Tickets" value={lotteryInfo.totalTickets} />
        <p className="ds-stat-item"><strong>Status:</strong> <StatusTag type={lotteryInfo.isActive ? 'active' : 'ended'}>{lotteryInfo.isActive ? 'Active' : 'Ended'}</StatusTag></p>
        {lotteryInfo.isDrawn && (
          <>
            <StatItem label="Winner" value={lotteryInfo.winner} />
            <StatItem label="Winning Number" value={lotteryInfo.winningNumber} />
          </>
        )}
      </div>

      <InlineError message={error} />
      <InlineSuccess message={success} />

      <TransactionStepper
        stage={flowStage}
        actionLabel="Purchase"
        approvalRequired={parseFloat(allowance) < (ticketCount * 1000)}
      />

      <div className="payout-info">
        <StatItem label="Allowance" value={`${parseFloat(allowance || '0').toFixed(4)} GT`} />
      </div>

      {lotteryInfo.isActive && (
        <div className="purchase-section">
          <h3>Purchase Tickets (1 Ticket = 1000 GT)</h3>
          <Input
            type="number"
            id="ticketCount"
            label="Number of Tickets"
            min="1"
            max="10"
            value={ticketCount}
            onChange={(e) => setTicketCount(parseInt(e.target.value))}
          />
          <p className="cost-info">Total Cost: {ticketCount * 1000} GT</p>
          {parseFloat(allowance) < (ticketCount * 1000) ? (
            <Button
              onClick={handleApprove}
              disabled={!account || isApproving}
              loading={isApproving}
            >
              Approve Tokens
            </Button>
          ) : (
            <Button
              onClick={handlePurchase}
              disabled={!account || isPurchasing}
              loading={isPurchasing}
            >
              {`Purchase ${ticketCount} Ticket(s)`}
            </Button>
          )}
        </div>
      )}

      {!account && (
        <p className="connect-prompt">Please connect your wallet to participate</p>
      )}
    </Card>
  );
};

export default LotteryGame;
