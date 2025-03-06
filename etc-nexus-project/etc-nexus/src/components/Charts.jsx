import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import CandlestickChart from './CandlestickChart';

function Charts() {
  const { t } = useTranslation();
  const [chartsOpen, setChartsOpen] = useState(true);

  // ---------------- TRADINGVIEW SETUP ----------------
  const tvPairs = [{ label: 'ETC/USDT', value: 'BINANCEUS:ETCUSDT' }];
  const [activeTab, setActiveTab] = useState('tradingview');
  const [tvSymbol, setTvSymbol] = useState(tvPairs[0].value);
  const [tvAnalysis, setTvAnalysis] = useState('');
  const [tvLoading, setTvLoading] = useState(false);
  const [tvError, setTvError] = useState('');

  const tradingViewURL = `https://www.tradingview.com/widgetembed/?frameElementId=etcChart&symbol=${encodeURIComponent(
    tvSymbol
  )}&interval=60&theme=dark&style=1&timezone=Etc%2FUTC&autosize=1`;

  // TradingView analysis => calls /api/chartAnalysis (Binance-based)
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

  // -------------------------------------------------------------------------
  // Only USD pairs (WETC pairs removed)
  // Format: "address:usd"
  // -------------------------------------------------------------------------
  const dexPairs = [
    { label: 'ETCPOW/USD', value: '0x730f59a8690b50724914d7b9b2f49a8dd18f5572:usd' },
    { label: 'PEPE/USD',   value: '0xcfe10aa566f8238d6509a7f3abbf9bdee2dde6da:usd' },
    { label: 'HEBE/USD',   value: '0xc1f4df5ca7894c32689072de15c5267e46b6747b:usd' },
    { label: 'TAD/USD',    value: '0x1ee6fcb75930d55adbaa94c17fd0d1f4071c54f5:usd' },
  ];

  // When a new pair is selected, clear previous pair info, analysis, and chart data
  const [selectedDexPair, setSelectedDexPair] = useState(dexPairs[0].value);
  const handleDexPairChange = (e) => {
    const newVal = e.target.value;
    setSelectedDexPair(newVal);
    setPairInfo(null);
    setDexAnalysis('');
    setDexChartData(null);
    setInfoError('');
    setDexError('');
    setDexChartError('');
  };

  // Helper: parse "0x1234...:usd" into { address, denom }
  function parsePairSelection(val) {
    const [address, denom] = val.split(':');
    return { address, denom };
  }

  // ---------------- Pair Info (DexScreener) ----------------
  const [pairInfo, setPairInfo] = useState(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState('');

  async function handleGetPairInfo() {
    try {
      setInfoLoading(true);
      setInfoError('');
      setPairInfo(null);

      const { address } = parsePairSelection(selectedDexPair);
      const url = `https://etc-nexus-server-production.up.railway.app/api/dexPair?pairAddress=${address}`;
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

  // ---------------- GPT Analysis (Dex) ----------------
  const [dexAnalysis, setDexAnalysis] = useState('');
  const [dexLoading, setDexLoading] = useState(false);
  const [dexError, setDexError] = useState('');

  async function handleDexAnalysis() {
    // Check if pair info is available – if not, instruct the user to press "Get Pair Info" first.
    if (!pairInfo || !pairInfo.baseToken?.symbol) {
      setDexError("Please press 'Get Pair Info' first to retrieve token details.");
      return;
    }

    try {
      setDexLoading(true);
      setDexError('');
      setDexAnalysis('');

      const { address } = parsePairSelection(selectedDexPair);
      // Use the token's symbol from pairInfo for GPT context.
      const tokenName = pairInfo.baseToken.symbol;

      const res = await fetch(
        'https://etc-nexus-server-production.up.railway.app/api/dexAnalysis',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pairAddress: address,
            tokenName: tokenName,
          }),
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

  // ---------------- DEX Chart (USD) ----------------
  const [dexChartData, setDexChartData] = useState(null);
  const [dexChartLoading, setDexChartLoading] = useState(false);
  const [dexChartError, setDexChartError] = useState('');

  async function handleGetDexChartData() {
    try {
      setDexChartLoading(true);
      setDexChartError('');
      setDexChartData(null);

      const { address, denom } = parsePairSelection(selectedDexPair);
      const denomParam = denom === 'usd' ? '&denom=usd' : '';
      const finalUrl = `https://etc-nexus-server-production.up.railway.app/api/dexChart?pairAddress=${address}${denomParam}`;
      const res = await fetch(finalUrl);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to fetch dex chart data.');
      }
      const rawCandles = await res.json();

      console.log('rawCandles =>', rawCandles);

      // Filter out incomplete candles
      const validCandles = rawCandles.filter(
        (c) =>
          c.timestamp != null &&
          c.open != null &&
          c.high != null &&
          c.low != null &&
          c.close != null
      );

      // Convert to numeric data for the chart
      const candleData = validCandles.map((c) => ({
        time: Number(c.timestamp),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
      }));

      // Sort in ascending order by time
      candleData.sort((a, b) => a.time - b.time);

      setDexChartData(candleData);
    } catch (err) {
      setDexChartError(err.message);
      console.error('handleGetDexChartData =>', err);
    } finally {
      setDexChartLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  return (
    <div className="mt-8 border border-emerald-500 p-4 rounded-xl shadow-xl bg-gray-800 bg-opacity-70">
      {/* Title Row */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-emerald-300">{t('ETC Charts')}</h2>
        <button
          onClick={() => setChartsOpen(!chartsOpen)}
          className="bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded text-white font-semibold transition-colors"
        >
          {chartsOpen ? t('Close Charts') : t('Open Charts')}
        </button>
      </div>

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
              {t('Dex Pairs')}
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

          {/* ---------------- DEX TAB ---------------- */}
          {activeTab === 'dexscreener' && (
            <>
              <div className="flex flex-col space-y-3 mb-4">
                <div className="flex items-center space-x-3">
                  <label className="text-gray-300">{t('selectEtcPair')}</label>
                  <select
                    className="bg-gray-700 text-white px-2 py-1 rounded"
                    value={selectedDexPair}
                    onChange={handleDexPairChange}
                  >
                    {dexPairs.map((dp) => (
                      <option key={dp.value} value={dp.value}>
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
                  <button
                    onClick={handleGetDexChartData}
                    className="bg-purple-600 hover:bg-purple-500 px-3 py-1 rounded text-white font-semibold"
                  >
                    Get Chart Data
                  </button>
                </div>
              </div>

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
                    {t('base')} {pairInfo.baseToken?.name} (
                    {pairInfo.baseToken?.symbol})
                  </p>
                  <p className="text-sm text-white">
                    {t('quote')} {pairInfo.quoteToken?.name} (
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

              {dexLoading && (
                <p className="text-yellow-300 mt-4">{t('generatingDexAnalysis')}</p>
              )}
              {dexError && <p className="text-red-400 mt-4">{dexError}</p>}
              {dexAnalysis && !dexLoading && (
                <div className="mt-4 bg-gray-700 p-3 rounded">
                  <h3 className="text-md font-bold text-emerald-300 mb-2">
                    {t('dexGptAnalysis')}
                  </h3>
                  <p className="text-sm text-white whitespace-pre-line">{dexAnalysis}</p>
                </div>
              )}

              {dexChartLoading && (
                <p className="text-yellow-300 mt-4">Loading chart data...</p>
              )}
              {dexChartError && (
                <p className="text-red-400 mt-4">{dexChartError}</p>
              )}
              {dexChartData && !dexChartLoading && (
                <div className="mt-4 bg-gray-700 p-3 rounded">
                  <h3 className="text-md font-bold text-emerald-300 mb-2">
                    Pair Price Chart
                  </h3>
                  <div style={{ width: '100%', height: '400px' }}>
                    <CandlestickChart data={dexChartData} />
                  </div>
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























