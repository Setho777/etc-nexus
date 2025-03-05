import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ethers } from 'ethers';

function PendingAlertsModal({ onClose, address, darkMode }) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(false);

  // For top banner notifications (success/error)
  const [notifyMsg, setNotifyMsg] = useState('');
  const [notifyError, setNotifyError] = useState(false);

  useEffect(() => {
    fetchIncidents();
  }, []);

  const fetchIncidents = async () => {
    setLoading(true);
    setNotifyMsg('');
    setNotifyError(false);
    try {
      const res = await axios.get(
        'https://etc-chat-server-production.up.railway.app/api/communityWatch/incidents?status=REPORTED'
      );
      if (res.data.success) {
        setIncidents(res.data.incidents);
      } else {
        setNotifyMsg('Error loading incidents');
        setNotifyError(true);
      }
    } catch (err) {
      console.error('Error fetching incidents =>', err);
      setNotifyMsg('Server error fetching incidents');
      setNotifyError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (incidentId) => {
    if (!address) {
      setNotifyMsg('Please connect your wallet first.');
      setNotifyError(true);
      return;
    }
    setNotifyMsg('');
    setNotifyError(false);

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const verifyMsg = `I verify incident #${incidentId}`;
      const signature = await signer.signMessage(verifyMsg);

      const res = await axios.post('https://etc-chat-server-production.up.railway.app/api/communityWatch/verify', {
        incidentId,
        watcherAddress: address,
        signature,
      });

      if (res.data.success) {
        if (res.data.status === 'VERIFIED') {
          setNotifyMsg(`✅ Incident #${incidentId} is now VERIFIED!`);
          setNotifyError(false);
          // remove from the local array
          setIncidents((prev) => prev.filter((inc) => inc._id !== incidentId));
        } else {
          // partial success, still reported
          setNotifyMsg(
            `Incident #${incidentId} => watchers so far: ${res.data.watchers}`
          );
          setNotifyError(false);
        }
      } else {
        setNotifyMsg(`❌ Verification failed: ${res.data.error || 'Unknown error'}`);
        setNotifyError(true);
      }
    } catch (err) {
      console.error('Error verifying =>', err);
      setNotifyMsg('❌ Error verifying => ' + err.message);
      setNotifyError(true);
    }
  };

  // Modal styling
  const overlayClass =
    'fixed inset-0 z-50 bg-black bg-opacity-60 flex items-center justify-center';
  const modalBgClass = darkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900';

  return (
    <div className={overlayClass}>
      <div className={`${modalBgClass} w-11/12 max-w-3xl p-4 rounded shadow relative`}>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-100"
        >
          ✕
        </button>
        <h2 className="text-2xl font-bold text-red-400 mb-4">
          Pending Community Watch Alerts
        </h2>

        {/* Notification Banner */}
        {notifyMsg && (
          <div
            className={`mb-3 p-2 rounded font-semibold ${
              notifyError
                ? 'bg-red-600 text-white'
                : 'bg-emerald-700 text-white'
            }`}
          >
            {notifyMsg}
          </div>
        )}

        {loading && <p className="text-yellow-400 mb-2">Loading incidents...</p>}

        {/* If no pending and not loading */}
        {incidents.length === 0 && !loading ? (
          <p className="text-sm text-green-400">
            No pending alerts at this time.
          </p>
        ) : (
          <div className="max-h-[65vh] overflow-y-auto space-y-4">
            {incidents.map((inc) => (
              <div
                key={inc._id}
                className="border border-gray-700 rounded p-4 shadow bg-gray-800"
              >
                <h3 className="text-lg font-bold text-emerald-300 mb-2">
                  Incident {inc._id}
                </h3>
                <p className="text-sm text-gray-200 mb-1">
                  <span className="font-semibold">Suspicious:</span>{' '}
                  {inc.suspiciousAddress}
                </p>
                <div className="text-sm text-gray-200 mt-2 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                  {inc.details}
                </div>
                <button
                  onClick={() => handleVerify(inc._id)}
                  className="mt-3 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded font-semibold"
                >
                  Sign to Verify
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default PendingAlertsModal;


