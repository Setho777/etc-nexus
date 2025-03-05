import React, { useState } from 'react';
import { ethers } from 'ethers';
import axios from 'axios';

function ETCCommunityWatch({ walletAddress, darkMode, onClose }) {
  const [suspiciousAddress, setSuspiciousAddress] = useState('');
  const [details, setDetails] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isError, setIsError] = useState(false); 

  const handleReport = async (e) => {
    e.preventDefault();
    setStatusMessage('');
    setIsError(false);

    if (!walletAddress) {
      setStatusMessage('Please connect your ETC wallet first.');
      setIsError(true);
      return;
    }
    if (!suspiciousAddress.trim() || !details.trim()) {
      setStatusMessage('Please fill out both the address and the details.');
      setIsError(true);
      return;
    }

    try {
      // Prepare data
      const formData = {
        suspiciousAddress,
        details,
        reporter: walletAddress,
        timestamp: Date.now(),
      };

      // Sign the ASCII text
      const dataToSign = JSON.stringify(formData);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const signature = await signer.signMessage(dataToSign);

      // POST
      const res = await axios.post('https://etc-chat-server-production.up.railway.app/api/communityWatch/report', {
        formData,
        signature,
      });

      if (res.data.success) {
        setStatusMessage(`✅ Report submitted! Incident ID: ${res.data.incidentId}`);
        setIsError(false);
        setSuspiciousAddress('');
        setDetails('');
      } else {
        setStatusMessage(`❌ Failed: ${res.data.error || 'Unknown error'}`);
        setIsError(true);
      }
    } catch (error) {
      console.error('Error reporting incident =>', error);
      setStatusMessage('❌ Error: ' + error.message);
      setIsError(true);
    }
  };

  // The container styling
  const containerClass = darkMode
    ? 'bg-gray-900 text-white'
    : 'bg-white text-gray-900';

  const inputClass = darkMode
    ? 'bg-gray-800 border-gray-600 text-white'
    : 'bg-white border-gray-300 text-gray-900';

  return (
    <div className={`${containerClass} border border-emerald-500 rounded p-4 shadow mt-4`}>
      {/* Header Row */}
      <div className="flex justify-between mb-2">
        <h2 className="text-xl font-bold">ETC Community Watch</h2>
        <button
          onClick={onClose}
          className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
        >
          ✕
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleReport}>
        <label className="block font-semibold mb-1">Suspicious Address:</label>
        <input
          type="text"
          value={suspiciousAddress}
          onChange={(e) => setSuspiciousAddress(e.target.value)}
          className={`w-full rounded px-2 py-1 mb-3 border ${inputClass}`}
          placeholder="0x123..., @telegramUser, or 'N/A'"
        />

        <label className="block font-semibold mb-1">Details:</label>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={4}
          className={`w-full rounded px-2 py-1 mb-3 border resize-none ${inputClass}`}
          placeholder="Describe the scam or suspicious activity..."
        />

        <button
          type="submit"
          className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded font-semibold"
        >
          Submit
        </button>
      </form>

      {/* Notification Banner */}
      {statusMessage && (
        <div
          className={`mt-4 p-2 rounded font-semibold ${
            isError
              ? 'bg-red-600 text-white'
              : 'bg-emerald-700 text-white'
          }`}
        >
          {statusMessage}
        </div>
      )}
    </div>
  );
}

export default ETCCommunityWatch;








