import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const DiceGame = ({ account, contractAddress, abi, gameTokenAddress, gameTokenAbi }) => {
  const [betAmount, setBetAmount] = useState('1');
  const [prediction, setPrediction] = useState(50);
  const [potentialPayout, setPotentialPayout] = useState('0');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [gameHistory, setGameHistory] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [contract, setContract] = useState(null);
  const [gameTokenContract, setGameTokenContract] = useState(null);
  const [allowance, setAllowance] = useState('0');

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

  const loadGameHistory = async (diceGameContract) => {
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
      await loadAllowance(gameTokenContract);
    } catch (error) {
      console.error('Error approving tokens:', error);
      setError(error.message || 'Failed to approve tokens');
    } finally {
      setIsApproving(false);
    }
  };

  const handlePlay = async () => {
    if (!contract || !account) return;

    setIsPlaying(true);
    setError(null);
    setSuccess(null);

    try {
      const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
      const contractWithSigner = contract.connect(signer);

      const tx = await contractWithSigner.startGame(
        ethers.parseEther(betAmount),
        prediction
      );
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
        const vrfCoordinatorAddress = '0xc5a5C42992dECbae36851359345FE25997F5C42d';
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
      await loadGameHistory(contract);
    } catch (error) {
      console.error('Error starting game:', error);
      setError(error.message || 'Failed to start game');
    } finally {
      setIsPlaying(false);
    }
  };

  return (
    <div className="game-card">
      <h2>🎲 Dice Game</h2>

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
        <div className="input-group">
          <label htmlFor="betAmount">Bet Amount (GT):</label>
          <input
            type="number"
            id="betAmount"
            className="input"
            min="0.001"
            max="10"
            step="0.001"
            value={betAmount}
            onChange={(e) => setBetAmount(e.target.value)}
          />
        </div>

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
          <p><strong>Potential Payout:</strong> {parseFloat(potentialPayout || '0').toFixed(4)} GT</p>
          <p><strong>Multiplier:</strong> {parseFloat(betAmount || '1') > 0 ? (parseFloat(potentialPayout || '0') / parseFloat(betAmount || '1')).toFixed(2) : '0.00'}x</p>
          <p><strong>Allowance:</strong> {parseFloat(allowance || '0').toFixed(4)} GT</p>
        </div>

        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}

        {parseFloat(allowance) < parseFloat(betAmount) ? (
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
            onClick={handlePlay}
            disabled={!account || isPlaying}
          >
            {isPlaying ? (
              <span className="loading"></span>
            ) : (
              'Roll Dice'
            )}
          </button>
        )}

        {!account && (
          <p className="connect-prompt">Please connect your wallet to play</p>
        )}
      </div>

      {gameHistory.length > 0 && (
        <div className="game-history">
          <h3>Recent Games</h3>
          <div className="history-list">
            {gameHistory.map((game) => (
              <div key={game.id} className="history-item">
                <p><strong>Game #{game.id}</strong></p>
                <p>Bet: {parseFloat(game.betAmount).toFixed(4)} GT</p>
                <p>Prediction: {game.prediction}</p>
                <p>Roll: {game.rollResult}</p>
                <p>Result: {parseFloat(game.payout) > 0 ? 
                  `Won ${parseFloat(game.payout).toFixed(4)} GT` : 
                  'Lost'}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DiceGame;
