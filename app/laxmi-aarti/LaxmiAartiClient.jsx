'use client';

/**
 * app/laxmi-aarti/LaxmiAartiClient.jsx
 *
 * Interactive devotional reader for Shri Mata Laxmi Ji Aarti (ॐ जय लक्ष्मी माता):
 * - Devanagari Hindi lyrics, Roman English transliteration, and spiritual meanings
 * - Synthesized temple bell & shankh chime (Web Audio API with zero external assets)
 * - Font size switcher (A-, A, A+, A++)
 * - Hands-free auto-scroll reading mode for puja
 * - WhatsApp sharing and robust one-click copy (with fallback)
 * - Original aarti sheet preview modal
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export const AARTI_STANZAS = [
  {
    num: 1,
    label: 'छंद १',
    linesHindi: [
      'ॐ जय लक्ष्मी माता, मैया जय लक्ष्मी माता।',
      'तुमको निशदिन सेवत,',
      'मैया जी को निशदिन सेवत, हरि विष्णु विधाता॥',
    ],
    refrainHindi: 'ॐ जय लक्ष्मी माता॥',
    linesEnglish: [
      'Om Jai Lakshmi Mata, Maiya Jai Lakshmi Mata.',
      'Tumko Nishdin Sevat,',
      'Maiya Ji Ko Nishdin Sevat, Hari Vishnu Vidhata.',
    ],
    refrainEnglish: 'Om Jai Lakshmi Mata.',
    meaningHindi: 'हे माँ लक्ष्मी! आपकी सदा जय हो। सृष्टि के पालनकर्ता भगवान श्री हरि विष्णु एवं विधाता (ब्रह्मा जी) रात-दिन आपकी सेवा और वंदना करते हैं।',
    meaningEnglish: 'Salutations to Mother Lakshmi! Supreme Lord Hari Vishnu and creator Lord Brahma devoutly worship and serve You day and night.',
  },
  {
    num: 2,
    label: 'छंद २',
    linesHindi: [
      'उमा रमा ब्रह्माणी, तुम ही जगमाता, मैया तुम ही जगमाता।',
      'सूर्य चन्द्रमा ध्यावत, नारद ऋषि गाता॥',
    ],
    refrainHindi: 'ॐ जय लक्ष्मी माता॥',
    linesEnglish: [
      'Uma Rama Brahmani, Tum Hi Jagmata, Maiya Tum Hi Jagmata.',
      'Surya Chandrama Dhyavat, Narad Rishi Gata.',
    ],
    refrainEnglish: 'Om Jai Lakshmi Mata.',
    meaningHindi: 'उमा (पार्वती), रमा (लक्ष्मी), और ब्रह्माणी (सरस्वती) — इन तीनों स्वरूपों में आप ही सम्पूर्ण जगत की जननी (जगन्माता) हैं। सूर्य और चंद्रमा आपका ध्यान करते हैं और देवर्षि नारद वीणा पर आपका गुणगान करते हैं।',
    meaningEnglish: 'As Uma, Rama, and Brahmani, You are the Divine Mother of the universe. Sun and Moon meditate upon You, and Sage Narada sings Your eternal glory.',
  },
  {
    num: 3,
    label: 'छंद ३',
    linesHindi: [
      'दुर्गा रूप निरंजनी, सुख सम्पत्ति दाता, मैया सुख सम्पत्ति दाता।',
      'जो कोई तुमको ध्यावत, ऋद्धि-सिद्धि धन पाता॥',
    ],
    refrainHindi: 'ॐ जय लक्ष्मी माता॥',
    linesEnglish: [
      'Durga Roop Niranjani, Sukh Sampatti Data, Maiya Sukh Sampatti Data.',
      'Jo Koi Tumko Dhyavat, Riddhi-Siddhi Dhan Pata.',
    ],
    refrainEnglish: 'Om Jai Lakshmi Mata.',
    meaningHindi: 'आप ही आदिमाया दुर्गा और माया से परे निर्मल "निरंजनी" स्वरूप हैं। आप ही समस्त सुख और संपत्ति की दात्री हैं। जो कोई भी निष्काम भाव से आपका ध्यान करता है, वह ऋद्धि, सिद्धि और धर्म-युक्त धन प्राप्त करता है।',
    meaningEnglish: 'You are Mother Durga and the untainted divine light, giver of peace and wealth. Whoever meditates upon You receives spiritual wisdom (Riddhi), accomplishment (Siddhi), and prosperous abundance.',
  },
  {
    num: 4,
    label: 'छंद ४',
    linesHindi: [
      'तुम ही पाताल निवासिनि, तुम ही शुभदाता, मैया तुम ही शुभदाता।',
      'कर्म प्रभाव प्रकाशिनी, भवनिधि की त्राता॥',
    ],
    refrainHindi: 'ॐ जय लक्ष्मी माता॥',
    linesEnglish: [
      'Tum Hi Patal Nivasini, Tum Hi Shubhdata, Maiya Tum Hi Shubhdata.',
      'Karm Prabhav Prakashini, Bhavanidhi Ki Trata.',
    ],
    refrainEnglish: 'Om Jai Lakshmi Mata.',
    meaningHindi: 'पाताल लोक से लेकर समस्त लोकों में आपका ही वास है। आप ही सर्व मंगल व शुभ फल प्रदान करने वाली हैं। आप हमारे सत्कर्मों के प्रभाव को प्रकाशित करती हैं और इस संसार रूपी भवसागर से तारने वाली मुक्तिदाता हैं।',
    meaningEnglish: 'You reside across all realms and bestow all auspiciousness. You illuminate the fruits of righteous deeds and protect souls across the ocean of worldly existence.',
  },
  {
    num: 5,
    label: 'छंद ५',
    linesHindi: [
      'जिस घर में तुम रहती, सब सद्गुण आता, मैया सब सद्गुण आता।',
      'सब सम्भव हो जाता, मन नहीं घबराता॥',
    ],
    refrainHindi: 'ॐ जय लक्ष्मी माता॥',
    linesEnglish: [
      'Jis Ghar Mein Tum Rehti, Sab Sadgun Aata, Maiya Sab Sadgun Aata.',
      'Sab Sambhav Ho Jata, Man Nahin Ghabrata.',
    ],
    refrainEnglish: 'Om Jai Lakshmi Mata.',
    meaningHindi: 'जिस घर और हृदय में आपकी कृपा और वास होता है, वहाँ स्वतः ही सभी सद्गुण, प्रेम और शांति आ जाती है। जीवन के सारे कठिन कार्य सुगम व संभव हो जाते हैं और मन कभी विपत्ति में घबराता नहीं है।',
    meaningEnglish: 'In whichever home You reside, all noble virtues enter. Everything impossible becomes attainable, and the devotee’s mind remains serene and fearless.',
  },
  {
    num: 6,
    label: 'छंद ६',
    linesHindi: [
      'तुम बिन यज्ञ न होते, वस्त्र न कोई पाता, मैया वस्त्र न कोई पाता।',
      'खान पान का वैभव, सब तुमसे आता॥',
    ],
    refrainHindi: 'ॐ जय लक्ष्मी माता॥',
    linesEnglish: [
      'Tum Bin Yagya Na Hote, Vastra Na Koi Pata, Maiya Vastra Na Koi Pata.',
      'Khan Pan Ka Vaibhav, Sab Tumse Aata.',
    ],
    refrainEnglish: 'Om Jai Lakshmi Mata.',
    meaningHindi: 'आपकी कृपा के बिना कोई भी यज्ञ, हवन या शुभ अनुष्ठान संपन्न नहीं हो सकता। न ही किसी को वस्त्र और संसाधन प्राप्त होते हैं। भोजन, अन्न, आजीविका और ऐश्वर्य का समस्त वैभव आप ही से प्राप्त होता है।',
    meaningEnglish: 'Without Your grace, no sacred yajnas can be performed, nor can anyone attain clothing and shelter. Food, sustenance, and the abundance of life all emanate from You.',
  },
  {
    num: 7,
    label: 'छंद ७',
    linesHindi: [
      'शुभ गुण मंदिर सुन्दर, क्षीरोदधि जाता, मैया सुन्दर क्षीरोदधि जाता।',
      'रत्न चतुर्दश तुम, बिन कोई नहीं पाता॥',
    ],
    refrainHindi: 'ॐ जय लक्ष्मी माता॥',
    linesEnglish: [
      'Shubh Gun Mandir Sundar, Kshirodadhi Jata, Maiya Sundar Kshirodadhi Jata.',
      'Ratna Chaturdash Tum, Bin Koi Nahin Pata.',
    ],
    refrainEnglish: 'Om Jai Lakshmi Mata.',
    meaningHindi: 'आप शुभ गुणों का परम पावन मंदिर हैं और समुद्र मंथन के समय क्षीर सागर (क्षीरोदधि) से प्रकट हुई हैं। समुद्र मंथन से उत्पन्न चौदह दिव्य रत्नों की महिमा व प्राप्ति आपके बिना किसी को नहीं मिल सकती।',
    meaningEnglish: 'You are the sublime abode of auspicious virtues, daughter of the Ocean of Milk (Kshira Sagara). None could partake in the fourteen celestial gems churned from the ocean without Your blessings.',
  },
  {
    num: 8,
    label: 'छंद ८',
    linesHindi: [
      'महालक्ष्मी जी की आरती,',
      'जो कोई नर गाता, मैया जो कोई नर गाता।',
      'उर आनन्द समाता, पाप उतर जाता॥',
      'ॐ जय लक्ष्मी माता, मैया जय लक्ष्मी माता।',
      'तुमको निशदिन सेवत,',
      'मैया जी को निशदिन सेवत, हरि विष्णु विधाता॥',
    ],
    refrainHindi: 'ॐ जय लक्ष्मी माता, मैया जय लक्ष्मी माता॥',
    linesEnglish: [
      'Mahalakshmi Ji Ki Aarti,',
      'Jo Koi Nar Gata, Maiya Jo Koi Nar Gata.',
      'Ur Aanand Samata, Paap Utar Jata.',
      'Om Jai Lakshmi Mata, Maiya Jai Lakshmi Mata.',
      'Tumko Nishdin Sevat,',
      'Maiya Ji Ko Nishdin Sevat, Hari Vishnu Vidhata.',
    ],
    refrainEnglish: 'Om Jai Lakshmi Mata, Maiya Jai Lakshmi Mata.',
    meaningHindi: 'जो कोई भी भक्त माता महालक्ष्मी की इस पावन आरती का श्रद्धा से गान करता है, उसके अंतःकरण (उर) में परमानंद समा जाता है, समस्त पाप व ताप नष्ट हो जाते हैं और जीवन में सुख-समृद्धि का वास होता है।',
    meaningEnglish: 'Whosoever sings this sacred Aarti of Goddess Mahalakshmi with pure devotion, boundless bliss fills their heart, their sins dissolve, and their household is blessed with lasting peace and abundance.',
  },
];

export default function LaxmiAartiClient() {
  const [viewMode, setViewMode] = useState('hindi'); // 'hindi' | 'english' | 'meaning'
  const [fontSize, setFontSize] = useState('md'); // 'sm' | 'md' | 'lg' | 'xl'
  const [isRinging, setIsRinging] = useState(false);
  const [isBlowingShankh, setIsBlowingShankh] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showAudioEmbed, setShowAudioEmbed] = useState(false);

  const scrollTimerRef = useRef(null);

  // Web Audio API synthesized temple bell chime
  const ringTempleBell = useCallback(() => {
    if (typeof window === 'undefined') return;
    setIsRinging(true);
    setTimeout(() => setIsRinging(false), 900);

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();

      // Authentic brass temple bell frequencies and decay times
      const harmonics = [
        { freq: 659.25, gain: 0.5, decay: 2.8 },   // E5 fundamental
        { freq: 1318.5, gain: 0.35, decay: 2.2 },  // E6 octave
        { freq: 1975.5, gain: 0.22, decay: 1.6 },  // B6 fifth
        { freq: 2637.0, gain: 0.15, decay: 1.2 },  // E7 double octave
        { freq: 3300.0, gain: 0.08, decay: 0.8 },  // High harmonic shimmer
      ];

      harmonics.forEach(({ freq, gain, decay }) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);

        gainNode.gain.setValueAtTime(0.001, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(gain * 0.45, ctx.currentTime + 0.008);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + decay);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + decay);
      });
    } catch {
      // AudioContext not permitted or unsupported
    }
  }, []);

  // Web Audio API synthesized sacred Shankh sound
  const blowShankh = useCallback(() => {
    if (typeof window === 'undefined') return;
    setIsBlowingShankh(true);
    setTimeout(() => setIsBlowingShankh(false), 2200);

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();

      // Conch resonance
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(215, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(228, ctx.currentTime + 0.7);
      osc.frequency.linearRampToValueAtTime(216, ctx.currentTime + 2.0);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(430, ctx.currentTime);
      osc2.frequency.linearRampToValueAtTime(456, ctx.currentTime + 0.7);

      gainNode.gain.setValueAtTime(0.001, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.35);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2.2);

      osc.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc2.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 2.2);
      osc2.stop(ctx.currentTime + 2.2);
    } catch {
      // AudioContext not permitted
    }
  }, []);

  // Hands-free auto-scroll for puja
  useEffect(() => {
    if (!autoScroll) {
      if (scrollTimerRef.current) clearInterval(scrollTimerRef.current);
      return;
    }

    scrollTimerRef.current = setInterval(() => {
      window.scrollBy({ top: 1, behavior: 'smooth' });
      if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 50) {
        setAutoScroll(false);
      }
    }, 45);

    return () => {
      if (scrollTimerRef.current) clearInterval(scrollTimerRef.current);
    };
  }, [autoScroll]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Copy full Aarti text with fallback for all webviews
  const handleCopyAarti = () => {
    const fullText = [
      '॥ श्री माँ लक्ष्मी जी की आरती ॥',
      '',
      ...AARTI_STANZAS.flatMap((s) => [
        ...s.linesHindi,
        s.refrainHindi,
        '',
      ]),
      '🌸 ॐ महालक्ष्म्यै नमः 🌸',
      'स्रोत: Abundance (https://mfcalc.getabundance.in/laxmi-aarti)',
    ].join('\n');

    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fullText).then(() => {
        showToast('आरती की पावन पंक्तियाँ कॉपी हो गई हैं! 🙏');
      }).catch(() => {
        fallbackCopy(fullText);
      });
    } else {
      fallbackCopy(fullText);
    }
  };

  const fallbackCopy = (text) => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showToast('आरती की पावन पंक्तियाँ कॉपी हो गई हैं! 🙏');
    } catch {
      showToast('कॉपी करने में असमर्थ।');
    }
  };

  // WhatsApp share
  const handleWhatsAppShare = () => {
    const text = `🌸 *श्री माँ लक्ष्मी जी की पावन आरती* (ॐ जय लक्ष्मी माता) 🌸\n\nसम्पूर्ण आरती, भावार्थ, पूजा विधि एवं अष्टलक्ष्मी महिमा:\nhttps://mfcalc.getabundance.in/laxmi-aarti\n\nजय माँ महालक्ष्मी! 🙏✨`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      {/* ── Interactive Puja Toolbar ── */}
      <div className="la-toolbar" aria-label="Aarti Reading Toolbar">
        <div className="la-toolbar-left">
          {/* Temple Bell */}
          <button
            type="button"
            className={`la-bell-btn${isRinging ? ' ringing' : ''}`}
            onClick={ringTempleBell}
            title="पूजा घंटी बजाएं (Ring Temple Bell)"
          >
            <span className="bell-icon">🔔</span>
            <span>घंटी</span>
          </button>

          {/* Shankh Chime */}
          <button
            type="button"
            className={`la-shankh-btn${isBlowingShankh ? ' blowing' : ''}`}
            onClick={blowShankh}
            title="शंख ध्वनि बजाएं (Sound Sacred Shankh)"
          >
            <span>🐚</span>
            <span>शंख</span>
          </button>

          {/* View Mode: Hindi | English | Meaning */}
          <div className="la-view-tabs" role="tablist" aria-label="Text Language Selection">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'hindi'}
              className={`la-tab-btn${viewMode === 'hindi' ? ' active' : ''}`}
              onClick={() => setViewMode('hindi')}
            >
              हिन्दी
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'english'}
              className={`la-tab-btn${viewMode === 'english' ? ' active' : ''}`}
              onClick={() => setViewMode('english')}
            >
              English
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'meaning'}
              className={`la-tab-btn${viewMode === 'meaning' ? ' active' : ''}`}
              onClick={() => setViewMode('meaning')}
            >
              अर्थ सहित
            </button>
          </div>
        </div>

        <div className="la-toolbar-right">
          {/* Font Size Selector */}
          <div className="la-font-controls" title="अक्षर का आकार (Font Size)">
            <button
              type="button"
              className={`la-font-btn${fontSize === 'sm' ? ' active' : ''}`}
              onClick={() => setFontSize('sm')}
              aria-label="Small font"
            >
              क-
            </button>
            <button
              type="button"
              className={`la-font-btn${fontSize === 'md' ? ' active' : ''}`}
              onClick={() => setFontSize('md')}
              aria-label="Medium font"
            >
              क
            </button>
            <button
              type="button"
              className={`la-font-btn${fontSize === 'lg' ? ' active' : ''}`}
              onClick={() => setFontSize('lg')}
              aria-label="Large font"
            >
              क+
            </button>
            <button
              type="button"
              className={`la-font-btn${fontSize === 'xl' ? ' active' : ''}`}
              onClick={() => setFontSize('xl')}
              aria-label="Extra large font"
            >
              क++
            </button>
          </div>

          {/* Auto Scroll toggle */}
          <button
            type="button"
            className={`la-tool-btn auto-scroll${autoScroll ? ' active' : ''}`}
            onClick={() => setAutoScroll(!autoScroll)}
            title="आरती के साथ स्वतः नीचे स्क्रॉल करें (Hands-free Auto Scroll)"
          >
            <span>{autoScroll ? '⏸️ विराम' : '📜 ऑटो स्क्रॉल'}</span>
          </button>

          {/* Copy Aarti */}
          <button
            type="button"
            className="la-tool-btn"
            onClick={handleCopyAarti}
            title="पूरी आरती कॉपी करें"
          >
            <span>📋 कॉपी</span>
          </button>

          {/* WhatsApp Share */}
          <button
            type="button"
            className="la-tool-btn"
            onClick={handleWhatsAppShare}
            title="WhatsApp पर शेयर करें"
          >
            <span>💬 शेयर</span>
          </button>

          {/* Audio toggle */}
          <button
            type="button"
            className={`la-tool-btn${showAudioEmbed ? ' active' : ''}`}
            onClick={() => setShowAudioEmbed(!showAudioEmbed)}
            title="आरती सुनें (Audio Recitation)"
          >
            <span>🎧 {showAudioEmbed ? 'ऑडियो छिपाएं' : 'आरती सुनें'}</span>
          </button>
        </div>
      </div>

      {/* ── Audio Recitation Player (Embed) ── */}
      {showAudioEmbed && (
        <div style={{ marginBottom: 24, background: '#fff', padding: 16, borderRadius: 16, border: '1.5px solid #ecd899' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#880e4f' }}>
              🎵 श्री लक्ष्मी माता आरती (भक्ति भजन)
            </span>
            <button
              type="button"
              onClick={() => setShowAudioEmbed(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#795548' }}
              aria-label="Close audio player"
            >
              ✕
            </button>
          </div>
          <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: 12 }}>
            <iframe
              src="https://www.youtube-nocookie.com/embed/5B-4g6b2n9s?rel=0"
              title="Om Jai Lakshmi Mata Aarti"
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}

      {/* ── Aarti Sacred Sheet ── */}
      <section className={`la-aarti-sheet la-font-${fontSize}`} id="aarti-lyrics">
        <header className="la-sheet-header">
          <span className="la-om-badge">🕉️</span>
          <h2 className="la-sheet-title">माँ लक्ष्मी आरती</h2>
          <p className="la-sheet-meta">
            राग: बिलावल / दरबारी · नित्य एवं दीपावली पूजन पाठ
          </p>
        </header>

        <div className="la-stanzas-list">
          {AARTI_STANZAS.map((stanza) => (
            <article className="la-stanza-card" key={stanza.num}>
              <div className="la-stanza-top">
                <span className="la-stanza-num">{stanza.label}</span>
                <span className="la-stanza-flower">🌸 ✨ 🌸</span>
              </div>

              {/* Hindi Devanagari View */}
              {(viewMode === 'hindi' || viewMode === 'meaning') && (
                <div className="la-verse-text">
                  {stanza.linesHindi.map((line, idx) => (
                    <span className="la-verse-line" key={idx}>{line}</span>
                  ))}
                  <span className="la-refrain-line">{stanza.refrainHindi}</span>
                </div>
              )}

              {/* Roman English View */}
              {viewMode === 'english' && (
                <div className="la-verse-text">
                  {stanza.linesEnglish.map((line, idx) => (
                    <span className="la-verse-line" key={idx}>{line}</span>
                  ))}
                  <span className="la-refrain-line">{stanza.refrainEnglish}</span>
                </div>
              )}

              {/* Spiritual Meaning */}
              {viewMode === 'meaning' && (
                <div className="la-meaning-box">
                  <p style={{ margin: '0 0 6px' }}>
                    <strong>भावार्थ:</strong> {stanza.meaningHindi}
                  </p>
                  <p style={{ margin: 0, fontStyle: 'italic', color: '#5d4037', fontSize: '0.8rem' }}>
                    <strong>English:</strong> {stanza.meaningEnglish}
                  </p>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* ── Toast notification ── */}
      {toastMessage && (
        <div className="la-toast" role="status">
          {toastMessage}
        </div>
      )}
    </>
  );
}
