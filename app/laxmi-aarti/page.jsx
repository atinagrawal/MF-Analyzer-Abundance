/**
 * app/laxmi-aarti/page.jsx
 *
 * Route: /laxmi-aarti
 *
 * Shri Mata Laxmi Ji Aarti (माँ लक्ष्मी आरती — ॐ जय लक्ष्मी माता):
 * - Complete Sacred Lyrics in Devanagari Hindi & Roman English Transliteration
 * - Stanza-by-Stanza Spiritual Meaning (भावार्थ)
 * - Interactive Temple Bell, Shankh & Puja toolbar
 * - Step-by-Step Aarti Vidhi & 14-Movement Deepam Guide (शास्त्रसम्मत आरती विधि)
 * - Significance of Ashta Lakshmi (अष्टलक्ष्मी स्वरूप)
 * - Maha Lakshmi Dhyan Shloka & Mool Mantras
 * - Harmonious connection with Abundance (धर्मसम्मत समृद्धि एवं सम्पत्ति निर्माण)
 * - Schema.org Structured Data (Breadcrumbs, FAQPage, MusicComposition, ItemPage)
 */

import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import LaxmiAartiClient from './LaxmiAartiClient';
import SriSuktamSection from './SriSuktamSection';
import { getPageMeta } from '@/lib/metadata';
import './laxmi-aarti.css';

export const metadata = getPageMeta('laxmi-aarti');
export const revalidate = 86400; // 24 hours ISR cache

const CANONICAL_URL = 'https://mfcalc.getabundance.in/laxmi-aarti';

const FAQS = [
  {
    q: 'लक्ष्मी पूजा में आरती से पूर्व श्री सूक्तम् का पाठ क्यों किया जाता है?',
    a: 'ऋग्वेद के खिल-भाग में वर्णित "श्री सूक्तम्" माँ महालक्ष्मी की स्तुति का सर्वप्राचीन व सर्वाधिक शक्तिशाली वैदिक स्तोत्र है। शास्त्रों के अनुसार, मन्त्रमय आवाहन (श्री सूक्त) के उपरांत आरती करने से सम्पूर्ण पूजा विधिवत संपन्न होती है और घर में स्थायी धन-धान्य का वास होता है।',
  },
  {
    q: 'माँ लक्ष्मी जी की आरती करने का सबसे शुभ समय कौन सा है?',
    a: 'माँ लक्ष्मी जी की आरती करने का सबसे उत्तम समय दैनिक गोधूलि वेला (संध्या काल), प्रत्येक शुक्रवार की संध्या, तथा कार्तिक अमावस्या (दीपावली पूजन), धनतेरस और शरद पूर्णिमा की रात्रि माना जाता है। इस समय घर में शुद्ध घी का दीपक प्रज्वलित कर भक्ति भाव से आरती करनी चाहिए।',
  },
  {
    q: 'लक्ष्मी आरती में "क्षीरोदधि जाता" पंक्ति का क्या आध्यात्मिक अर्थ है?',
    a: '"क्षीरोदधि जाता" का अर्थ है — क्षीरसागर (क्षीर + उदधि = दूध का सागर) से उत्पन्न होने वाली। श्रीमद्भागवत एवं पुराणों के अनुसार, देवासुर समुद्र मंथन के समय माता लक्ष्मी का प्राकट्य क्षीरसागर से हुआ था। इसलिए उन्हें समुद्रराज की कन्या और क्षीरोदधि जाता कहा जाता है।',
  },
  {
    q: 'आरती की थाली घुमाने का शास्त्रसम्मत क्रम क्या होना चाहिए?',
    a: 'शास्त्रों के अनुसार, आरती की थाली को सबसे पहले भगवान/माता के चरणों में 4 बार, नाभि मंडल पर 2 बार, मुखारविंद के सम्मुख 1 बार और अंत में संपूर्ण विग्रह (सर्वांग) पर 7 बार ॐ (ऊँ) की आकृति में दक्षिणावर्त (घड़ी की सुई की दिशा में) घुमाना चाहिए। कुल 14 बार आरती घुमाने का विधान है।',
  },
  {
    q: 'लक्ष्मी जी की आरती में "रत्न चतुर्दश तुम, बिन कोई नहीं पाता" का क्या आशय है?',
    a: 'समुद्र मंथन के समय चौदह अत्यंत दिव्य रत्न प्रकट हुए थे (जैसे अमृत, ऐरावत हाथी, उच्चैःश्रवा अश्व, कामधेनु, कौस्तुभ मणि, कल्पवृक्ष, आदि)। इनमें साक्षात माता महालक्ष्मी भी सर्वोत्कृष्ट रत्न रूप में प्रकट हुईं। माता लक्ष्मी की कृपा के बिना जगत में कोई भी सच्चा ऐश्वर्य व अलौकिक निधि प्राप्त नहीं कर सकता।',
  },
  {
    q: 'माता लक्ष्मी के आठ स्वरूप (अष्टलक्ष्मी) कौन-कौन से हैं?',
    a: 'माता लक्ष्मी के आठ मुख्य स्वरूप हैं: (1) आदि लक्ष्मी (आध्यात्मिक चेतना), (2) धन लक्ष्मी (भौतिक वैभव), (3) धान्य लक्ष्मी (अन्न व पोषण), (4) गज लक्ष्मी (प्रशासनिक सम्मान व पशु संपदा), (5) संतान लक्ष्मी (वंश कल्याण), (6) धैर्य/वीर लक्ष्मी (संकटों से लड़ने का साहस), (7) विजय लक्ष्मी (सफलता), और (8) विद्या लक्ष्मी (ज्ञान, कौशल व विवेक)।',
  },
  {
    q: 'क्या इस आरती का पाठ नित्य किया जा सकता है?',
    a: 'हाँ, नित्य सायंकाल संध्या दीप प्रज्वलन के पश्चात "ॐ जय लक्ष्मी माता" की आरती करने से घर में सकारात्मक ऊर्जा, पारिवारिक सौहार्द और दरिद्रता का निवारण होकर स्थायी सुख-समृद्धि का वास होता है।',
  },
];

function buildJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.getabundance.in' },
          { '@type': 'ListItem', position: 2, name: 'Market Data & Tools', item: 'https://mfcalc.getabundance.in/' },
          { '@type': 'ListItem', position: 3, name: 'माँ लक्ष्मी आरती', item: CANONICAL_URL },
        ],
      },
      {
        '@type': 'ItemPage',
        name: 'श्री माता लक्ष्मी जी की आरती — ॐ जय लक्ष्मी माता (Devotional Aarti, Meaning & Puja Vidhi)',
        description: 'Complete lyrics of Maa Laxmi Aarti (Om Jai Laxmi Mata) in Hindi Devanagari and English with spiritual meaning, interactive temple bell, step-by-step puja vidhi, and Ashta Lakshmi attributes.',
        url: CANONICAL_URL,
        inLanguage: ['hi', 'en'],
        image: 'https://mfcalc.getabundance.in/maa-lakshmi.jpg',
      },
      {
        '@type': 'CreativeWork',
        name: 'ऋग्वैदिक श्री सूक्तम् (Rigvedic Sri Suktam — 16 Sacred Verses)',
        genre: 'Vedic Stotra / Suktam',
        inLanguage: ['sa', 'hi', 'en'],
        text: 'ॐ हिरण्यवर्णां हरिणीं सुवर्णरजतस्रजाम्। चन्द्रां हिरण्मयीं लक्ष्मीं जातवेदो म आवह॥',
        url: `${CANONICAL_URL}#sri-suktam`,
      },
      {
        '@type': 'MusicComposition',
        name: 'माँ लक्ष्मी आरती (ॐ जय लक्ष्मी माता)',
        composer: {
          '@type': 'Person',
          name: 'Traditional Sanatan Devotional',
        },
        lyricist: {
          '@type': 'Person',
          name: 'Traditional Hindi Bhakti Sahitya',
        },
        inLanguage: 'hi',
        genre: 'Devotional Aarti / Bhajan',
        text: 'ॐ जय लक्ष्मी माता, मैया जय लक्ष्मी माता। तुमको निशदिन सेवत, मैया जी को निशदिन सेवत, हरि विष्णु विधाता॥',
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQS.map((faq) => ({
          '@type': 'Question',
          name: faq.q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.a,
          },
        })),
      },
      {
        '@type': 'WebPage',
        url: CANONICAL_URL,
        speakable: {
          '@type': 'SpeakableSpecification',
          cssSelector: ['.la-title', '.la-subtitle', '.la-verse-text'],
        },
      },
    ],
  };
}

