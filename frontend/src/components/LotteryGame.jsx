import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const LotteryGame = ({ account, contractAddress, abi }) => {
  const [lotteryInfo, setLotteryInfo] = useState(null);
  const [ticketCount, setTicketCount] = useState(1);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [contract, setContract] = useState(null);

  useEffect(() => {
    if (window.ethereum && account && contractAddress && abi) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const lotteryContract = new ethers.Contract(contractAddress, abi, provider);
      setContract(lotteryContract);
      loadLotteryInfo(lotteryContract);
    }
  }, [account, contractAddress, abi]);

  const loadLotteryInfo = async (lotteryContract) => {
    try {
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
      await loadLotteryInfo(contract);
    } catch (error) {
      console.error('Error purchasing tickets:', error);
      setError(error.message || 'Failed to purchase tickets');
    } finally {
      setIsPurchasing(false);
    }
  };

  if (!lotteryInfo) {
    return <div className="loading-container">Loading lottery information...</div>;
  }

  return (
    <div className="game-card">
      <h2>🎰 Lottery Game</h2>

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

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      {lotteryInfo.isActive && (
        <div className="purchase-section">
          <h3>Purchase Tickets</h3>
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
        </div>
      )}

      {!account && (
        <p className="connect-prompt">Please connect your wallet to participate</p>
      )}
    </div>
  );
};

export default LotteryGame;
