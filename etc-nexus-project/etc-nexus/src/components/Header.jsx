import React, { useState, useEffect } from 'react';
import { ethers, formatEther } from 'ethers';
import { useTranslation } from 'react-i18next';

function Header({ walletAddress, setWalletAddress, darkMode, setDarkMode }) {
  const { t, i18n } = useTranslation();

  const [etcBalance, setEtcBalance] = useState(null);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const showNotification = (message, type = 'error') => {
    setNotification({ message, type });
  };

  const connectWallet = async () => {
    if (typeof window.ethereum === 'undefined') {
      showNotification(
        'MetaMask (or a compatible wallet) is not installed!',
        'error'
      );
      return;
    }

    try {
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (chainId.toLowerCase() !== '0x3d') {
        showNotification('Please switch MetaMask to ETC (chainId 61).', 'error');
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setWalletAddress(address);

      const balanceBigInt = await provider.getBalance(address);
      setEtcBalance(formatEther(balanceBigInt));
    } catch (error) {
      showNotification('User rejected or error occurred connecting.', 'error');
      console.error(error);
    }
  };

  const handleToggleTheme = () => setDarkMode(!darkMode);

  const forceGoogleTranslate = (langCode) => {
    const googleCombo = document.querySelector('select.goog-te-combo');
    if (!googleCombo) {
      console.warn('Google Translate dropdown not found.');
      return;
    }
    googleCombo.value = langCode;
    googleCombo.dispatchEvent(new Event('change'));
  };

  const switchToEnglish = () => {
    i18n.changeLanguage('en');
    forceGoogleTranslate('en');
  };

  const switchToChinese = () => {
    i18n.changeLanguage('zh');
    forceGoogleTranslate('zh-CN');
  };

  const modeIcon = darkMode ? (
    // SUN icon
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      className="w-5 h-5"
    >
      <path d="M12 1.75a.75.75 0 01.75.75v1.06a.75.75 0 01-1.5 0V2.5A.75.75 0 0112 1.75zm5.72 3.03a.75.75 0 011.06 1.06l-.75.75a.75.75 0 11-1.06-1.06l.75-.75zM17.5 12a5.5 5.5 0 11-11 0 5.5 5.5 0 0111 0zm-6.75 8.44a.75.75 0 011.5 0v1.06a.75.75 0 01-1.5 0v-1.06zm8.75-8.44c0-.41.34-.75.75-.75h1.06a.75.75 0 010 1.5H20a.75.75 0 01-.75-.75zm-16.25.75H2.5a.75.75 0 010-1.5h1.06a.75.75 0 010 1.5zm14.22 6.22a.75.75 0 011.06 1.06l-.75.75a.75.75 0 11-1.06-1.06l.75-.75zm-12.44.75l-.75.75a.75.75 0 101.06 1.06l.75-.75a.75.75 0 10-1.06-1.06z" />
    </svg>
  ) : (
    // MOON icon
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      className="w-5 h-5"
    >
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.752 15.002A9.718 9.718 0 0112.13 3.727a.75.75 0 10-.84-1.264 11.218 11.218 0 1011.974 12.768.75.75 0 00-1.512-.23z"
      />
    </svg>
  );

  return (
    <header
      className={
        (darkMode
          ? 'bg-gray-950 py-4 shadow-lg' 
          : 'bg-gray-800 py-4 shadow-lg' 
        ) +
        ' border-b-2 border-emerald-600' 
      }
    >
      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-4 right-4 z-50">
          <div
            className={`px-4 py-2 rounded shadow ${
              notification.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'
            } text-white`}
          >
            {notification.message}
          </div>
        </div>
      )}

      <div className="container max-w-none mx-auto px-2 sm:px-4 flex flex-wrap justify-between items-center">
        {/* Logo/Title */}
        <div className="flex items-center space-x-4">
          <img
            src="/NEXUSlogo.png"
            alt="ETC Logo"
            className="h-20 w-20 object-contain"
          />
          <div>
            <h1
              className={
                darkMode
                  ? 'text-3xl font-extrabold text-emerald-400'
                  : 'text-3xl font-extrabold text-emerald-600'
              }
            >
              {t('headerTitle')}
            </h1>
            <p
              className={
                darkMode ? 'text-sm text-gray-400' : 'text-sm text-gray-200'
              }
            >
              {t('tagline')}
            </p>
          </div>
        </div>

        
        <div className="flex items-center space-x-4 mt-4 sm:mt-0">
         
          <div className="flex items-center space-x-2">
            <button
              onClick={switchToEnglish}
              className="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded"
            >
              EN
            </button>
            <button
              onClick={switchToChinese}
              className="bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded"
            >
              中文
            </button>
          </div>

          {/* Dark Mode Icon Toggle */}
          <button
            onClick={handleToggleTheme}
            className="bg-gray-600 hover:bg-gray-500 p-2 rounded text-white"
            title={t('toggleTheme')}
          >
            {modeIcon}
          </button>

          {/* If we have a walletAddress, show it & ETC balance */}
          {walletAddress && etcBalance !== null ? (
            <div className="bg-gray-700 text-white px-3 py-1 rounded-lg flex items-center space-x-2">
              <span className="font-bold text-emerald-300">
                {walletAddress.slice(0, 6)}...
                {walletAddress.slice(-4)}
              </span>
              <span className="text-sm text-gray-300">
                {parseFloat(etcBalance).toFixed(4)} ETC
              </span>
            </div>
          ) : (
            // Otherwise show "Connect Wallet" button
            <button
              onClick={connectWallet}
              className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white px-5 py-2 rounded-lg font-semibold shadow-md transition duration-300"
            >
              {t('connectWallet')}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;












