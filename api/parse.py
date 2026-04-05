from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
import casparser
import tempfile
import os
import traceback
import re
from pdfminer.high_level import extract_text

app = FastAPI()


def build_pan_name_map(raw_text: str) -> dict:
    """
    Single-pass scan of the entire CAS document to build a reliable
    PAN → Investor Name mapping. Searches a ±900-char window around
    every PAN occurrence and tries multiple name-label patterns.
    Works for both CAMS and KFintech CAS formats.
    """
    pan_name_map = {}

    # Find every PAN in the document
    for m in re.finditer(r'([A-Z]{5}[0-9]{4}[A-Z])', raw_text):
        pan = m.group(1)
        if pan in pan_name_map:
            continue  # already resolved; skip duplicates

        ctx_start = max(0, m.start() - 900)
        ctx_end   = min(len(raw_text), m.end() + 900)
        context   = raw_text[ctx_start:ctx_end]

        # Ordered from most-specific to most-generic
        # BUG FIX: {2,60?} was INVALID regex (? inside braces) → corrected to {2,60}
        name_patterns = [
            # "Investor Name : JOHN DOE" followed by any line-end or PAN/KYC/Email keyword
            r'(?:Investor\s+Name|Name\s+of\s+(?:the\s+)?(?:Investor|Holder|First\s+Holder))\s*[:\-]\s*([A-Za-z][A-Za-z .]{2,60})(?:\s*[\r\n]|\s+(?:PAN|KYC|Email|Mobile|Address|DOB|Date|Folio))',
            # "Name : JOHN DOE" ending at line boundary
            r'(?:Investor\s+Name|Name)\s*[:\-]\s*([A-Za-z][A-Za-z .]{2,60})[\r\n]',
            # Fallback: label then colon then name, stopping at 2+ spaces or line
            r'(?:Investor|Name)\s*:\s*([A-Za-z][A-Za-z .]{2,55})(?:\s{2,}|[\r\n])',
            # KFintech format: sometimes "Name" appears after PAN on same/next line
            r'PAN\s*[:\-]?\s*[A-Z]{5}[0-9]{4}[A-Z]\s*[\r\n\s]+([A-Z][A-Za-z .]{2,55})[\r\n]',
        ]

        for pattern in name_patterns:
            nm = re.search(pattern, context, re.IGNORECASE)
            if nm:
                name = nm.group(1).strip().rstrip('.')
                # Filter out false positives: common field labels, single words that are labels
                skip_words = {
                    'pan', 'kyc', 'email', 'mobile', 'address', 'folio', 'nominee',
                    'advisor', 'broker', 'arn', 'date', 'dob', 'status', 'mode',
                    'tax', 'statement', 'consolidated', 'account', 'not provided',
                    'not updated', 'na', 'nil', 'compliant', 'ok', 'yes', 'no',
                }
                if len(name) > 2 and name.lower() not in skip_words:
                    pan_name_map[pan] = name
                    break

    return pan_name_map


