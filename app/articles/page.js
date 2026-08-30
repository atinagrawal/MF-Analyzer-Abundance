'use client';

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ArticlesIndexClient from './ArticlesIndexClient';
import { ARTICLES, PILLARS } from '@/lib/articles';
import './articles.css';

export default function ArticlesPage() {
  return (
    <>
      <Navbar />
      <div className="art-hero">
        <div className="container">
          <div className="art-hero-eyebrow">Articles</div>
          <h1>Honest, practical writing on mutual funds, PMS &amp; SIF</h1>
          <p>
            No listicles, no filler — the things we'd actually want a friend to know before
            they make a money decision, written by an AMFI Registered Mutual Funds &amp; SIF
            Distributor who has to live with the advice too.
          </p>
        </div>
      </div>
      <div className="container">
        <ArticlesIndexClient articles={ARTICLES} pillars={PILLARS} />
      </div>
      <Footer />
    </>
  );
}
