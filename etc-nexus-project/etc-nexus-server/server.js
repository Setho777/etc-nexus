require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Configuration, OpenAIApi } = require('openai');
const cron = require('node-cron');
const { ethers } = require('ethers');
const { TwitterApi } = require('twitter-api-v2');

const app = express();
app.use(express.json());

const allowedOrigins = [
  'http://localhost:5174',
  'https://etc-nexus-server-production.up.railway.app',
  'https://etc-nexus.netlify.app'
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  })
);

// ---------------------------------------------------------------------
// OpenAI Setup
// ---------------------------------------------------------------------
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// ---------------------------------------------------------------------
// Twitter Setup
// ---------------------------------------------------------------------
const twitterClient = new TwitterApi({
  appKey: process.env.X_APP_KEY,
  appSecret: process.env.X_APP_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_SECRET,
});

async function postToX(text) {
  try {
    const mediaId = await twitterClient.v1.uploadMedia('./BlogImage.png');
    await twitterClient.v2.tweet({
      text,
      media: { media_ids: [mediaId] },
    });
    console.log('✅ Tweeted =>', text.slice(0, 60), '...');
  } catch (err) {
    console.error('❌ Error posting to X =>', err);
  }
}

// ---------------------------------------------------------------------
// Optional Knowledge Base
// ---------------------------------------------------------------------
const knowledgeBasePath = path.join(__dirname, 'knowledgeBase.txt');
let knowledgeData = [];

async function embedKnowledgeBase() {
  if (!fs.existsSync(knowledgeBasePath)) {
    console.warn('⚠️ No knowledgeBase.txt found—skipping embedding.');
    return;
  }
  const rawText = fs.readFileSync(knowledgeBasePath, 'utf8');
  const chunks = rawText
    .split(/\n\s*\n/g)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  console.log(`📖 Loaded ${chunks.length} ETC knowledge base entries.`);
  for (let i = 0; i < chunks.length; i++) {
    try {
      console.log(`Embedding chunk #${i + 1}`);
      const chunkText = chunks[i];
      const embedRes = await openai.createEmbedding({
        model: 'text-embedding-ada-002',
        input: chunkText,
      });
      const embedding = embedRes.data.data[0].embedding;
      knowledgeData.push({ text: chunkText, embedding });
      console.log(`✅ Embedded chunk #${i + 1}`);
    } catch (err) {
      console.error(`❌ Error embedding chunk #${i + 1}:`, err.message);
    }
  }
  console.log(`✅ Finished embedding ${knowledgeData.length} chunks.`);
}

