/**
 * app/cas-tracker/faqData.js
 *
 * Single source of truth for the CAS Tracker FAQ -- imported by both
 * page.js (the visible, crawlable <details> list) and layout.js (the
 * FAQPage JSON-LD). These used to be maintained as two separate copies,
 * which had drifted: the schema was missing a whole question (investor
 * naming) and had outdated wording/answers on several others. Google's
 * structured-data guidelines require FAQPage schema to match what's
 * actually visible on the page, so keeping them in sync isn't just
 * tidiness -- a mismatch can get the rich-result eligibility rejected.
 */

export const CAS_FAQ = [
  {
    q: 'Is it safe to upload my CAS PDF with my PAN password?',
    a: 'Yes. The PDF is parsed inside an isolated serverless function and deleted immediately after. Your password is never stored. For signed-in users, only the parsed portfolio data (not the PDF) is saved privately — only you and your AMFI-registered distributor can view it.',
  },
  {
    q: 'What is a Consolidated Account Statement (CAS)?',
    a: 'A CAS consolidates all your mutual fund holdings across every AMC linked to your PAN. Download it from camsonline.com or kfintech.com using your PAN and registered email. Use your PAN in ALL CAPS as the PDF password.',
  },
  {
    q: 'Does this support Family CAS with multiple PANs?',
    a: 'Yes. The parser detects multiple PANs in one CAS and creates separate dashboard tabs per family member. Switch between them with one click, or check two or more to see a combined family view.',
  },
  {
    q: 'Can I name each investor in a multi-PAN family CAS?',
    a: 'Yes. Click the ✎ next to any PAN tab to label it with the investor’s name. We store that name against the PAN so it’s remembered the next time that PAN appears in a CAS upload — it’s only ever shown to you and your AMFI-registered distributor.',
  },
  {
    q: 'How is current value calculated?',
    a: 'Current Value = Units x Live NAV from AMFI official end-of-day data, fetched fresh on each page load.',
  },
  {
    q: 'What is FIFO capital gains calculation?',
    a: 'FIFO (First In, First Out) is the SEBI-mandated method for mutual fund redemptions. Our tracker uses CAS purchase history to compute unrealised gain/loss correctly under FIFO accounting.',
  },
  {
    q: 'How does ELSS lock-in tracking work?',
    a: 'ELSS investments are locked for 3 years from each purchase date. We compute the locked value and unlocked portion for each ELSS fund separately so you know exactly what is redeemable today.',
  },
  {
    q: 'Which CAS formats are supported?',
    a: 'CAMS (camsonline.com) and KFintech (kfintech.com) password-protected PDFs, plus MF Central\'s (mfcentral.com) "Detailed Report" Excel download — no password needed for the Excel format. For PDFs, enter your PAN in ALL CAPS as the password.',
  },
  {
    q: 'Does this support SIF (Specialised Investment Funds)?',
    a: 'Yes. SIF holdings added by your distributor appear alongside mutual funds with live NAVs from AMFI. Standard CAS PDFs do not yet include SIF statements, so your distributor adds them separately.',
  },
];
