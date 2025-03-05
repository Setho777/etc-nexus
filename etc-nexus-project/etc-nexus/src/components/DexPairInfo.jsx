// src/components/DexPairInfo.jsx
import React, { useState } from 'react';

function DexPairInfo() {
  // We'll store the user’s input for pairAddress
  const [pairAddress, setPairAddress] = useState('0x730f59a8690b50724914d7b9b2f49a8dd18f5572');
  // The data we get from the server
  const [pairData, setPairData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // We'll have a hard-coded list of the 5 addresses:
  const knownPairs = [
    { label: 'ETCPOW/WETC', address: '0x730f59a8690b50724914d7b9b2f49a8dd18f5572' },
    { label: 'PEPE/WETC',   address: '0xcfe10aa566f8238d6509a7f3abbf9bdee2dde6da' },
    { label: 'HEBE/ETC',    address: '0xc1f4df5ca7894c32689072de15c5267e46b6747b' },
    { label: 'SHIBC/WETC',  address: '0xccd8dc89ee29d65802f36d75e458ca6f6b18493c' },
    { label: 'TAD/WETC',    address: '0xb39f62a28d3a44b07ae4e08f5788cd5570e7a27b' },
  ];

  async function handleFetch() {
    try {
      setLoading(true);
      setErrorMsg('');
      setPairData(null);

      // e.g. http://localhost:3000/api/dexPair?pairAddress=0x...
      const url = `http://localhost:3000/api/dexPair?pairAddress=${pairAddress}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Request failed');
      }

      const data = await res.json();
      setPairData(data);
    } catch (err) {
      console.error('DexPair fetch error =>', err);
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 border border-emerald-500 rounded bg-gray-800 text-white">
      <h2 className="text-xl font-bold mb-3 text-emerald-300">Dex Pair Info</h2>

      {/* A dropdown for the known pairs */}
      <label className="block mb-2">
        <span>Select Pair:</span>
        <select
          className="bg-gray-700 ml-2 px-2 py-1 rounded"
          value={pairAddress}
          onChange={(e) => setPairAddress(e.target.value)}
        >
          {knownPairs.map((p) => (
            <option key={p.address} value={p.address}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      {/* Or let them type any address if they want */}
      <label className="block mb-2">
        <span>Or enter a custom pairAddress:</span>
        <input
          type="text"
          className="bg-gray-700 ml-2 px-2 py-1 rounded w-96"
          value={pairAddress}
          onChange={(e) => setPairAddress(e.target.value)}
        />
      </label>

      <button
        onClick={handleFetch}
        className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded text-white font-semibold"
      >
        Fetch Pair Data
      </button>

      {loading && <p className="mt-3 text-yellow-300">Loading...</p>}

      {errorMsg && (
        <p className="mt-3 text-red-400 font-semibold">
          {errorMsg}
        </p>
      )}

      {pairData && !loading && (
        <div className="mt-4 bg-gray-700 p-3 rounded">
          <h3 className="text-md font-bold text-emerald-300 mb-2">
            Pair: {pairData.baseToken.symbol} / {pairData.quoteToken.symbol}
          </h3>
          <p>Base: {pairData.baseToken.name} ({pairData.baseToken.symbol})</p>
          <p>Quote: {pairData.quoteToken.name} ({pairData.quoteToken.symbol})</p>
          <p>Price (USD): {pairData.priceUsd}</p>
          <p>Volume 24h: {pairData.volume24}</p>
          <p>Liquidity (USD): {pairData.liquidityUsd}</p>
          <p>FDV: {pairData.fdv}</p>
        </div>
      )}
    </div>
  );
}

export default DexPairInfo;