// ---------------------------------------------------------------------
// /api/dexChart => geckoTerminal feed
// ---------------------------------------------------------------------
app.get('/api/dexChart', async (req, res) => {
  const { pairAddress, denom } = req.query;
  if (!pairAddress) {
    return res.status(400).json({ error: 'Missing pairAddress query parameter.' });
  }

  try {
    if (denom === 'usd') {
      const usdUrl = `https://api.geckoterminal.com/api/v2/networks/ethereum_classic/pools/${pairAddress}/ohlcv/hour?quote=usd`;
      const usdResp = await axios.get(usdUrl);

      if (!usdResp.data?.data?.attributes) {
        return res.status(404).json({ error: 'No USD data found' });
      }

      const usdList = usdResp.data.data.attributes.ohlcv_list || [];
      if (usdList.length === 0) {
        return res.status(404).json({ error: 'No USD candle data found' });
      }

      const usdCandles = [];
      usdList.forEach((c, i) => {
        const ms = c[0];
        const openStr = c[1];
        const highStr = c[2];
        const lowStr = c[3];
        const closeStr = c[4];
        if (
          ms == null ||
          openStr == null ||
          highStr == null ||
          lowStr == null ||
          closeStr == null
        ) {
          console.warn(`Skipping #${i} => missing field`, c);
          return;
        }

        const timeNum = Math.floor(ms / 1000);
        const openNum = parseFloat(openStr);
        const highNum = parseFloat(highStr);
        const lowNum = parseFloat(lowStr);
        const closeNum = parseFloat(closeStr);

        if (
          isNaN(timeNum) ||
          isNaN(openNum) ||
          isNaN(highNum) ||
          isNaN(lowNum) ||
          isNaN(closeNum)
        ) {
          console.warn(`Skipping #${i} => parseFloat gave NaN`, c);
          return;
        }

        usdCandles.push({
          timestamp: timeNum,
          open: openNum,
          high: highNum,
          low: lowNum,
          close: closeNum,
          volume: parseFloat(c[5]) || 0,
        });
      });

      return res.json(usdCandles);
    }

    // Otherwise => ratio-based feed
    const geckoUrl = `https://api.geckoterminal.com/api/v2/networks/ethereum_classic/pools/${pairAddress}/ohlcv/hour`;
    const response = await axios.get(geckoUrl);
    const ohlcvData = response.data.data.attributes.ohlcv_list || [];

    const formattedCandles = [];
    ohlcvData.forEach((c, i) => {
      const ms = c[0];
      const openStr = c[1];
      const highStr = c[2];
      const lowStr = c[3];
      const closeStr = c[4];

      if (
        ms == null ||
        openStr == null ||
        highStr == null ||
        lowStr == null ||
        closeStr == null
      ) {
        console.warn(`Skipping candle #${i} => missing field`, c);
        return;
      }

      const timeNum = Math.floor(ms / 1000);
      const openNum = parseFloat(openStr);
      const highNum = parseFloat(highStr);
      const lowNum = parseFloat(lowStr);
      const closeNum = parseFloat(closeStr);

      if (
        isNaN(timeNum) ||
        isNaN(openNum) ||
        isNaN(highNum) ||
        isNaN(lowNum) ||
        isNaN(closeNum)
      ) {
        console.warn(`Skipping candle #${i} => parseFloat gave NaN`, c);
        return;
      }

      formattedCandles.push({
        timestamp: timeNum,
        open: openNum,
        high: highNum,
        low: lowNum,
        close: closeNum,
        volume: parseFloat(c[5]) || 0,
      });
    });

    return res.json(formattedCandles);
  } catch (err) {
    console.error('❌ Error fetching Chart data:', err.message);
    return res.status(500).json({ error: 'Failed to fetch DEX chart data.' });
  }
});

// ---------------------------------------------------------------------
// PERSISTENCE => blogPosts.json
// ---------------------------------------------------------------------
const BLOG_POSTS_FILE = path.join(__dirname, 'blogPosts.json');
let blogPosts = [];

function loadBlogPosts() {
  if (fs.existsSync(BLOG_POSTS_FILE)) {
    try {
      const data = fs.readFileSync(BLOG_POSTS_FILE, 'utf8');
      blogPosts = JSON.parse(data);
      console.log(`✅ Loaded ${blogPosts.length} posts from ${BLOG_POSTS_FILE}.`);
    } catch (err) {
      console.error('❌ Could not parse blogPosts.json =>', err.message);
    }
  } else {
    console.log(`⚠️ No existing ${BLOG_POSTS_FILE} found—starting empty.`);
  }
}

function saveBlogPosts() {
  try {
    fs.writeFileSync(BLOG_POSTS_FILE, JSON.stringify(blogPosts, null, 2), 'utf8');
    console.log(`✅ Saved ${blogPosts.length} posts to ${BLOG_POSTS_FILE}.`);
  } catch (err) {
    console.error('❌ Error writing blogPosts.json =>', err.message);
  }
}

// ---------------------------------------------------------------------
// /api/chat => multi-turn ETC Knowledge Bot
// ---------------------------------------------------------------------
app.post('/api/chat', async (req, res) => {
  try {
    const { conversationHistory } = req.body;
    if (!Array.isArray(conversationHistory)) {
      return res.status(400).json({
        error: 'conversationHistory must be an array of {role, content}.'
      });
    }

    const messages = [
      {
        role: 'system',
        content: 'You are a helpful Ethereum Classic knowledge bot.',
      },
      ...conversationHistory,
    ];

    console.log('Chat messages =>', JSON.stringify(messages, null, 2));

    const completion = await openai.createChatCompletion({
      model: 'gpt-4',
      messages,
      temperature: 0.7,
    });

    const reply = completion.data.choices[0].message.content.trim();
    console.log('Chat GPT-4 reply =>', reply.slice(0, 80), '...');
    return res.json({ reply });
  } catch (err) {
    console.error('❌ GPT-4 Chat Error =>', err.message);
    return res.status(500).json({ error: 'OpenAI error' });
  }
});

