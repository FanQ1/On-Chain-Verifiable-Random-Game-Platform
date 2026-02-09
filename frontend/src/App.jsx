import React, { useState, useEffect } from 'react';
import WalletConnect from './components/WalletConnect';
import LotteryGame from './components/LotteryGame';
import DiceGame from './components/DiceGame';
import './index.css';

function App() {
  const [account, setAccount] = useState(null);
  const [contracts, setContracts] = useState({
    gameToken: { address: null, abi: null },
    lottery: { address: null, abi: null },
    diceGame: { address: null, abi: null }
  });

  useEffect(() => {
    loadContractInfo();
  }, []);

  const loadContractInfo = async () => {
    try {
      // Load deployment info
      const response = await fetch('/deployment-info.json');
      const deploymentInfo = await response.json();

      setContracts({
        gameToken: {
          address: deploymentInfo.contracts.GameToken,
          abi: require('./contracts/GameToken.json').abi
        },
        lottery: {
          address: deploymentInfo.contracts.Lottery,
          abi: require('./contracts/Lottery.json').abi
        },
        diceGame: {
          address: deploymentInfo.contracts.DiceGame,
          abi: require('./contracts/DiceGame.json').abi
        }
      });
    } catch (error) {
      console.error('Error loading contract info:', error);
    }
  };

  const handleConnect = (connectedAccount) => {
    setAccount(connectedAccount);
  };

  const handleDisconnect = () => {
    setAccount(null);
  };

  return (
    <div className="App">
      <div className="container">
        <header className="header">
          <h1>🎮 On-Chain Random Game Platform</h1>
          <WalletConnect 
            onConnect={handleConnect} 
            onDisconnect={handleDisconnect}
          />
        </header>

        <main>
          <section className="game-container">
            {contracts.lottery.address && contracts.lottery.abi && (
              <LotteryGame
                account={account}
                contractAddress={contracts.lottery.address}
                abi={contracts.lottery.abi}
                gameTokenAddress={contracts.gameToken.address}
                gameTokenAbi={contracts.gameToken.abi}
              />
            )}

            {contracts.diceGame.address && contracts.diceGame.abi && (
              <DiceGame
                account={account}
                contractAddress={contracts.diceGame.address}
                abi={contracts.diceGame.abi}
                gameTokenAddress={contracts.gameToken.address}
                gameTokenAbi={contracts.gameToken.abi}
              />
            )}
          </section>

          <section className="info-section">
            <div className="info-box">
              <h2>About Our Platform</h2>
              <p>
                Welcome to our provably fair on-chain gaming platform! We use 
                Chainlink VRF (Verifiable Random Function) to ensure that all 
                game outcomes are truly random and verifiable.
              </p>
              <h3>Key Features:</h3>
              <ul>
                <li>✓ Verifiable randomness using Chainlink VRF</li>
                <li>✓ Multiple game types (Lottery and Dice Game)</li>
                <li>✓ Betting mechanisms with ERC-20 token support</li>
                <li>✓ Pooled prize mechanism with transparent house edge</li>
                <li>✓ Anti-cheating measures</li>
                <li>✓ Transparent outcome verification</li>
              </ul>
            </div>

            <div className="info-box">
              <h2>How It Works</h2>
              <h3>Lottery Game:</h3>
              <ol>
                <li>Purchase tickets for the current lottery</li>
                <li>Wait for the lottery draw (either time-based or when minimum players reached)</li>
                <li>Chainlink VRF generates a random winning number</li>
                <li>Winner receives the prize pool (minus house edge)</li>
              </ol>

              <h3>Dice Game:</h3>
              <ol>
                <li>Place your bet and choose your prediction</li>
                <li>Chainlink VRF generates a random dice roll</li>
                <li>If roll ≤ prediction, you win based on multiplier</li>
                <li>Payout is automatically transferred to your wallet</li>
              </ol>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