export default function LaxmiAartiPage() {
  const jsonLd = buildJsonLd();

  return (
    <div className="la-page-wrap">
      {/* Preload authentic devotional audio for instantaneous playback */}
      <link rel="preload" href="/audio/temple-bell.mp3" as="audio" type="audio/mpeg" />
      <link rel="preload" href="/audio/shankh.mp3" as="audio" type="audio/mpeg" />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar />

      <main className="container la-main-content">
        {/* Breadcrumbs */}
        <nav className="la-breadcrumbs" aria-label="Breadcrumbs">
          <Link href="https://www.getabundance.in">Home</Link>
          <span className="sep">/</span>
          <Link href="/">Abundance</Link>
          <span className="sep">/</span>
          <span className="cur">माँ लक्ष्मी आरती</span>
        </nav>

        {/* Hero Section */}
        <header className="la-hero">
          <div className="la-hero-layout">
            <div className="la-hero-img-wrap">
              <div className="la-hero-img-frame">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/maa-lakshmi.jpg"
                  alt="माँ महालक्ष्मी — धन, वैभव और सुख-समृद्धि की अधिष्ठात्री देवी (Goddess Mahalakshmi)"
                  width={250}
                  height={334}
                  className="la-hero-img"
                  loading="eager"
                />
                <span className="la-hero-img-badge">🌸 साक्षात महालक्ष्मी स्वरूप</span>
              </div>
            </div>

            <div className="la-hero-content">
              <span className="la-eyebrow">
                🪔 नित्य व दीपावली पावन पूजन · सुख-समृद्धि प्रदायिनी
              </span>
              <h1 className="la-title">
                श्री माता लक्ष्मी जी की आरती
              </h1>
              <p className="la-subtitle">
                ॐ जय लक्ष्मी माता, मैया जय लक्ष्मी माता · सम्पूर्ण आरती, ऋग्वैदिक श्री सूक्तम्, भावार्थ एवं पूजा विधि
              </p>
              <p className="la-desc">
                माँ महालक्ष्मी धन, संपदा, सौहार्द और आध्यात्मिक ऐश्वर्य की अधिष्ठात्री देवी हैं। श्रद्धापूर्वक नित्य संध्या एवं पावन पर्वों पर माँ लक्ष्मी की आरती एवं श्री सूक्तम् का पाठ करने से घर में स्थायी शांति, सद्गुण और सुख-समृद्धि का वास होता है।
              </p>

              {/* Quick-Jump Section Navigation */}
              <div className="la-jump-nav" aria-label="Quick page navigation">
                <a href="#aarti-lyrics" className="la-jump-chip">📜 सम्पूर्ण आरती</a>
                <a href="#sri-suktam" className="la-jump-chip">🕉️ ऋग्वैदिक श्री सूक्तम्</a>
                <a href="#mantras" className="la-jump-chip">🕉️ महालक्ष्मी मंत्र</a>
                <a href="#puja-vidhi" className="la-jump-chip">🪔 आरती पूजा विधि</a>
                <a href="#ashta-lakshmi" className="la-jump-chip">🌸 अष्टलक्ष्मी स्वरूप</a>
                <a href="#faq" className="la-jump-chip">❓ प्रश्नोत्तर</a>
              </div>
            </div>
          </div>
        </header>

        {/* Client Interactive Aarti Reader */}
        <LaxmiAartiClient />

        {/* Rigvedic Sri Suktam Section (16 Sacred Verses & Phalasruti) */}
        <SriSuktamSection />

        {/* ── Maha Lakshmi Mantras & Dhyan Shlokas ── */}
        <section className="la-mantra-section" id="mantras">
          <div className="la-section-head">
            <span className="la-head-icon">🕉️</span>
            <h2 className="la-section-title">श्री महालक्ष्मी ध्यान श्लोक एवं पावन मंत्र</h2>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#5d4037', lineHeight: 1.55, margin: '0 0 14px' }}>
            आरती प्रारंभ करने से पूर्व अथवा आरती के उपरांत इन दिव्य मंत्रों का जप करने से माँ महालक्ष्मी की विशेष कृपा प्राप्त होती है:
          </p>

          <div className="la-mantra-box">
            <p className="la-mantra-shloka">
              ॐ श्रीं ह्रीं क्लीं श्रीं सिद्ध लक्ष्म्यै नमः॥
            </p>
            <p className="la-mantra-meaning">
              <strong>महालक्ष्मी मूल बीज मंत्र:</strong> समस्त प्रकार की ऋद्धि, सिद्धि, भौतिक सुख और आध्यात्मिक शांति प्रदान करने वाला बीज मंत्र।
            </p>
          </div>

          <div className="la-mantra-box" style={{ marginTop: 12 }}>
            <p className="la-mantra-shloka">
              ॐ महालक्ष्म्यै च विद्महे विष्णुपत्नी च धीमहि।<br />
              तन्नो लक्ष्मीः प्रचोदयात्॥
            </p>
            <p className="la-mantra-meaning">
              <strong>महालक्ष्मी गायत्री मंत्र:</strong> &quot;हम भगवान विष्णु की अर्धांगिनी परम देवी महालक्ष्मी का ध्यान करते हैं। वे जगन्माता हमारी बुद्धि और कर्मों को धर्म, अर्थ और समृद्धि के मार्ग पर प्रेरित करें।&quot;
            </p>
          </div>

          <div className="la-mantra-box" style={{ marginTop: 12 }}>
            <p className="la-mantra-shloka">
              नमस्तेऽस्तु महामाये श्रीपीठे सुरपूजिते।<br />
              शङ्खचक्रगदाहस्ते महालक्ष्मि नमोऽस्तु ते॥
            </p>
            <p className="la-mantra-meaning">
              <strong>श्रीमहालक्ष्म्यष्टकम् ध्यान:</strong> &quot;श्रीपीठ पर विराजमान, देवताओं द्वारा पूजित, हाथों में शंख, चक्र और गदा धारण करने वाली हे महामाये महालक्ष्मी! आपको बारंबार नमस्कार है।&quot;
            </p>
          </div>
        </section>

        {/* ── Puja Vidhi (Step-by-step) ── */}
        <section className="la-vidhi-section" id="puja-vidhi">
          <div className="la-section-head">
            <span className="la-head-icon">🪔</span>
            <h2 className="la-section-title">माँ लक्ष्मी आरती की शास्त्रसम्मत पूजा विधि</h2>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#5d4037', lineHeight: 1.6, margin: 0 }}>
            सनातन धर्म में आरती को पंचोपचार एवं षोडशोपचार पूजा का सबसे महत्वपूर्ण अंग माना गया है। आरती करते समय निम्नलिखित नियमों का पालन करने से पूर्ण सात्त्विक फल प्राप्त होता है:
          </p>

          <div className="la-vidhi-grid">
            <div className="la-vidhi-card">
              <span className="la-vidhi-step-num">चरण १</span>
              <h3 className="la-vidhi-step-title">आरती थाली की तैयारी</h3>
              <p className="la-vidhi-step-desc">
                पीतल, तांबे या चांदी की स्वच्छ थाली में कुमकुम से <strong>स्वस्तिक</strong> बनाएं। अक्षत, सुगंधित पुष्प, शुद्ध गाय के घी का एकमुखी या पंचमुखी दीपक और विशुद्ध कपूर सजाएं।
              </p>
            </div>

            <div className="la-vidhi-card">
              <span className="la-vidhi-step-num">चरण २</span>
              <h3 className="la-vidhi-step-title">दीप प्रज्वलन व शंख ध्वनि</h3>
              <p className="la-vidhi-step-desc">
                सर्वप्रथम <em>&quot;शुभं करोति कल्याणम्&quot;</em> मंत्र से दीप प्रज्वलित करें। आरती प्रारंभ करते समय शंखनाद करें और हाथ में घंटी लेकर निरंतर मधुर लय में बजाएं।
              </p>
            </div>

            <div className="la-vidhi-card">
              <span className="la-vidhi-step-num">चरण ३</span>
              <h3 className="la-vidhi-step-title">आरती घुमाने का वैदिक क्रम</h3>
              <p className="la-vidhi-step-desc">
                थाली को <strong>४ बार चरणों में</strong>, <strong>२ बार नाभि पर</strong>, <strong>१ बार मुखारविंद के समक्ष</strong> तथा <strong>७ बार सर्वांग पर</strong> दक्षिणावर्त (Clockwise ॐ की आकृति) घुमाएं।
              </p>
            </div>

            <div className="la-vidhi-card">
              <span className="la-vidhi-step-num">चरण ४</span>
              <h3 className="la-vidhi-step-title">आरती ग्रहण व पुष्पांजलि</h3>
              <p className="la-vidhi-step-desc">
                आरती पूर्ण होने पर जल से तीन बार आचमन कर आरती को शीतल करें। इसके पश्चात दोनों हाथों से आरती का तेज अपने नयनों व मस्तक पर धारण कर माता को पुष्पांजलि अर्पित करें।
              </p>
            </div>
          </div>

          <div className="la-thali-insight">
            💡 <strong>शास्त्रसम्मत रहस्य (१४ बार घुमाने का विधान):</strong> आरती की थाली कुल १४ बार घुमाई जाती है (४ + २ + १ + ७ = १४)। यह चौदह भुवनों एवं समुद्र मंथन से प्रकट चौदह दिव्य रत्नों के प्रति कृतज्ञता और अपने सम्पूर्ण अहंकार को माँ के श्रीचरणों में समर्पित करने का प्रतीक है।
          </div>
        </section>

        {/* ── Ashta Lakshmi (8 Forms) ── */}
        <section className="la-ashta-section" id="ashta-lakshmi">
          <div className="la-section-head">
            <span className="la-head-icon">🌸</span>
            <h2 className="la-section-title">माँ महालक्ष्मी के आठ पावन स्वरूप (अष्टलक्ष्मी)</h2>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#5d4037', lineHeight: 1.6, margin: 0 }}>
            अष्टलक्ष्मी का आशय केवल मौद्रिक धन नहीं, बल्कि मानव जीवन के सर्वांगीण उत्थान व संतुलन से है:
          </p>

          <div className="la-ashta-grid">
            <div className="la-ashta-card">
              <span className="la-ashta-icon">🕉️</span>
              <span className="la-ashta-name">आदि लक्ष्मी</span>
              <p className="la-ashta-desc">आध्यात्मिक चेतना, मोक्ष और सनातन दिव्यता की दात्री।</p>
            </div>

            <div className="la-ashta-card">
              <span className="la-ashta-icon">💰</span>
              <span className="la-ashta-name">धन लक्ष्मी</span>
              <p className="la-ashta-desc">सदाचार से अर्जित भौतिक धन, स्वर्ण व वित्तीय स्थिरता।</p>
            </div>

            <div className="la-ashta-card">
              <span className="la-ashta-icon">🌾</span>
              <span className="la-ashta-name">धान्य लक्ष्मी</span>
              <p className="la-ashta-desc">अन्न, कृषि, पोषण व किसी भी प्रकार के अभाव से मुक्ति।</p>
            </div>

            <div className="la-ashta-card">
              <span className="la-ashta-icon">🐘</span>
              <span className="la-ashta-name">गज लक्ष्मी</span>
              <p className="la-ashta-desc">राजसी सम्मान, वाहन, पशुधन व समाज में प्रतिष्ठा।</p>
            </div>

            <div className="la-ashta-card">
              <span className="la-ashta-icon">👶</span>
              <span className="la-ashta-name">संतान लक्ष्मी</span>
              <p className="la-ashta-desc">कुल की रक्षा, सुयोग्य संतान व पारिवारिक सुख-शांति।</p>
            </div>

            <div className="la-ashta-card">
              <span className="la-ashta-icon">🛡️</span>
              <span className="la-ashta-name">वीर / धैर्य लक्ष्मी</span>
              <p className="la-ashta-desc">कठिन समय में धैर्य, साहस और संकटों पर विजय की शक्ति।</p>
            </div>

            <div className="la-ashta-card">
              <span className="la-ashta-icon">🏆</span>
              <span className="la-ashta-name">विजय लक्ष्मी</span>
              <p className="la-ashta-desc">सत्कर्मों, व्यापार, उद्यम व कर्मक्षेत्र में सफलता।</p>
            </div>

            <div className="la-ashta-card">
              <span className="la-ashta-icon">📚</span>
              <span className="la-ashta-name">विद्या लक्ष्मी</span>
              <p className="la-ashta-desc">सद्ज्ञान, कला, कौशल, विवेक और दूरदृष्टि का वरदान।</p>
            </div>
          </div>
        </section>

        {/* ── Abundance & Lakshmi Connection Banner ── */}
        <section className="la-abundance-banner" id="abundance-philosophy">
          <div className="la-banner-content">
            <h3>सद्भाव और समृद्धि का संगम — Abundance</h3>
            <p>
              भारतीय दर्शन में <strong>&quot;शुभ लाभ&quot;</strong> का विधान है — जहाँ लाभ से पूर्व शुभता का होना अनिवार्य है। हम अपने प्रत्येक निवेशक के वित्तीय लक्ष्यों को अनुशासित, पारदर्शी व सुदृढ़ निवेश (SIPs, Mutual Funds व दीर्घकालिक नियोजन) के माध्यम से पूर्ण करने हेतु समर्पित हैं।
            </p>
          </div>
          <div>
            <Link href="/screener" className="la-banner-btn">
              <span>वित्तीय योजना बनाएं →</span>
            </Link>
          </div>
        </section>

        {/* ── Devotional FAQs ── */}
        <section className="la-faq-section" id="faq">
          <div className="la-section-head">
            <span className="la-head-icon">❓</span>
            <h2 className="la-section-title">माँ लक्ष्मी जी की आरती से संबंधित प्रश्न एवं उत्तर (FAQs)</h2>
          </div>

          <div className="la-faq-list">
            {FAQS.map((item, idx) => (
              <details className="la-faq-item" key={item.q} open={idx === 0}>
                <summary className="faq-q">{item.q}</summary>
                <div className="faq-a">
                  <p style={{ margin: 0 }}>{item.a}</p>
                </div>
              </details>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
