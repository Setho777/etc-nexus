import React, { useState } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './components/Home';
import Chat from './components/Chat';

function App() {
  const [walletAddress, setWalletAddress] = useState('');
  // New state to hold the signer from ethers
  const [signer, setSigner] = useState(null);
  const [darkMode, setDarkMode] = useState(true);

  const containerClass = darkMode
    ? 'min-h-screen bg-gray-950 text-white flex flex-col'
    : 'min-h-screen bg-white text-gray-900 flex flex-col';

  return (
    <div className={containerClass}>
      <Header
        walletAddress={walletAddress}
        setWalletAddress={setWalletAddress}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        signer={signer}
        setSigner={setSigner}
      />
      
      {/* Render Home which itself renders Dashboard */}
      <Home walletAddress={walletAddress} darkMode={darkMode} signer={signer} />
      
      <Chat />
      <Footer darkMode={darkMode} />
    </div>
  );
}

export default App;















