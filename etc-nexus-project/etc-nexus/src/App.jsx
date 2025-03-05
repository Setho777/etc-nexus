import React, { useState } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './components/Home';
import Chat from './components/Chat';

function App() {
  
  const [walletAddress, setWalletAddress] = useState('');

 
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
      />

      
      <Home walletAddress={walletAddress} darkMode={darkMode} />
      
      <Chat />

      <Footer darkMode={darkMode} />
    </div>
  );
}

export default App;











