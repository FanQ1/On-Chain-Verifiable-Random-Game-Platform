import React, { useState, useEffect } from 'react';
import WalletConnect from './components/WalletConnect';
import LotteryGame from './components/LotteryGame';
import DiceGame from './components/DiceGame';
import WalletHubCard from './components/WalletHubCard';
import './index.css';

const resolveRoute = (pathname) => {
  if (pathname === '/lottery') return 'lottery';
  if (pathname === '/dice') return 'dice';
  return 'home';
};

const routePathMap = {
  home: '/',
  lottery: '/lottery',
  dice: '/dice'
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    localStorage.getItem('metaMaskAuthenticated') === 'true'
  );
  const [account, setAccount] = useState(localStorage.getItem('metaMaskAccount'));
  const [contracts, setContracts] = useState({
    gameToken: { address: null, abi: null },
    lottery: { address: null, abi: null },
    diceGame: { address: null, abi: null }
  });
  const [currentRoute, setCurrentRoute] = useState(resolveRoute(window.location.pathname));

  useEffect(() => {
    loadContractInfo();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      window.location.href = '/login.html';
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentRoute(resolveRoute(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
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
    localStorage.setItem('metaMaskAuthenticated', 'true');
    localStorage.setItem('metaMaskAccount', connectedAccount);
    setIsAuthenticated(true);
  };

  const handleDisconnect = () => {
    setAccount(null);
    localStorage.removeItem('metaMaskAuthenticated');
    localStorage.removeItem('metaMaskAccount');
    setIsAuthenticated(false);
    window.location.href = '/login.html';
  };

  const navigateTo = (routeKey) => {
    const nextPath = routePathMap[routeKey] || '/';
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setCurrentRoute(routeKey);
  };

  const renderGameViews = () => {
    if (currentRoute === 'lottery') {
      return (
        <section className="game-container single-game-container">
          {contracts.lottery.address && contracts.lottery.abi && (
            <LotteryGame
              account={account}
              contractAddress={contracts.lottery.address}
              abi={contracts.lottery.abi}
              gameTokenAddress={contracts.gameToken.address}
              gameTokenAbi={contracts.gameToken.abi}
              onToggleView={() => navigateTo('home')}
              toggleLabel="Return"
            />
          )}
        </section>
      );
    }

    if (currentRoute === 'dice') {
      return (
        <section className="game-container single-game-container">
          {contracts.diceGame.address && contracts.diceGame.abi && (
            <DiceGame
              account={account}
              contractAddress={contracts.diceGame.address}
              abi={contracts.diceGame.abi}
              gameTokenAddress={contracts.gameToken.address}
              gameTokenAbi={contracts.gameToken.abi}
              onToggleView={() => navigateTo('home')}
              toggleLabel="Return"
            />
          )}
        </section>
      );
    }

    return (
      <section className="game-container">
        {contracts.lottery.address && contracts.lottery.abi && (
          <LotteryGame
            account={account}
            contractAddress={contracts.lottery.address}
            abi={contracts.lottery.abi}
            gameTokenAddress={contracts.gameToken.address}
            gameTokenAbi={contracts.gameToken.abi}
            onToggleView={() => navigateTo('lottery')}
            toggleLabel="Lottery Game"
          />
        )}

        {contracts.diceGame.address && contracts.diceGame.abi && (
          <DiceGame
            account={account}
            contractAddress={contracts.diceGame.address}
            abi={contracts.diceGame.abi}
            gameTokenAddress={contracts.gameToken.address}
            gameTokenAbi={contracts.gameToken.abi}
            onToggleView={() => navigateTo('dice')}
            toggleLabel="Dice Game"
          />
        )}
      </section>
    );
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="App">
      <div className="container">
        <header className="header">
          <div className="brand-block">
            <h1>🎮 On-Chain Random Game Platform</h1>
            <p className="header-subtitle">Provably fair gaming powered by on-chain randomness</p>
          </div>
          <WalletConnect 
            onConnect={handleConnect} 
            onDisconnect={handleDisconnect}
          />
        </header>

        <main className="app-main">
          <WalletHubCard
            account={account}
            gameTokenAddress={contracts.gameToken.address}
            gameTokenAbi={contracts.gameToken.abi}
          />

          {renderGameViews()}

          {currentRoute === 'home' && (
          <section className="info-section">
            <h2 className="section-title">Platform Guide</h2>
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
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
