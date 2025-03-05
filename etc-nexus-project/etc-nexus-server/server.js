require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Configuration, OpenAIApi } = require('openai');
const cron = require('node-cron');
const { ethers } = require('ethers');
// 1) Import TwitterApi
const { TwitterApi } = require('twitter-api-v2');

// ---------------------------------------------------------------------
// Single Express App
// - Multi-Turn ETC Knowledge Bot (/api/chat)
// - 3 daily AI posts (Market, General ETC, Community) w/ local JSON persistence
// - Chart Analysis Endpoint (/api/chartAnalysis)
// ---------------------------------------------------------------------

const app = express();
app.use(express.json());

// Allowed frontend origins
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

// 2) A helper to tweet text + image:
async function postToX(text) {
  try {
    // 2A) Upload image via v1
    const mediaId = await twitterClient.v1.uploadMedia('./BlogImage.png'); 
    // 2B) Then tweet in v2, attaching the media
    await twitterClient.v2.tweet({
      text: text,
      media: { media_ids: [mediaId] },
    });
    console.log('✅ Tweeted =>', text.slice(0, 60), '...');
  } catch (err) {
    console.error('❌ Error posting to X =>', err);
  }
}

// ---------------------------------------------------------------------
// Optional Knowledge Base for Chat
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
// PERSISTENCE => blogPosts.json
// ---------------------------------------------------------------------
const BLOG_POSTS_FILE = path.join(__dirname, 'blogPosts.json');
let blogPosts = [];

/** Load blog posts from disk at server start. */
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
    console.log(`⚠️ No existing ${BLOG_POSTS_FILE} found—starting with empty blogPosts.`);
  }
}

/** Save the in-memory blogPosts array to disk. */
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
      return res
        .status(400)
        .json({ error: 'conversationHistory must be an array of {role, content}.' });
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
  return res.json({ blogPosts });
});

