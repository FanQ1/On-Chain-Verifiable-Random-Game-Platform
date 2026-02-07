import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const DiceGame = ({ account, contractAddress, abi }) => {
  const [betAmount, setBetAmount] = useState('1');
  const [prediction, setPrediction] = useState(50);
  const [potentialPayout, setPotentialPayout] = useState('0');
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameHistory, setGameHistory] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [contract, setContract] = useState(null);

  useEffect(() => {
    if (window.ethereum && account && contractAddress && abi) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const diceGameContract = new ethers.Contract(contractAddress, abi, provider);
      setContract(diceGameContract);
      loadGameHistory(diceGameContract);
    }
  }, [account, contractAddress, abi]);

  useEffect(() => {
    calculatePayout();
  }, [betAmount, prediction]);

  const calculatePayout = async () => {
    if (!contract) return;
    try {
      const payout = await contract.calculatePayout(
        ethers.parseEther(betAmount),
        prediction
      );
      setPotentialPayout(ethers.formatEther(payout));
    } catch (error) {
      console.error('Error calculating payout:', error);
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
            betAmount: ethers.formatEther(game.betAmount),
            prediction: game.prediction.toString(),
            rollResult: game.rollResult.toString(),
            payout: ethers.formatEther(game.payout),
            isCompleted: game.isCompleted
          };
        })
      );
      setGameHistory(gameDetails.reverse());
    } catch (error) {
      console.error('Error loading game history:', error);
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
      await tx.wait();

      setSuccess('Game started! Waiting for result...');
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
          <p><strong>Potential Payout:</strong> {parseFloat(potentialPayout).toFixed(4)} GT</p>
          <p><strong>Multiplier:</strong> {(parseFloat(potentialPayout) / parseFloat(betAmount)).toFixed(2)}x</p>
        </div>

        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}

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
