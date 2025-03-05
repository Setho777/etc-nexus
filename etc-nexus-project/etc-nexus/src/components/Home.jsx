import React, { useState } from 'react';
import Blog from './Blog';
import Dashboard from './Dashboard';

function Home({ walletAddress, darkMode }) {
  const [blogOpen, setBlogOpen] = useState(true);

  return (
    <div className="flex-grow flex flex-col md:flex-row">
      {blogOpen ? (
        <div className="w-full md:w-1/4 transition-all duration-300">
          <Blog blogOpen={blogOpen} setBlogOpen={setBlogOpen} />
        </div>
      ) : (
        <div className="w-full md:w-1/12 bg-gray-900 p-4 flex flex-col items-start">
          <button
            onClick={() => setBlogOpen(true)}
            className="bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded text-white font-semibold"
          >
            Open Blog
          </button>
        </div>
      )}

      <div
        className={`transition-all duration-300 ${
          blogOpen ? 'w-full md:w-3/4' : 'w-full md:w-11/12'
        }`}
      >
        <Dashboard walletAddress={walletAddress} darkMode={darkMode} />
      </div>
    </div>
  );
}

export default Home;






