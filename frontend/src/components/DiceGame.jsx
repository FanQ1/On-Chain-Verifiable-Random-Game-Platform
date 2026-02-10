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

const DiceGame = ({ account, contractAddress, abi, gameTokenAddress, gameTokenAbi }) => {
  const [betAmount, setBetAmount] = useState('1');
  const [prediction, setPrediction] = useState(50);
  const [potentialPayout, setPotentialPayout] = useState('0');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [gameHistory, setGameHistory] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [contract, setContract] = useState(null);
  const [gameTokenContract, setGameTokenContract] = useState(null);
  const [allowance, setAllowance] = useState('0');
  const [tokenBalance, setTokenBalance] = useState('0');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [flowStage, setFlowStage] = useState('idle');
  const { showToast } = useToast();

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
      loadTokenBalance(gameToken);
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
      setError('Error calculating payout: ' + error.message);
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

  const loadGameHistory = async (diceGameContract) => {
    if (!account) return;
    setIsLoadingHistory(true);
    try {
      const games = await diceGameContract.getPlayerGames(account);
      const gameDetails = await Promise.all(
        games.slice(-5).map(async (gameId) => {
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
      setError(error.message || 'Failed to approve tokens');
      setFlowStage('error');
      showToast('Approval failed', 'error');
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
        const gameId = parsed.args.gameId;

        // Manually fulfill the random words request
        // This is a workaround for the local testing environment
        // In production, this would be done automatically by the Chainlink VRF
        const vrfCoordinatorAddress = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
        const vrfCoordinatorAbi = [
          'function fulfillRandomWords(uint256 requestId) external'
        ];
        const vrfCoordinator = new ethers.Contract(vrfCoordinatorAddress, vrfCoordinatorAbi, signer);

        // The requestId is the gameId + 1 (because requestId starts from 1)
        // Convert BigInt to number before adding 1
        const gameIdNumber = typeof gameId === 'bigint' ? Number(gameId) : gameId;
        const requestId = gameIdNumber + 1;
        await vrfCoordinator.fulfillRandomWords(requestId);
      }

      setSuccess('Game completed!');
      setFlowStage('done');
      showToast('Game completed', 'success');
      await loadGameHistory(contract);
    } catch (error) {
      console.error('Error starting game:', error);
      setError(error.message || 'Failed to start game');
      setFlowStage('error');
      showToast('Failed to start game', 'error');
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

  return (
    <Card title="Dice Game" icon="🎲" className="game-card dice-card">

      {account && (
        <div className="token-balance">
          <span className="token-balance-label">GT Balance</span>
          <span className="token-balance-value">{parseFloat(tokenBalance || '0').toFixed(2)} GT</span>
        </div>
      )}

      {parseFloat(tokenBalance) === 0 && account && (
        <div className="mint-section">
          <p className="mint-info">Get 10000 GT for 0.01 ETH</p>
          <Button
            variant="accent"
            fullWidth
            onClick={handleMintWithEth}
            disabled={!account || isMinting}
            loading={isMinting}
          >
            Get GT
          </Button>
        </div>
      )}

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

      <div className="game-history">
        <h3>Recent Games</h3>
        {isLoadingHistory ? (
          <Skeleton lines={4} />
        ) : gameHistory.length === 0 ? (
          <EmptyState
            title="No games yet"
            description="Play your first round to see game history."
          />
        ) : (
          <div className="history-list">
            {gameHistory.map((game) => (
              <div key={game.id} className="history-item">
                <p><strong>Game #{game.id}</strong></p>
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
          </div>
        )}
      </div>
    </Card>
  );
};

export default DiceGame;
