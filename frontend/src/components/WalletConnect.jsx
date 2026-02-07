import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const WalletConnect = ({ onConnect, onDisconnect }) => {
  const [account, setAccount] = useState(null);
  const [balance, setBalance] = useState('0');
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    checkConnection();
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', () => window.location.reload());
    }
    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', () => window.location.reload());
      }
    };
  }, []);

  const checkConnection = async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
          setAccount(accounts[0]);
          await updateBalance(accounts[0]);
          if (onConnect) onConnect(accounts[0]);
        }
      } catch (error) {
        console.error('Error checking connection:', error);
      }
    }
  };

  const updateBalance = async (address) => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const balance = await provider.getBalance(address);
      setBalance(ethers.formatEther(balance));
    } catch (error) {
      console.error('Error updating balance:', error);
    }
  };

  const handleAccountsChanged = (accounts) => {
    if (accounts.length === 0) {
      disconnect();
    } else if (accounts[0] !== account) {
      setAccount(accounts[0]);
      updateBalance(accounts[0]);
      if (onConnect) onConnect(accounts[0]);
    }
  };

  const connect = async () => {
    if (!window.ethereum) {
      alert('Please install MetaMask to use this application');
      return;
    }

    setIsConnecting(true);
    try {
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });
      setAccount(accounts[0]);
      await updateBalance(accounts[0]);
      if (onConnect) onConnect(accounts[0]);
    } catch (error) {
      console.error('Error connecting wallet:', error);
      alert('Failed to connect wallet. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    setAccount(null);
    setBalance('0');
    if (onDisconnect) onDisconnect();
  };

  return (
    <div className="wallet-connect">
      {account ? (
        <div className="wallet-info">
          <div className="account">
            {account.slice(0, 6)}...{account.slice(-4)}
          </div>
          <div className="balance">
            {parseFloat(balance).toFixed(4)} ETH
          </div>
          <button className="button" onClick={disconnect}>
            Disconnect
          </button>
        </div>
      ) : (
        <button 
          className="button" 
          onClick={connect} 
          disabled={isConnecting}
        >
          {isConnecting ? <span className="loading"></span> : 'Connect Wallet'}
        </button>
      )}
    </div>
  );
};

export default WalletConnect;
