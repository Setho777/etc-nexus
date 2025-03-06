import React, { useEffect, useRef } from 'react';

export default function CandlestickChart({ data }) {
  const chartContainerRef = useRef(null);

  useEffect(() => {
    const LW = window.LightweightCharts;
    if (!LW) {
      console.error('LightweightCharts is not available on window!');
      return;
    }

    // Create the chart using container dimensions (will resize dynamically)
    const chart = LW.createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#202B33' },
        textColor: '#ffffff',
      },
      grid: {
        vertLines: { color: '#33414E' },
        horzLines: { color: '#33414E' },
      },
      crosshair: {
        mode: LW.CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time, tickMarkType, locale) => {
          const date = new Date(time * 1000);
          // Format to show hours and minutes (adjust locale/options as needed)
          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        },
      },
    });

    // Use ResizeObserver for responsiveness
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        chart.resize(entry.contentRect.width, entry.contentRect.height);
      }
    });
    resizeObserver.observe(chartContainerRef.current);

    // Add candlestick series with custom price formatting for small decimals
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#4bffb5',
      downColor: '#ff4976',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      priceFormat: {
        type: 'price',
        precision: 8,
        minMove: 0.00000001,
      },
    });

    // Set the provided data (should be an array with { time, open, high, low, close })
    candleSeries.setData(data || []);

    // Cleanup on unmount
    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [data]);

  return <div ref={chartContainerRef} style={{ width: '100%', height: '400px', minHeight: '300px' }} />;
}