@app.post("/api/parse")
async def parse_cas_statement(
    password: str = Form(...),
    file: UploadFile = File(...)
):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    temp_pdf_path = ""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_pdf:
            temp_pdf.write(await file.read())
            temp_pdf_path = temp_pdf.name

        # ── 1. Base extraction via casparser (handles financial maths) ──────────
        data = casparser.read_cas_pdf(temp_pdf_path, password)
        dict_data = jsonable_encoder(data)

        # ── 2. Text-enrichment engine ────────────────────────────────────────────
        pan_investor_map: dict = {}   # returned to client for reliable name lookup

        try:
            raw_text = extract_text(temp_pdf_path, password=password)

            # Build document-wide PAN → Name map FIRST (single pass)
            pan_investor_map = build_pan_name_map(raw_text)

            for folio in dict_data.get('folios', []):
                folio_no = folio.get('folio', '')
                if not folio_no:
                    continue

                # Locate the folio number in the raw text
                indices = [m.start() for m in re.finditer(re.escape(folio_no), raw_text)]
                if not indices:
                    continue

                idx         = indices[0]
                text_before = raw_text[max(0, idx - 2500) : idx]
                text_after  = raw_text[idx : min(len(raw_text), idx + 1500)]

                # ── 2a. PAN: fill in if casparser left it blank ──────────────
                folio_pan = (folio.get('pan') or '').upper().strip()
                if not folio_pan or len(folio_pan) < 10:
                    pan_hits = re.findall(r'[A-Z]{5}[0-9]{4}[A-Z]', text_before)
                    if pan_hits:
                        folio['pan'] = pan_hits[-1]   # nearest PAN before the folio line
                        folio_pan = folio['pan']

                # ── 2b. Investor Name: use global map (most reliable) ────────
                if folio_pan and folio_pan in pan_investor_map:
                    folio['investor_name'] = pan_investor_map[folio_pan]
                else:
                    # Fallback: search immediately around this folio block
                    # BUG FIX: corrected {2,60?} → {2,60}
                    for ctx in [text_before, text_after]:
                        nm = re.search(
                            r'(?:Investor\s+Name|Name\s+of\s+(?:the\s+)?(?:Investor|Holder|First\s+Holder)|Name)\s*[:\-]\s*'
                            r'([A-Za-z][A-Za-z .]{2,60})'
                            r'(?:\s*[\r\n]|\s+(?:PAN|KYC|Email|Mobile|Folio|Date))',
                            ctx, re.IGNORECASE
                        )
                        if nm:
                            clean = nm.group(1).strip().rstrip('.')
                            if len(clean) > 3:
                                folio['investor_name'] = clean
                                # Also backfill the map so later folios benefit
                                if folio_pan:
                                    pan_investor_map[folio_pan] = clean
                                break

                # ── 2c. Nominee ─────────────────────────────────────────────
                nom = re.search(
                    r'(?:Nominee(?:\s+Name)?)\s*[:\-]?\s*'
                    r'([A-Za-z][A-Za-z\s]{1,60}?)(?:[\r\n]|\s{2,})',
                    text_after, re.IGNORECASE
                )
                if nom:
                    clean_nom = nom.group(1).strip()
                    if clean_nom.lower() not in ['not provided', 'not updated', 'na', '-', '']:
                        folio['nominee'] = clean_nom

                # ── 2d. Advisor / ARN ────────────────────────────────────────
                adv = re.search(
                    r'(?:Advisor|Broker|ARN|Distributor)\s*[:\-]\s*'
                    r'([A-Za-z0-9\-\s]{1,60}?)(?:[\r\n]|\s{2,})',
                    text_after, re.IGNORECASE
                )
                if adv:
                    folio['advisor'] = adv.group(1).strip()
                else:
                    arn = re.search(r'(ARN\s*-\s*[0-9]+)', text_after, re.IGNORECASE)
                    if arn:
                        folio['advisor'] = arn.group(1).strip()

        except Exception as e:
            print("⚠️  Text enrichment failed:", e)
            traceback.print_exc()

        # ── 3. Fallback: use casparser's investor_info for single-PAN CAS ───
        # If the document-level scan found no names at all, but casparser
        # extracted a global investor_info.name, use it as last resort.
        investor_info_name = (
            dict_data.get('investor_info', {}).get('name', '') or ''
        ).strip()

        if investor_info_name and len(investor_info_name) > 2:
            # Collect all unique PANs across folios
            all_pans = set()
            for folio in dict_data.get('folios', []):
                fp = (folio.get('pan') or '').upper().strip()
                if fp and len(fp) >= 10:
                    all_pans.add(fp)

            # If single-PAN CAS (or all folios share the same PAN),
            # it's safe to assign investor_info.name to that PAN.
            if len(all_pans) <= 1:
                for pan in all_pans:
                    if pan not in pan_investor_map:
                        pan_investor_map[pan] = investor_info_name
                # Also fill any folio that still lacks an investor_name
                for folio in dict_data.get('folios', []):
                    if not folio.get('investor_name'):
                        folio['investor_name'] = investor_info_name

        # Attach the PAN→Name map so the frontend can use it directly
        dict_data['pan_investor_map'] = pan_investor_map

        return JSONResponse(content=dict_data)

    except casparser.exceptions.IncorrectPasswordError:
        raise HTTPException(
            status_code=401,
            detail="Incorrect PDF password. For most CAS files this is your PAN in ALL CAPS."
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Parsing error: {str(e)}")
    finally:
        if os.path.exists(temp_pdf_path):
            os.remove(temp_pdf_path)
