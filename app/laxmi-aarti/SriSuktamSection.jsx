'use client';

/**
 * app/laxmi-aarti/SriSuktamSection.jsx
 *
 * Rigvedic Sri Suktam (ऋग्वैदिक श्री सूक्तम्) — Complete 16 Sacred Verses & Phalasruti:
 * - Authentic Devanagari Sanskrit text with standard Vedic punctuation
 * - Roman English transliteration (IAST style)
 * - Verse-by-verse spiritual meaning in Hindi (भावार्थ)
 * - View toggles: 'meaning' (हिन्दी अर्थ सहित) | 'sanskrit' (केवल श्लोक) | 'english' (English Transliteration)
 * - One-click copy for complete Sri Suktam
 * - Expandable Phalasruti (फलश्रुति)
 */

import { useState } from 'react';

export const SRI_SUKTAM_VERSES = [
  {
    num: 1,
    label: 'ऋचा १',
    sanskrit: 'ॐ हिरण्यवर्णां हरिणीं सुवर्णरजतस्रजाम्।\nचन्द्रां हिरण्मयीं लक्ष्मीं जातवेदो म आवह॥ १॥',
    english: 'Om Hiraṇyavarṇāṃ Hariṇīṃ Suvarṇa-Rajata-Srajām |\nCandrāṃ Hiraṇmayīṃ Lakṣmīṃ Jātavedo Ma Āvaha || 1 ||',
    meaning: 'हे सर्वज्ञ अग्निदेव (जातवेदा)! आप मेरे लिए सुवर्ण के समान कान्तिमान, हरिणी रूप में मनोहर, सोने और चाँदी के हार धारण करने वाली, चन्द्रमा के समान शीतल एवं आनन्ददायिनी, सुवर्णमयी महालक्ष्मी देवी का यहाँ आवाहन कीजिए।',
  },
  {
    num: 2,
    label: 'ऋचा २',
    sanskrit: 'तां म आवह जातवेदो लक्ष्मीमनपगामिनीम्।\nयस्यां हिरण्यं विन्देयं गामश्वं पुरुषानहम्॥ २॥',
    english: 'Tāṃ Ma Āvaha Jātavedo Lakṣmīm-Anapagāminīm |\nYasyāṃ Hiraṇyaṃ Vindeyaṃ Gām-Aśvaṃ Puruṣān-Aham || 2 ||',
    meaning: 'हे अग्निदेव! आप मेरे लिए उन स्थिर (सदा साथ रहने वाली) लक्ष्मी जी का आवाहन कीजिए, जिनके आगमन से मैं विपुल सुवर्ण, गौ, अश्व और परिजन-सेवकों को प्राप्त कर सकूँ।',
  },
  {
    num: 3,
    label: 'ऋचा ३',
    sanskrit: 'अश्वपूर्वां रथमध्यां हस्तिनादप्रबोधिनीम्।\nश्रियं देवीमुपह्वये श्रीर्मा देवी जुषताम्॥ ३॥',
    english: 'Aśva-Pūrvāṃ Ratha-Madhyāṃ Hasti-Nāda-Prabodhinīm |\nŚriyaṃ Devīm-Upahvaye Śrīrmā Devī Juṣatām || 3 ||',
    meaning: 'जिनके आगे-आगे अश्व चलते हैं, जो रथ के मध्य में विराजमान हैं, और जो हाथियों की गंभीर चिंघाड़ से प्रफुल्लित होती हैं — उन परम ऐश्वर्यमयी श्री देवी का मैं आवाहन करता हूँ। वे भगवती लक्ष्मी मुझ पर प्रसन्न हों।',
  },
  {
    num: 4,
    label: 'ऋचा ४',
    sanskrit: 'कां सोस्मितां हिरण्यप्राकारामार्द्रां ज्वलन्तीं तृप्तां तर्पयन्तीम्।\nपद्मे स्थितां पद्मवर्णां तामिहोपह्वये श्रियम्॥ ४॥',
    english: 'Kāṃ Sosmitāṃ Hiraṇya-Prākārām-Ārdrāṃ Jvalantīṃ Tṛptāṃ Tarpayantīm |\nPadme Sthitāṃ Padma-Varṇāṃ Tām-Ihopahvaye Śriyam || 4 ||',
    meaning: 'जो मंद-मंद मुस्कान वाली, स्वर्ण के परकोटे में स्थित, दया से द्रवीभूत, दिव्य तेज से देदीप्यमान, स्वतः तृप्त और भक्तों के मनोरथ पूर्ण कर उन्हें तृप्त करने वाली हैं, जो कमल पर विराजमान और कमल के समान वर्ण वाली हैं — उन श्री लक्ष्मी जी को मैं यहाँ सादर पुकारता हूँ।',
  },
  {
    num: 5,
    label: 'ऋचा ५',
    sanskrit: 'चन्द्रां प्रभासां यशसा ज्वलन्तीं श्रियं लोके देवजुष्टामुदाराम्।\nतां पद्मिनीमीं शरणमहं प्रपद्येऽलक्ष्मीर्मे नश्यतां त्वां वृणे॥ ५॥',
    english: 'Candrāṃ Prabhāsāṃ Yaśasā Jvalantīṃ Śriyaṃ Loke Deva-Juṣṭām-Udārām |\nTāṃ Padminīm-Īṃ Śaraṇam-Ahaṃ Prapadye\'lakṣmīr-Me Naśyatāṃ Tvāṃ Vṛṇe || 5 ||',
    meaning: 'जो चन्द्रमा के समान शीतल प्रकाशमयी, अपने यश से जगत में दैदीप्यमान, देवताओं द्वारा पूजित और अत्यंत उदार हैं — उन कमलनयनी भगवती लक्ष्मी की मैं शरण लेता हूँ। हे माँ! मेरे दारिद्र्य (अलक्ष्मी) का नाश हो, मैं आपका ही वरण करता हूँ।',
  },
  {
    num: 6,
    label: 'ऋचा ६',
    sanskrit: 'आदित्यवर्णे तपसोऽधिजातो वनस्पतिस्तव वृक्षोऽथ बिल्वः।\nतस्य फलानि तपसानुदन्तु मायान्तरायाश्च बाह्या अलक्ष्मीः॥ ६॥',
    english: 'Āditya-Varṇe Tapaso\'dhijāto Vanaspatis-Tava Vṛkṣo\'tha Bilvaḥ |\nTasya Phalāni Tapasānudantu Māyāntarāyāśca Bāhyā Alakṣmīḥ || 6 ||',
    meaning: 'हे सूर्य के समान तेजस्वी महालक्ष्मी! आपके कठोर तप से ही वनस्पतियों में श्रेष्ठ पवित्र "बिल्व" (बेल) का वृक्ष उत्पन्न हुआ। उस बिल्व वृक्ष के फल हमारे आंतरिक अज्ञान, मोह और बाह्य दारिद्र्य (अलक्ष्मी) को समूल नष्ट कर दें।',
  },
  {
    num: 7,
    label: 'ऋचा ७',
    sanskrit: 'उपैतु मां देवसखः कीर्तिश्च मणिना सह।\nप्रादुर्भूतोऽस्मि राष्ट्रेऽस्मिन् कीर्तिमृद्धिं ददातु मे॥ ७॥',
    english: 'Upaitu Māṃ Deva-Sakhaḥ Kīrtiśca Maṇinā Saha |\nPrādurbhūto\'smi Rāṣṭre\'smin Kīrtim-Ṛddhiṃ Dadātu Me || 7 ||',
    meaning: 'देवों के सखा कुबेर और यश (कीर्ति) दिव्य मणियों सहित मेरे पास आएँ। मैं इस राष्ट्र में उत्पन्न हुआ हूँ, अतः हे माँ लक्ष्मी! आप मुझे कीर्ति (यश) और ऋद्धि (अलौकिक समृद्धि) प्रदान करें।',
  },
  {
    num: 8,
    label: 'ऋचा ८',
    sanskrit: 'क्षुत्पिपासाकलां ज्येष्ठामलक्ष्मीं नाशयाम्यहम्।\nअभूतिमसमृद्धिं च सर्वान् निर्णुद मे गृहात्॥ ८॥',
    english: 'Kṣut-Pipāsā-Malāṃ Jyeṣṭhām-Alakṣmīṃ Nāśayāmy-Aham |\nAbhūtim-Asamṛddhiṃ Ca Sarvān Nirṇuda Me Gṛhāt || 8 ||',
    meaning: 'भूख और प्यास रूपी मलिनता से युक्त जो "ज्येष्ठा अलक्ष्मी" (दरिद्रता) हैं, उनका मैं माँ की कृपा से नाश करता हूँ। हे देवि! आप मेरे घर से समस्त अभाव, विपन्नता और असमृद्धि को सदैव के लिए दूर भगा दीजिए।',
  },
  {
    num: 9,
    label: 'ऋचा ९',
    sanskrit: 'गन्धद्वारां दुराधर्षां नित्यपुष्टां करीषिणीम्।\nईश्वरीं सर्वभूतानां तामिहोपह्वये श्रियम्॥ ९॥',
    english: 'Gandha-Dvārāṃ Durādharṣāṃ Nitya-Puṣṭāṃ Karīṣiṇīm |\nĪśvarīṃ Sarva-Bhūtānāṃ Tām-Ihopahvaye Śriyam || 9 ||',
    meaning: 'जो दिव्य सुगंध का मूल द्वार हैं, जिन्हें कोई पराजित नहीं कर सकता, जो नित्य पुष्ट व धन-धान्य से परिपूर्ण हैं, और जो समस्त चराचर प्राणियों की स्वामिनी (ईश्वरी) हैं — उन महालक्ष्मी का मैं सादर आवाहन करता हूँ।',
  },
  {
    num: 10,
    label: 'ऋचा १०',
    sanskrit: 'मनसः काममाकूतिं वाचः सत्यमशीमहि।\nपशूनां रूपमन्नस्य मयि श्रीः श्रयतां यशः॥ १०॥',
    english: 'Manasaḥ Kāmam-Ākūtiṃ Vācaḥ Satyam-Aśīmahi |\nPaśūnāṃ Rūpam-Annasya Mayi Śrīḥ Śrayatāṃ Yaśaḥ || 10 ||',
    meaning: 'मेरे मन के समस्त शुभ संकल्प और कामनाएँ सिद्ध हों, मेरी वाणी में सत्य का वास हो। गौ आदि पशुधन, अन्न का वैभव, ऐश्वर्य और यश सदा मेरे घर में स्थिर होकर निवास करें।',
  },
  {
    num: 11,
    label: 'ऋचा ११',
    sanskrit: 'कर्दमेन प्रजाभूता मयि सम्भव कर्दम।\nश्रियं वासय मे कुले मातरं पद्ममालिनीम्॥ ११॥',
    english: 'Kardamena Prajā-Bhūtā Mayi Sambhava Kardama |\nŚriyaṃ Vāsaya Me Kule Mātaraṃ Padma-Mālinīm || 11 ||',
    meaning: 'हे कर्दम ऋषि! आप माता लक्ष्मी के पुत्र रूप में प्रकट हुए हैं। हे कर्दम! आप मेरे कुल में निवास कीजिए और कमल की माला धारण करने वाली अपनी दिव्य माता महालक्ष्मी को भी मेरे परिवार में सदा के लिए प्रतिष्ठित कर दीजिए।',
  },
  {
    num: 12,
    label: 'ऋचा १२',
    sanskrit: 'आपः सृजन्तु स्निग्धानि चिक्लीत वस मे गृहे।\nनि च देवीं मातरं श्रियं वासय मे कुले॥ १२॥',
    english: 'Āpaḥ Sṛjantu Snigdhāni Ciklīta Vasa Me Gṛhe |\nNi Ca Devīṃ Mātaraṃ Śriyaṃ Vāsaya Me Kule || 12 ||',
    meaning: 'वरुण देव जल और स्निग्ध (मधुर व पोषक) पदार्थों की सृष्टि करें। हे चिक्लीत (माता लक्ष्मी के पुत्र)! आप मेरे घर में वास करें और अपनी पूजनीया माता महालक्ष्मी को भी मेरे कुल में सदा के लिए स्थिर कर दें।',
  },
  {
    num: 13,
    label: 'ऋचा १३',
    sanskrit: 'आर्द्रां पुष्करिणीं पुष्टिं पिङ्गलां पद्ममालिनीम्।\nचन्द्रां हिरण्मयीं लक्ष्मीं जातवेदो म आवह॥ १३॥',
    english: 'Ārdrāṃ Puṣkariṇīṃ Puṣṭiṃ Piṅgalāṃ Padma-Mālinīm |\nCandrāṃ Hiraṇmayīṃ Lakṣmīṃ Jātavedo Ma Āvaha || 13 ||',
    meaning: 'हे अग्निदेव! आप मेरे लिए उन दयामयी, कमल-सरोवरों से युक्त, पोषणदात्री, पीतवर्णा, कमलों की माला धारण करने वाली, चन्द्रमा के समान शांत और सुवर्णमयी लक्ष्मी जी का आवाहन कीजिए।',
  },
  {
    num: 14,
    label: 'ऋचा १४',
    sanskrit: 'आर्द्रां यः करिणीं यष्टिं सुवर्णां हेममालिनीम्।\nसूर्यां हिरण्मयीं लक्ष्मीं जातवेदो म आवह॥ १४॥',
    english: 'Ārdrāṃ Yaḥ Kariṇīṃ Yaṣṭiṃ Suvarṇāṃ Hema-Mālinīm |\nSūryāṃ Hiraṇmayīṃ Lakṣmīṃ Jātavedo Ma Āvaha || 14 ||',
    meaning: 'हे अग्निदेव! जो कृपा की वर्षा करने वाली, धर्म की राजसत्ता रूप यष्टि को धारण करने वाली, सुवर्णमयी कांति और स्वर्णहारों से अलंकृत, सूर्य के समान प्रचण्ड तेजस्विनी सुवर्णमयी लक्ष्मी जी हैं, उन्हें आप मेरे यहाँ ले आइए।',
  },
  {
    num: 15,
    label: 'ऋचा १५',
    sanskrit: 'तां म आवह जातवेदो लक्ष्मीमनपगामिनीम्।\nयस्यां हिरण्यं प्रभूतं गावो दास्योऽश्वान् विन्देयं पुरुषानहम्॥ १५॥',
    english: 'Tāṃ Ma Āvaha Jātavedo Lakṣmīm-Anapagāminīm |\nYasyāṃ Hiraṇyaṃ Prabhūtaṃ Gāvo Dāsyo\'śvān Vindeyaṃ Puruṣān-Aham || 15 ||',
    meaning: 'हे अग्निदेव! आप मेरे लिए उन कभी न नष्ट होने वाली स्थिर लक्ष्मी जी का आवाहन कीजिए, जिनके अनुग्रह से मैं विपुल सुवर्ण, गौएँ, सेवक-सेविकाएँ, अश्व और समस्त स्वजनों को प्राप्त कर सकूँ।',
  },
  {
    num: 16,
    label: 'ऋचा १६',
    sanskrit: 'यः शुचिः प्रयतो भूत्वा जुहुयादाज्यमन्वहम्।\nसूक्तं पञ्चदशर्चं च श्रीकामः सततं जपेत्॥ १६॥',
    english: 'Yaḥ Śuciḥ Prayato Bhūtvā Juhuyād-Ājyam-Anvaham |\nSūktaṃ Pañcadaśarcaṃ Ca Śrī-Kāmaḥ Satataṃ Japet || 16 ||',
    meaning: 'जो मनुष्य पवित्र और संयमित होकर प्रतिदिन घी की आहुतियों से हवन करता है और इस पंद्रह ऋचाओं वाले "श्री सूक्त" का निरंतर श्रद्धा से जप करता है, वह अखंड ऐश्वर्य, स्थिर लक्ष्मी और परम कल्याण को प्राप्त होता है।',
  },
];

