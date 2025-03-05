require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const { hashMessage, recoverAddress } = require('ethers');

// =========================
// ADDED: OpenAI & Twitter
// =========================
const { Configuration, OpenAIApi } = require('openai');
const { TwitterApi } = require('twitter-api-v2');

// Configure OpenAI
const openaiConfig = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(openaiConfig);

// Configure Twitter
const twitterClient = new TwitterApi({
  appKey: process.env.X_APP_KEY,
  appSecret: process.env.X_APP_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_SECRET,
});

// Utility to post text to X
async function postToX(text) {
  try {
    await twitterClient.v2.tweet(text);
    console.log('✅ Tweeted =>', text);
  } catch (err) {
    console.error('❌ Error posting to X =>', err);
  }
}

// Summarize & tweet
async function postVerifiedIncidentToTwitter(incident) {
  try {
    const prompt = `
This incident was flagged by the ETC Community.
Suspicious Address: ${incident.suspiciousAddress}
Details: ${incident.details}

Write a short 80-120 word alert about the potential scam/suspicious activity on Ethereum Classic.
Mention #EthereumClassic and #ETC so that the community is aware.
End with a caution to DYOR.
    `;
    const completion = await openai.createChatCompletion({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    });
    const summary = completion.data.choices[0].message.content.trim();

    await postToX(summary);
  } catch (err) {
    console.error('❌ Could not generate or tweet verified incident =>', err);
  }
}

// =============================================
// 1) Mongoose Schemas & Models
// =============================================
const chatMessageSchema = new mongoose.Schema({
  content: { type: String, default: '' },
  type: { type: String, default: 'text' },
  createdAt: { type: Date, default: Date.now },
  userAddress: { type: String },
  username: { type: String },
  imageUrl: { type: String },
  color: { type: String, default: 'text-white' },
  profilePic: { type: String, default: '' },

  // For local "reply"
  replyToId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatMessage', default: null },
  replySnippet: { type: String, default: '' },
});
const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

const userSchema = new mongoose.Schema({
  address: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  color: { type: String, default: 'text-green-400' },
  profilePic: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model('User', userSchema);

const incidentSchema = new mongoose.Schema({
  suspiciousAddress: { type: String, required: true },
  details: { type: String, required: true },
  reporter: { type: String, required: true },
  signature: { type: String, required: true },
  timestamp: { type: Number, required: true },
  status: { type: String, default: 'REPORTED' },
  verifiedBy: [{ type: String }],
});
const Incident = mongoose.model('Incident', incidentSchema);

// =============================================
// 2) Express Setup
// =============================================


const app = express();

app.use(express.json());

app.use(
  cors({
    origin: [
      'http://localhost:5174',
      'https://etc-nexus.netlify.app',
      'https://etc-chat-server-production.up.railway.app'
    ]
  })
);

// Serve images from /uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
const upload = multer({ dest: 'uploads/' });

// =============================================
// 3) REST Endpoints
// =============================================

// (A) Set Username
app.post('/api/setUsername', async (req, res) => {
  try {
    const { address, username } = req.body;
    if (!address || !username) {
      return res.status(400).json({ error: 'Missing address or username.' });
    }

    const lowerAddr = address.toLowerCase();
    let existingUser = await User.findOne({ address: lowerAddr });

    const colorList = [
      'text-red-400',
      'text-yellow-400',
      'text-green-400',
      'text-blue-400',
      'text-pink-400',
      'text-purple-400',
      'text-cyan-400',
      'text-orange-400',
    ];

    if (!existingUser) {
      const randomIndex = Math.floor(Math.random() * colorList.length);
      const assignedColor = colorList[randomIndex];
      const newUser = await User.create({
        address: lowerAddr,
        username,
        color: assignedColor,
      });
      return res.json({ success: true, user: newUser });
    } else {
      existingUser.username = username;
      await existingUser.save();
      return res.json({ success: true, user: existingUser });
    }
  } catch (err) {
    console.error('setUsername error =>', err);
    return res.status(500).json({ error: 'Failed to set username.' });
  }
});

// (B) Get Username
app.get('/api/getUsername/:address', async (req, res) => {
  try {
    const lowerAddr = req.params.address.toLowerCase();
    const user = await User.findOne({ address: lowerAddr });
    if (!user) {
      return res.json({ success: false, user: null });
    }
    return res.json({ success: true, user });
  } catch (err) {
    console.error('getUsername error =>', err);
    return res.status(500).json({ error: 'Failed to load user.' });
  }
});

// (C) Image Upload => **No longer creates a chat message**
app.post('/api/upload-image', upload.single('file'), async (req, res) => {
  try {
    const host = req.get('host');
    const protocol = req.protocol;
    const imageFullUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

    return res.json({
      success: true,
      imageUrl: imageFullUrl,
    });
  } catch (err) {
    console.error('Image upload error =>', err);
    return res.status(500).json({ error: 'Upload failed' });
  }
});

// (D) Set Profile Pic
app.post('/api/setProfilePic', upload.single('file'), async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) {
      return res.status(400).json({ error: 'Missing address.' });
    }
    const lowerAddr = address.toLowerCase();

    const host = req.get('host');
    const protocol = req.protocol;
    const avatarUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

    const colorList = [
      'text-red-400',
      'text-yellow-400',
      'text-green-400',
      'text-blue-400',
      'text-pink-400',
      'text-purple-400',
      'text-cyan-400',
      'text-orange-400',
    ];

    let userDoc = await User.findOne({ address: lowerAddr });
    if (!userDoc) {
      const assignedColor =
        colorList[Math.floor(Math.random() * colorList.length)];
      userDoc = await User.create({
        address: lowerAddr,
        username: 'AnonUser',
        color: assignedColor,
        profilePic: avatarUrl,
      });
    } else {
      userDoc.profilePic = avatarUrl;
      await userDoc.save();
    }

    return res.json({ success: true, user: userDoc });
  } catch (err) {
    console.error('setProfilePic error =>', err);
    return res.status(500).json({ error: 'Failed to set profile pic.' });
  }
});