// ---------------------------------------------------------------------
// 3 daily posts => Market / General ETC / Community
// ---------------------------------------------------------------------
app.get('/api/blog', (req, res) => {
  // sort descending so newest is first
  blogPosts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return res.json({ blogPosts });
});

// ---------------------------------------------------------------------
// Helper to generate all daily posts
// ---------------------------------------------------------------------
async function generateAllPosts() {
  const categories = ['Market Analysis', 'General ETC', 'Community Buzz'];
  const results = [];
  for (const cat of categories) {
    if (cat === 'Market Analysis') {
      results.push(await generateMarketAnalysisPost());
    } else if (cat === 'General ETC') {
      results.push(await generateGeneralEtcPost());
    } else if (cat === 'Community Buzz') {
      results.push(await generateCommunityBuzzPost());
    }
  }
  return results;
}

// 1) Market Analysis => from CoinGecko
async function generateMarketAnalysisPost() {
  console.log('🔎 Market => fetching CoinGecko...');
  try {
    const cgUrl =
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum-classic&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true';
    console.log('CoinGecko GET =>', cgUrl);
    const cgRes = await axios.get(cgUrl);
    console.log('CoinGecko response => status:', cgRes.status, 'data:', cgRes.data);

    const etc = cgRes.data['ethereum-classic'];
    if (
      !etc ||
      typeof etc.usd !== 'number' ||
      typeof etc.usd_24h_vol !== 'number' ||
      typeof etc.usd_24h_change !== 'number'
    ) {
      throw new Error('CoinGecko response missing some ETC price data.');
    }

    const price = etc.usd;
    const vol = etc.usd_24h_vol;
    const change = etc.usd_24h_change;

    const prompt = `
      ETC price: $${price.toFixed(2)},
      24h vol: ~$${Number(vol).toLocaleString()},
      24h change: ${change.toFixed(2)}%.
      Write a 200-300 word analysis focusing on these stats.
      Maintain a friendly, positive, uplifting tone. Mention short-term trading factors.
    `;
    console.log('Market prompt =>', prompt.slice(0, 100), '...');

    const gptRes = await openai.createChatCompletion({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 700,
    });
    console.log(
      'Market GPT =>',
      gptRes.data.choices[0].message.content.slice(0, 100),
      '...'
    );

    return {
      id: Date.now() + 1,
      category: 'Market Analysis',
      title: `ETC Market Analysis - ${new Date().toDateString()}`,
      body: gptRes.data.choices[0].message.content.trim(),
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('🚨 Market Analysis error =>', err.message);
    return {
      id: Date.now() + 1,
      category: 'Market Analysis',
      title: `ETC Market Analysis - ${new Date().toDateString()}`,
      body: `Unable to fetch real ETC data from CoinGecko. "ETC saw typical fluctuations..."`,
      createdAt: new Date().toISOString(),
    };
  }
}

// 2) General ETC => from minerstat + ethers.js
async function generateGeneralEtcPost() {
  console.log('🔎 General ETC => fetching chain stats...');
  try {
    const msUrl = 'https://api.minerstat.com/v2/coins?list=ETC';
    console.log('Minerstat GET =>', msUrl);
    const msRes = await axios.get(msUrl);
    console.log('Minerstat response => status:', msRes.status);

    const etcInfo = msRes.data.find((c) => c.coin === 'ETC');
    if (!etcInfo) throw new Error('No ETC data in minerstat');
    const netHash = etcInfo.network_hashrate;
    const difficultyMS = etcInfo.difficulty;

    // Ethers
    const rpc = 'https://etc.rivet.link';
    console.log('Ethers => connecting to', rpc);
    const provider = new ethers.JsonRpcProvider(rpc);
    const blockNumber = await provider.getBlockNumber();
    console.log('Ethers => latest block =>', blockNumber);

    const block = await provider.getBlock(blockNumber);
    console.log('Ethers => block data =>', {
      difficulty: block.difficulty?.toString(),
      gasUsed: block.gasUsed?.toString(),
    });

    const netHashTH = (netHash / 1e12).toFixed(2);
    const diffMSDisplay = Number(difficultyMS).toLocaleString();
    const blockDiff = block.difficulty ? block.difficulty.toString() : '(missing)';

    const prompt = `
      Ethereum Classic chain stats:
      - Minerstat => ~${netHashTH} TH/s, difficulty: ${diffMSDisplay}
      - Ethers => latest block #${blockNumber}, block diff: ${blockDiff}

      Write a 200-300 word "General ETC" update summarizing these real stats.
      Maintain an upbeat, encouraging tone. Keep it concise & easy to read.
    `;
    console.log('General ETC prompt =>', prompt.slice(0, 100), '...');

    const gptRes = await openai.createChatCompletion({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 700,
    });
    console.log(
      'General ETC GPT =>',
      gptRes.data.choices[0].message.content.slice(0, 100),
      '...'
    );

    return {
      id: Date.now() + 2,
      category: 'General ETC',
      title: `ETC General Update - ${new Date().toDateString()}`,
      body: gptRes.data.choices[0].message.content.trim(),
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('🚨 General ETC chain stats error =>', err.message);
    const fallbackPrompt = `
      Could not fetch ETC chain stats from minerstat or ethers.
      Write a short 200-300 word "General ETC" update disclaiming no real data,
      but keep a positive tone.
    `;
    const fallback = await openai.createChatCompletion({
      model: 'gpt-4',
      messages: [{ role: 'user', content: fallbackPrompt }],
      temperature: 0.8,
      max_tokens: 400,
    });
    return {
      id: Date.now() + 2,
      category: 'General ETC',
      title: `ETC General Update - ${new Date().toDateString()}`,
      body: fallback.data.choices[0].message.content.trim(),
      createdAt: new Date().toISOString(),
    };
  }
}

// 3) Community Buzz => from Twitter (X)
async function generateCommunityBuzzPost() {
  console.log('🔎 Community Buzz => fetching tweets from X...');
  try {
    const bearer = process.env.X_BEARER_TOKEN;
    if (!bearer) throw new Error('No X_BEARER_TOKEN in .env');

    const rawQuery = '#etcarmy -is:retweet lang:en';
    const encodedQuery = encodeURIComponent(rawQuery);
    const maxResults = 10;
    const url = `https://api.twitter.com/2/tweets/search/recent?query=${encodedQuery}`
      + `&max_results=${maxResults}&tweet.fields=created_at,text`
      + `&expansions=author_id&user.fields=username`;

    console.log('X GET =>', url);
    const resp = await axios.get(url, {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    console.log('X response => status:', resp.status);

    let tweets = resp.data.data || [];
    console.log('Raw tweets =>', JSON.stringify(tweets, null, 2));

    const includes = resp.data.includes || {};
    const userArray = includes.users || [];
    const userMap = {};
    userArray.forEach((u) => {
      userMap[u.id] = u.username;
    });

    if (tweets.length === 0) {
      throw new Error('No relevant ETC tweets found');
    }

    let tweetSummary = '';
    tweets.forEach((tw, i) => {
      const authorName = userMap[tw.author_id] || 'UnknownUser';
      tweetSummary += `Tweet #${i + 1} (by @${authorName}): ${tw.text}\n\n`;
    });

    const prompt = `
      Below are up to ${maxResults} recent tweets referencing #etcarmy.
      Summarize them in ~200-300 words as a "Community Buzz" post, positive spin.
      Focus on real ETC sentiment, highlight optimism.
      ${tweetSummary}
    `;
    console.log('Community Buzz prompt =>', prompt.slice(0, 100), '...');

    const summary = await openai.createChatCompletion({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 700,
    });
    console.log(
      'Community GPT =>',
      summary.data.choices[0].message.content.slice(0, 100),
      '...'
    );

    return {
      id: Date.now() + 3,
      category: 'Community Buzz',
      title: `ETC Community Buzz - ${new Date().toDateString()}`,
      body: summary.data.choices[0].message.content.trim(),
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('🚨 Community Buzz error =>', err.message);
    if (err.response) {
      console.log('X error body =>', err.response.data);
    }
    const fallbackPrompt = `
      We couldn't fetch real ETC tweets or got rate-limited.
      Write a 200-300 word "Community Buzz" disclaiming no real data,
      but keep a positive, uplifting tone.
    `;
    const fallback = await openai.createChatCompletion({
      model: 'gpt-4',
      messages: [{ role: 'user', content: fallbackPrompt }],
      temperature: 0.8,
      max_tokens: 400,
    });
    return {
      id: Date.now() + 3,
      category: 'Community Buzz',
      title: `ETC Community Buzz - ${new Date().toDateString()}`,
      body: fallback.data.choices[0].message.content.trim(),
      createdAt: new Date().toISOString(),
    };
  }
}

// 4) Generate single “Daily Overview” referencing the 3 new posts
async function generateDailyOverviewPost(newPosts) {
  try {
    let snippet = '';
    newPosts.forEach((p, i) => {
      snippet += `Post #${i + 1} [${p.category}]: ${p.title}\nExcerpt: ${p.body.slice(
        0,
        120
      )}...\n\n`;
    });

    const prompt = `
      Create a short ETC Daily Overview (~200-250 words) referencing these 3 new posts:
      ${snippet}

      Summarize key points, mention ETC cohesively,
      maintain an uplifting tone. 
      Include #ETC, #ETCArmy, #EthereumClassic. Friendly conclusion.
    `;

    const gptRes = await openai.createChatCompletion({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 400,
    });

    return {
      id: Date.now() + 4,
      category: 'Daily Overview',
      title: `ETC Daily Overview - ${new Date().toDateString()}`,
      body: gptRes.data.choices[0].message.content.trim(),
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('❌ generateDailyOverview error =>', err.message);
    return {
      id: Date.now() + 4,
      category: 'Daily Overview',
      title: `ETC Daily Overview - ${new Date().toDateString()}`,
      body: `We couldn't generate a daily overview. Please check logs.`,
      createdAt: new Date().toISOString(),
    };
  }
}

// ---------------------------------------------------------------------
// CRON => generate daily posts at 08:00
// ---------------------------------------------------------------------
cron.schedule('0 8 * * *', async () => {
  console.log('🔔 Cron triggered => generating daily posts...');
  try {
    const newPosts = await generateAllPosts();
    newPosts.forEach((p) => blogPosts.unshift(p));
    console.log(
      '✅ 3 daily blog posts generated:',
      newPosts.map((x) => x.title).join(' | ')
    );

    // Then create a daily overview referencing these 3 new posts
    const overviewPost = await generateDailyOverviewPost(newPosts);
    blogPosts.unshift(overviewPost);

    // << ADDED: Trim to keep the newest 4
    blogPosts = blogPosts.slice(0, 4);

    // Save
    saveBlogPosts();

    // Tweet daily overview
    await postToX(overviewPost.body);
  } catch (err) {
    console.error('❌ daily generation error =>', err.message);
  }
});

// ---------------------------------------------------------------------
// /api/chartAnalysis => (Binance-based)
// ---------------------------------------------------------------------
app.post('/api/chartAnalysis', async (req, res) => {
  try {
    const { symbol } = req.body;
    if (!symbol) {
      return res.status(400).json({ error: 'Missing symbol in request body.' });
    }

    let pair = '';
    if (symbol.startsWith('BINANCEUS:')) {
      pair = symbol.replace('BINANCEUS:', '').trim().toUpperCase();
    } else if (symbol.startsWith('BINANCE:')) {
      pair = symbol.replace('BINANCE:', '').trim().toUpperCase();
    } else {
      return res.status(400).json({
        error: 'Invalid symbol. Must start with "BINANCE:" or "BINANCEUS:".',
      });
    }

    const binanceUrl = `https://api.binance.us/api/v3/klines?symbol=${pair}&interval=1h&limit=24`;
    const klineRes = await axios.get(binanceUrl);
    const klines = klineRes.data;

    if (!Array.isArray(klines) || klines.length === 0) {
      throw new Error(`No kline data returned for ${pair}`);
    }

    let highestHigh = 0;
    let lowestLow = Number.MAX_VALUE;
    let totalVolume = 0;
    let lastClose = 0;

    klines.forEach((c) => {
      const openPrice = parseFloat(c[1]);
      const highPrice = parseFloat(c[2]);
      const lowPrice = parseFloat(c[3]);
      const closePrice = parseFloat(c[4]);
      const volume = parseFloat(c[5]);

      if (highPrice > highestHigh) highestHigh = highPrice;
      if (lowPrice < lowestLow) lowestLow = lowPrice;
      totalVolume += volume;
      lastClose = closePrice;
    });

    const firstOpen = parseFloat(klines[0][1]);
    const dayChange = ((lastClose - firstOpen) / firstOpen) * 100;

    const summary = `
- 24-hour open price: ${firstOpen.toFixed(4)}
- 24-hour highest high: ${highestHigh.toFixed(4)}
- 24-hour lowest low: ${lowestLow.toFixed(4)}
- Latest close price: ${lastClose.toFixed(4)}
- Total volume (24h): ${totalVolume.toFixed(4)}
- % Change (24h): ${dayChange.toFixed(2)}%
    `;

    const prompt = `
      You are an expert crypto trading analyst focusing on Ethereum Classic and related pairs on Binance.
      Pair: ${pair}
      Over last 24h (1h candles), summary:
      ${summary}

      Provide thorough but concise technical analysis:
      - Price trend
      - Volume significance
      - Potential support/resistance
      - short-term factors/patterns
      150-250 words, professional, actionable.
    `;

    const gptRes = await openai.createChatCompletion({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.85,
      max_tokens: 700,
    });

    const analysis = gptRes.data.choices[0].message.content.trim();
    return res.json({ analysis });
  } catch (err) {
    console.error('❌ /api/chartAnalysis error =>', err.message);
    return res.status(500).json({ error: 'Failed to analyze chart.' });
  }
});

// ---------------------------------------------------------------------
// /api/dexAnalysis => For custom tokens (CoinGecko / geckoTerminal).
// ---------------------------------------------------------------------
app.post('/api/dexAnalysis', async (req, res) => {
  try {
    const { pairAddress, tokenName } = req.body;
    if (!pairAddress) {
      return res.status(400).json({ error: 'Missing pairAddress in request body.' });
    }

    // 1) Get hour candles from geckoTerminal
    const geckoUrl = `https://api.geckoterminal.com/api/v2/networks/ethereum_classic/pools/${pairAddress}/ohlcv/hour`;
    const gtRes = await axios.get(geckoUrl);

    if (!gtRes.data?.data?.attributes?.ohlcv_list) {
      throw new Error('No geckoTerminal data for that address');
    }
    const ohlcvList = gtRes.data.data.attributes.ohlcv_list;

    if (!Array.isArray(ohlcvList) || ohlcvList.length === 0) {
      throw new Error('No candles returned from geckoTerminal');
    }

    // Sort ascending
    const sorted = ohlcvList.slice().sort((a, b) => a[0] - b[0]);
    // last 24
    const last24 = sorted.slice(-24);

    let highestHigh = 0;
    let lowestLow = Number.MAX_VALUE;
    let totalVolume = 0;
    let firstOpen = 0;
    let lastClose = 0;

    last24.forEach((c, i) => {
      const openNum = parseFloat(c[1]);
      const highNum = parseFloat(c[2]);
      const lowNum = parseFloat(c[3]);
      const closeNum = parseFloat(c[4]);
      const volNum = parseFloat(c[5]);

      if (i === 0) firstOpen = openNum;
      if (i === last24.length - 1) lastClose = closeNum;

      if (highNum > highestHigh) highestHigh = highNum;
      if (lowNum < lowestLow) lowestLow = lowNum;
      totalVolume += volNum;
    });

    const dayChange = ((lastClose - firstOpen) / firstOpen) * 100;

    const summary = `
Token Name: ${tokenName || 'UnknownToken'}

- 24-hour open: ${firstOpen.toFixed(6)}
- 24-hour highest high: ${highestHigh.toFixed(6)}
- 24-hour lowest low: ${lowestLow.toFixed(6)}
- Latest close: ${lastClose.toFixed(6)}
- Total volume (24h): ${totalVolume.toFixed(2)}
- % Change (24h): ${dayChange.toFixed(2)}%
    `;

    const prompt = `
You are an expert crypto trading analyst. The user has a custom token named "${tokenName}" (if known).
Over the last 24 hours, we have:

${summary}

Please provide a ~150-250 word technical analysis:
- Price trend
- Volume significance
- Support/resistance
- short-term trading patterns
Keep it professional, actionable, referencing the token name if given.
    `;

    const gptRes = await openai.createChatCompletion({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.85,
      max_tokens: 700,
    });

    const analysis = gptRes.data.choices[0].message.content.trim();
    return res.json({ analysis });
  } catch (err) {
    console.error('❌ /api/dexAnalysis error =>', err.message);
    return res.status(500).json({ error: 'Failed to analyze token chart.' });
  }
});

// ---------------------------------------------------------------------
// << ADDED: Helper to check if a given date string is "today"
// ---------------------------------------------------------------------
function isToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

// ---------------------------------------------------------------------
// STARTUP
// ---------------------------------------------------------------------
const PORT = process.env.PORT || 3000;

embedKnowledgeBase().then(async () => {
  loadBlogPosts();

  // << ADDED: On startup, check if we already have a post for today.
  const newestPost = blogPosts[0];
  if (!newestPost || !isToday(newestPost.createdAt)) {
    console.log('🔎 No existing post for today => generating now...');

    try {
      const newPosts = await generateAllPosts();
      newPosts.forEach((p) => blogPosts.unshift(p));

      const overviewPost = await generateDailyOverviewPost(newPosts);
      blogPosts.unshift(overviewPost);

      // Trim to keep the newest 4
      blogPosts = blogPosts.slice(0, 4);

      saveBlogPosts();

      // Tweet the new daily overview
      await postToX(overviewPost.body);
    } catch (err) {
      console.error('❌ Startup generation error =>', err.message);
    }
  } else {
    console.log('✅ We already have a post for today—no new generation needed.');
  }

  // /api/dexPair => DexScreener pair info
  app.get('/api/dexPair', async (req, res) => {
    try {
      const { pairAddress } = req.query;
      if (!pairAddress) {
        return res.status(400).json({ error: 'Missing pairAddress in query' });
      }

      const baseUrl = 'https://api.dexscreener.com/latest/dex/pairs/ethereumclassic';
      const apiUrl = `${baseUrl}/${pairAddress}`;
      const dsRes = await axios.get(apiUrl);
      if (!dsRes.data?.pairs?.length) {
        return res.status(404).json({ error: 'No data for that address' });
      }

      const pairData = dsRes.data.pairs[0];
      const priceUsd = pairData.priceUsd || null;
      const volume24 = pairData.volume?.h24 || null;
      const liquidityUsd = pairData.liquidity?.usd || null;
      const fdv = pairData.fdv || null;

      const baseName = pairData.baseToken?.name || 'UnknownBase';
      const baseSymbol = pairData.baseToken?.symbol || '???';
      const quoteName = pairData.quoteToken?.name || 'UnknownQuote';
      const quoteSymbol = pairData.quoteToken?.symbol || '???';

      return res.json({
        pairAddress,
        baseToken: { name: baseName, symbol: baseSymbol },
        quoteToken: { name: quoteName, symbol: quoteSymbol },
        priceUsd,
        volume24,
        liquidityUsd,
        fdv,
      });
    } catch (err) {
      console.error('Error fetching single Dex pair =>', err.message);
      return res.status(500).json({ error: 'Failed to fetch Dex pair' });
    }
  });

  // Start server
  app.listen(PORT, () => {
    console.log(`🚀 ETC Nexus server running on port ${PORT}`);
  });
});













