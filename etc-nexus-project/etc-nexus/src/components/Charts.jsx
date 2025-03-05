import React, { useState } from 'react';
import { useTranslation } from 'react-i18next'; // <-- NEW



function Charts() {
  // 1) Initialize translation
  const { t } = useTranslation();

  const [chartsOpen, setChartsOpen] = useState(true);

  // ---------------- TRADINGVIEW SETUP ----------------
 
  const tvPairs = [
    { label: 'ETC/USDT', value: 'BINANCEUS:ETCUSDT' },
  ];
  const [activeTab, setActiveTab] = useState('tradingview');
  const [tvSymbol, setTvSymbol] = useState(tvPairs[0].value);
  const [tvAnalysis, setTvAnalysis] = useState('');
  const [tvLoading, setTvLoading] = useState(false);
  const [tvError, setTvError] = useState('');

  // TradingView iFrame URL
  const tradingViewURL = `https://www.tradingview.com/widgetembed/?frameElementId=etcChart&symbol=${encodeURIComponent(
    tvSymbol
  )}&interval=60&theme=dark&style=1&timezone=Etc%2FUTC&autosize=1`;

  async function handleTvAnalysis() {
    try {
      setTvLoading(true);
      setTvError('');
      setTvAnalysis('');

      const res = await fetch(
        'https://etc-nexus-server-production.up.railway.app/api/chartAnalysis',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: tvSymbol }),
        }
      );
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to analyze TradingView pair.');
      }
      const data = await res.json();
      setTvAnalysis(data.analysis);
    } catch (err) {
      setTvError(err.message);
      console.error('TV Analysis error =>', err);
    } finally {
      setTvLoading(false);
    }
  }

  // ---------------- DEX PAIRS SETUP ----------------
  const dexPairs = [
    { label: 'ETCPOW/WETC', address: '0x730f59a8690b50724914d7b9b2f49a8dd18f5572' },
    { label: 'PEPE/WETC',   address: '0xcfe10aa566f8238d6509a7f3abbf9bdee2dde6da' },
    { label: 'HEBE/ETC',    address: '0xc1f4df5ca7894c32689072de15c5267e46b6747b' },
    { label: 'SHIBC/WETC',  address: '0xccd8dc89ee29d65802f36d75e458ca6f6b18493c' },
    { label: 'TAD/WETC',    address: '0xb39f62a28d3a44b07ae4e08f5788cd5570e7a27b' },
  ];
  const [selectedDexPair, setSelectedDexPair] = useState(dexPairs[0].address);

  // Pair Info
  const [pairInfo, setPairInfo] = useState(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState('');

  // Dex GPT Analysis
  const [dexAnalysis, setDexAnalysis] = useState('');
  const [dexLoading, setDexLoading] = useState(false);
  const [dexError, setDexError] = useState('');

  async function handleGetPairInfo() {
    try {
      setInfoLoading(true);
      setInfoError('');
      setPairInfo(null);

      // Updated to use Railway domain
      const url = `https://etc-nexus-server-production.up.railway.app/api/dexPair?pairAddress=${selectedDexPair}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t('failedFetchDexPair'));
      }
      const data = await res.json();
      setPairInfo(data);
    } catch (err) {
      console.error('handleGetPairInfo error =>', err);
      setInfoError(err.message);
    } finally {
      setInfoLoading(false);
    }
  }

  async function handleDexAnalysis() {
    try {
      setDexLoading(true);
      setDexError('');
      setDexAnalysis('');

      const res = await fetch(
        'https://etc-nexus-server-production.up.railway.app/api/dexAnalysis',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pairAddress: selectedDexPair }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t('failedDexAnalysis'));
      }
      const data = await res.json();
      setDexAnalysis(data.analysis);
    } catch (err) {
      console.error('handleDexAnalysis error =>', err);
      setDexError(err.message);
    } finally {
      setDexLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  return (
    <div className="mt-8 border border-emerald-500 p-4 rounded-xl shadow-xl bg-gray-800 bg-opacity-70">
      {/* Title Row => includes hide/show toggle */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-emerald-300">
          {t('ETC Charts')}
        </h2>
        <button
          onClick={() => setChartsOpen(!chartsOpen)}
          className="bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded text-white font-semibold transition-colors"
        >
          {chartsOpen ? t('Close Charts') : t('Open Charts')}
        </button>
      </div>

      {/* If chartsOpen => show the entire content */}
      {chartsOpen && (
        <>
          {/* Tab bar */}
          <div className="flex space-x-2 mb-4">
            <button
              onClick={() => setActiveTab('tradingview')}
              className={`px-3 py-1 rounded font-semibold transition-colors ${
                activeTab === 'tradingview'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
              }`}
            >
              {t('tradingView')}
            </button>
            <button
              onClick={() => setActiveTab('dexscreener')}
              className={`px-3 py-1 rounded font-semibold transition-colors ${
                activeTab === 'dexscreener'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
              }`}
            >
              {t('dex')}
            </button>
          </div>

          {/* ---------------- TRADINGVIEW TAB ---------------- */}
          {activeTab === 'tradingview' && (
            <>
              <div className="flex flex-wrap items-center space-x-3 mb-4">
                <label className="text-gray-300">{t('selectPair')}</label>
                <select
                  value={tvSymbol}
                  onChange={(e) => setTvSymbol(e.target.value)}
                  className="bg-gray-700 text-white px-2 py-1 rounded"
                >
                  {tvPairs.map((pair) => (
                    <option key={pair.value} value={pair.value}>
                      {pair.label}
                    </option>
                  ))}
                </select>

                <button
                  onClick={handleTvAnalysis}
                  className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1 rounded text-white font-semibold"
                >
                  {t('getAnalysis')}
                </button>
              </div>

              {/* TradingView iFrame */}
              <div className="w-full h-[500px] bg-gray-900 overflow-hidden">
                <iframe
                  title="TradingViewChart"
                  src={tradingViewURL}
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  allowFullScreen
                />
              </div>

              {/* TV Error or Analysis */}
              {tvError && (
                <p className="mt-4 text-red-400 font-semibold">{tvError}</p>
              )}
              {tvLoading && (
                <p className="mt-4 text-yellow-300 font-semibold">
                  {t('generatingTvAnalysis')}
                </p>
              )}
              {tvAnalysis && !tvLoading && (
                <div className="mt-4 bg-gray-700 bg-opacity-60 p-3 rounded">
                  <h3 className="text-md font-semibold text-emerald-300 mb-2">
                    {t('binancePairAnalysis')}
                  </h3>
                  <p className="text-sm text-white whitespace-pre-line">
                    {tvAnalysis}
                  </p>
                </div>
              )}
            </>
          )}

          {/* ---------------- DEX TAB (NO IFRAME) ---------------- */}
          {activeTab === 'dexscreener' && (
            <>
              <div className="flex flex-col space-y-3 mb-4">
                <div className="flex items-center space-x-3">
                  <label className="text-gray-300">{t('selectEtcPair')}</label>
                  <select
                    className="bg-gray-700 text-white px-2 py-1 rounded"
                    value={selectedDexPair}
                    onChange={(e) => setSelectedDexPair(e.target.value)}
                  >
                    {dexPairs.map((dp) => (
                      <option key={dp.address} value={dp.address}>
                        {dp.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={handleGetPairInfo}
                    className="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-white font-semibold"
                  >
                    {t('getPairInfo')}
                  </button>

                  <button
                    onClick={handleDexAnalysis}
                    className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1 rounded text-white font-semibold"
                  >
                    {t('getAnalysis')}
                  </button>
                </div>
              </div>

              {/* Pair Info Display */}
              {infoLoading && (
                <p className="text-yellow-300">{t('loadingPairInfo')}</p>
              )}
              {infoError && <p className="text-red-400">{infoError}</p>}

              {pairInfo && !infoLoading && (
                <div className="mt-4 bg-gray-700 p-3 rounded">
                  <h3 className="text-md font-bold text-emerald-300 mb-2">
                    {t('pairInfo')}
                  </h3>
                  <p className="text-sm text-white">
                    {t('base')}{' '}
                    {pairInfo.baseToken?.name} (
                    {pairInfo.baseToken?.symbol})
                  </p>
                  <p className="text-sm text-white">
                    {t('quote')}{' '}
                    {pairInfo.quoteToken?.name} (
                    {pairInfo.quoteToken?.symbol})
                  </p>
                  <p className="text-sm text-white">
                    {t('priceUsd')} {pairInfo.priceUsd}
                  </p>
                  <p className="text-sm text-white">
                    {t('volume24h')} {pairInfo.volume24}
                  </p>
                  <p className="text-sm text-white">
                    {t('liquidityUsd')} {pairInfo.liquidityUsd}
                  </p>
                  <p className="text-sm text-white">
                    {t('fdv')} {pairInfo.fdv}
                  </p>
                </div>
              )}

              {/* Dex Analysis (GPT) */}
              {dexLoading && (
                <p className="text-yellow-300 mt-4">
                  {t('generatingDexAnalysis')}
                </p>
              )}
              {dexError && <p className="text-red-400 mt-4">{dexError}</p>}

              {dexAnalysis && !dexLoading && (
                <div className="mt-4 bg-gray-700 p-3 rounded">
                  <h3 className="text-md font-bold text-emerald-300 mb-2">
                    {t('dexGptAnalysis')}
                  </h3>
                  <p className="text-sm text-white whitespace-pre-line">
                    {dexAnalysis}
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default Charts;














