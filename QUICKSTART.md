
# 快速启动指南

本指南将帮助您快速启动区块链游戏平台进行本地测试。

## 前提条件

- 已安装 Node.js (v14 或更高版本)
- 已安装 npm 或 yarn
- 已安装 Git

## 快速启动步骤

### 1. 安装项目依赖

在项目根目录下运行：

```bash
npm install
```

### 2. 安装前端依赖

```bash
cd frontend
npm install
cd ..
```

### 3. 启动本地区块链节点

在一个新的终端窗口中运行：

```bash
npx hardhat node
```

这将启动一个本地以太坊网络，预置了几个测试账户和大量 ETH。

### 4. 部署智能合约

在另一个新的终端窗口中运行：

```bash
npx hardhat run scripts/deploy.js --network localhost
```

这将部署所有智能合约到本地网络，并生成 `deployment-info.json` 文件。

### 5. 准备前端合约 ABI 文件

```bash
mkdir -p frontend/src/contracts
copy artifacts\contracts\Lottery.sol\Lottery.json frontend\src\contracts\
copy artifacts\contracts\DiceGame.sol\DiceGame.json frontend\src\contracts\
copy deployment-info.json frontend\public\
```

### 6. 启动前端应用

在另一个新的终端窗口中运行：

```bash
cd frontend
npm start
```

### 7. 配置 MetaMask

1. 安装 MetaMask 浏览器扩展（如果尚未安装）
2. 添加自定义网络：
   - 网络名称: Hardhat Local
   - RPC URL: http://127.0.0.1:8545
   - 链ID: 31337
   - 货币符号: ETH
3. 导入测试账户（从 hardhat node 输出中复制私钥）

### 8. 开始使用

1. 在浏览器中打开 http://localhost:3000
2. 点击 "Connect Wallet" 连接 MetaMask
3. 开始玩彩票或骰子游戏

## 注意事项

- 确保所有终端窗口保持打开状态
- 如果需要重新部署合约，先停止前端，重新部署后，再启动前端
- 本地网络上的所有操作都是模拟的，不会消耗真实资金

## 测试账户

Hardhat node 启动时会提供多个测试账户，每个账户都有 10000 ETH。您可以使用这些账户进行测试。

## 常见问题

1. **合约部署失败**
   - 确保 hardhat node 正在运行
   - 检查终端是否有错误信息

2. **前端无法连接合约**
   - 检查 deployment-info.json 和合约 ABI 文件是否正确复制
   - 确保 MetaMask 连接到正确的网络

3. **交易失败**
   - 检查账户是否有足够的 ETH 支付 gas 费用
   - 确保账户已批准足够的 GameToken 用于游戏

## 下一步

- 查看 README.md 了解更多项目详情
- 查看 contracts/ 目录了解智能合约实现
- 查看 frontend/src/ 目录了解前端实现
