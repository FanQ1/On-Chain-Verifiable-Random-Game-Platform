# On-Chain Verifiable Random Game Platform

A provably fair on-chain gaming platform that uses Chainlink VRF (Verifiable Random Function) for generating random outcomes.

## Features

- Verifiable randomness using Chainlink VRF
- Multiple game types (Lottery and Dice Game)
- Betting mechanisms with ETH and ERC-20 token support
- Pooled prize mechanism with house edge
- Anti-cheating measures
- Transparent outcome verification

## Games

### 1. Lottery System
- Time-based draws
- Multiple ticket tiers
- Automatic payout system
- No-winner handling mechanism

### 2. Dice Game
- Multiplier betting system
- Instant result verification
- Adjustable risk levels
- Automatic payout

## Tech Stack

- **Smart Contracts**: Solidity
- **Development Framework**: Hardhat
- **Randomness**: Chainlink VRF v2
- **Frontend**: React + Web3.js
- **Testing**: Hardhat Test

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Git

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd blockchain
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```
PRIVATE_KEY=your_private_key
SEPOLIA_RPC_URL=your_sepolia_rpc_url
CHAINLINK_VRF_COORDINATOR=your_vrf_coordinator_address
CHAINLINK_VRF_SUBSCRIPTION_ID=your_subscription_id
CHAINLINK_VRF_KEY_HASH=your_key_hash
```

### Deployment

1. Deploy to local network
```bash
npx hardhat node
npx hardhat run scripts/deploy.js --network localhost
```

2. Deploy to Sepolia testnet
```bash
npx hardhat run scripts/deploy.js --network sepolia
```

### Running the Frontend

1. Navigate to frontend directory
```bash
cd frontend
npm install
npm start
```

2. Open http://localhost:3000 in your browser

## Smart Contracts

### Core Contracts

- `GameToken.sol`: ERC-20 token for betting
- `Lottery.sol`: Lottery game implementation
- `DiceGame.sol`: Dice game implementation
- `VRFCoordinatorV2Mock.sol`: Mock VRF coordinator for testing

### Key Features

- Verifiable randomness using Chainlink VRF
- Commit-reveal schemes for fairness
- Time-locked reveals
- Slashing for malicious behavior
- Automatic payout system

## Testing

Run all tests:
```bash
npx hardhat test
```

Run specific test file:
```bash
npx hardhat test test/Lottery.test.js
```

## Security Considerations

- All randomness is generated using Chainlink VRF
- Commit-reveal schemes prevent front-running
- Time-locked mechanisms prevent MEV exploitation
- House edge is transparent and verifiable
- Slashing mechanisms for malicious behavior

## License

MIT
