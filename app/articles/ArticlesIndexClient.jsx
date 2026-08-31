'use client';

import { useState, useMemo, useEffect } from 'react';

const PAGE_SIZE = 9;

function formatDate(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export default function ArticlesIndexClient({ articles, pillars }) {
  const [active, setActive] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let list = active === 'all' ? articles : articles.filter((a) => a.pillar === active);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((a) =>
        a.title.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
      );
    }
    // Most recent first — a shared publishedDate string sorts correctly as text (YYYY-MM-DD).
    return [...list].sort((a, b) => (b.publishedDate || '').localeCompare(a.publishedDate || ''));
  }, [articles, active, query]);

  // Any change to filter or search should land back on page 1 — otherwise a
  // narrower result set can leave the viewer stranded on a now-empty page.
  useEffect(() => { setPage(1); }, [active, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const visible = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  return (
    <>
      <div className="art-search">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search articles…"
          aria-label="Search articles"
        />
      </div>

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

      {filtered.length === 0 ? (
        <div className="art-empty">No articles match "{query}".</div>
      ) : (
        <div className="art-grid">
          {visible.map((a) => (
            <a key={a.slug} href={`/articles/${a.slug}`} className="art-card">
              <img
                className="art-card-image"
                src={a.image || `/api/og-article?title=${encodeURIComponent(a.title)}&pillar=${encodeURIComponent(pillars[a.pillar])}`}
                alt=""
                loading="lazy"
              />
              <div className="art-card-body">
                <div className="art-card-meta">
                  <span className="art-card-pillar">{pillars[a.pillar]}</span>
                  {a.publishedDate && <span className="art-card-date">{formatDate(a.publishedDate)}</span>}
                </div>
                <h3>{a.title}</h3>
                <p>{a.description}</p>
                <span className="art-card-read">Read the article →</span>
              </div>
            </a>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="art-pagination">
          <button
            className="art-page-btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={pageSafe === 1}
          >
            ← Prev
          </button>
          <span className="art-page-status">Page {pageSafe} of {totalPages}</span>
          <button
            className="art-page-btn"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={pageSafe === totalPages}
          >
            Next →
          </button>
        </div>
      )}
    </>
  );
}