// =============================================
//  Community Watch Endpoints
// =============================================
app.post('/api/communityWatch/report', async (req, res) => {
  try {
    const { formData, signature } = req.body;
    if (!formData || !signature) {
      return res
        .status(400)
        .json({ success: false, error: 'Missing formData or signature' });
    }

    const { suspiciousAddress, details, reporter, timestamp } = formData;
    if (!suspiciousAddress || !details || !reporter || !timestamp) {
      return res
        .status(400)
        .json({ success: false, error: 'Incomplete form data' });
    }

    // Check signature
    const hashedMsg = hashMessage(JSON.stringify(formData));
    const recoveredAddress = recoverAddress(hashedMsg, signature);
    if (recoveredAddress.toLowerCase() !== reporter.toLowerCase()) {
      return res.status(400).json({
        success: false,
        error: 'Signature does not match the reported address',
      });
    }

    // Save
    const newIncident = await Incident.create({
      suspiciousAddress,
      details,
      reporter: reporter.toLowerCase(),
      signature,
      timestamp,
      status: 'REPORTED',
      verifiedBy: [],
    });

    res.json({
      success: true,
      incidentId: newIncident._id,
      message: 'Incident reported successfully',
    });

    const systemMsg = {
      content: `⚠️ Community Watch Alert! Incident #${newIncident._id} is reported. Watchers needed!`,
      type: 'text',
      createdAt: Date.now(),
      userAddress: '',
      username: 'System',
      imageUrl: '',
      color: 'text-red-400',
      profilePic: '',
    };

    await ChatMessage.create(systemMsg);
    io.emit('chatMessage', systemMsg);
  } catch (err) {
    console.error('/api/communityWatch/report error =>', err);
    res
      .status(500)
      .json({ success: false, error: 'Server error reporting incident' });
  }
});

app.post('/api/communityWatch/verify', async (req, res) => {
  try {
    const { incidentId, watcherAddress, signature } = req.body;
    if (!incidentId || !watcherAddress || !signature) {
      return res.status(400).json({ success: false, error: 'Missing fields' });
    }

    const incident = await Incident.findById(incidentId);
    if (!incident) {
      return res
        .status(404)
        .json({ success: false, error: 'Incident not found' });
    }
    if (incident.status === 'VERIFIED') {
      return res.json({ success: true, message: 'Already verified' });
    }

    const hashedVerify = hashMessage(`I verify incident #${incidentId}`);
    const recovered = recoverAddress(hashedVerify, signature);
    if (recovered.toLowerCase() !== watcherAddress.toLowerCase()) {
      return res
        .status(400)
        .json({ success: false, error: 'Signature mismatch' });
    }

    if (!incident.verifiedBy.includes(watcherAddress.toLowerCase())) {
      incident.verifiedBy.push(watcherAddress.toLowerCase());
      if (incident.verifiedBy.length >= 3) {
        incident.status = 'VERIFIED';
      }
      await incident.save();
    }

    if (incident.status === 'VERIFIED') {
      const verifiedMsg = {
        content: `✅ Incident #${incidentId} is now VERIFIED by 3 watchers!`,
        type: 'text',
        createdAt: Date.now(),
        userAddress: '',
        username: 'System',
        imageUrl: '',
        color: 'text-green-400',
        profilePic: '',
      };
      await ChatMessage.create(verifiedMsg);
      io.emit('chatMessage', verifiedMsg);

      await postVerifiedIncidentToTwitter(incident);
      return res.json({ success: true, incidentId, status: 'VERIFIED' });
    } else {
      const partialMsg = {
        content: `Watcher ${watcherAddress.slice(
          0,
          6
        )}... verified Incident #${incidentId}. \nTotal watchers: ${incident.verifiedBy.length}`,
        type: 'text',
        createdAt: Date.now(),
        userAddress: '',
        username: 'System',
        imageUrl: '',
        color: 'text-yellow-400',
        profilePic: '',
      };
      await ChatMessage.create(partialMsg);
      io.emit('chatMessage', partialMsg);

      return res.json({
        success: true,
        incidentId,
        status: 'REPORTED',
        watchers: incident.verifiedBy.length,
      });
    }
  } catch (err) {
    console.error('/api/communityWatch/verify error =>', err);
    res.status(500).json({ success: false, error: 'Server error verifying incident' });
  }
});

