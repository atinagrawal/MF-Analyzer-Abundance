/**
 * app/book-consultation/faqData.js
 *
 * Single source of truth for the Book a Consultation page's FAQ -- imported
 * by both page.jsx (the visible, crawlable accordion) and layout.js (the
 * FAQPage JSON-LD), so they can never drift apart. Google's structured-data
 * guidelines require FAQPage schema to match what's actually visible on
 * the page.
 */

export const BOOK_CONSULTATION_FAQ = [
  {
    q: 'Is this consultation really free?',
    a: 'Yes. The 30-minute call is completely free with no obligation to invest, transfer funds, or sign up for anything. It exists to help you understand your options — what you do afterwards is entirely up to you.',
  },
  {
    q: "What will we discuss on the call?",
    a: "Whatever's relevant to your situation — mutual fund selection, SIP or SWP planning, tax-efficient investing (ELSS, capital gains), goal-based planning for retirement or a big purchase, or Specialised Investment Funds (SIF) and Portfolio Management Services (PMS) for larger portfolios. Tell us your priority when you book and we'll come prepared.",
  },
  {
    q: 'Why do I need to verify my email with a code?',
    a: "It's a simple anti-spam check — nothing more. We email you a 6-digit code, you enter it, and the real booking calendar opens. No account, password, or sign-in is required at any point.",
  },
  {
    q: 'Who will I actually be speaking with?',
    a: 'Atin Kumar Agarwal, an AMFI-registered Mutual Fund Distributor (ARN-251838) and APMI-registered PMS Distributor with 15+ years of experience, currently advising 350+ clients across ₹250Cr+ in assets. Same person who built this analysis toolset — not a call-centre script.',
  },
  {
    q: 'Do I need to prepare anything or bring my portfolio details?',
    a: "No preparation required. If you already track your holdings on this site's Portfolio dashboard or CAS Tracker, that's genuinely useful context to have on the call — but it's optional, not a prerequisite for booking.",
  },
  {
    q: 'Is my information kept private?',
    a: "Yes. Your name and email are used only to verify the booking and send calendar confirmations — the same privacy standard as every other feature on this site. Nothing is sold or shared with third parties.",
  },
  {
    q: 'Can I book a consultation if I live outside Haldwani, or outside India (NRI)?',
    a: 'Yes — this is a video/phone call, not an in-person meeting, so location is not a constraint. Abundance Financial Services serves investors across India and NRI clients remotely.',
  },
  {
    q: "What if I need to reschedule after booking?",
    a: 'The confirmation email from the booking calendar includes a reschedule/cancel link. You can also call or WhatsApp +91 98081 05923 directly if that\'s easier.',
  },
];
