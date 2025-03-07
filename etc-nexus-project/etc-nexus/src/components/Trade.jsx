// src/components/Trade.jsx
import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';

// Import your ABI files – adjust paths as needed:
import routerABI from '../abi/ETCMCrouterABI.json';
import factoryABI from '../abi/ETCMCfactoryABI.json';
import pairABI from '../abi/IUniswapV2Pair.json';
import erc20ABI from '../abi/IERC20.json';

// A simple spinner component using Tailwind CSS classes
const Spinner = () => (
  <svg
    className="animate-spin inline-block h-5 w-5 text-green-300 ml-2"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    ></circle>
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8v8H4z"
    ></path>
  </svg>
);

function Trade({ signer, onClose }) {
  // Use your actual addresses
  const routerAddress = "0x2d18693b77acF8F2785084B0Ae53F6e0627e4376";
  const factoryAddress = "0x164999e9174686b39987dfB7E0FAb28465b867A5";

  // --------------------- FACTORY / PAIRS / TOKENS ---------------------
  const [pairsCount, setPairsCount] = useState(0);
  const [pairsError, setPairsError] = useState('');
  const [loadingPairs, setLoadingPairs] = useState(false);

  const [tokenAddrs, setTokenAddrs] = useState([]);
  const [tokenInfoMap, setTokenInfoMap] = useState({});
  const [tokensError, setTokensError] = useState('');
  const [loadingTokens, setLoadingTokens] = useState(false);

  // --------------------- ROUTER & WETC ---------------------
  const [routerContract, setRouterContract] = useState(null);
  const [wetcAddress, setWetcAddress] = useState(null);

  // --------------------- SWAP UI STATE ---------------------
  const [swapMode, setSwapMode] = useState('ETC_TO_TOKEN'); // "ETC_TO_TOKEN" or "TOKEN_TO_ETC"
  const [selectedToken, setSelectedToken] = useState('');
  const [amountIn, setAmountIn] = useState('');
  const [swapStatus, setSwapStatus] = useState('');
  const [swapError, setSwapError] = useState('');
  const [isSwapping, setIsSwapping] = useState(false);

  // ------------- STEP 1: Enumerate All Pairs from Factory -------------
  useEffect(() => {
    if (!signer || !factoryAddress) return;
    async function fetchPairs() {
      try {
        setPairsError('');
        setLoadingPairs(true);
        const factory = new ethers.Contract(factoryAddress, factoryABI, signer);
        const pairCountBN = await factory.allPairsLength();
        const count = Number(pairCountBN);
        setPairsCount(count);
        if (count === 0) {
          console.log('[Trade] No pairs found in factory.');
          return;
        }
        console.log(`[Trade] Found ${count} pairs, enumerating tokens...`);
        const tokenSet = new Set();
        for (let i = 0; i < count; i++) {
          try {
            const pairAddr = await factory.allPairs(i);
            const pair = new ethers.Contract(pairAddr, pairABI, signer);
            const token0 = await pair.token0();
            const token1 = await pair.token1();
            tokenSet.add(token0.toLowerCase());
            tokenSet.add(token1.toLowerCase());
          } catch (innerErr) {
            console.warn(`[Trade] Error reading pair #${i}:`, innerErr);
          }
        }
        setTokenAddrs(Array.from(tokenSet));
        console.log('[Trade] Unique tokens:', Array.from(tokenSet));
      } catch (err) {
        console.error('[Trade] Error enumerating pairs:', err);
        setPairsError(err.message);
      } finally {
        setLoadingPairs(false);
      }
    }
    fetchPairs();
  }, [signer, factoryAddress]);

  // ------------- STEP 2: Fetch Each Token's Metadata -------------
  useEffect(() => {
    if (!signer || tokenAddrs.length === 0) return;
    async function fetchTokenInfos() {
      try {
        setTokensError('');
        setLoadingTokens(true);
        const localMap = {};
        for (const addr of tokenAddrs) {
          try {
            const tokenC = new ethers.Contract(addr, erc20ABI, signer);
            const [symbol, name, decimals] = await Promise.all([
              tokenC.symbol(),
              tokenC.name(),
              tokenC.decimals()
            ]);
            localMap[addr] = { symbol, name, decimals };
          } catch (infoErr) {
            console.warn(`[Trade] Error fetching token info for ${addr}:`, infoErr);
          }
        }
        setTokenInfoMap(localMap);
        const keys = Object.keys(localMap);
        if (keys.length > 0) {
          setSelectedToken(keys[0]);
        }
      } catch (err) {
        console.error('[Trade] Error fetching token metadata:', err);
        setTokensError(err.message);
      } finally {
        setLoadingTokens(false);
      }
    }
    fetchTokenInfos();
  }, [signer, tokenAddrs]);

  // ------------- STEP 3: Instantiate Router and Fetch WETC Address -------------
  useEffect(() => {
    if (!signer || !routerAddress) return;
    const rC = new ethers.Contract(routerAddress, routerABI, signer);
    setRouterContract(rC);
    async function fetchWETC() {
      try {
        const w = await rC.WETH();
        setWetcAddress(w.toLowerCase());
        console.log('[Trade] WETC address:', w);
      } catch (err) {
        console.warn('[Trade] Error fetching WETH() from router:', err);
      }
    }
    fetchWETC();
  }, [signer, routerAddress]);

  // ------------- STEP 4: Handle the Swap -------------
  async function handleSwap() {
    try {
      setSwapError('');
      setSwapStatus('');
      setIsSwapping(true);
      if (!routerContract) throw new Error('Router not ready');
      if (!wetcAddress) throw new Error('WETC address not loaded');
      if (!selectedToken) throw new Error('Please specify a token address');
      if (!amountIn || isNaN(amountIn)) throw new Error('Invalid amount');

      const userAddr = await signer.getAddress();
      const baseUnits = ethers.parseUnits(amountIn, 18);
      const amountOutMin = 0n;
      const deadline = Math.floor(Date.now() / 1000) + 900;

      if (swapMode === 'ETC_TO_TOKEN') {
        // Fetch pre-swap token balance
        const tokenC = new ethers.Contract(selectedToken, erc20ABI, signer);
        const preBalance = await tokenC.balanceOf(userAddr);

        setSwapStatus("Swapping ETC → Token. Please wait...");
        const tx = await routerContract.swapExactETHForTokens(
          amountOutMin,
          [wetcAddress, selectedToken],
          userAddr,
          deadline,
          { value: ethers.parseUnits(amountIn, 18) }
        );
        await tx.wait();

        const postBalance = await tokenC.balanceOf(userAddr);
        const diff = postBalance - preBalance;
        const formattedDiff = ethers.formatUnits(diff, tokenInfoMap[selectedToken]?.decimals || 18);
        setSwapStatus(`Swap complete: ETC → Token. You received ${formattedDiff} ${tokenInfoMap[selectedToken]?.symbol}.`);
      } else {
        setSwapStatus("Approving token. Please wait...");
        const tokenC = new ethers.Contract(selectedToken, erc20ABI, signer);
        const allowance = await tokenC.allowance(userAddr, routerAddress);
        if (allowance.lt(baseUnits)) {
          const txApprove = await tokenC.approve(routerAddress, baseUnits);
          await txApprove.wait();
        }
        setSwapStatus("Swapping Token → ETC. Please wait...");
        const tx2 = await routerContract.swapExactTokensForETH(
          baseUnits,
          amountOutMin,
          [selectedToken, wetcAddress],
          userAddr,
          deadline
        );
        await tx2.wait();
        setSwapStatus("Swap complete: Token → ETC.");
      }
    } catch (err) {
      console.error('[Trade] Swap error:', err);
      setSwapError(err.message);
    } finally {
      setIsSwapping(false);
    }
  }

  // ------------- RENDER UI -------------
  if (!signer) {
    return (
      <div className="p-6 bg-gray-900 text-white rounded-lg max-w-3xl mx-auto mt-8">
        <p>Please connect your wallet first.</p>
      </div>
    );
  }
  if (!routerContract) {
    return (
      <div className="p-6 bg-gray-900 text-white rounded-lg max-w-3xl mx-auto mt-8">
        <p>Loading router contract…</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-green-600 p-6 rounded-lg shadow-xl max-w-3xl mx-auto mt-8 mb-12">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <img src="/NEXUSlogo.png" alt="Nexus Logo" className="w-10 h-10 mr-2" />
          <h1 className="text-2xl font-bold text-green-300">
            ETC Nexus <span className="mx-2">↔</span> Token Swap
          </h1>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="bg-green-700 hover:bg-green-600 text-white px-3 py-1 rounded font-semibold"
          >
            Close
          </button>
        )}
      </div>

      {/* NOTIFICATIONS */}
      {(loadingPairs || loadingTokens) && (
        <div className="mb-4 p-2 bg-gray-800 text-green-300 rounded flex items-center">
          {loadingPairs && (
            <p>
              <Spinner />
              Enumerating pairs...
            </p>
          )}
          {loadingTokens && (
            <p>
              <Spinner />
              Loading tokens… {Object.keys(tokenInfoMap).length} discovered so far.
            </p>
          )}
        </div>
      )}

      {/* SWAP FORM */}
      <div className="bg-gray-800 border border-green-600 p-4 rounded mb-6">
        <div className="mb-4">
          <label className="block text-sm text-green-300 mb-1">Swap Mode:</label>
          <select
            value={swapMode}
            onChange={(e) => setSwapMode(e.target.value)}
            className="bg-gray-800 border border-green-600 text-white px-3 py-1 rounded w-full"
          >
            <option value="ETC_TO_TOKEN">ETC → Token</option>
            <option value="TOKEN_TO_ETC">Token → ETC</option>
          </select>
        </div>

        <div className="mb-4">
          <label className="block text-sm text-green-300 mb-1">Token Address:</label>
          {Object.keys(tokenInfoMap).length > 0 ? (
            <select
              value={selectedToken}
              onChange={(e) => setSelectedToken(e.target.value)}
              className="bg-gray-800 border border-green-600 text-white px-3 py-1 rounded w-full"
            >
              {Object.entries(tokenInfoMap).map(([addr, info]) => (
                <option key={addr} value={addr}>
                  {info.symbol} ({addr.slice(0, 6)}...)
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={selectedToken}
              onChange={(e) => setSelectedToken(e.target.value)}
              placeholder="0x..."
              className="bg-gray-800 border border-green-600 text-white px-3 py-1 rounded w-full"
            />
          )}
        </div>

        <div className="mb-4">
          <label className="block text-sm text-green-300 mb-1">
            Amount {swapMode === 'ETC_TO_TOKEN' ? 'ETC' : 'Token'}
          </label>
          <input
            type="text"
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value)}
            placeholder="0.0"
            className="bg-gray-800 border border-green-600 text-white px-3 py-1 rounded w-full"
          />
        </div>

        <button
          onClick={handleSwap}
          className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded font-semibold w-full"
        >
          Swap
        </button>

        <div className="mt-3 flex items-center">
          {swapStatus && <p className="text-green-300">{swapStatus}</p>}
          {isSwapping && <Spinner />}
        </div>
        {swapError && <p className="text-red-400 mt-3">Error: {swapError}</p>}
      </div>

      {/* OPTIONAL: Discovered Tokens Table */}
      {Object.keys(tokenInfoMap).length > 0 && (
        <div className="bg-gray-800 border border-green-600 p-4 rounded">
          <h2 className="text-md font-semibold text-green-300 mb-2">Discovered Tokens</h2>
          <div className="overflow-auto max-h-64 border border-green-600 rounded">
            <table className="table-auto w-full text-sm">
              <thead className="bg-green-700 text-white">
                <tr>
                  <th className="px-2 py-1 text-left">Address</th>
                  <th className="px-2 py-1 text-left">Symbol</th>
                  <th className="px-2 py-1 text-left">Name</th>
                  <th className="px-2 py-1 text-left">Decimals</th>
                </tr>
              </thead>
              <tbody className="text-green-100">
                {Object.entries(tokenInfoMap).map(([addr, info]) => (
                  <tr key={addr} className="border-b border-green-600">
                    <td className="px-2 py-1">{addr}</td>
                    <td className="px-2 py-1">{info.symbol}</td>
                    <td className="px-2 py-1">{info.name}</td>
                    <td className="px-2 py-1">{info.decimals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-green-300 mt-2">
            * Tokens discovered from factory at {factoryAddress}
          </p>
        </div>
      )}
    </div>
  );
}

export default Trade;












