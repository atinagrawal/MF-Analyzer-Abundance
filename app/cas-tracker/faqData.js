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
    q: 'What is a Consolidated Account Statement (CAS), and how do I get one?',
    a: 'A CAS consolidates all your mutual fund holdings across every AMC linked to your PAN. Request one free from camsonline.com/Investors/Statements/Consolidated-Account-Statement (choose "Detailed", not Summary, so it includes the transaction history this tool needs) or from kfintech.com, using your registered email address — it arrives by email as a password-protected PDF, either your PAN in ALL CAPS or a password you set yourself, depending on which service generated it.',
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
    q: 'Can I see the rate at which each of my transactions happened?',
    a: 'Yes. Click "Transactions" on any fund card to open a chart of the NAV at every purchase, SIP instalment, switch, or redemption — alongside your average entry NAV versus today\'s NAV, and an option to overlay the fund\'s own NAV history since your first purchase.',
  },
  {
    q: 'Does the redemption planner account for exit load?',
    a: 'Yes. Click "Redeem" on any fund and the planner checks its actual exit-load structure — verified scheme-level data where available, with a clear BSE-sourced fallback otherwise — and shows the exact amount deducted for each purchase lot based on how long it was held, alongside the FIFO capital-gains and tax breakdown, before you redeem.',
  },
  {
    q: 'Can I export my portfolio to PDF or Excel?',
    a: 'Yes. Use the PDF and Excel buttons above your holdings to download a printable summary or a spreadsheet of everything currently shown — respecting the Mutual Fund/SIF filter and, in combined family view, tagging each row with its owning family member.',
  },
  {
    q: 'Which CAS formats are supported?',
    a: 'CAMS (camsonline.com) and KFintech (kfintech.com) password-protected PDFs, plus MF Central\'s (mfcentral.com) "Detailed Report" Excel download — no password needed for the Excel format. For PDFs, enter your PAN in ALL CAPS as the password.',
  },
  {
    q: 'Does this support SIF (Specialised Investment Funds)?',
    a: 'Yes. SIF holdings in your CAS are recognised automatically, with live NAVs and full transaction history just like a mutual fund. For SIF investments not yet reflected in your CAS, your distributor can also add them manually with live NAVs from AMFI.',
  },
  {
    q: 'I inherited mutual fund units — does this tool handle transmission?',
    a: 'Yes. When units are transmitted into a folio (typically after the original holder\'s death), we detect this automatically from your CAS and label those transactions "Transmission In" in the fund\'s transaction history, separately from your own purchases and SIPs. Your CAS preserves each transaction\'s original purchase date and rate, so FIFO cost basis and holding-period calculations already account for them correctly.',
  },
];
