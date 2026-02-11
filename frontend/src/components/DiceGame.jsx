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

const DiceGame = ({
  account,
  contractAddress,
  abi,
  gameTokenAddress,
  gameTokenAbi,
  onToggleView,
  toggleLabel = 'Dice Game'
}) => {
  const LOCAL_VRF_COORDINATOR = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
  const AUTO_RETRY_INTERVAL_MS = 8000;
  const [betAmount, setBetAmount] = useState('1');
  const [prediction, setPrediction] = useState(50);
  const [potentialPayout, setPotentialPayout] = useState('0');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [gameHistory, setGameHistory] = useState([]);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [contract, setContract] = useState(null);
  const [gameTokenContract, setGameTokenContract] = useState(null);
  const [allowance, setAllowance] = useState('0');
  const [requestIdByGameId, setRequestIdByGameId] = useState({});
  const [isRetryingFulfill, setIsRetryingFulfill] = useState(false);
  const [lastFulfillRetryAt, setLastFulfillRetryAt] = useState(0);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [flowStage, setFlowStage] = useState('idle');
  const [resultModal, setResultModal] = useState({
    isOpen: false,
    isRevealing: false,
    progressMs: 1000,
    won: false,
    gameId: '',
    rollResult: '',
    payout: '0'
  });
  const isHistoryInitializedRef = useRef(false);
  const notifiedGameIdsRef = useRef(new Set());
  const revealTimerRef = useRef(null);
  const { showToast } = useToast();

  useAutoDismiss(error, setError, null);
  useAutoDismiss(success, setSuccess, null);

  useEffect(() => {
    if (window.ethereum && account && contractAddress && abi) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const diceGameContract = new ethers.Contract(contractAddress, abi, provider);
      setContract(diceGameContract);
      loadGameHistory(diceGameContract);
    }

    if (window.ethereum && account && gameTokenAddress && gameTokenAbi) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const gameToken = new ethers.Contract(gameTokenAddress, gameTokenAbi, provider);
      setGameTokenContract(gameToken);
      loadAllowance(gameToken);
    }
  }, [account, contractAddress, abi, gameTokenAddress, gameTokenAbi]);

  useEffect(() => {
    calculatePayout();
  }, [betAmount, prediction]);

  useEffect(() => {
    if (!account) {
      setFlowStage('idle');
      return;
    }

    if (!isApproving && !isPlaying) {
      setFlowStage(parseFloat(allowance || '0') >= parseFloat(betAmount || '0') ? 'ready' : 'idle');
    }
  }, [account, allowance, betAmount, isApproving, isPlaying]);

  useEffect(() => {
    if (!contract || !account) return undefined;

    const hasPendingGame = gameHistory.some(
      (game) => !game.isCompleted || parseInt(game.rollResult, 10) === 0
    );
    if (!hasPendingGame) return undefined;

    const intervalId = setInterval(() => {
      loadGameHistory(contract);
    }, 2000);

    return () => clearInterval(intervalId);
  }, [contract, account, gameHistory]);

  useEffect(() => {
    if (!contract || !account) return;
    loadRequestIdMap(contract);
  }, [contract, account]);

  useEffect(() => {
    const autoRetryFulfill = async () => {
      if (!window.ethereum || !contract || !account || isPlaying || isRetryingFulfill) return;

      const pendingGame = gameHistory.find(
        (game) => !game.isCompleted || parseInt(game.rollResult, 10) === 0
      );
      if (!pendingGame) return;

      const requestId = requestIdByGameId[pendingGame.id];
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

        const signer = await provider.getSigner();
        const vrfCoordinatorAbi = ['function fulfillRandomWords(uint256 requestId) external'];
        const vrfCoordinator = new ethers.Contract(LOCAL_VRF_COORDINATOR, vrfCoordinatorAbi, signer);
        const tx = await vrfCoordinator.fulfillRandomWords(requestId);
        await tx.wait();

        await loadGameHistory(contract);
      } catch (error) {
        console.warn('Auto retry fulfill failed:', error);
      } finally {
        setIsRetryingFulfill(false);
      }
    };

    autoRetryFulfill();
  }, [
    contract,
    account,
    gameHistory,
    requestIdByGameId,
    isPlaying,
    isRetryingFulfill,
    lastFulfillRetryAt
  ]);

  useEffect(() => {
    if (!gameHistory.length) return;

    if (!isHistoryInitializedRef.current) {
      gameHistory.forEach((game) => {
        if (game.isCompleted && parseInt(game.rollResult, 10) > 0) {
          notifiedGameIdsRef.current.add(String(game.id));
        }
      });
      isHistoryInitializedRef.current = true;
      return;
    }

    const newlyCompletedGame = gameHistory.find((game) => (
      game.isCompleted &&
      parseInt(game.rollResult, 10) > 0 &&
      !notifiedGameIdsRef.current.has(String(game.id))
    ));

    if (!newlyCompletedGame) return;

    notifiedGameIdsRef.current.add(String(newlyCompletedGame.id));
    const randomProgressMs = 800 + Math.floor(Math.random() * 1001);
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
    }
    setResultModal({
      isOpen: true,
      isRevealing: true,
      progressMs: randomProgressMs,
      won: parseFloat(newlyCompletedGame.payout) > 0,
      gameId: newlyCompletedGame.id,
      rollResult: newlyCompletedGame.rollResult,
      payout: newlyCompletedGame.payout
    });

    revealTimerRef.current = setTimeout(() => {
      setResultModal((prev) => ({ ...prev, isRevealing: false }));
      revealTimerRef.current = null;
    }, randomProgressMs);
  }, [gameHistory]);

  useEffect(() => () => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
    }
  }, []);

  const calculatePayout = async () => {
    if (!contract) return;
    try {
      const betAmountWei = ethers.parseEther(betAmount);
      console.log('Calculating payout for betAmount:', betAmountWei, 'prediction:', prediction);
      const payout = await contract.calculatePayout(
        betAmountWei,
        prediction
      );
      console.log('Payout:', payout);
      // Convert BigInt to string before formatting
      const payoutString = payout.toString();
      setPotentialPayout(ethers.formatEther(payoutString));
    } catch (error) {
      console.error('Error calculating payout:', error);
      setError(getFriendlyError(error, 'Payout calculation failed. Please check your input and try again.'));
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

  const loadRequestIdMap = async (diceGameContract) => {
    if (!account || !diceGameContract) return;
    try {
      const filter = diceGameContract.filters.GameStarted(null, account);
      const logs = await diceGameContract.queryFilter(filter);
      const map = {};
      logs.forEach((log) => {
        const gameId = log.args?.gameId?.toString?.();
        const requestId = log.args?.requestId?.toString?.();
        if (gameId && requestId) {
          map[gameId] = requestId;
        }
      });
      if (Object.keys(map).length > 0) {
        setRequestIdByGameId((prev) => ({ ...prev, ...map }));
      }
    } catch (error) {
      console.warn('Failed to load requestId map:', error);
    }
  };

  const loadGameHistory = async (diceGameContract) => {
    if (!account) return;
    setIsLoadingHistory(true);
    try {
      const games = await diceGameContract.getPlayerGames(account);
      const gameDetails = await Promise.all(
        games.map(async (gameId) => {
          const game = await diceGameContract.getGame(gameId);
          return {
            id: gameId.toString(),
            betAmount: ethers.formatEther(game.betAmount.toString()),
            prediction: game.prediction.toString(),
            rollResult: game.rollResult.toString(),
            payout: ethers.formatEther(game.payout.toString()),
            isCompleted: game.isCompleted
          };
        })
      );
      setGameHistory(gameDetails.reverse());
    } catch (error) {
      console.error('Error loading game history:', error);
      showToast('Failed to load game history', 'error');
    } finally {
      setIsLoadingHistory(false);
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

  const handlePlay = async () => {
    if (!contract || !account) return;

    setIsPlaying(true);
    setFlowStage('submitting');
    setError(null);
    setSuccess(null);

    try {
      const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
      const contractWithSigner = contract.connect(signer);
      const network = await signer.provider.getNetwork();
      const isLocalNetwork = Number(network.chainId) === 31337 || Number(network.chainId) === 1337;

      const tx = await contractWithSigner.startGame(
        ethers.parseEther(betAmount),
        prediction
      );
      setFlowStage('confirming');
      const receipt = await tx.wait();

      // Get the requestId from the event
      const event = receipt.logs.find(log => {
        try {
          const parsed = contract.interface.parseLog(log);
          return parsed.name === 'GameStarted';
        } catch (e) {
          return false;
        }
      });

      if (event) {
        const parsed = contract.interface.parseLog(event);
        const gameId = parsed.args.gameId?.toString();
        const requestId = parsed.args.requestId;
        if (gameId && requestId !== undefined) {
          setRequestIdByGameId((prev) => ({
            ...prev,
            [gameId]: requestId.toString()
          }));
        }

        // Manually fulfill only on local hardhat chain.
        if (isLocalNetwork) {
          try {
            const vrfCoordinatorAbi = [
              'function fulfillRandomWords(uint256 requestId) external'
            ];
            const vrfCoordinator = new ethers.Contract(LOCAL_VRF_COORDINATOR, vrfCoordinatorAbi, signer);
            const fulfillTx = await vrfCoordinator.fulfillRandomWords(requestId);
            await fulfillTx.wait();
          } catch (fulfillError) {
            console.warn('Manual fulfill failed after startGame:', fulfillError);
            setSuccess('Game started. Waiting for random result...');
            setFlowStage('confirming');
            showToast('Game started, waiting for result', 'info');
            await loadGameHistory(contract);
            return;
          }
        }
      }

      setSuccess('Game completed!');
      setFlowStage('done');
      showToast('Game completed', 'success');
      await loadGameHistory(contract);
    } catch (error) {
      console.error('Error starting game:', error);
      const message = getFriendlyError(error, 'Failed to start game. Please try again.');
      setError(message);
      setFlowStage('error');
      showToast(message, 'error');
    } finally {
      setIsPlaying(false);
    }
  };

  const getHistoryStage = (game) => {
    if (!game.isCompleted || parseInt(game.rollResult, 10) === 0) {
      return 'confirming';
    }
    return 'done';
  };

  const displayedHistory = showAllHistory ? gameHistory : gameHistory.slice(0, 3);
  const settledGames = gameHistory.filter(
    (game) => game.isCompleted && parseInt(game.rollResult, 10) > 0
  );
  const wonGamesCount = settledGames.filter(
    (game) => (parseFloat(game.payout) || 0) > 0
  ).length;
  const winRate = settledGames.length > 0
    ? (wonGamesCount / settledGames.length) * 100
    : 0;
  const totalNetPnl = settledGames.reduce((sum, game) => {
    const payout = parseFloat(game.payout) || 0;
    const bet = parseFloat(game.betAmount) || 0;
    return sum + (payout - bet);
  }, 0);
  const getHistoryCategory = (game) => {
    if (!game.isCompleted || parseInt(game.rollResult, 10) === 0) return 'waiting';
    return parseFloat(game.payout) > 0 ? 'won' : 'lost';
  };
  const filteredHistory = showAllHistory
    ? displayedHistory.filter((game) => {
      if (historyFilter === 'all') return true;
      return getHistoryCategory(game) === historyFilter;
    })
    : displayedHistory;

  const renderHeaderActions = () => (
    <>
      <button type="button" className="card-link-btn" onClick={onToggleView}>
        {toggleLabel}
      </button>
      <button
        type="button"
        className="card-link-btn"
        onClick={() => {
          setShowAllHistory((prev) => !prev);
          setHistoryFilter('all');
        }}
      >
        {showAllHistory ? 'Bet' : 'Games History'}
      </button>
    </>
  );

  return (
    <>
      <Card
        title="Dice Game"
        icon="🎲"
      className={`game-card dice-card ${showAllHistory ? 'dice-card-all-history' : ''}`}
        headerActions={renderHeaderActions()}
      >
        {!showAllHistory && (
          <>
            <div className="info-box">
            <p><strong>Rules:</strong></p>
            <ul>
              <li>Predict a number between 1 and 100</li>
              <li>If the dice roll is less than or equal to your prediction, you win!</li>
              <li>Higher predictions = Lower multiplier, Higher chance</li>
              <li>Lower predictions = Higher multiplier, Lower chance</li>
              <li>House edge: 3%</li>
            </ul>
          </div>

            <div className="game-controls">
            <Input
              type="number"
              id="betAmount"
              label="Bet Amount (GT)"
              min="0.001"
              max="10"
              step="0.001"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
            />

            <div className="input-group">
              <label htmlFor="prediction">Prediction (1-100):</label>
              <input
                type="range"
                id="prediction"
                className="input"
                min="1"
                max="100"
                value={prediction}
                onChange={(e) => setPrediction(parseInt(e.target.value))}
              />
              <div className="prediction-value">
                <span className="prediction-number">{prediction}</span>
                <span className="win-chance">
                  Win Chance: {prediction}%
                </span>
              </div>
            </div>

            <div className="payout-info">
              <StatItem label="Potential Payout" value={`${parseFloat(potentialPayout || '0').toFixed(4)} GT`} />
              <StatItem label="Multiplier" value={`${parseFloat(betAmount || '1') > 0 ? (parseFloat(potentialPayout || '0') / parseFloat(betAmount || '1')).toFixed(2) : '0.00'}x`} />
              <StatItem label="Allowance" value={`${parseFloat(allowance || '0').toFixed(4)} GT`} />
            </div>

            <InlineError message={error} />
            <InlineSuccess message={success} />

            <TransactionStepper
              stage={flowStage}
              actionLabel="Play"
              approvalRequired={parseFloat(allowance) < parseFloat(betAmount || '0')}
            />

            {parseFloat(allowance) < parseFloat(betAmount) ? (
              <Button
                onClick={handleApprove}
                disabled={!account || isApproving}
                loading={isApproving}
              >
                Approve Tokens
              </Button>
            ) : (
              <Button
                onClick={handlePlay}
                disabled={!account || isPlaying}
                loading={isPlaying}
              >
                Roll Dice
              </Button>
            )}

            {!account && (
              <p className="connect-prompt">Please connect your wallet to play</p>
            )}
            </div>
          </>
        )}

      <div className={`game-history ${showAllHistory ? 'game-history-all' : ''}`}>
          {!showAllHistory && <h3>Recent Games</h3>}
          {showAllHistory && (
            <div className="history-filter-row">
            <button
              type="button"
              className={`card-link-btn history-filter-btn ${historyFilter === 'all' ? 'history-filter-active' : ''}`}
              onClick={() => setHistoryFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`card-link-btn history-filter-btn ${historyFilter === 'won' ? 'history-filter-active' : ''}`}
              onClick={() => setHistoryFilter('won')}
            >
              Won
            </button>
            <button
              type="button"
              className={`card-link-btn history-filter-btn ${historyFilter === 'lost' ? 'history-filter-active' : ''}`}
              onClick={() => setHistoryFilter('lost')}
            >
              Lost
            </button>
            <button
              type="button"
              className={`card-link-btn history-filter-btn ${historyFilter === 'waiting' ? 'history-filter-active' : ''}`}
              onClick={() => setHistoryFilter('waiting')}
            >
              Waiting for result...
            </button>
            </div>
          )}
        {showAllHistory && (
          <div className="payout-info">
            <StatItem label="Settled Games" value={settledGames.length.toString()} />
            <StatItem label="Win Rate" value={`${winRate.toFixed(1)}%`} />
            <p className="ds-stat-item">
              <strong>Net P/L:</strong>{' '}
              <StatusTag type={totalNetPnl >= 0 ? 'active' : 'ended'}>
                {`${totalNetPnl >= 0 ? '+' : ''}${totalNetPnl.toFixed(4)} GT`}
              </StatusTag>
            </p>
          </div>
        )}
          {isLoadingHistory ? (
            <Skeleton lines={4} />
          ) : gameHistory.length === 0 ? (
            <EmptyState
              title="No games yet"
              description="Play your first round to see game history."
            />
          ) : (
            <div className="history-list">
            {filteredHistory.map((game) => (
              <div key={game.id} className="history-item">
                <p><strong>Game #{Number(game.id) + 1}</strong></p>
                <div className="history-status-box">
                  <TransactionStepper
                    stage={getHistoryStage(game)}
                    actionLabel="Play"
                    approvalRequired={false}
                    compact
                    hideHint
                  />
                  <div className="history-meta-grid">
                    <p className="history-meta-item"><strong>Bet:</strong> {parseFloat(game.betAmount).toFixed(4)} GT</p>
                    <p className="history-meta-item"><strong>Prediction:</strong> {game.prediction}</p>
                    {parseInt(game.rollResult) === 0 || !game.isCompleted ? (
                      <p className="history-meta-item">
                        <strong>Result:</strong> <StatusTag type="info">Waiting for result...</StatusTag>
                      </p>
                    ) : (
                      <>
                        <p className="history-meta-item"><strong>Roll:</strong> {game.rollResult}</p>
                        <p className="history-meta-item">
                          <strong>Result:</strong>{' '}
                          {parseFloat(game.payout) > 0 ? (
                            <StatusTag type="active">{`Won ${parseFloat(game.payout).toFixed(4)} GT`}</StatusTag>
                          ) : (
                            <StatusTag type="ended">Lost</StatusTag>
                          )}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {filteredHistory.length === 0 && (
              <EmptyState
                title="No matching games"
                description="Try another filter."
              />
            )}
            </div>
          )}
        </div>
      </Card>

      {resultModal.isOpen && (
        <div className="ds-result-modal-overlay" role="dialog" aria-modal="true">
          <div className={`ds-result-modal ${resultModal.won ? 'ds-result-modal-win' : 'ds-result-modal-lose'}`}>
            {resultModal.isRevealing ? (
              <>
                <h3>🎲 Checking Result...</h3>
                <p>Game #{Number(resultModal.gameId) + 1}</p>
                <div className="ds-result-progress-track">
                  <div
                    className="ds-result-progress-fill"
                    style={{ animationDuration: `${resultModal.progressMs}ms` }}
                  />
                </div>
              </>
            ) : (
              <>
                <h3>{resultModal.won ? '🎉 You Won!' : '😢 You Lost'}</h3>
                <p>Game #{Number(resultModal.gameId) + 1}</p>
                <p>Roll: {resultModal.rollResult}</p>
                <p>
                  {resultModal.won
                    ? `Payout: ${parseFloat(resultModal.payout).toFixed(4)} GT`
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

export default DiceGame;
