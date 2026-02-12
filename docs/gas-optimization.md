# Gas Optimization

This document describes gas-related optimizations and configuration present in the codebase.

---

## A. Gas Optimization Techniques

### Immutable Variables

- **DiceGame**: `vrfCoordinator` and `gameToken` are declared `immutable`. The VRF parameters `keyHash` and `subscriptionId` are stored in `internal immutable` variables. These are set in the constructor and never change, reducing deployment and read costs compared to storage.
- **Lottery**: Same pattern — `vrfCoordinator` and `gameToken` are `immutable`; `keyHash` and `subscriptionId` are `internal immutable`.

### Constants

- **DiceGame**: `callbackGasLimit` (100000), `numWords` (1), `HOUSE_EDGE` (3), and `DICE_SIDES` (100) are declared `constant` or `internal constant`, so they are inlined and do not use storage.
- **Lottery**: `callbackGasLimit`, `numWords`, `HOUSE_EDGE` (5), `MIN_PLAYERS` (50), `MAX_PLAYERS` (50), and `DRAW_INTERVAL` (1 days) are constants.
- **GameToken**: `MAX_SUPPLY` is a `constant`.
- **VRFCoordinatorV2Mock**: `MOCK_FEE` is a private constant.

### Compiler Optimizer

- **hardhat.config.js** enables the Solidity optimizer with `enabled: true` and `runs: 200`. This reduces bytecode size and runtime gas at the cost of higher deployment cost; 200 runs is a common choice for contract size and execution balance.

### Bounded Loops

- **Lottery.purchaseTickets**: The loop `for (uint256 i = 0; i < ticketCount; i++)` is bounded because `lottery.totalTickets + ticketCount <= MAX_PLAYERS` (50), so `ticketCount` is at most 50.
- **Lottery.handleNoWinner**: The refund loop runs over `lottery.totalTickets`, which never exceeds `MAX_PLAYERS` (50). This avoids unbounded iteration and keeps gas predictable.
- **VRFCoordinatorV2Mock._fulfillRandomWords**: The loop over `numWords` uses a fixed parameter (e.g. 1 in the public `fulfillRandomWords`), so it is bounded.

### Storage and Memory Usage

- **DiceGame.getGame** and **Lottery.getLotteryInfo** return structs in `memory`, so callers pay for memory copy rather than the contract performing repeated storage reads in a loop.
- Game and lottery state is stored in mappings keyed by id (`games[gameId]`, `lotteries[lotteryId]`), which is a standard and gas-efficient pattern for indexed access.

### No Unchecked Blocks

The contracts do not use `unchecked` blocks. All arithmetic is in Solidity 0.8.x and therefore checked for overflow/underflow by default. There are no explicit gas-saving unchecked blocks in the codebase.

### Revert Messages

The contracts use `require(condition, "string message")` for reverts. Custom errors (Solidity custom errors) are not used; switching to custom errors would reduce deployment and revert gas in a future change but is not present in the current implementation.

### Struct and Storage Layout

- **DiceGame.Game** and **Lottery.LotteryInfo** use multiple `uint256` and related types. No explicit struct packing (e.g. uint128, uint96) is applied; all fields are full-width. Packing could reduce storage cost for some fields at the cost of more complex logic and is not implemented here.