// List incidents – optionally filter by status
app.get('/api/communityWatch/incidents', async (req, res) => {
  try {
    const { status } = req.query;
    let filter = {};
    if (status) {
      filter.status = status;
    }
    const incidents = await Incident.find(filter).sort({ timestamp: -1 }).lean();
    return res.json({ success: true, incidents });
  } catch (err) {
    console.error('Error fetching incidents =>', err);
    return res
      .status(500)
      .json({ success: false, error: 'Server error fetching incidents' });
  }
});

// =============================================
// 4) Socket.io – Real-Time Chat
// =============================================
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5174',
      'https://etc-nexus.netlify.app',
      'https://etc-chat-server-production.up.railway.app'
    ]
  }
});

io.on('connection', async (socket) => {
  console.log('New client connected =>', socket.id);

  // On new connection => fetch the 50 MOST RECENT messages, then reverse
  try {
    const recentMessages = await ChatMessage.find({})
      .sort({ createdAt: -1 }) // newest first
      .limit(50)
      .lean();

    // Reverse so that the array is oldest => newest
    recentMessages.reverse();

    socket.emit('chatHistory', recentMessages);
  } catch (err) {
    console.error('Error fetching messages =>', err);
  }

  // newMessage => create doc => broadcast
  socket.on('newMessage', async (payload) => {
    try {
      const lowerAddr = payload.userAddress?.toLowerCase() || '';
      const userDoc = await User.findOne({ address: lowerAddr });
      const userColor = userDoc?.color || 'text-white';
      const userPic = userDoc?.profilePic || '';

      const newMsg = await ChatMessage.create({
        content: payload.content,
        type: payload.type || 'text',
        userAddress: lowerAddr,
        username: payload.username || 'Anon',
        color: userColor,
        profilePic: userPic,
        imageUrl: payload.imageUrl || '',
        replyToId: payload.replyToId || null,
        replySnippet: payload.replySnippet || '',
      });

      io.emit('chatMessage', newMsg);
    } catch (err) {
      console.error('Error creating new chat message =>', err);
    }
  });

  // editMessage => verify ECDSA => update doc => broadcast
  socket.on('editMessage', async (data) => {
    try {
      const { messageId, newContent, address, signature } = data;
      if (!messageId || !newContent || !address || !signature) return;

      // Compose same string for verifying
      const toVerify = `editMessage:${messageId}:${newContent}`;
      const hashed = hashMessage(toVerify);
      const recovered = recoverAddress(hashed, signature);

      if (recovered.toLowerCase() !== address.toLowerCase()) {
        return; // Signature mismatch
      }

      // Check if the message belongs to them
      const msgDoc = await ChatMessage.findById(messageId);
      if (!msgDoc) return;
      if (msgDoc.userAddress.toLowerCase() !== address.toLowerCase()) {
        return; // not your message
      }

      // Update doc
      msgDoc.content = newContent;
      await msgDoc.save();

      // broadcast "editedMessage"
      io.emit('editedMessage', msgDoc);
    } catch (err) {
      console.error('Error editing message =>', err);
    }
  });

  // loadOlderMessages => fetch older than the oldest message’s createdAt
  socket.on('loadOlderMessages', async (oldestMessageId) => {
    try {
      const oldestDoc = await ChatMessage.findById(oldestMessageId);
      if (!oldestDoc) return;

      // get messages older than this doc
      const older = await ChatMessage.find({
        createdAt: { $lt: oldestDoc.createdAt },
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      // reverse them so we send oldest => newest
      older.reverse();

      socket.emit('olderMessages', older);
    } catch (err) {
      console.error('Error loading older messages =>', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected =>', socket.id);
  });
});

// =============================================
// 5) Connect to MongoDB and Start Server
// =============================================
const PORT = process.env.PORT || 4000; 
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/etc-chat';

mongoose
  .connect(MONGO_URI)
  .then(() => {
    server.listen(PORT, () => {
      console.log(`✅ Chat server running on port ${PORT}, connected to Mongo`);
    });
  })
  .catch((err) => {
    console.error('❌ Mongo connect error =>', err);
  });
















