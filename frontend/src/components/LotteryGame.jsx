import React, { useState, useEffect, useRef } from 'react';
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
  vrfCoordinatorAddress,
  onToggleView,
  toggleLabel = 'Lottery Game'
}) => {
  const LOCAL_VRF_COORDINATOR = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
  const resolvedVrfCoordinatorAddress = vrfCoordinatorAddress || LOCAL_VRF_COORDINATOR;
  const AUTO_RETRY_INTERVAL_MS = 2500;
  const FAST_POLL_INTERVAL_MS = 1000;
  const HISTORY_POLL_INTERVAL_MS = 1500;
  const REFRESH_THROTTLE_MS = 700;
  const LOTTERY_TICKET_TARGET = 50;
  const [lotteryInfo, setLotteryInfo] = useState(null);
  const [isLoadingLottery, setIsLoadingLottery] = useState(true);
  const [ticketCount, setTicketCount] = useState(1);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [lotteryHistory, setLotteryHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [contract, setContract] = useState(null);
  const [gameTokenContract, setGameTokenContract] = useState(null);
  const [allowance, setAllowance] = useState('0');
  const [ticketPrice, setTicketPrice] = useState('0');
  const [requestIdByLotteryId, setRequestIdByLotteryId] = useState({});
  const [isRetryingFulfill, setIsRetryingFulfill] = useState(false);
  const [lastFulfillRetryAt, setLastFulfillRetryAt] = useState(0);
  const [flowStage, setFlowStage] = useState('idle');
  const [resultModal, setResultModal] = useState({
    isOpen: false,
    isRevealing: false,
    progressMs: 1000,
    lotteryId: '',
    isWinner: false,
    winningNumber: '',
    prize: 0
  });
  const isHistoryInitializedRef = useRef(false);
  const notifiedLotteryIdsRef = useRef(new Set());
  const revealTimerRef = useRef(null);
  const didInitLotteryInfoRef = useRef(false);
  const isRealtimeRefreshInFlightRef = useRef(false);
  const lastRealtimeRefreshAtRef = useRef(0);
  const pendingRealtimeRefreshRef = useRef({ includeHistory: false, force: false });
  const { showToast } = useToast();

  useAutoDismiss(error, setError, null);
  useAutoDismiss(success, setSuccess, null);

  useEffect(() => {
    if (window.ethereum && account && contractAddress && abi) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const lotteryContract = new ethers.Contract(contractAddress, abi, provider);
      setContract(lotteryContract);
      loadLotteryInfo(lotteryContract);
      loadLotteryHistory(lotteryContract);
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
      const normalizedTicketCount = Number.isFinite(ticketCount) && ticketCount > 0 ? ticketCount : 1;
      const requiredAllowance = parseFloat(ticketPrice || '0') * normalizedTicketCount;
      setFlowStage(parseFloat(allowance || '0') >= requiredAllowance ? 'ready' : 'idle');
    }
  }, [account, allowance, ticketCount, ticketPrice, isApproving, isPurchasing]);

  useEffect(() => {
    if (!contract || !account) return;
    loadRequestIdMap(contract);
  }, [contract, account]);

  const refreshRealtimeState = async ({ includeHistory = false, force = false } = {}) => {
    if (!contract || !account) return;
    const now = Date.now();
    if (!force && now - lastRealtimeRefreshAtRef.current < REFRESH_THROTTLE_MS) return;
    if (isRealtimeRefreshInFlightRef.current) {
      pendingRealtimeRefreshRef.current = {
        includeHistory: pendingRealtimeRefreshRef.current.includeHistory || includeHistory,
        force: pendingRealtimeRefreshRef.current.force || force
      };
      return;
    }

    isRealtimeRefreshInFlightRef.current = true;
    lastRealtimeRefreshAtRef.current = now;
    try {
      await loadLotteryInfo(contract, { silent: true });
      if (includeHistory) {
        await Promise.all([
          loadLotteryHistory(contract, { silent: true }),
          loadRequestIdMap(contract)
        ]);
      }
    } finally {
      isRealtimeRefreshInFlightRef.current = false;
      const pending = pendingRealtimeRefreshRef.current;
      if (pending.includeHistory || pending.force) {
        pendingRealtimeRefreshRef.current = { includeHistory: false, force: false };
        setTimeout(() => {
          refreshRealtimeState({
            includeHistory: pending.includeHistory,
            force: true
          });
        }, 0);
      }
    }
  };

  useEffect(() => {
    if (!contract || !account) return undefined;

    const intervalId = setInterval(() => {
      refreshRealtimeState();
    }, FAST_POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [contract, account]);

  useEffect(() => {
    if (!contract || !account) return undefined;

    const historyIntervalId = setInterval(() => {
      refreshRealtimeState({ includeHistory: true });
    }, HISTORY_POLL_INTERVAL_MS);

    return () => clearInterval(historyIntervalId);
  }, [contract, account]);

  useEffect(() => {
    if (!contract || !account) return undefined;
    const provider = contract.runner?.provider || contract.runner;
    if (!provider || typeof provider.on !== 'function' || typeof provider.off !== 'function') {
      return undefined;
    }

    const handleBlock = () => {
      refreshRealtimeState();
    };

    provider.on('block', handleBlock);
    return () => {
      provider.off('block', handleBlock);
    };
  }, [contract, account]);

  useEffect(() => {
    if (!contract || !account) return undefined;

    const refreshFromEvent = () => {
      refreshRealtimeState({ includeHistory: true, force: true });
    };

    contract.on('TicketPurchased', refreshFromEvent);
    contract.on('LotteryDrawRequested', refreshFromEvent);
    contract.on('LotteryDrawn', refreshFromEvent);

    return () => {
      contract.off('TicketPurchased', refreshFromEvent);
      contract.off('LotteryDrawRequested', refreshFromEvent);
      contract.off('LotteryDrawn', refreshFromEvent);
    };
  }, [contract, account]);

  useEffect(() => {
    const autoRetryFulfill = async () => {
      if (!window.ethereum || !contract || !lotteryInfo || isPurchasing || isRetryingFulfill) return;
      if (lotteryInfo.isDrawn || lotteryInfo.isActive) return;

      const requestId = await resolveRequestIdForLottery(contract, lotteryInfo.id);
      if (!requestId) {
        await loadRequestIdMap(contract);
        return;
      }

      const now = Date.now();
      if (now - lastFulfillRetryAt < AUTO_RETRY_INTERVAL_MS) return;

      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const network = await provider.getNetwork();
        const isLocalNetwork = Number(network.chainId) === 31337 || Number(network.chainId) === 1337;
        if (!isLocalNetwork) return;

        setIsRetryingFulfill(true);
        setLastFulfillRetryAt(now);

        const signer = await getLocalAutoFulfillSigner();
        if (!signer) return;
        const vrfCoordinatorAbi = ['function fulfillRandomWords(uint256 requestId) external'];
        const vrfCoordinator = new ethers.Contract(resolvedVrfCoordinatorAddress, vrfCoordinatorAbi, signer);
        const tx = await vrfCoordinator.fulfillRandomWords(requestId);
        await tx.wait();

        await loadLotteryInfo(contract, { silent: true });
        await loadLotteryHistory(contract, { silent: true });
      } catch (error) {
        console.warn('Lottery auto retry fulfill failed:', error);
      } finally {
        setIsRetryingFulfill(false);
      }
    };

    autoRetryFulfill();
  }, [
    contract,
    lotteryInfo,
    requestIdByLotteryId,
    resolvedVrfCoordinatorAddress,
    isPurchasing,
    isRetryingFulfill,
    lastFulfillRetryAt
  ]);

  useEffect(() => {
    if (!lotteryHistory.length) return;

    if (!isHistoryInitializedRef.current) {
      lotteryHistory.forEach((lottery) => {
        if (lottery.isDrawn) {
          notifiedLotteryIdsRef.current.add(String(lottery.id));
        }
      });
      isHistoryInitializedRef.current = true;
      return;
    }

    const newlyDrawnLottery = lotteryHistory.find(
      (lottery) => lottery.isDrawn && !notifiedLotteryIdsRef.current.has(String(lottery.id))
    );

    if (!newlyDrawnLottery) return;

    notifiedLotteryIdsRef.current.add(String(newlyDrawnLottery.id));
    const randomProgressMs = 800 + Math.floor(Math.random() * 1001);

    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
    }

    setResultModal({
      isOpen: true,
      isRevealing: true,
      progressMs: randomProgressMs,
      lotteryId: newlyDrawnLottery.id,
      isWinner: newlyDrawnLottery.isWinner,
      winningNumber: newlyDrawnLottery.winningNumber,
      prize: newlyDrawnLottery.prize
    });

    revealTimerRef.current = setTimeout(() => {
      setResultModal((prev) => ({ ...prev, isRevealing: false }));
      revealTimerRef.current = null;
    }, randomProgressMs);
  }, [lotteryHistory]);

  useEffect(() => () => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const maybeRevealFromLotteryInfo = async () => {
      if (!contract || !account || !lotteryInfo) return;

      if (!didInitLotteryInfoRef.current) {
        didInitLotteryInfoRef.current = true;
        return;
      }

      if (!lotteryInfo.isDrawn) return;
      const lotteryId = String(lotteryInfo.id);
      if (notifiedLotteryIdsRef.current.has(lotteryId)) return;

      const participatedIds = await contract.getPlayerLotteries(account);
      const hasParticipated = participatedIds.some((id) => id.toString() === lotteryId);
      if (!hasParticipated) return;

      notifiedLotteryIdsRef.current.add(lotteryId);
      const randomProgressMs = 800 + Math.floor(Math.random() * 1001);
      const winner = lotteryInfo.winner?.toLowerCase?.() || '';
      const accountLower = account.toLowerCase();
      const prizePoolGt = parseFloat(lotteryInfo.prizePool || '0');
      const prizeGt = prizePoolGt * 0.95;

      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
      }

      setResultModal({
        isOpen: true,
        isRevealing: true,
        progressMs: randomProgressMs,
        lotteryId,
        isWinner: winner === accountLower,
        winningNumber: lotteryInfo.winningNumber,
        prize: prizeGt
      });

      revealTimerRef.current = setTimeout(() => {
        setResultModal((prev) => ({ ...prev, isRevealing: false }));
        revealTimerRef.current = null;
      }, randomProgressMs);
    };

    maybeRevealFromLotteryInfo().catch((error) => {
      console.warn('Lottery result modal fallback trigger failed:', error);
    });
  }, [lotteryInfo, contract, account]);

  const loadLotteryInfo = async (lotteryContract, options = {}) => {
    const silent = options.silent === true;
    try {
      if (!silent) {
        setIsLoadingLottery(true);
      }
      const [currentLotteryId, chainTicketPrice] = await Promise.all([
        lotteryContract.currentLotteryId(),
        lotteryContract.ticketPrice()
      ]);
      const info = await lotteryContract.getLotteryInfo(currentLotteryId);
      setTicketPrice(ethers.formatEther(chainTicketPrice.toString()));
      setLotteryInfo({
        id: currentLotteryId.toString(),
        startTime: new Date(Number(info.startTime) * 1000).toLocaleString(),
        endTime: new Date(Number(info.endTime) * 1000).toLocaleString(),
        endTimeUnix: Number(info.endTime),
        prizePool: ethers.formatEther(info.prizePool),
        totalTickets: info.totalTickets.toString(),
        isActive: info.isActive,
        isDrawn: info.isDrawn,
        winner: info.winner,
        winningNumber: info.winningNumber.toString()
      });
    } catch (error) {
      console.error('Error loading lottery info:', error);
      if (!silent) {
        setError('Failed to load lottery information');
        showToast('Failed to load lottery information', 'error');
      }
    } finally {
      if (!silent) {
        setIsLoadingLottery(false);
      }
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

  const loadRequestIdMap = async (lotteryContract) => {
    if (!lotteryContract) return;
    try {
      const filter = lotteryContract.filters.LotteryDrawRequested();
      const logs = await lotteryContract.queryFilter(filter);
      const map = {};
      logs.forEach((log) => {
        const lotteryId = log.args?.lotteryId?.toString?.();
        const requestId = log.args?.requestId?.toString?.();
        if (lotteryId && requestId) {
          map[lotteryId] = requestId;
        }
      });
      if (Object.keys(map).length > 0) {
        setRequestIdByLotteryId((prev) => ({ ...prev, ...map }));
      }
    } catch (error) {
      console.warn('Failed to load lottery requestId map:', error);
    }
  };

  const getLocalAutoFulfillSigner = async () => {
    try {
      const localProvider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
      const localNetwork = await localProvider.getNetwork();
      const isLocalNetwork = Number(localNetwork.chainId) === 31337 || Number(localNetwork.chainId) === 1337;
      if (!isLocalNetwork) return null;
      return await localProvider.getSigner(0);
    } catch (error) {
      console.warn('Unable to use local auto-fulfill signer:', error);
      return null;
    }
  };

  const resolveRequestIdForLottery = async (lotteryContract, lotteryId) => {
    if (!lotteryContract || !lotteryId) return null;

    if (requestIdByLotteryId[lotteryId]) {
      return requestIdByLotteryId[lotteryId];
    }

    try {
      const filter = lotteryContract.filters.LotteryDrawRequested(lotteryId);
      const logs = await lotteryContract.queryFilter(filter);
      if (logs.length > 0) {
        const latest = logs[logs.length - 1];
        const requestId = latest.args?.requestId?.toString?.();
        if (requestId) {
          setRequestIdByLotteryId((prev) => ({ ...prev, [lotteryId]: requestId }));
          return requestId;
        }
      }
    } catch (error) {
      console.warn('Failed to resolve requestId from draw-request logs:', error);
    }

    try {
      const vrfAbi = ['function getRequestIdCounter() external view returns (uint256)'];
      const vrfContract = new ethers.Contract(resolvedVrfCoordinatorAddress, vrfAbi, lotteryContract.runner);
      const counter = await vrfContract.getRequestIdCounter();
      let i = Number(counter) - 1;
      const minRequestId = Math.max(1, i - 40);
      while (i >= minRequestId) {
        const mappedLotteryId = await lotteryContract.requestIdToLotteryId(i);
        if (mappedLotteryId.toString() === lotteryId) {
          const requestId = i.toString();
          setRequestIdByLotteryId((prev) => ({ ...prev, [lotteryId]: requestId }));
          return requestId;
        }
        i -= 1;
      }
    } catch (error) {
      console.warn('Failed fallback requestId scan:', error);
    }

    return null;
  };

  const loadLotteryHistory = async (lotteryContract, options = {}) => {
    const silent = options.silent === true;
    if (!account || !lotteryContract) return;
    if (!silent) {
      setIsLoadingHistory(true);
    }
    try {
      const participatedIds = await lotteryContract.getPlayerLotteries(account);
      const uniqueIds = [...new Set(participatedIds.map((id) => id.toString()))];
      const details = await Promise.all(
        uniqueIds.map(async (id) => {
          const info = await lotteryContract.getLotteryInfo(id);
          const prizePoolGt = parseFloat(ethers.formatEther(info.prizePool.toString()));
          const prizeGt = prizePoolGt * 0.95;
          const winner = info.winner?.toLowerCase?.() || '';
          const accountLower = account.toLowerCase();
          return {
            id,
            totalTickets: info.totalTickets.toString(),
            prizePool: prizePoolGt,
            isDrawn: info.isDrawn,
            isActive: info.isActive,
            winner,
            winningNumber: info.winningNumber.toString(),
            isWinner: info.isDrawn && winner === accountLower,
            prize: prizeGt
          };
        })
      );
      details.sort((a, b) => Number(b.id) - Number(a.id));
      setLotteryHistory(details);
    } catch (historyError) {
      console.error('Error loading lottery history:', historyError);
      if (!silent) {
        showToast('Failed to load lottery history', 'error');
      }
    } finally {
      if (!silent) {
        setIsLoadingHistory(false);
      }
    }
  };

  const handlePurchase = async () => {
    if (!contract || !account) return;
    const pendingUserLottery = lotteryHistory.find((lottery) => !lottery.isDrawn);
    if (pendingUserLottery) {
      const message = 'Please wait for your current round draw result before buying more tickets.';
      setError(message);
      setFlowStage('error');
      showToast(message, 'info');
      return;
    }

    setIsPurchasing(true);
    setFlowStage('submitting');
    setError(null);
    setSuccess(null);

    try {
      const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
      const contractWithSigner = contract.connect(signer);
      const network = await signer.provider.getNetwork();
      const isLocalNetwork = Number(network.chainId) === 31337 || Number(network.chainId) === 1337;

      const tx = await contractWithSigner.purchaseTickets(ticketCount);
      setFlowStage('confirming');
      const receipt = await tx.wait();

      const drawRequestedLog = receipt.logs.find((log) => {
        try {
          const parsed = contract.interface.parseLog(log);
          return parsed.name === 'LotteryDrawRequested';
        } catch (e) {
          return false;
        }
      });

      if (drawRequestedLog) {
        const parsed = contract.interface.parseLog(drawRequestedLog);
        const lotteryId = parsed.args?.lotteryId?.toString?.();
        const requestId = parsed.args?.requestId?.toString?.();

        if (lotteryId && requestId) {
          setRequestIdByLotteryId((prev) => ({ ...prev, [lotteryId]: requestId }));
        }

        if (isLocalNetwork && requestId) {
          try {
            const autoFulfillSigner = await getLocalAutoFulfillSigner();
            if (!autoFulfillSigner) {
              throw new Error('Local auto-fulfill signer unavailable');
            }
            const vrfCoordinatorAbi = ['function fulfillRandomWords(uint256 requestId) external'];
            const vrfCoordinator = new ethers.Contract(resolvedVrfCoordinatorAddress, vrfCoordinatorAbi, autoFulfillSigner);
            const fulfillTx = await vrfCoordinator.fulfillRandomWords(requestId);
            await fulfillTx.wait();
          } catch (fulfillError) {
            console.warn('Manual lottery fulfill failed, waiting for auto retry:', fulfillError);
            showToast('Draw requested. Waiting for random fulfillment...', 'info');
          }
        }
      }

      setSuccess(`Successfully purchased ${ticketCount} ticket(s)!`);
      setFlowStage('done');
      showToast(`Purchased ${ticketCount} ticket(s)`, 'success');
      await loadLotteryInfo(contract);
      await loadLotteryHistory(contract);
      await loadRequestIdMap(contract);
      await loadAllowance(gameTokenContract);
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

  const displayedHistory = showAllHistory ? lotteryHistory : lotteryHistory.slice(0, 3);

  const getHistoryStage = (lottery) => {
    if (!lottery.isDrawn) return 'confirming';
    return 'done';
  };

  const toShortCode = (input) => {
    try {
      const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const hashBytes = ethers.getBytes(ethers.keccak256(ethers.toUtf8Bytes(String(input))));
      let shortCode = '';
      for (let i = 0; i < 6; i += 1) {
        shortCode += alphabet[hashBytes[i] % alphabet.length];
      }
      return shortCode;
    } catch (e) {
      return '------';
    }
  };

  const renderHeaderActions = () => (
    <>
      <button type="button" className="card-link-btn" onClick={onToggleView}>
        {toggleLabel}
      </button>
      <button
        type="button"
        className="card-link-btn"
        onClick={() => setShowAllHistory((prev) => !prev)}
      >
        {showAllHistory ? 'Bet' : 'Games History'}
      </button>
    </>
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

  const normalizedTicketCount = Number.isFinite(ticketCount) && ticketCount > 0 ? ticketCount : 1;
  const totalCostGt = (parseFloat(ticketPrice || '0') * normalizedTicketCount).toString();
  const isApprovalRequired = parseFloat(allowance || '0') < parseFloat(totalCostGt || '0');
  const nowUnix = Math.floor(Date.now() / 1000);
  const pendingUserLottery = lotteryHistory.find((lottery) => !lottery.isDrawn);
  const isPurchaseLockedByPendingDraw = Boolean(pendingUserLottery);
  const currentLotteryCode = toShortCode(`lottery-${lotteryInfo.id}`);
  const currentWinningCode = lotteryInfo.isDrawn
    ? toShortCode(`winning-${lotteryInfo.id}-${lotteryInfo.winningNumber}`)
    : '------';

  const getDrawStatus = () => {
    if (lotteryInfo.isDrawn) {
      return { text: 'Drawn', type: 'ended' };
    }
    if (isPurchaseLockedByPendingDraw) {
      return { text: 'Waiting for Draw Result', type: 'info' };
    }
    if (isPurchasing && flowStage === 'confirming') {
      return { text: 'Requesting', type: 'info' };
    }
    if (!lotteryInfo.isActive) {
      return { text: 'Pending Fulfill', type: 'info' };
    }
    if (Number(lotteryInfo.totalTickets) >= LOTTERY_TICKET_TARGET || nowUnix >= lotteryInfo.endTimeUnix) {
      return { text: 'Ready to Draw', type: 'info' };
    }
    return { text: 'Selling Tickets', type: 'active' };
  };

  const drawStatus = getDrawStatus();

  return (
    <>
      <Card
        title="Lottery Game"
        icon="🎰"
        className="game-card lottery-card"
        headerActions={renderHeaderActions()}
      >
        {!showAllHistory && (
          <>
          <div className="info-box">
            <StatItem label="Lottery ID" value={`#${currentLotteryCode}`} />
            <StatItem label="Start Time" value={lotteryInfo.startTime} />
            <StatItem label="End Time" value={lotteryInfo.endTime} />
            <StatItem label="Prize Pool" value={`${parseFloat(lotteryInfo.prizePool).toFixed(2)} GT`} />
            <StatItem label="Ticket Price" value={`${parseFloat(ticketPrice || '0').toFixed(4)} GT`} />
            <StatItem label="Total Tickets" value={lotteryInfo.totalTickets} />
            <p className="ds-stat-item"><strong>Draw Status:</strong> <StatusTag type={drawStatus.type}>{drawStatus.text}</StatusTag></p>
            {lotteryInfo.isDrawn && (
              <>
                <StatItem label="Winner" value={lotteryInfo.winner} />
                <StatItem label="Winning Number" value={currentWinningCode} />
              </>
            )}
          </div>

          <InlineError message={error} />
          <InlineSuccess message={success} />

          <TransactionStepper
            stage={flowStage}
            actionLabel="Purchase"
            approvalRequired={isApprovalRequired}
          />

          <div className="payout-info">
            <StatItem label="Allowance" value={`${parseFloat(allowance || '0').toFixed(4)} GT`} />
          </div>

          {lotteryInfo.isActive && (
            <div className="purchase-section">
              <h3>{`Purchase Tickets (1 Ticket = ${parseFloat(ticketPrice || '0').toFixed(4)} GT)`}</h3>
              {isPurchaseLockedByPendingDraw && (
                <p className="history-meta-item">
                  <strong>Purchase Locked:</strong>{' '}
                  <StatusTag type="info">Waiting for your current round draw result</StatusTag>
                </p>
              )}
              <Input
                type="number"
                id="ticketCount"
                label="Number of Tickets"
                min="1"
                max="10"
                value={ticketCount}
                onChange={(e) => {
                  const nextValue = Number.parseInt(e.target.value, 10);
                  setTicketCount(Number.isFinite(nextValue) && nextValue > 0 ? nextValue : 1);
                }}
              />
              <p className="cost-info">Total Cost: {parseFloat(totalCostGt).toFixed(4)} GT</p>
              {isPurchaseLockedByPendingDraw ? (
                <Button disabled>
                  Waiting for Draw Result
                </Button>
              ) : isApprovalRequired ? (
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
                  {`Purchase ${normalizedTicketCount} Ticket(s)`}
                </Button>
              )}
            </div>
          )}
          </>
        )}

        <div className="game-history">
          {!showAllHistory && <h3>Recent Games</h3>}
          {isLoadingHistory ? (
            <Skeleton lines={4} />
          ) : lotteryHistory.length === 0 ? (
            <EmptyState
              title="No lottery history yet"
              description="Join your first lottery to see history."
            />
          ) : (
            <div className="history-list">
              {displayedHistory.map((lottery) => (
                <div key={lottery.id} className="history-item">
                  <p><strong>Lottery #{toShortCode(`lottery-${lottery.id}`)}</strong></p>
                  <div className="history-status-box">
                    <TransactionStepper
                      stage={getHistoryStage(lottery)}
                      actionLabel="Purchase"
                      approvalRequired={false}
                      compact
                      hideHint
                    />
                    <div className="history-meta-grid">
                      <p className="history-meta-item"><strong>Total Tickets:</strong> {lottery.totalTickets}</p>
                      <p className="history-meta-item"><strong>Prize Pool:</strong> {lottery.prizePool.toFixed(4)} GT</p>
                      {lottery.isDrawn ? (
                        <>
                          <p className="history-meta-item">
                            <strong>Winning Number:</strong> {toShortCode(`winning-${lottery.id}-${lottery.winningNumber}`)}
                          </p>
                          <p className="history-meta-item">
                            <strong>Result:</strong>{' '}
                            {lottery.isWinner ? (
                              <StatusTag type="active">{`Won ${lottery.prize.toFixed(4)} GT`}</StatusTag>
                            ) : (
                              <StatusTag type="ended">Lost</StatusTag>
                            )}
                          </p>
                        </>
                      ) : (
                        <p className="history-meta-item">
                          <strong>Result:</strong> <StatusTag type="info">Waiting for draw...</StatusTag>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!account && (
          <p className="connect-prompt">Please connect your wallet to participate</p>
        )}
      </Card>

      {resultModal.isOpen && (
        <div className="ds-result-modal-overlay" role="dialog" aria-modal="true">
          <div className={`ds-result-modal ${resultModal.isWinner ? 'ds-result-modal-win' : 'ds-result-modal-lose'}`}>
            {resultModal.isRevealing ? (
              <>
                <h3>🎰 Checking Draw Result...</h3>
                <p>Lottery #{toShortCode(`lottery-${resultModal.lotteryId}`)}</p>
                <div className="ds-result-progress-track">
                  <div
                    className="ds-result-progress-fill"
                    style={{ animationDuration: `${resultModal.progressMs}ms` }}
                  />
                </div>
              </>
            ) : (
              <>
                <h3>{resultModal.isWinner ? '🎉 You Won!' : '😢 You Lost'}</h3>
                <p>Lottery #{toShortCode(`lottery-${resultModal.lotteryId}`)}</p>
                <p>Winning Number: {toShortCode(`winning-${resultModal.lotteryId}-${resultModal.winningNumber}`)}</p>
                <p>
                  {resultModal.isWinner
                    ? `Prize: ${resultModal.prize.toFixed(4)} GT`
                    : 'Better luck next round!'}
                </p>
                <button
                  type="button"
                  className="ds-button ds-button-primary ds-result-modal-btn"
                  onClick={() => setResultModal((prev) => ({ ...prev, isOpen: false }))}
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default LotteryGame;