// Cron => daily at 08:00 UTC => generate 3 main posts, then daily overview => tweet
cron.schedule('0 8 * * *', async () => {
  console.log('🔔 Cron triggered => generating daily posts...');
  try {
    const newPosts = await generateAllPosts();
    newPosts.forEach((p) => blogPosts.unshift(p));
    console.log('✅ 3 daily blog posts generated:', newPosts.map((x) => x.title).join(' | '));

    // Then create a daily overview that references these 3 new posts
    const overviewPost = await generateDailyOverviewPost(newPosts);
    blogPosts.unshift(overviewPost);

    // Save after generation
    saveBlogPosts();

    // Tweet the daily overview
    await postToX(overviewPost.body);
  } catch (err) {
    console.error('❌ daily generation error =>', err.message);
  }
});

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

    // Validate fields
    if (
      !etc ||
      typeof etc.usd !== 'number' ||
      typeof etc.usd_24h_vol !== 'number' ||
      typeof etc.usd_24h_change !== 'number'
    ) {
      throw new Error('CoinGecko response is missing some ETC price data.');
    }

    const price = etc.usd;
    const vol = etc.usd_24h_vol;
    const change = etc.usd_24h_change;

    // Insert positivity line:
    const prompt = `
      ETC price: $${price.toFixed(2)}, 
      24h vol: ~$${Number(vol).toLocaleString()}, 
      24h change: ${change.toFixed(2)}%.
      Write a 200-300 word analysis focusing on these stats. 
      Maintain a friendly, positive, and uplifting tone for ETC community morale, 
      even if data is slightly bearish. Keep it concise & easy to read, 
      mention short-term trading factors.
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
      body: `Unable to fetch real ETC data from CoinGecko or parse it correctly. 
      "ETC saw typical fluctuations. Check back soon for real stats."`,
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
    console.log('Minerstat response => status:', msRes.status, 'data:', msRes.data);

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
      - Minerstat => network hashrate: ~${netHashTH} TH/s, difficulty: ${diffMSDisplay}
      - Ethers => latest block: #${blockNumber}, block difficulty: ${blockDiff}

      Write a 200-300 word "General ETC" update summarizing these real stats. 
      Maintain an upbeat, encouraging tone for the ETC community, highlighting 
      any positive angles or progress. Keep it concise & easy to read.
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
      but maintain a positive, uplifting tone.
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

// 3) Community Buzz => narrower search, expansions for username
async function generateCommunityBuzzPost() {
  console.log('🔎 Community Buzz => fetching tweets from X...');
  try {
    const bearer = process.env.X_BEARER_TOKEN;
    if (!bearer) {
      throw new Error('No X_BEARER_TOKEN in .env');
    }

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
    console.log('X response => status:', resp.status, 'data:', resp.data);

    let tweets = resp.data.data || [];
    console.log('Raw tweets =>', JSON.stringify(tweets, null, 2));

    const includes = resp.data.includes || {};
    const userArray = includes.users || [];
    const userMap = {};
    userArray.forEach((u) => {
      userMap[u.id] = u.username;
    });

    if (tweets.length === 0) {
      throw new Error('No relevant ETC tweets found after final filter');
    }

    let tweetSummary = '';
    tweets.forEach((tw, i) => {
      // Insert the handle if found
      const authorName = userMap[tw.author_id] || 'UnknownUser';
      tweetSummary += `Tweet #${i + 1} (by @${authorName}): ${tw.text}\n\n`;
    });

    const prompt = `
      Below are up to ${maxResults} recent tweets referencing #etcarmy. 
      Summarize them in ~200-300 words as a "Community Buzz" post, with a positive spin. 
      Focus on real ETC sentiment/discussions, highlighting encouraging or optimistic aspects 
      for the community.

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
      but still maintain a positive, uplifting tone for the ETC community.
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

// 4) Generate a single “Daily Overview” post that references the 3 new posts
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
      Create a short ETC Daily Overview (~200-250 words) referencing the 3 newly created blog posts:
      ${snippet}

      Summarize the key points from each, mention ETC in a cohesive way, 
      and maintain an optimistic, uplifting tone to encourage the ETC community. 
      **Please include the hashtags #ETC, #ETCArmy, and #EthereumClassic in the text** 
      to boost community engagement. Wrap it up with a friendly conclusion.
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
// NEW ENDPOINT: /api/chartAnalysis
// ---------------------------------------------------------------------
app.post('/api/chartAnalysis', async (req, res) => {
  try {
    const { symbol } = req.body;
    if (!symbol) {
      return res
        .status(400)
        .json({ error: 'Missing symbol in request body.' });
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

    // Use Binance.US for klines
    const binanceUrl = `https://api.binance.us/api/v3/klines?symbol=${pair}&interval=1h&limit=24`;

    const klineRes = await axios.get(binanceUrl);
    const klines = klineRes.data;

    if (!Array.isArray(klines) || klines.length === 0) {
      throw new Error(`No kline data returned for ${pair}`);
    }

    let candleSummary = '';
    let totalVolume = 0;
    let highestHigh = 0;
    let lowestLow = Number.MAX_VALUE;
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

    candleSummary += `- 24-hour open price: ${firstOpen.toFixed(4)}\n`;
    candleSummary += `- 24-hour highest high: ${highestHigh.toFixed(4)}\n`;
    candleSummary += `- 24-hour lowest low: ${lowestLow.toFixed(4)}\n`;
    candleSummary += `- Latest close price: ${lastClose.toFixed(4)}\n`;
    candleSummary += `- Total volume (24h): ${totalVolume.toFixed(4)}\n`;
    candleSummary += `- % Change over these 24 candles: ${dayChange.toFixed(2)}%\n`;

    const prompt = `
      You are an expert crypto trading analyst focusing on Ethereum Classic and related pairs on Binance.
      The user is requesting an in-depth analysis of the following pair: ${pair}.
      Over the last 24 hours (1h candles), we have these summary stats:

      ${candleSummary}

      Please provide a thorough yet concise technical analysis, discussing:
      - Price trend over the 24h
      - Volume significance
      - Potential support/resistance levels based on the high/low
      - Any short-term trading factors or notable patterns

      Keep it professional, around 150-250 words, and give actionable insights if possible.
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
// STARTUP => Load from blogPosts.json => embed knowledge base => listen => generate posts => save
// ---------------------------------------------------------------------
const PORT = process.env.PORT || 3000;

embedKnowledgeBase().then(() => {
  // 1) Load existing posts from JSON
  loadBlogPosts();

  // NEW DYNAMIC ENDPOINT: /api/dexPair
  // The user provides ?pairAddress=0x...
  app.get('/api/dexPair', async (req, res) => {
    try {
      const { pairAddress } = req.query;
      if (!pairAddress) {
        return res.status(400).json({ error: 'Missing pairAddress in query' });
      }

      const baseUrl = 'https://api.dexscreener.com/latest/dex/pairs/ethereumclassic';
      const apiUrl = `${baseUrl}/${pairAddress}`;

      const dsRes = await axios.get(apiUrl);
      if (!dsRes.data || !dsRes.data.pairs || dsRes.data.pairs.length === 0) {
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

      const response = {
        pairAddress,
        baseToken: {
          name: baseName,
          symbol: baseSymbol,
        },
        quoteToken: {
          name: quoteName,
          symbol: quoteSymbol,
        },
        priceUsd,
        volume24,
        liquidityUsd,
        fdv,
      };

      return res.json(response);
    } catch (err) {
      console.error('Error fetching single Dex pair =>', err.message);
      return res.status(500).json({ error: 'Failed to fetch Dex pair' });
    }
  });

  // 2) Start server
  app.listen(PORT, async () => {
    console.log(`🚀 ETC Nexus server running on port ${PORT}`);

    // 3) On startup => generate 3 posts => then daily overview => then tweet
    console.log('🔎 Starting initial generateAllPosts()...');
    try {
      const initialPosts = await generateAllPosts();
      initialPosts.forEach((p) => blogPosts.unshift(p));
      console.log(
        '✅ Generated initial 3 posts on launch =>',
        initialPosts.map((x) => x.title).join(' | ')
      );

      // Then create daily overview referencing these 3 new posts
      const overviewPost = await generateDailyOverviewPost(initialPosts);
      blogPosts.unshift(overviewPost);

      // Save to disk
      saveBlogPosts();

      // Tweet the daily overview
      await postToX(overviewPost.body);
    } catch (err) {
      console.error('❌ Could not create initial posts on launch =>', err.message);
    }
  });
});











