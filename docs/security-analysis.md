# Security Analysis

This document describes the security-related measures and patterns present in the codebase.

---

## A. Static Analysis

Slither was used as the static analysis tool for this project. The analysis results are available at:`docs/slither-report.json`

Slither version: 0.11.5

Solidity version: 0.8.19

Contracts analyzed: 12
Total findings: 39

No critical severity vulnerabilities were identified.

The main findings relate to:

- Divide-before-multiply arithmetic patterns (precision consideration)
- Reentrancy warnings on external token calls (mitigated by ReentrancyGuard and CEI)
- Calls inside bounded loops (MAX_PLAYERS = 50)
- Timestamp usage in lottery logic
- Low-level calls in VRF callback

---

## B. Vulnerability Protections

### Reentrancy

- **DiceGame** and **Lottery** inherit OpenZeppelin’s `ReentrancyGuard` and use the `nonReentrant` modifier on user-facing state-changing functions that perform external calls:
  - DiceGame: `startGame` is `nonReentrant` (it performs `transferFrom` and then `requestRandomWords`).
  - Lottery: `purchaseTickets` is `nonReentrant` (it performs `transferFrom` and may call `_requestRandomness`).
- The VRF callback functions `rawFulfillRandomWords` are not marked `nonReentrant`. They are restricted to the VRF coordinator (`require(msg.sender == address(vrfCoordinator))`), which in this design is a trusted mock or Chainlink contract that does not trigger reentrancy from user code.

### Integer Overflow / Underflow

- All contracts use Solidity `^0.8.0` (Hardhat config uses `0.8.19`), so built-in overflow and underflow checks are in place. The code does not use `unchecked` blocks for arithmetic.

### Access Control

- **GameToken**, **DiceGame**, and **Lottery** use OpenZeppelin’s `Ownable`. Privileged functions are protected with `onlyOwner`:
  - GameToken: `mint`, `burn`, `withdrawEth`, `updateMintFee`
  - DiceGame: `updateBetLimits`, `withdrawHouseEdge`
  - Lottery: `updateTicketPrice`, `withdrawHouseEdge`, `handleNoWinner`
- **VRF callbacks**: Only the VRF coordinator may call `rawFulfillRandomWords` in both DiceGame and Lottery (explicit `require(msg.sender == address(vrfCoordinator))`).

### Checks-Effects-Interactions (CEI)

- **Lottery**
  - `purchaseTickets`: Checks (ticketCount, isActive, totalTickets limit, balance), then token transfer (external), then state updates (tickets, totalTickets, prizePool, playerLotteries). The external call is the first interaction; subsequent logic only updates storage and may call `_requestRandomness` (which does another external call to VRF). The token transfer is to the contract itself and is done before any complex state changes that could be re-entered.
  - `rawFulfillRandomWords`: State is updated first (isDrawn, winningNumber, winner), then `gameToken.transfer(winner, prize)` is performed. This follows CEI for the callback.
- **DiceGame**
  - `startGame`: Checks, then `transferFrom` (external), then state updates and VRF request. Reentrancy is mitigated by `nonReentrant`.
  - `rawFulfillRandomWords`: State (rollResult, isCompleted, payout) is updated, then a low-level call to `gameToken.transfer` is made. Payout is zeroed if the call fails. So effects are applied before the external transfer; the only external call is the transfer to the player (EOA or contract), and the callback is restricted to the VRF coordinator.

### Emergency Pause

No pause or emergency-stop mechanism (e.g. OpenZeppelin `Pausable`) is used in any of the contracts.

---

## C. External Calls

### GameToken

- **`transfer` / `transferFrom`**: Standard ERC-20; return value is used when called from other contracts (e.g. Lottery uses `require(gameToken.transfer(...))`).
- **`mintWithEth`**: Uses `payable(msg.sender).transfer(msg.value - MINT_FEE)` for refunds. `transfer` forwards 2300 gas and can revert on failure; the refund is to `msg.sender` only.
- **`withdrawEth`**: `payable(owner()).transfer(balance)`; same pattern.

### DiceGame

- **`startGame`**: `gameToken.transferFrom(msg.sender, address(this), betAmount)` — return value is used via `require(..., "DiceGame: Token transfer failed")`. Then `vrfCoordinator.requestRandomWords(...)`; return value (requestId) is used and stored.
- **`rawFulfillRandomWords`**: Two low-level calls to `gameToken.transfer` (player or contract balance). Return value is not checked; failure is handled by setting `game.payout = 0` and continuing, so the callback does not revert if the token transfer fails (e.g. if GameToken reverts or returns false).

### Lottery

- **`purchaseTickets`**: `gameToken.transferFrom(msg.sender, address(this), totalCost)` — return value checked with `require(..., "Lottery: Token transfer failed")`.
- **`rawFulfillRandomWords`**: `gameToken.transfer(winner, prize)` — return value checked with `require(..., "Lottery: Prize transfer failed")`.
- **`handleNoWinner`**: Loop over `lottery.totalTickets` with `gameToken.transfer(player, ticketPrice)`; each return value is checked with `require`.

### VRFCoordinatorV2Mock

- **`_fulfillRandomWords`**: Calls the requester’s `rawFulfillRandomWords(requestId, randomWords)` via low-level `call`. Success is enforced with `require(success, "Callback failed")`.

### Summary

- Lottery and DiceGame’s user-facing token pulls and Lottery’s prize/refund transfers validate return values.
- DiceGame’s callback does not validate the return value of `gameToken.transfer` and instead adjusts `payout` on failure. This avoids callback reverting but does not surface a failed transfer to the caller (the VRF coordinator).

---

## D. Threat Model

The design implies the following:

- **Randomness**: Outcomes depend on the VRF (mock in tests or Chainlink in production). Compromise or misuse of the VRF or subscription could affect fairness; the contracts do not implement additional commit–reveal or delay schemes.
- **Trust**: The owner can withdraw house edge funds, change bet limits (DiceGame), ticket price (Lottery), and mint fee (GameToken). The VRF coordinator is trusted to call `rawFulfillRandomWords` only once per request and with correct random words.
- **Token behavior**: Games assume GameToken’s `transfer`/`transferFrom` revert or return false on failure. DiceGame’s callback treats transfer failure as “payout = 0” rather than reverting.
- **Bounded loops**: Lottery’s `handleNoWinner` iterates over `totalTickets`, which is capped by `MAX_PLAYERS` (50). `purchaseTickets` loops over `ticketCount`, which is effectively limited by the same cap (totalTickets + ticketCount ≤ MAX_PLAYERS), so no unbounded loop in normal use.

Given the scope of the implementation (ERC-20 games, single VRF callback per request, no flash loans or governance), the main attack surfaces are: (1) VRF/oracle trust and (2) owner key compromise and (3) GameToken contract behavior (e.g. fee-on-transfer or callback-involving tokens could break assumptions).
