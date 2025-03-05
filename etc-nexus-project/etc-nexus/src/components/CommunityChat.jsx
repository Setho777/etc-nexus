import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import axios from 'axios';
import EmojiPicker from 'emoji-picker-react';
import { ethers } from 'ethers'; // for editing

// For local "reply" / "edit"
const initialMessageAction = {
  type: null, // 'reply' or 'edit' or null
  messageId: '',
  content: '',
};

function CommunityChat({ address, username }) {
  const { t } = useTranslation();

  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');

  // If you want to attach a file (image)
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(''); // local preview

  // For emojis & GIF
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPanel, setShowGifPanel] = useState(false);
  const [selectedGifUrl, setSelectedGifUrl] = useState('');

  // Expand or Fullscreen
  const [chatExpanded, setChatExpanded] = useState(false);
  const [chatFullscreen, setChatFullscreen] = useState(false);

  // For auto-scroll
  const messagesContainerRef = useRef(null);

  // For "reply" or "edit"
  const [messageAction, setMessageAction] = useState(initialMessageAction);

  // Right-click context
  const [contextMenu, setContextMenu] = useState({
    show: false,
    x: 0,
    y: 0,
    messageId: '',
    fromMe: false,
  });

  // Track if we’re currently uploading
  const [uploading, setUploading] = useState(false);

  // Pagination states
  const [loadingOlder, setLoadingOlder] = useState(false); // avoid multiple triggers
  const [hasMore, setHasMore] = useState(true); // track if there are more older messages

  // ----- Socket Setup -----
  useEffect(() => {
    const chatSocket = io('https://etc-chat-server-production.up.railway.app');
    setSocket(chatSocket);

    // Initially, listen for the 50 newest messages
    chatSocket.on('chatHistory', (history) => {
      // This is in ascending order (oldest -> newest),
      // because the server .reverse() after sorting descending
      setMessages(history);
    });

    // Listen for new messages => push to local
    chatSocket.on('chatMessage', (newMsg) => {
      setMessages((prev) => [...prev, newMsg]);
    });

    // Listen for edited messages => update in place
    chatSocket.on('editedMessage', (updatedMsg) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === updatedMsg._id ? updatedMsg : m))
      );
    });

    // When older messages are loaded, prepend them
    chatSocket.on('olderMessages', (older) => {
      if (older.length < 50) {
        // fewer than 50 => probably no more older
        setHasMore(false);
      }
      setMessages((prev) => [...older, ...prev]);
      setLoadingOlder(false);
    });

    return () => {
      chatSocket.disconnect();
    };
  }, []);

  // Load older messages on demand
  const loadOlderMessages = useCallback(() => {
    if (!socket || messages.length === 0) return;
    setLoadingOlder(true);
    const oldestId = messages[0]._id;
    socket.emit('loadOlderMessages', oldestId);
  }, [socket, messages]);

  // Scroll handler to detect when user hits the top
  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return;
    const { scrollTop } = messagesContainerRef.current;

    // If at top and have more, load older
    if (scrollTop <= 0 && !loadingOlder && hasMore && messages.length > 0) {
      loadOlderMessages();
    }
  }, [loadingOlder, hasMore, messages, loadOlderMessages]);

  // auto-scroll on new messages
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Attach the scroll event listener
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // check ownership
  const isMyMessage = (msg) =>
    msg.userAddress?.toLowerCase() === address?.toLowerCase();

  // ----- MAIN "Send" or "Edit" -----
  const handleSendMessage = async (e) => {
    e.preventDefault();

    // If we’re editing
    if (messageAction.type === 'edit') {
      const newContent = messageInput.trim();
      if (!newContent) return;
      try {
        // sign "editMessage:<messageId>:<newContent>"
        const toSign = `editMessage:${messageAction.messageId}:${newContent}`;
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const signature = await signer.signMessage(toSign);

        socket.emit('editMessage', {
          messageId: messageAction.messageId,
          newContent,
          address,
          signature,
        });
      } catch (err) {
        console.error('Error signing edit =>', err);
      }

      // Clear local
      setMessageAction(initialMessageAction);
      setMessageInput('');
      setSelectedGifUrl('');
      setSelectedFile(null);
      setPreviewUrl('');
      return;
    }

    // If not editing => new message
    let contentText = messageInput.trim();
    if (!contentText && !selectedGifUrl && !selectedFile) {
      return; // nothing
    }

    let finalType = 'text';
    let finalImageUrl = '';

    // If there's a GIF
    if (selectedGifUrl) {
      finalType = 'gif';
      finalImageUrl = selectedGifUrl;
    }

    // If there's a file => upload first
    if (selectedFile) {
      try {
        setUploading(true);
        const formData = new FormData();
        formData.append('file', selectedFile);
        const res = await axios.post('https://etc-chat-server-production.up.railway.app/api/upload-image', formData);

        // UPDATED: Now we check for res.data.imageUrl
        if (res.data.success && res.data.imageUrl) {
          finalType = 'image';
          finalImageUrl = res.data.imageUrl;
        }
      } catch (err) {
        console.error('File upload error =>', err);
      } finally {
        setUploading(false);
      }
    }

    // If replying
    let replyToId = null;
    let replySnippet = '';
    if (messageAction.type === 'reply') {
      replyToId = messageAction.messageId;
      replySnippet = messageAction.content;
    }

    // Emit newMessage
    socket.emit('newMessage', {
      content: contentText,
      userAddress: address?.toLowerCase() || '',
      username: username || 'Anon',
      type: finalType,
      imageUrl: finalImageUrl,
      replyToId,
      replySnippet,
    });

    // reset
    setMessageAction(initialMessageAction);
    setMessageInput('');
    setSelectedGifUrl('');
    setSelectedFile(null);
    setPreviewUrl('');
  };

  // ----- Paperclip => choose file => local preview
  const hiddenFileInput = useRef(null);
  const handlePaperclipClick = () => {
    if (hiddenFileInput.current) {
      hiddenFileInput.current.click();
    }
  };
  const handleSelectFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);

    // If it's an image => local preview
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl('');
    }
  };

  // Right-click => reply/edit
  const handleContextMenu = (e, msg) => {
    e.preventDefault();
    if (!msg._id) return;
    setContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      messageId: msg._id,
      fromMe: isMyMessage(msg),
    });
  };
  const hideContextMenu = () => {
    setContextMenu({
      show: false,
      x: 0,
      y: 0,
      messageId: '',
      fromMe: false,
    });
  };
  const handleReply = () => {
    hideContextMenu();
    const msgObj = messages.find((m) => m._id === contextMenu.messageId);
    if (!msgObj) return;
    setMessageAction({
      type: 'reply',
      messageId: msgObj._id,
      content: msgObj.content.slice(0, 100),
    });
  };
  const handleEdit = () => {
    hideContextMenu();
    const msgObj = messages.find((m) => m._id === contextMenu.messageId);
    if (!msgObj) return;
    setMessageAction({
      type: 'edit',
      messageId: msgObj._id,
      content: msgObj.content,
    });
    setMessageInput(msgObj.content);
  };

  // Container
  const chatContainer = `
    ${chatFullscreen ? 'fixed inset-0 z-50' : 'relative mt-8'}
    border border-emerald-500 p-4 rounded-xl shadow-xl w-full
  `;
  const bgStyle = {
    backgroundImage: "url('/images/chat-bg.png')",
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };

  return (
    <div className={chatContainer} style={bgStyle}>
      {/* BG overlay */}
      <div className="absolute inset-0 bg-gray-900 bg-opacity-60 rounded-xl pointer-events-none"></div>

      {/* Top row => Title, Expand, Fullscreen */}
      <div className="relative flex items-center justify-between mb-3 z-10">
        <h2 className="text-lg font-bold text-emerald-300">
          {t('communityChatHeading')}
        </h2>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setChatFullscreen(!chatFullscreen)}
            className="bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded text-white"
          >
            {chatFullscreen ? 'Exit Full Screen' : 'Full Screen'}
          </button>
          <button
            onClick={() => setChatExpanded(!chatExpanded)}
            className="bg-gray-600 hover:bg-gray-500 px-2 py-1 rounded text-white"
          >
            {chatExpanded ? t('minimize') : t('enlarge')}
          </button>
        </div>
      </div>

      {/* If not connected or no username */}
      {!address && (
        <p className="relative text-red-400 z-10">{t('noWalletAddressConnected')}</p>
      )}
      {!username && (
        <p className="relative text-red-400 z-10">{t('noUsernameProvided')}</p>
      )}

      {/* Messages container */}
      <div
        ref={messagesContainerRef}
        className={`relative mb-4 overflow-y-auto bg-transparent p-3 rounded transition-all duration-300 z-10 ${
          chatExpanded
            ? 'max-h-[80vh] min-h-[300px]'
            : 'max-h-64 sm:max-h-80 min-h-[250px]'
        }`}
      >
        {messages.map((msg, index) => {
          const key = msg._id || `local-${index}`;
          const fromMe = isMyMessage(msg);
          const replySnippet =
            msg.replySnippet || msg.replyToId
              ? `Replying to: ${msg.replySnippet || '...'}`
              : null;

          return (
            <div
              key={key}
              className="flex items-start space-x-3 mb-3"
              onContextMenu={(e) => handleContextMenu(e, msg)}
            >
              {/* Profile pic */}
              <div className="flex-shrink-0">
                {msg.profilePic ? (
                  <img
                    src={msg.profilePic}
                    alt="avatar"
                    className="w-10 h-10 rounded-full border border-gray-700 object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full border border-gray-700 bg-gray-600 flex items-center justify-center">
                    <span className="text-white text-sm">?</span>
                  </div>
                )}
              </div>

              {/* Bubble */}
              <div
                className={`relative max-w-xs p-3 rounded-xl text-sm leading-normal cursor-default ${
                  fromMe
                    ? 'bg-emerald-600 text-black'
                    : 'bg-gray-700 text-white'
                }`}
              >
                {/* Name + Time */}
                <div className="mb-1 flex justify-between items-center">
                  <span className={`font-semibold ${msg.color || 'text-white'}`}>
                    {msg.username || 'Anon'}
                  </span>
                  <span className="ml-2 text-[10px] text-gray-200">
                    {new Date(msg.createdAt).toLocaleTimeString()}
                  </span>
                </div>

                {/* If replying => small snippet */}
                {replySnippet && (
                  <div className="mb-1 text-xs italic bg-black bg-opacity-20 p-1 rounded">
                    {replySnippet}
                  </div>
                )}

                {/* Actual content => text, image, or gif */}
                {msg.type === 'gif' ? (
                  <>
                    {!!msg.content?.trim() && (
                      <p className="mb-1">{msg.content}</p>
                    )}
                    <img
                      src={msg.imageUrl}
                      alt="gif"
                      className="border border-gray-600 rounded max-w-[200px] max-h-[200px]"
                    />
                  </>
                ) : msg.type === 'image' ? (
                  <img
                    src={msg.imageUrl}
                    alt="chat-img"
                    className="border border-gray-600 rounded max-w-[200px] max-h-[200px]"
                  />
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* If we have a local GIF => preview */}
      {selectedGifUrl && (
        <div className="relative mb-2 z-10">
          <p className="text-white text-sm mb-1">{t('selectedGifPreview')}</p>
          <img
            src={selectedGifUrl}
            alt="Selected GIF"
            className="rounded mb-2 max-w-[200px] max-h-[200px]"
          />
        </div>
      )}

      {/* If we have a local file preview => show if image */}
      {previewUrl && (
        <div className="relative mb-2 z-10">
          <p className="text-white text-sm mb-1">File Preview:</p>
          <img
            src={previewUrl}
            alt="SelectedFilePreview"
            className="rounded mb-2 max-w-[200px] max-h-[200px]"
          />
        </div>
      )}

      {/* If replying or editing => small box */}
      {messageAction.type === 'reply' && (
        <div className="mb-2 p-2 rounded bg-black bg-opacity-30 text-sm text-white z-10">
          {t('replyingTo')}: <span className="italic">{messageAction.content}</span>
          <button
            onClick={() => setMessageAction(initialMessageAction)}
            className="ml-3 text-red-300 hover:text-red-500"
          >
            {t('cancel')}
          </button>
        </div>
      )}
      {messageAction.type === 'edit' && (
        <div className="mb-2 p-2 rounded bg-black bg-opacity-30 text-sm text-white z-10">
          {t('editingMessage')}
          <button
            onClick={() => {
              setMessageAction(initialMessageAction);
              setMessageInput('');
            }}
            className="ml-3 text-red-300 hover:text-red-500"
          >
            {t('cancel')}
          </button>
        </div>
      )}

      {/* The input row => text, paperclip, emoji, gif, send */}
      <form onSubmit={handleSendMessage} className="relative flex items-center space-x-1 mb-2 z-10">
        <div className="flex-grow relative">
          <input
            type="text"
            className="w-full bg-gray-700 text-white px-3 py-2 rounded-l focus:outline-none pr-10"
            placeholder={t('typeYourMessage')}
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
          />

          {/* Hidden file input */}
          <input
            type="file"
            accept="image/*"
            ref={hiddenFileInput}
            onChange={handleSelectFile}
            style={{ display: 'none' }}
          />

          {/* Paperclip icon => triggers file input */}
          <button
            type="button"
            className="absolute right-2 top-2 text-white hover:text-gray-300"
            onClick={handlePaperclipClick}
            title="Attach file"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.375 12.75L8.56 22.56a3.375 3.375 0 01-4.775-4.775l9.814-9.81a1.125 1.125 0 011.59 1.59l-9.81 9.813"
              />
            </svg>
          </button>
        </div>

        {/* Emoji */}
        <button
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className="bg-gray-600 hover:bg-gray-500 px-2 py-2 rounded text-white"
          title="Pick an emoji"
        >
          😀
        </button>

        {/* GIF */}
        <button
          type="button"
          onClick={() => setShowGifPanel(!showGifPanel)}
          className="bg-gray-600 hover:bg-gray-500 px-2 py-2 rounded text-white"
          title="Pick a GIF"
        >
          GIF
        </button>

        {/* Send / Save Edit */}
        <button
          type="submit"
          className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded text-white font-semibold"
        >
          {messageAction.type === 'edit' ? t('saveEdit') : t('send')}
        </button>
      </form>

      {/* If we’re uploading => show a note */}
      {uploading && (
        <p className="text-yellow-400 text-sm z-10">{t('uploading')}...</p>
      )}

      {/* Tenor GIF panel */}
      {showGifPanel && (
        <TenorGifPanel
          onClose={() => setShowGifPanel(false)}
          onSelectGif={(gifUrl) => {
            setSelectedGifUrl(gifUrl);
            setShowGifPanel(false);
          }}
        />
      )}

      {/* Right-click context => reply/edit */}
      {contextMenu.show && (
        <div
          className="absolute bg-gray-800 border border-gray-700 rounded shadow-md p-1 z-50"
          style={{ top: contextMenu.x, left: contextMenu.y }}
          onMouseLeave={hideContextMenu}
        >
          <button
            onClick={handleReply}
            className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-700 text-white"
          >
            {t('reply')}
          </button>
          {contextMenu.fromMe && (
            <button
              onClick={handleEdit}
              className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-700 text-white"
            >
              {t('edit')}
            </button>
          )}
          <button
            onClick={hideContextMenu}
            className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-700 text-white"
          >
            {t('cancel')}
          </button>
        </div>
      )}

      {/* If user picks an emoji => add to messageInput */}
      {showEmojiPicker && (
        <div
          className="absolute bottom-14 left-0 bg-gray-800 border border-gray-700 rounded z-20"
          onMouseLeave={() => setShowEmojiPicker(false)}
        >
          <EmojiPicker
            onEmojiClick={(emojiData) =>
              setMessageInput((prev) => prev + emojiData.emoji)
            }
          />
        </div>
      )}
    </div>
  );
}

// ----- TenorGifPanel => same approach -----
function TenorGifPanel({ onClose, onSelectGif }) {
  const [gifs, setGifs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { t } = useTranslation();
  const TENOR_API_KEY = 'AIzaSyDC4I_MEI1RYaKi-0fO7diSSjF7wNXuGRA';

  useEffect(() => {
    fetchTrending();
  }, []);

  async function fetchTrending() {
    try {
      setIsLoading(true);
      const url = `https://tenor.googleapis.com/v2/featured?key=${TENOR_API_KEY}&client_key=ETC-Nexus&limit=30`;
      const res = await axios.get(url);
      if (res.data?.results) {
        const arr = res.data.results.map((item) => {
          const gifUrl =
            item.media_formats?.gif?.url ||
            item.media_formats?.mediumgif?.url ||
            item.media_formats?.tinygif?.url ||
            '';
          return { id: item.id, url: gifUrl };
        });
        setGifs(arr);
      }
    } catch (err) {
      console.error('Error fetching Tenor trending =>', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchSearch(term) {
    try {
      setIsLoading(true);
      const url = `https://tenor.googleapis.com/v2/search?key=${TENOR_API_KEY}&client_key=ETC-Nexus&limit=30&q=${encodeURIComponent(
        term
      )}`;
      const res = await axios.get(url);
      if (res.data?.results) {
        const arr = res.data.results.map((item) => {
          const gifUrl =
            item.media_formats?.gif?.url ||
            item.media_formats?.mediumgif?.url ||
            item.media_formats?.tinygif?.url ||
            '';
          return { id: item.id, url: gifUrl };
        });
        setGifs(arr);
      }
    } catch (err) {
      console.error('Error searching Tenor =>', err);
    } finally {
      setIsLoading(false);
    }
  }

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) {
      fetchTrending();
    } else {
      fetchSearch(searchTerm);
    }
  };

  return (
    <div className="absolute top-0 right-0 w-64 bg-gray-900 border border-gray-700 p-3 rounded shadow-lg z-20">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-emerald-300 font-semibold">{t('pickAGif')}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-100">
          ✕
        </button>
      </div>

      {/* Search box */}
      <form onSubmit={handleSearch} className="flex mb-2">
        <input
          type="text"
          placeholder={t('searchTenorPlaceholder')}
          className="flex-grow bg-gray-700 text-white px-2 py-1 rounded-l"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded-r text-white"
        >
          {t('go')}
        </button>
      </form>

      {isLoading && (
        <p className="text-yellow-300 text-sm font-semibold mb-2">
          {t('loading')}
        </p>
      )}

      <div className="max-h-72 overflow-y-auto grid grid-cols-3 gap-2">
        {gifs.map((gif) => (
          <img
            key={gif.id}
            src={gif.url}
            alt="gif"
            className="w-full h-auto cursor-pointer hover:opacity-80"
            onClick={() => onSelectGif(gif.url)}
          />
        ))}
      </div>

      {gifs.length === 0 && !isLoading && (
        <p className="text-gray-400 text-center mt-3">
          {t('noGifsFoundOrError')}
        </p>
      )}
    </div>
  );
}

export default CommunityChat;































