import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next'; 

function Blog({ blogOpen, setBlogOpen }) {
  // 1) Destructure from useTranslation
  const { t } = useTranslation();

  const [posts, setPosts] = useState([]);
  const [activeTab, setActiveTab] = useState('Market Analysis');

  useEffect(() => {
    fetch('https://etc-nexus-server-production.up.railway.app/api/blog')
      .then((res) => res.json())
      .then((data) => {
        if (data.blogPosts) {
          setPosts(data.blogPosts);
        }
      })
      .catch((err) => console.error('Error fetching blog posts:', err));
  }, []);

  // We keep these English strings for filtering logic,
  // but display them with localized labels in the UI.
  const categories = ['Market Analysis', 'General ETC', 'Community Buzz'];

  // For UI display => map each English category to a localized label
  const categoryLabels = {
    'Market Analysis': t('marketAnalysis'),
    'General ETC': t('generalETC'),
    'Community Buzz': t('communityBuzz'),
  };

  // Filter posts by the current active tab, then only show the newest one
  const filteredPosts = posts.filter((post) => post.category === activeTab);
  // Sort descending by date
  const sorted = [...filteredPosts].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  const newestPost = sorted[0] || null;

  const handleTabClick = (category) => {
    setActiveTab(category);
  };

  return (
    <aside className="bg-gray-800 bg-opacity-70 p-4 w-full h-full flex flex-col">
      {/* Header row with "ETC Blog" title and "Close Blog" button */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-emerald-300">
          {t('etcBlog')}
        </h2>
        <button
          onClick={() => setBlogOpen(false)}
          className="bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded text-white font-semibold"
        >
          {t('closeBlog')}
        </button>
      </div>

      {/* Tab Buttons */}
      <div className="flex space-x-2 mb-4">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => handleTabClick(cat)}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              activeTab === cat
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {/* Display localized label */}
            {categoryLabels[cat] || cat}
          </button>
        ))}
      </div>

      {/* Show only the single newest post for the active category */}
      <div className="overflow-y-auto flex-grow">
        {!newestPost ? (
          <p className="text-gray-400 italic">
            {t('noPostsYetForCategory', { cat: categoryLabels[activeTab] })}
          </p>
        ) : (
          <article
            key={newestPost.id}
            className="mb-4 bg-gray-900 p-3 rounded-md shadow-sm border border-gray-700"
          >
            <img src="/BlogImage.png" alt="Blog Banner" className="mb-3" />
            <h3 className="text-md md:text-lg font-semibold mb-1 text-emerald-300">
              {newestPost.title}
            </h3>
            <p className="text-xs text-gray-400 mb-2">
              {new Date(newestPost.createdAt).toLocaleString()}
            </p>
            <div className="text-white text-sm leading-relaxed">
              {newestPost.body}
            </div>
          </article>
        )}
      </div>
    </aside>
  );
}

export default Blog;









