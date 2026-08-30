# Decoded: A CAS Statement, Annotated Line by Line

*A "Decoded" piece from Abundance Financial Services · Atin Kumar Agrawal, ARN-251838*

*Note: every number and name below is illustrative — a constructed example built to teach the format, not a real investor's data.*

Your Consolidated Account Statement (CAS) is the single most important document you own as a mutual fund investor, and almost nobody reads it properly. It's dense, it's formatted like it was designed in 2004 (because parts of it were), and it says things like "Stamp Duty" without ever explaining what that means. Let's fix that.

## The folio block

```
Folio No: 123456789 / 0
PAN: XXXXX1234X
Registrar: CAMS
```

A **folio** is your individual account number with a specific AMC — not with the fund, with the *fund house*. If you own three funds from the same AMC, they might all sit under one folio, or you might have opened separate ones over the years without realising it (very common if you invested through different apps or advisors at different times). Multiple folios for the same AMC aren't wrong, just often unnecessary — worth consolidating for a cleaner picture, not for any tax reason.

## The scheme row

```
Scheme Name: XYZ Flexi Cap Fund - Regular Plan - Growth
ISIN: INFXXX01XXX
Opening Unit Balance: 245.678
```

Read the scheme name in full, every time — "Regular" vs "Direct" and "Growth" vs "IDCW" are three different products with three different cost structures and payout behaviours, and they're easy to skim past because the fund name itself is identical.

## The transaction rows — where people get lost

```
Date        Description          Amount(Rs)   Units    NAV       Unit Balance
15-Jun-2024 Purchase - SIP        5,000.00     42.194   118.5230  287.872
```

This is a single SIP instalment. **Units** is how many fund units ₹5,000 actually bought you that day, at that day's **NAV** (the price per unit). **Unit Balance** is your running total after this transaction. Every SIP date can buy a slightly different number of units, because NAV moves daily — this is the entire mechanism behind rupee-cost averaging, made visible one row at a time.

## The line everyone skips: "Stamp Duty"

```
Stamp Duty                         2.50
```

Since mid-2020, a small stamp duty (0.005% of the transaction value) applies to every mutual fund purchase, deducted automatically before your units are allotted. It's not a mistake, not a fee your distributor added, and not something you can avoid — it's a government levy on the transaction itself, same as stamp duty on a property deal, just far smaller.

## Cost Value vs Market Value — the two numbers people confuse

```
Cost Value: Rs. 45,000.00
Market Value as on 30-Jun-2024: Rs. 52,340.00
```

**Cost value** is simply what you actually put in — every SIP instalment, added up. **Market value** is what all your units are worth today, at today's NAV. The gap between them is your unrealised gain (or loss) — unrealised because you haven't sold yet, so it's not locked in, up or down.

## Why this actually matters

The CAS isn't paperwork to file away. It's the only document that shows your *actual, personal* cost basis, transaction history, and folio structure — the exact things you need to calculate real returns, plan a tax-efficient redemption, or catch a duplicate folio you forgot existed. Reading it once, properly, is worth more than most of the advice you'll find about which fund to buy next.

---

*Atin Kumar Agrawal, Abundance Financial Services (ARN-251838), is an AMFI Registered Mutual Funds & SIF Distributor. If you'd rather have your actual CAS read and explained for you, our [CAS tracker](/cas-tracker) does exactly that — or [book a free consultation](/book-consultation) for a human walkthrough.*
