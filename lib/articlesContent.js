/**
 * lib/articlesContent.js — Server-only markdown body loader for /articles
 *
 * Split out from lib/articles.js specifically because this file needs fs/
 * path -- import this only from server components (app/articles/[slug]/
 * page.jsx), never from anything 'use client' (see lib/articles.js's own
 * header comment for why that split exists).
 */
import fs from 'fs';
import path from 'path';

const CONTENT_DIR = path.join(process.cwd(), 'content', 'articles');

// Strips the leading "# Title" and "*byline*" lines (plus the blank lines
// around them) from a draft's raw markdown -- the page renders both as
// styled elements from the manifest instead, so keeping them in the
// markdown body would duplicate the <h1> and the byline on the page.
function stripLeadingHeader(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  if (lines[i]?.startsWith('# ')) i++;
  while (lines[i] === '') i++;
  if (lines[i]?.startsWith('*') && lines[i]?.endsWith('*')) i++;
  while (lines[i] === '') i++;
  return lines.slice(i).join('\n');
}

export function getArticleBody(article) {
  const raw = fs.readFileSync(path.join(CONTENT_DIR, article.file), 'utf8');
  return stripLeadingHeader(raw);
}
