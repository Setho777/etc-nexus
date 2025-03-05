import React from 'react';

function Footer({ darkMode }) {
  // Switch background/text based on darkMode
  const footerClass = darkMode
    ? 'bg-gray-900 text-gray-400'
    : 'bg-gray-200 text-gray-700';

  return (
    <footer className={`${footerClass} w-full py-4 mt-auto`}>
      <div className="container mx-auto px-6 text-center">
        © 2025 ETC Nexus. Powered by Ethereum Classic.
      </div>
    </footer>
  );
}

export default Footer;

