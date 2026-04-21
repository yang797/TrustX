import { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import deployment from './deployment.json';
import { ORACLE_ABI, TOKEN_ABI, TRUSTX_ABI } from './abi';

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [status, setStatus] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [depositAmount, setDepositAmount] = useState('0.1');
  const [borrowAmount, setBorrowAmount] = useState('100');
  const [repayAmount, setRepayAmount] = useState('50');
  const [withdrawAmount, setWithdrawAmount] = useState('0.05');
  const [adminPrice, setAdminPrice] = useState('1500');

  const [borrowerAddress, setBorrowerAddress] = useState("");
  const [liquidateAmount, setLiquidateAmount] = useState("500");

  const [data, setData] = useState({
    collateral: '0',
    debt: '0',
    healthFactor: '0',
    liquidatable: false,
    price: '0',
    tokenBalance: '0',
    volatilityFactor: '1.00',
    trendFactor: '1.00'
  });

  const trustXAddress = deployment.trustX;
  const tokenAddress = deployment.token;
  const oracleAddress = deployment.oracle;

  const browserProvider = useMemo(() => {
    if (!window.ethereum) return null;
    return new ethers.BrowserProvider(window.ethereum);
  }, []);

  useEffect(() => {
    if (!browserProvider || !account || trustXAddress === 'REPLACE_AFTER_DEPLOY') return;

    const load = async () => {
      // const readProvider = provider || browserProvider;
      const readProvider = browserProvider;
      const trustX = new ethers.Contract(trustXAddress, TRUSTX_ABI, readProvider);
      const oracle = new ethers.Contract(oracleAddress, ORACLE_ABI, readProvider);
      const token = new ethers.Contract(tokenAddress, TOKEN_ABI, readProvider);

      //test
      console.log("trustXAddress:", trustXAddress);
      console.log("tokenAddress:", tokenAddress);
      console.log("oracleAddress:", oracleAddress);

      console.log("trustX code:", await readProvider.getCode(trustXAddress));
      console.log("token code:", await readProvider.getCode(tokenAddress));
      console.log("oracle code:", await readProvider.getCode(oracleAddress));
      //test

      const [collateral, debt, healthFactor, liquidatable, price, tokenBalance, volatilityFactor, trendFactor] = await Promise.all([
        trustX.collateralBalance(account),
        trustX.borrowBalance(account),
        trustX.getAdjustedHealthFactor(account),
        trustX.isLiquidatable(account),
        oracle.getPrice(),
        token.balanceOf(account),
        trustX.getVolatilityFactor(),
        trustX.getTrendFactor()
      ]);

      setData({
        collateral: ethers.formatEther(collateral),
        debt: ethers.formatEther(debt),
        healthFactor:
          healthFactor > ethers.MaxUint256 / 2n ? '∞' : Number(ethers.formatEther(healthFactor)).toFixed(3),
        liquidatable,
        price: ethers.formatEther(price),
        tokenBalance: ethers.formatEther(tokenBalance),
        volatilityFactor: Number(ethers.formatEther(volatilityFactor)).toFixed(2),
        trendFactor: Number(ethers.formatEther(trendFactor)).toFixed(2)
      });
    };

    load().catch((err) => setStatus(err.message));
  }, [browserProvider, provider, account, refreshKey, trustXAddress, oracleAddress, tokenAddress]);

  const connectWallet = async () => {
    if (!browserProvider) {
      setStatus('MetaMask not detected.');
      return;
    }

    try {
      const signerInstance = await browserProvider.getSigner();
      const address = await signerInstance.getAddress();
      setProvider(browserProvider);
      setSigner(signerInstance);
      setAccount(address);

      const network = await browserProvider.getNetwork();
      console.log("chainId:", network.chainId.toString());
      console.log("account:", address);
      console.log("oracle address:", oracleAddress);
      console.log("oracle code in browser:", await browserProvider.getCode(oracleAddress));
      
      // setIsAdmin(network.chainId === 31337n || network.chainId === 11155111n);
      setIsAdmin(
        address.toLowerCase() === deployment.deployer.toLowerCase()
      );
      setStatus('Wallet connected.');
    } catch (error) {
      setStatus(error.message);
    }
  };

  const runTx = async (fn) => {
    try {
      setStatus('Waiting for wallet confirmation...');
      await fn();
      setStatus('Transaction confirmed.');
      setRefreshKey((k) => k + 1);
    } catch (error) {
      setStatus(error.shortMessage || error.message);
    }
  };

  const getContracts = () => {
    if (!signer) throw new Error('Please connect wallet first.');
    return {
      trustX: new ethers.Contract(trustXAddress, TRUSTX_ABI, signer),
      token: new ethers.Contract(tokenAddress, TOKEN_ABI, signer),
      oracle: new ethers.Contract(oracleAddress, ORACLE_ABI, signer)
    };
  };

  const mintDemoTokens = async () => {
    const { token } = getContracts();
    await runTx(async () => {
      const tx = await token.faucetMint(account, ethers.parseEther('1000'));
      await tx.wait();
    });
  };

  const handleDeposit = async () => {
    const { trustX } = getContracts();
    await runTx(async () => {
      const tx = await trustX.deposit({ value: ethers.parseEther(depositAmount) });
      await tx.wait();
    });
  };

  const handleBorrow = async () => {
    const { trustX } = getContracts();
    await runTx(async () => {
      const tx = await trustX.borrow(ethers.parseEther(borrowAmount));
      await tx.wait();
    });
  };

  const handleRepay = async () => {
    const { trustX, token } = getContracts();
    await runTx(async () => {
      const amount = ethers.parseEther(repayAmount);
      const approveTx = await token.approve(trustXAddress, amount);
      await approveTx.wait();
      const repayTx = await trustX.repay(amount);
      await repayTx.wait();
    });
  };

  const handleWithdraw = async () => {
    const { trustX } = getContracts();
    await runTx(async () => {
      const tx = await trustX.withdraw(ethers.parseEther(withdrawAmount));
      await tx.wait();
    });
  };

  const handleSetPrice = async () => {
    const { oracle, trustX } = getContracts();
    await runTx(async () => {
      const tx = await oracle.setPrice(ethers.parseEther(adminPrice));
      await tx.wait();

      const syncTx = await trustX.syncMarketState();
      await syncTx.wait();
    });
  };

  const handleLiquidate = async () => {
    const { trustX, token } = getContracts();

    await runTx(async () => {
      const amount = ethers.parseEther(liquidateAmount);

      const approveTx = await token.approve(trustXAddress, amount);
      await approveTx.wait();

      const tx = await trustX.liquidate(borrowerAddress, amount);
      await tx.wait();
    });
  };

  const hfClass = data.healthFactor === '∞'
    ? 'safe'
    : parseFloat(data.healthFactor) < 1.5
      ? 'danger'
      : 'safe';

  return (
    <div className="page">
      <div className="container">
        <h1>TrustX Demo</h1>
        <p className="subtitle">Simplified decentralized lending with price stress testing</p>

        <div className="card">
          <button onClick={connectWallet}>Connect MetaMask</button>
          <p><strong>Account:</strong> {account || 'Not connected'}</p>
          <p><strong>Status:</strong> {status || 'Idle'}</p>
        </div>

        <div className="grid">
          <div className="card">
            <h2>Account Status</h2>
            <p><strong>ETH Collateral:</strong> {data.collateral}</p>
            <p><strong>Token Debt:</strong> {data.debt}</p>
            <p><strong>Token Balance:</strong> {data.tokenBalance}</p>
            <p><strong>ETH Price:</strong> ${data.price}</p>
            <p><strong>Volatility Factor:</strong> {data.volatilityFactor}</p>
            <p><strong>Trend Factor:</strong> {data.trendFactor}</p>
            <p className={data.liquidatable ? "danger" : "safe"}>
              <strong>Liquidatable:</strong> {String(data.liquidatable)}
            </p>
            <p className={hfClass}><strong>Health Factor:</strong> {data.healthFactor}</p>
          </div>

          <div className="card">
            <h2>User Actions</h2>
            <label>Deposit ETH</label>
            <input value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
            <button onClick={handleDeposit}>Deposit</button>

            <label>Borrow Token</label>
            <input value={borrowAmount} onChange={(e) => setBorrowAmount(e.target.value)} />
            <button onClick={handleBorrow}>Borrow</button>

            <label>Repay Token</label>
            <input value={repayAmount} onChange={(e) => setRepayAmount(e.target.value)} />
            <button onClick={handleRepay}>Approve & Repay</button>

            <label>Withdraw ETH</label>
            <input value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} />
            <button onClick={handleWithdraw}>Withdraw</button>

            <button onClick={mintDemoTokens}>Mint 1000 Demo Tokens</button>
          </div>

          <div className="card">
            <h2>Admin Panel</h2>
            <p>Use this panel during demo to simulate a price crash.</p>
            <label>Set ETH Price</label>
            <input value={adminPrice} onChange={(e) => setAdminPrice(e.target.value)} />
            <button onClick={handleSetPrice} disabled={!isAdmin}>Update Oracle Price</button>
            <div className="quick-actions">
              {[1800, 1500, 1200, 1000, 800].map((p) => (
                <button key={p} onClick={() => setAdminPrice(String(p))}>${p}</button>
              ))}
            </div>
            {!isAdmin && <p className="hint">Connect with the deployer/admin account to change price.</p>}
          </div>

          <div className="card">
            <h2>Liquidation Panel</h2>

            <label>Borrower Address</label>
            <input
              value={borrowerAddress}
              onChange={(e) => setBorrowerAddress(e.target.value)}
              placeholder="0x..."
            />

            <label>Repay Amount (Token)</label>
            <input
              value={liquidateAmount}
              onChange={(e) => setLiquidateAmount(e.target.value)}
            />

            <button onClick={handleLiquidate}>Liquidate</button>
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;