export const SRI_SUKTAM_PHALASHRUTI = [
  {
    sanskrit: 'पद्मानने पद्मविपद्मपत्रे पद्मप्रिये पद्मदलायताक्षि।\nविश्वप्रिये विश्वमनोऽनुकूले त्वत्पादपद्मं मयि सन्निधत्स्व॥',
    english: 'Padmānane Padma-Vipadma-Patre Padma-Priye Padma-Dalāyatākṣi |\nViśva-Priye Viśva-Mano\'nukūle Tvat-Pāda-Padmaṃ Mayi Sannidhatsva ||',
    meaning: 'हे कमलमुखी, कमलदल के समान विशाल नेत्रों वाली, कमलप्रिया, सम्पूर्ण विश्व की प्रियतमा माँ लक्ष्मी! आप अपने दोनों चरणकमलों को मेरे हृदय में सदा के लिए स्थापित कर दीजिए।',
  },
  {
    sanskrit: 'पद्मानने पद्मऊरु पद्माक्षी पद्मसम्भवे।\nतन्मे भजसि पद्माक्षि येन सौख्यं लभाम्यहम्॥',
    english: 'Padmānane Padma-Ūru Padmākṣī Padma-Sambhave |\nTan-Me Bhajasi Padmākṣi Yena Saukhyaṃ Labhāmy-Aham ||',
    meaning: 'हे कमल के समान कोमल अंगों वाली, कमलनयनी, कमल से प्राकट्य लेने वाली माँ लक्ष्मी! आप मुझे वह भक्ति और कृपा प्रदान करें जिससे मुझे अखंड सुख और शांति प्राप्त हो।',
  },
  {
    sanskrit: 'अश्वदायि गोदायि धनदायि महाधने।\nधनं मे लभतां देवि सर्वकामांश्च देहि मे॥',
    english: 'Aśva-Dāyi Go-Dāyi Dhana-Dāyi Mahā-Dhane |\nDhanaṃ Me Labhatāṃ Devi Sarva-Kāmāṃśca Dehi Me ||',
    meaning: 'हे अश्व, गौ, भौतिक व आध्यात्मिक महाधन प्रदान करने वाली भगवती! मुझे स्थायी धन व समृद्धि प्रदान करें और मेरे समस्त शुभ संकल्पों को सिद्ध करें।',
  },
  {
    sanskrit: 'ॐ महालक्ष्म्यै च विद्महे विष्णुपत्नी च धीमहि।\nतन्नो लक्ष्मीः प्रचोदयात्॥',
    english: 'Om Mahālakṣmyai Ca Vidmahe Viṣṇu-Patnī Ca Dhīmahi |\nTanno Lakṣmīḥ Pracodayāt ||',
    meaning: 'महालक्ष्मी गायत्री मंत्र: हम भगवान विष्णु की अर्धांगिनी परम देवी महालक्ष्मी का ध्यान करते हैं। वे जगन्माता हमारी बुद्धि और कर्मों को धर्म, अर्थ और समृद्धि के मार्ग पर प्रेरित करें।',
  },
];

