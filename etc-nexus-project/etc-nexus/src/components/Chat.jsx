// src/components/Chat.jsx
import React, { useState, useRef, useEffect } from 'react';

function Chat() {
  const [isOpen, setIsOpen] = useState(false);

  // Chat state
  const [conversation, setConversation] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);

  // Auto-scroll ref
  const chatContainerRef = useRef(null);
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [conversation, isOpen]);

  // Toggle modal
  const openModal = () => setIsOpen(true);
  const closeModal = () => setIsOpen(false);

  // Send conversation to backend
  const handleSend = async (e) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setLoading(true);

    const updatedConversation = [
      ...conversation,
      { role: 'user', content: trimmed },
    ];
    setConversation(updatedConversation);
    setInputValue('');

    try {
      const res = await fetch('https://etc-nexus-server-production.up.railway.app/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationHistory: updatedConversation }),
      });
      const data = await res.json();

      if (data.reply) {
        const finalConversation = [
          ...updatedConversation,
          { role: 'assistant', content: data.reply },
        ];
        setConversation(finalConversation);
      } else {
        setConversation((prev) => [
          ...prev,
          { role: 'assistant', content: 'No response from server.' },
        ]);
      }
    } catch (error) {
      console.error('Error contacting the bot:', error);
      setConversation((prev) => [
        ...prev,
        { role: 'assistant', content: 'Error contacting the ETC Wizard bot.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Render each message as a bubble
  const renderMessage = (msg, idx) => {
    const isUser = msg.role === 'user';
    const bubbleClass = isUser
      ? 'bg-emerald-600 text-white self-end'
      : 'bg-gray-700 text-white self-start';
    const alignment = isUser ? 'items-end' : 'items-start';

    return (
      <div key={idx} className={`flex flex-col ${alignment} mb-3`}>
        <div className={`max-w-[75%] p-3 rounded-xl ${bubbleClass}`}>
          {msg.content}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Floating chat button => "Ask the ETC Wizard" */}
      <button
        onClick={openModal}
        className="fixed bottom-5 right-5 z-50 bg-emerald-600 hover:bg-emerald-500 text-white p-3 rounded-full shadow-lg"
      >
        <span className="flex items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="h-6 w-6 mr-1"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7.758 9h.008v.008h-.008V9zM11.758 9h.008v.008h-.008V9zM15.758 9h.008v.008h-.008V9z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 12c0 1.49.36 2.9 1.03 4.18a.75.75 0 0 1 .084.548l-.558 2.23a.75.75 0 0 0 .928.92l2.23-.558a.75.75 0 0 1 .548.084A9.74 9.74 0 0 0 12 21.75c5.108 0 9.248-3.708 9.75-8.365a.16.16 0 0 0-.04-.124.164.164 0 0 0-.118-.051H19.5c-.69 0-1.184-.66-1.016-1.331A3.75 3.75 0 0 0 14.889 7.5H14.25C13.56 7.5 13.066 6.84 13.234 6.169 13.676 4.5 11.881 3 9.75 3c-2.342 0-4.256 1.572-4.63 3.613-.168.84-.992 1.387-1.852 1.271-1.212-.164-2.145 1.196-1.548 2.245A9.508 9.508 0 0 0 2.25 12z"
            />
          </svg>
          Ask the ETC Wizard
        </span>
      </button>

      {/* Modal overlay (only renders if isOpen) */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-2">
          {/* 
            Modal content => 
            max-w-full on small screens, 
            has a green border + ETC styling 
          */}
          <div className="bg-gray-900 text-white w-full max-w-md md:max-w-lg h-[80vh] md:h-[70vh] rounded-lg shadow-xl flex flex-col border-2 border-emerald-600">
            {/* Header */}
            <div className="px-4 py-2 border-b border-emerald-600 flex justify-between items-center bg-gray-800 bg-opacity-80">
              <div className="flex items-center space-x-2">
                <img
                  src="ETClogo.png"
                  alt="ETC Logo"
                  className="w-8 h-8 object-contain"
                />
                <h2 className="text-xl font-bold">ETC Wizard</h2>
              </div>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-200 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Chat scrollable area */}
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-4 py-2">
              {conversation.length === 0 && (
                <div className="text-gray-400 text-center mt-4">
                  Ask me anything about ETC...
                </div>
              )}
              {conversation.map((msg, idx) => renderMessage(msg, idx))}
            </div>

            {/* Input area */}
            <form
              onSubmit={handleSend}
              className="p-3 border-t border-emerald-600 flex gap-2 bg-gray-800 bg-opacity-60"
            >
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask me anything about ETC..."
                className="flex-1 p-2 rounded-md bg-gray-800 text-white border border-gray-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading}
                className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white px-4 py-2 rounded-md font-semibold"
              >
                {loading ? 'Sending...' : 'Send'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default Chat;



