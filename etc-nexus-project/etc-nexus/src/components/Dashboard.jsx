import React, { useState, useEffect } from 'react';
// 1) Import the translation hook
import { useTranslation } from 'react-i18next';
import { ethers } from 'ethers';
import CommunityChat from './CommunityChat';
import axios from 'axios';
import Charts from './Charts';

import ETCCommunityWatch from './ETCCommunityWatch';
import PendingAlertsModal from './PendingAlertsModal';

function Dashboard({ walletAddress, darkMode, signer }) {  
  const { t, i18n } = useTranslation();

  // =========================
  // ETC Stats
  // =========================
  const [etcPrice, setEtcPrice] = useState('--.--');
  const [hashrate, setHashrate] = useState('--');
  const [nodeCount, setNodeCount] = useState('--');
  const [networkStatus, setNetworkStatus] = useState('Loading...');
  const [tvl, setTVL] = useState('--');
  const [avgBlockTime, setAvgBlockTime] = useState(null);

  const ETC_RPC_URL = 'https://etc.rivet.link';

  // =========================
  // On Mount: Fetch ETC Stats
  // =========================
  useEffect(() => {
    const fetchData = async () => {
      await fetchEtcPrice();
      await fetchHashrate();
      await fetchNodeCount();
      await checkNetworkStatus();
    };
    fetchData();

    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  // =========================
  // On Mount: Fetch TVL (plus every 60s)
  // =========================
  useEffect(() => {
    const fetchTVLData = async () => {
      await fetchTVL();
    };
    fetchTVLData();

    const tvlInterval = setInterval(fetchTVLData, 60000);
    return () => clearInterval(tvlInterval);
  }, []);

  // =========================
  // ETC Price
  // =========================
  const fetchEtcPrice = async () => {
    try {
      const res = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum-classic&vs_currencies=usd'
      );
      const data = await res.json();
      setEtcPrice(data['ethereum-classic'].usd.toFixed(2));
    } catch (err) {
      console.error('Failed to fetch ETC price =>', err);
    }
  };

  // =========================
  // Hashrate
  // =========================
  const fetchHashrate = async () => {
    try {
      const res = await fetch('https://api.minerstat.com/v2/coins?list=ETC');
      const data = await res.json();
      if (data && data.length > 0) {
        const rateTH = (data[0].network_hashrate / 1e12).toFixed(2);
        setHashrate(rateTH);
      }
    } catch (err) {
      console.error('Failed to fetch ETC hashrate =>', err);
    }
  };

  // =========================
  // Node Count (placeholder)
  // =========================
  const fetchNodeCount = async () => {
    try {
      // placeholder
      setNodeCount('1234');
    } catch (err) {
      console.error('Error fetching node count =>', err);
    }
  };

  // =========================
  // Network Status
  // =========================
  const checkNetworkStatus = async () => {
    try {
      const provider = new ethers.JsonRpcProvider(ETC_RPC_URL);
      const currentBlockNumber = await provider.getBlockNumber();
      const currentBlock = await provider.getBlock(currentBlockNumber);
      const oldBlock = await provider.getBlock(currentBlockNumber - 10);

      const timeDiff = currentBlock.timestamp - oldBlock.timestamp;
      const avgBlockTimeCalc = timeDiff / 10; // seconds per block
      setAvgBlockTime(avgBlockTimeCalc);

      if (avgBlockTimeCalc < 30) {
        setNetworkStatus('Good');
      } else {
        setNetworkStatus('Congested');
      }
    } catch (err) {
      console.error('Error checking network status =>', err);
      setNetworkStatus('Unknown');
    }
  };

  // =========================
  // TVL (via charts/EthereumClassic endpoint)
  // =========================
  const fetchTVL = async () => {
    try {
      const res = await fetch('https://api.llama.fi/charts/EthereumClassic');
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        const latest = data[data.length - 1];
        if (latest && latest.totalLiquidityUSD) {
          const formatted = latest.totalLiquidityUSD.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0,
          });
          setTVL(formatted);
        } else {
          setTVL('--');
        }
      } else {
        setTVL('--');
      }
    } catch (err) {
      console.error('Failed to fetch TVL =>', err);
      setTVL('--');
    }
  };

  // =========================
  // Dropdown Button States
  // =========================
  const [openDefi, setOpenDefi] = useState(false);
  const [openProjects, setOpenProjects] = useState(false);
  const [openNodes, setOpenNodes] = useState(false);
  const [openLinks, setOpenLinks] = useState(false);
  // NEW => openRpc for the ETC RPCs
  const [openRpc, setOpenRpc] = useState(false);

  // =========================
  // Chat Integration
  // =========================
  const [username, setUsername] = useState('');
  const [usernameFound, setUsernameFound] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [feedback, setFeedback] = useState('');

  // Profile Settings Panel
  const [showSettings, setShowSettings] = useState(false);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarFeedback, setAvatarFeedback] = useState('');

  // =========================
  // Auto-load username
  // =========================
  useEffect(() => {
    if (!walletAddress) return;
    const lowerAddr = walletAddress.toLowerCase();
    axios
      .get(`https://etc-chat-server-production.up.railway.app/api/getUsername/${lowerAddr}`)
      .then((res) => {
        if (res.data.success && res.data.user) {
          setUsername(res.data.user.username);
          setUsernameFound(true);
        }
      })
      .catch((err) => console.warn('No existing username or error =>', err));
  }, [walletAddress]);

  // =========================
  // Username Save
  // =========================
  const handleSetUsername = async () => {
    if (!walletAddress) {
      setFeedback(t('connectWalletFirst'));
      return;
    }
    if (!username.trim()) {
      setFeedback(t('enterUsernameFirst'));
      return;
    }
    try {
      const res = await axios.post(
        'https://etc-chat-server-production.up.railway.app/api/setUsername',
        {
          address: walletAddress,
          username,
        }
      );
      if (res.data.success) {
        setUsernameFound(true);
        setFeedback(
          `${t('usernameSaved')} "${res.data.user.username}" ${t('forAddress')} ${res.data.user.address}`
        );
      }
    } catch (err) {
      console.error('Failed to set username =>', err);
      setFeedback(t('errorSavingUsername'));
    }
  };

  // =========================
  // Join Chat
  // =========================
  const handleJoinChat = () => {
    if (!walletAddress) {
      setFeedback(t('connectWalletFirst'));
      return;
    }
    if (!username.trim()) {
      setFeedback(t('enterUsernameFirst'));
      return;
    }
    setChatOpen(true);
  };

  // =========================
  // Profile Pic Upload
  // =========================
  const handleProfilePicUpload = async (e) => {
    e.preventDefault();
    if (!avatarFile) {
      setAvatarFeedback(t('selectFileFirst'));
      return;
    }
    if (!walletAddress) {
      setAvatarFeedback(t('connectWalletFirst'));
      return;
    }

    try {
      const formData = new FormData();
      formData.append('address', walletAddress);
      formData.append('file', avatarFile);

      const res = await axios.post(
        'https://etc-chat-server-production.up.railway.app/api/setProfilePic',
        formData
      );
      if (res.data.success) {
        setAvatarFeedback(t('picUpdated'));
      } else {
        setAvatarFeedback(t('uploadCompletedNoFlag'));
      }
      setAvatarFile(null);
      e.target.reset();
    } catch (err) {
      console.error('Profile pic upload error =>', err);
      setAvatarFeedback(t('errorUploadingPic'));
    }
  };

  // =========================
  // Styling Classes
  // =========================
  const containerClass = darkMode
    ? 'bg-gray-900 text-white'
    : 'bg-white text-gray-900';

  const dropdownContainerClass = darkMode
    ? 'absolute left-1/2 transform -translate-x-1/2 mt-2 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-10 transition-all duration-200'
    : 'absolute left-1/2 transform -translate-x-1/2 mt-2 w-56 bg-gray-100 border border-gray-300 rounded-lg shadow-lg z-10 transition-all duration-200';

  const dropdownLinkClass = darkMode
    ? 'flex items-center px-4 py-2 text-gray-200 hover:bg-gray-700 transition-colors duration-200'
    : 'flex items-center px-4 py-2 text-gray-800 hover:bg-gray-200 transition-colors duration-200';

  // State for ETC Community Watch + Alerts
  const [showCommunityWatch, setShowCommunityWatch] = useState(false);
  const [showPendingAlerts, setShowPendingAlerts] = useState(false);

  return (
    <div className={`${containerClass} w-full min-h-screen`}>
      <div className="container mx-auto px-4 py-6">
        {/* ===== ETC Stats Grid (5 columns on large screens) ===== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {/* TVL Card + Explore ETC RPC's Button */}
          <div className="flex flex-col items-center">
            <div
              className={
                'w-full bg-gray-800 bg-opacity-70 border border-emerald-500 p-4 rounded-xl shadow-xl hover:scale-105 transition-transform' +
                (darkMode ? '' : ' bg-gray-100')
              }
            >
              <h2 className="text-sm md:text-base font-semibold text-emerald-300">
                {t('tvl')}
              </h2>
              <p className="text-2xl md:text-3xl font-bold">{tvl}</p>
              <span className="text-xs md:text-sm text-gray-400">
                {t('totalValueLocked')}
              </span>
            </div>
            {/* Updated "Explore ETC RPC's" dropdown */}
            <div className="relative mt-2">
              <button
                onClick={() => setOpenRpc(!openRpc)}
                className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1 rounded text-white font-semibold transition-colors duration-150"
              >
                Explore ETC RPC's
              </button>
              {openRpc && (
                <div className={dropdownContainerClass}>
                  {/* Rivet RPC */}
                  <div className={dropdownLinkClass}>
                    <img
                      src="ETClogo.png"
                      alt="Rivet RPC"
                      className="w-10 h-10 mr-2"
                    />
                    <div>
                      <p className="font-semibold">Rivet RPC</p>
                      <p className="text-xs text-gray-400 break-all">https://etc.rivet.link</p>
                    </div>
                  </div>
                  {/* ETCMC RPC */}
                  <div className={dropdownLinkClass}>
                    <img
                      src="ETClogo.png"
                      alt="ETCMC RPC"
                      className="w-10 h-10 mr-2"
                    />
                    <div>
                      <p className="font-semibold">ETCMC RPC</p>
                      <p className="text-xs text-gray-400 break-all">https://mainnet.etcmc.link</p>
                    </div>
                  </div>
                  {/* HebeBlock RPC */}
                  <div className={dropdownLinkClass}>
                    <img
                      src="ETClogo.png"
                      alt="HebeBlock RPC"
                      className="w-10 h-10 mr-2"
                    />
                    <div>
                      <p className="font-semibold">HebeBlock RPC</p>
                      <p className="text-xs text-gray-400 break-all">https://etc.etcdesktop.com</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* ETC Price Card + Explore ETC Defi Dropdown */}
          <div className="flex flex-col items-center">
            <div
              className={
                'w-full bg-gray-800 bg-opacity-70 border border-emerald-500 p-4 rounded-xl shadow-xl hover:scale-105 transition-transform' +
                (darkMode ? '' : ' bg-gray-100')
              }
            >
              <h2 className="text-sm md:text-base font-semibold text-emerald-300">
                {t('price')}
              </h2>
              <p className="text-2xl md:text-3xl font-bold">${etcPrice}</p>
              <span className="text-xs md:text-sm text-gray-400">
                {t('usd')}
              </span>
            </div>
            <div className="relative mt-2">
              <button
                onClick={() => setOpenDefi(!openDefi)}
                className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1 rounded text-white font-semibold transition-colors duration-150"
              >
                {t('defi')}
              </button>
              {openDefi && (
                <div className={dropdownContainerClass}>
                  <a
                    href="https://www.etc-mc.com/#/swap"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={dropdownLinkClass}
                  >
                    <img
                      src="ETCMClogo.png"
                      alt="ETCMCdex logo"
                      className="w-10 h-10 mr-2"
                    />
                    ETCMCdex
                  </a>
                  <a
                    href="https://etcswap.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={dropdownLinkClass}
                  >
                    <img
                      src="ETClogo.png"
                      alt="ETCswap logo"
                      className="w-10 h-10 mr-2"
                    />
                    ETCswap
                  </a>
                  <a
                    href="https://hebeswap.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={dropdownLinkClass}
                  >
                    <img
                      src="HEBElogo.png"
                      alt="Hebeswap logo"
                      className="w-10 h-10 mr-2"
                    />
                    Hebeswap
                  </a>
                  <a
                    href="https://etcpow-staking.netlify.app/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={dropdownLinkClass}
                  >
                    <img
                      src="ETCPOWlogo.png"
                      alt="ETCPOWstaking logo"
                      className="w-10 h-10 mr-2"
                    />
                    ETCPOWstaking
                  </a>
                </div>
              )}
            </div>
          </div>
          {/* Hashrate Card + Explore ETC Projects Dropdown */}
          <div className="flex flex-col items-center">
            <div
              className={
                'w-full bg-gray-800 bg-opacity-70 border border-emerald-500 p-4 rounded-xl shadow-xl hover:scale-105 transition-transform' +
                (darkMode ? '' : ' bg-gray-100')
              }
            >
              <h2 className="text-sm md:text-base font-semibold text-emerald-300">
                {t('hashrate')}
              </h2>
              <p className="text-2xl md:text-3xl font-bold">
                {hashrate} TH/s
              </p>
              <span className="text-xs md:text-sm text-gray-400">
                {t('networkHashrate')}
              </span>
            </div>
            <div className="relative mt-2">
              <button
                onClick={() => setOpenProjects(!openProjects)}
                className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1 rounded text-white font-semibold transition-colors duration-150"
              >
                {t('projects')}
              </button>
              {openProjects && (
                <div className={dropdownContainerClass.replace('w-56', 'w-48')}>
                  <a
                    href="https://etcmc.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={dropdownLinkClass}
                  >
                    <img
                      src="ETCMClogo.png"
                      alt="ETCMC logo"
                      className="w-10 h-10 mr-2"
                    />
                    ETCMC
                  </a>
                  <a
                    href="https://x.com/ETC_Radio_"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={dropdownLinkClass}
                  >
                    <img
                      src="RADIOlogo.png"
                      alt="ETC Radio logo"
                      className="w-10 h-10 mr-2"
                    />
                    ETC Radio
                  </a>
                  <a
                    href="https://www.etcplanets.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={dropdownLinkClass}
                  >
                    <img
                      src="PLANETSlogo.png"
                      alt="ETC Planets logo"
                      className="w-10 h-10 mr-2"
                    />
                    ETC Planets
                  </a>
                  <a
                    href="https://frogb.art/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={dropdownLinkClass}
                  >
                    <img
                      src="FROGlogo.png"
                      alt="ETCFROGB logo"
                      className="w-10 h-10 mr-2"
                    />
                    ETCFROGB
                  </a>
                  <a
                    href="https://www.classicverse.net/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={dropdownLinkClass}
                  >
                    <img
                      src="COINlogo.png"
                      alt="BITCOIN Classic logo"
                      className="w-10 h-10 mr-2"
                    />
                    BITCOIN Classic
                  </a>
                </div>
              )}
            </div>
          </div>
          {/* Node Count Card + Explore ETC Nodes Dropdown */}
          <div className="flex flex-col items-center">
            <div
              className={
                'w-full bg-gray-800 bg-opacity-70 border border-emerald-500 p-4 rounded-xl shadow-xl hover:scale-105 transition-transform' +
                (darkMode ? '' : ' bg-gray-100')
              }
            >
              <h2 className="text-sm md:text-base font-semibold text-emerald-300">
                {t('nodeCount')}
              </h2>
              <p className="text-2xl md:text-3xl font-bold">{nodeCount}</p>
              <span className="text-xs md:text-sm text-gray-400">
                {t('activeNodes')}
              </span>
            </div>
            <div className="relative mt-2">
              <button
                onClick={() => setOpenNodes(!openNodes)}
                className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1 rounded text-white font-semibold transition-colors duration-150"
              >
                {t('nodes')}
              </button>
              {openNodes && (
                <div className={dropdownContainerClass.replace('w-56', 'w-48')}>
                  <a
                    href="#"
                    className="block px-4 py-2 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-200"
                  >
                    {t('placeholder')} 1
                  </a>
                  <a
                    href="#"
                    className="block px-4 py-2 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-200"
                  >
                    {t('placeholder')} 2
                  </a>
                </div>
              )}
            </div>
          </div>
          {/* Network Status Card + Explore ETC Links Dropdown */}
          <div className="flex flex-col items-center">
            <div
              className={
                'w-full bg-gray-800 bg-opacity-70 border border-emerald-500 p-4 rounded-xl shadow-xl hover:scale-105 transition-transform' +
                (darkMode ? '' : ' bg-gray-100')
              }
            >
              <h2 className="text-sm md:text-base font-semibold text-emerald-300">
                {t('networkStatus')}
              </h2>
              <p className="text-2xl md:text-3xl font-bold">{networkStatus}</p>
              <span className="text-xs md:text-sm text-gray-400">
                {avgBlockTime
                  ? `${avgBlockTime.toFixed(2)}s Avg Blocktime`
                  : '--'}
              </span>
            </div>
            <div className="relative mt-2">
              <button
                onClick={() => setOpenLinks(!openLinks)}
                className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1 rounded text-white font-semibold transition-colors duration-150"
              >
                {t('links')}
              </button>
              {openLinks && (
                <div className={dropdownContainerClass.replace('w-56', 'w-48')}>
                  {/* ETC Website */}
                  <a
                    href="https://ethereumclassic.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={dropdownLinkClass}
                  >
                    <img
                      src="ETClogo.png"
                      alt="ETC Website"
                      className="w-10 h-10 mr-2"
                    />
                    ETC Website
                  </a>
                  {/* ETC on X */}
                  <a
                    href="https://x.com/eth_classic"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={dropdownLinkClass}
                  >
                    <img
                      src="Xlogo.png"
                      alt="ETC on X"
                      className="w-10 h-10 mr-2"
                    />
                    ETC on X
                  </a>
                  {/* ETC Discord */}
                  <a
                    href="https://discord.com/invite/3j55xXEEdP"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={dropdownLinkClass}
                  >
                    <img
                      src="DISCORDlogo.png"
                      alt="ETC Discord"
                      className="w-10 h-10 mr-2"
                    />
                    ETC Discord
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* =============== Render Charts and pass signer =============== */}
        <Charts signer={signer} />

        {/* =============== Community Chat Section =============== */}
        <div className="mt-8 bg-gray-800 bg-opacity-70 p-4 rounded shadow relative">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold text-emerald-300">
              {t('communityChat')}
            </h2>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="text-gray-300 hover:text-gray-100 transition"
              title={t('profileSettings')}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-6 h-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11.08 2.59c.27-.02.54-.02.81 0a9.46 9.46 0 011.03.16.75.75 0 00.87-.58l.13-.65A.75.75 0 0115.58 1h2.84a.75.75 0 01.74.9l-.13.65a.75.75 0 00.57.87 9.31 9.31 0 011.03.31.75.75 0 01.45.97l-.28.66a.75.75 0 000 .95 7.62 7.62 0 01.66.76.75.75 0 010 .95c-.2.27-.43.52-.66.76a.75.75 0 00-.18.82l-.28.66a.75.75 0 01-.45.97 9.31 9.31 0 01-1.03.31.75.75 0 00-.57.87l.13.65a.75.75 0 01-.74.9h-2.84a.75.75 0 01-.74-.61l-.13-.65a.75.75 0 00-.87-.58 9.46 9.46 0 01-1.03-.16.75.75 0 00-.81 0 9.43 9.43 0 01-1.03.16.75.75 0 00-.87.58l-.13.65A.75.75 0 018.42 3h2.84c.36 0 .67.26.74.61z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          </div>

          <p className="text-white mb-2">
            {t('walletAddress')}: {walletAddress || t('notConnected')}
          </p>

          {usernameFound ? (
            <p className="text-green-300 mb-2">
              {t('welcomeBack')}, {username}!
            </p>
          ) : (
            <div className="mb-3">
              <label className="text-white font-semibold mr-2">
                {t('username')}:
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-gray-700 text-white px-2 py-1 rounded"
                placeholder={t('pickName')}
              />
              <button
                onClick={handleSetUsername}
                className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1 rounded text-white font-semibold ml-2"
              >
                {t('save')}
              </button>
            </div>
          )}

          {feedback && <p className="text-yellow-300 mb-2">{feedback}</p>}

          <button
            onClick={handleJoinChat}
            className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded text-white font-semibold transition-colors duration-150"
          >
            {t('joinChat')}
          </button>

          {showSettings && (
            <div className="bg-gray-700 bg-opacity-70 text-white mt-4 p-4 rounded shadow">
              <h3 className="text-md font-bold mb-2">
                {t('profileSettings')}
              </h3>
              <div className="mb-3">
                <label className="font-semibold mr-2">
                  {t('username')}:
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="bg-gray-600 px-2 py-1 rounded"
                />
                <button
                  onClick={handleSetUsername}
                  className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1 rounded text-white font-semibold ml-2"
                >
                  {t('save')}
                </button>
              </div>
              <form
                onSubmit={handleProfilePicUpload}
                className="flex flex-col space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setAvatarFile(e.target.files[0])}
                    className="bg-gray-600 px-1 py-1 rounded"
                  />
                  <button
                    type="submit"
                    className="bg-purple-600 hover:bg-purple-500 px-3 py-1 rounded text-white font-semibold"
                  >
                    {t('uploadPic')}
                  </button>
                </div>
                {avatarFeedback && (
                  <p className="text-yellow-300">{avatarFeedback}</p>
                )}
              </form>
            </div>
          )}
        </div>

        {chatOpen && (
          <div className="mt-6">
            <CommunityChat address={walletAddress} username={username} />
          </div>
        )}

        <div className="mt-8 flex justify-between">
          <button
            onClick={() => setShowCommunityWatch(true)}
            className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded text-white font-semibold shadow-md flex items-center"
          >
            <img
              src="POLICE.png"
              alt="Police Icon"
              className="w-10 h-10 mr-2"
            />
            ETC Community Watch
          </button>
          <button
            onClick={() => setShowPendingAlerts(true)}
            className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded text-white font-semibold shadow-md flex items-center"
          >
            <img
              src="ALERT.png"
              alt="Alert Icon"
              className="w-10 h-10 mr-2"
            />
            Pending Alerts
          </button>
        </div>

        {showCommunityWatch && (
          <div className="mt-6">
            <ETCCommunityWatch
              walletAddress={walletAddress}
              darkMode={darkMode}
              onClose={() => setShowCommunityWatch(false)}
            />
          </div>
        )}

        {showPendingAlerts && (
          <div className="mt-6">
            <PendingAlertsModal
              onClose={() => setShowPendingAlerts(false)}
              address={walletAddress}
              darkMode={darkMode}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;




