export default function SriSuktamSection() {
  const [viewMode, setViewMode] = useState('meaning'); // 'meaning' | 'sanskrit' | 'english'
  const [showPhalashruti, setShowPhalashruti] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const handleCopySriSuktam = () => {
    const fullText = [
      '॥ ऋग्वैदिक श्री सूक्तम् ॥',
      '(Rigvedic Sri Suktam — 16 Sacred Verses)',
      '',
      ...SRI_SUKTAM_VERSES.map((v) => `${v.label}:\n${v.sanskrit}\nभावार्थ: ${v.meaning}\n`),
      '॥ श्री सूक्तम् फलश्रुति ॥',
      ...SRI_SUKTAM_PHALASHRUTI.map((p) => `${p.sanskrit}\nभावार्थ: ${p.meaning}\n`),
      '🌸 ॐ श्रीं ह्रीं क्लीं श्रीं सिद्ध लक्ष्म्यै नमः 🌸',
      'स्रोत: Abundance (https://mfcalc.getabundance.in/laxmi-aarti#sri-suktam)',
    ].join('\n');

    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fullText).then(() => {
        showToast('सम्पूर्ण श्री सूक्तम् कॉपी हो गया है! 🙏');
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
      showToast('सम्पूर्ण श्री सूक्तम् कॉपी हो गया है! 🙏');
    } catch {
      showToast('कॉपी करने में असमर्थ।');
    }
  };

  return (
    <section className="la-suktam-section" id="sri-suktam" aria-label="Rigvedic Sri Suktam Section">
      {/* Toast Alert */}
      {toastMsg && (
        <div className="la-toast" role="alert">
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <div className="la-section-head">
        <span className="la-head-icon">🕉️</span>
        <div>
          <h2 className="la-section-title">ऋग्वैदिक श्री सूक्तम् (Rigvedic Sri Suktam)</h2>
          <p className="la-section-subtitle">
            ऋग्वेद के खिल-सूक्त का परम पावन महालक्ष्मी स्तोत्र · समस्त १६ ऋचाएँ, मन्त्र, अन्वय एवं भावार्थ
          </p>
        </div>
      </div>

      {/* Intro Note */}
      <div className="la-suktam-intro">
        <p>
          सनातन धर्म की परंपरानुसार, <strong>दीपावली महालक्ष्मी पूजन</strong>, धनतेरस, शरद पूर्णिमा अथवा शुक्रवार की संध्या पर आरती से पूर्व <strong>श्री सूक्तम्</strong> का पाठ करना सर्वोत्तम फलदायी माना गया है। अग्निदेव के माध्यम से माँ लक्ष्मी का आवाहन करने वाले इन १६ दिव्य वैदिक मन्त्रों का नित्य श्रवण व पाठ दरिद्रता का नाश कर अखंड लक्ष्मी की प्रतिष्ठा करता है।
        </p>
      </div>

      {/* Suktam Controls Bar */}
      <div className="la-suktam-controls">
        <div className="la-view-tabs" role="tablist" aria-label="Sri Suktam Language Selection">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'meaning'}
            className={`la-tab-btn${viewMode === 'meaning' ? ' active' : ''}`}
            onClick={() => setViewMode('meaning')}
          >
            अर्थ सहित
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'sanskrit'}
            className={`la-tab-btn${viewMode === 'sanskrit' ? ' active' : ''}`}
            onClick={() => setViewMode('sanskrit')}
          >
            केवल श्लोक
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
        </div>

        <button
          type="button"
          className="la-tool-btn"
          onClick={handleCopySriSuktam}
          title="सम्पूर्ण श्री सूक्तम् कॉपी करें"
        >
          <span>📋 श्री सूक्तम् कॉपी</span>
        </button>
      </div>

      {/* 16 Verses Grid / List */}
      <div className="la-suktam-verses">
        {SRI_SUKTAM_VERSES.map((v) => (
          <article key={v.num} className="la-suktam-card">
            <div className="la-suktam-card-head">
              <span className="la-suktam-num-badge">{v.label}</span>
              <span className="la-suktam-rig-tag">ऋग्वेद खिलभाग</span>
            </div>

            {/* Sanskrit Devanagari */}
            {(viewMode === 'meaning' || viewMode === 'sanskrit') && (
              <p className="la-suktam-sanskrit">
                {v.sanskrit.split('\n').map((line, idx) => (
                  <span key={idx} className="la-suktam-line">
                    {line}
                    <br />
                  </span>
                ))}
              </p>
            )}

            {/* English Transliteration */}
            {(viewMode === 'english' || viewMode === 'meaning') && (
              <p className={`la-suktam-english${viewMode === 'meaning' ? ' muted' : ''}`}>
                {v.english.split('\n').map((line, idx) => (
                  <span key={idx}>
                    {line}
                    <br />
                  </span>
                ))}
              </p>
            )}

            {/* Hindi Meaning */}
            {viewMode === 'meaning' && (
              <div className="la-suktam-meaning">
                <span className="la-meaning-label">भावार्थ:</span> {v.meaning}
              </div>
            )}
          </article>
        ))}
      </div>

      {/* Phalasruti Accordion / Toggle */}
      <div className="la-phalashruti-box">
        <button
          type="button"
          className="la-phalashruti-toggle"
          onClick={() => setShowPhalashruti(!showPhalashruti)}
          aria-expanded={showPhalashruti}
        >
          <span>🌸 <strong>श्री सूक्तम् फलश्रुति एवं महालक्ष्मी गायत्री</strong> ({showPhalashruti ? 'छुपाएं ▲' : 'देखें ▼'})</span>
        </button>

        {showPhalashruti && (
          <div className="la-phalashruti-content">
            <p className="la-phalashruti-desc">
              श्री सूक्त के सोलह मन्त्रों के उपरांत फलश्रुति के इन दिव्य पद्यों का गान करने से पूजा संपूर्ण होती है:
            </p>
            <div className="la-phalashruti-grid">
              {SRI_SUKTAM_PHALASHRUTI.map((p, idx) => (
                <div key={idx} className="la-phala-card">
                  <p className="la-suktam-sanskrit" style={{ fontSize: '0.98rem' }}>
                    {p.sanskrit.split('\n').map((l, i) => (
                      <span key={i}>
                        {l}
                        <br />
                      </span>
                    ))}
                  </p>
                  <p className="la-suktam-meaning" style={{ marginTop: 8 }}>
                    <span className="la-meaning-label">भावार्थ:</span> {p.meaning}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
