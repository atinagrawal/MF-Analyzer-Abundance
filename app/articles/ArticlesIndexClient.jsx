'use client';

import { useState } from 'react';

export default function ArticlesIndexClient({ articles, pillars }) {
  const [active, setActive] = useState('all');
  const visible = active === 'all' ? articles : articles.filter((a) => a.pillar === active);

  return (
    <>
      <div className="art-filters">
        <button
          className={`art-filter-chip${active === 'all' ? ' active' : ''}`}
          onClick={() => setActive('all')}
        >
          All ({articles.length})
        </button>
        {Object.entries(pillars).map(([key, label]) => {
          const count = articles.filter((a) => a.pillar === key).length;
          if (!count) return null;
          return (
            <button
              key={key}
              className={`art-filter-chip${active === key ? ' active' : ''}`}
              onClick={() => setActive(key)}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      <div className="art-grid">
        {visible.map((a) => (
          <a key={a.slug} href={`/articles/${a.slug}`} className="art-card">
            <span className="art-card-pillar">{pillars[a.pillar]}</span>
            <h3>{a.title}</h3>
            <p>{a.description}</p>
            <span className="art-card-read">Read the article →</span>
          </a>
        ))}
      </div>
    </>
  );
}
