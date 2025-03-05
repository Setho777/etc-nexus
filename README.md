ETC Nexus
A unified Ethereum Classic infrastructure hub featuring real-time community chat, AI-driven market analysis, live trading charts, and community watch alerts.
Submitted for the ETC Nova Hackathon.

Project Overview

etc-nexus-server

Provides AI-based endpoints (GPT market analysis, blog posts) and an automated Twitter alerts feature.
Built with Node.js, Express, OpenAI, Twitter API.

etc-chat-server

Handles real-time community chat with Socket.IO.
Integrates MongoDB for storing messages and user profiles.
Includes an ETC Community Watch feature to report and verify suspicious addresses.

etc-nexus

A React-based user interface (compiled with Vite or CRA).
Shows live trading charts, daily ETC stats, and the community chat UI.
Integrates the above servers for real-time data and user interactions.
Key Features

Community Chat

Real-time messaging with Socket.IO.
Username and avatar management.
Supports file uploads (images), replies, and editing messages.

AI Market Analysis

GPT-driven analysis for ETC market data.
Automated daily blog posts.
Twitter automation for significant alerts.

Trading Charts

Uses TradingView or Binance.US klines for price data.
Allows quick analysis of ETC pairs (like ETC/USDT).

Community Watch

Users can report suspicious addresses.
Verification by watchers – once 3 watchers verify, the system tweets an alert.
Setup & Installation

Clone the Repository

bash
Copy
Edit
git clone https://github.com/<YourUsername>/etc-nexus.git
cd etc-nexus
(You can also just download a ZIP of the repo and unzip.)

Install Dependencies (Backend Servers & Frontend)

Server A (etc-nexus-server):
bash
Copy
Edit
cd etc-nexus-project/etc-nexus-server
npm install

Server B (etc-chat-server):
bash
Copy
Edit
cd ../etc-chat-server
npm install

Frontend (etc-nexus):
bash
Copy
Edit
cd ../etc-frontend
npm install
Environment Variables

We use .env files for each server. Check out .env.example in each folder. Copy and rename it to .env, then fill in your own keys:
OpenAI API Key
Twitter API Keys
MongoDB URI
And any others (like port settings).
Running Locally

Server A (etc-nexus-server):

bash
Copy
Edit
cd etc-nexus-server
npm start
By default, might run on port 3000 or PORT from .env.

Server B (etc-chat-server):

bash
Copy
Edit
cd etc-chat-server
npm start
By default, might run on port 4000 or PORT from .env.

Frontend (etc-frontend):

bash
Copy
Edit
cd etc-frontend
npm run dev
Should open your browser at http://localhost:5173 (or as configured).

Live Demo Links
Frontend on Netlify:
https://etc-nexus.netlify.app

Tech Stack
Backend
Node.js, Express, Socket.IO, Mongoose
GPT-4 (OpenAI), Twitter API, Cron jobs for daily blog posts
Frontend
React (Vite or CRA), Tailwind CSS (or your styling choice)
TradingView charts (or Binance klines)
Database
MongoDB Atlas for storing chat messages, user profiles, incidents

Author: Seth
