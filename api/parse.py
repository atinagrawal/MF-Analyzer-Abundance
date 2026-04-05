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


# ─────────────────────────────────────────────────────────────────────────────
# PAN → Investor-Name map builder (from raw PDF text)
#
# Strategy: find "Investor Name" / "Name" labels in the document, extract the
# name value, then associate it with the nearest PAN found within a reasonable
# window. Handles both CAMS and KFintech CAS layouts.
# ─────────────────────────────────────────────────────────────────────────────
def build_pan_name_map(raw_text: str) -> dict:
    pan_name_map = {}

    if not raw_text or len(raw_text) < 50:
        return pan_name_map

    # ── Phase 1: find ALL "Investor Name: XXX" occurrences ────────────────────
    name_label_patterns = [
        # "Investor Name : JOHN DOE" — most common CAMS format
        r'(?:Investor\s+Name|Name\s+of\s+(?:the\s+)?(?:Investor|First\s*Holder|Holder))\s*[:\-–]\s*([A-Z][A-Za-z .\']{2,60})',
        # "Name : JOHN DOE" (standalone)
        r'(?<![A-Za-z])Name\s*[:\-–]\s*([A-Z][A-Za-z .\']{2,60})',
    ]

    name_occurrences = []   # list of (position_in_text, extracted_name)
    for pattern in name_label_patterns:
        for m in re.finditer(pattern, raw_text, re.IGNORECASE):
            name = m.group(1).strip().rstrip('. ')
            # Filter out false positives
            low = name.lower()
            junk = {
                'pan', 'kyc', 'email', 'mobile', 'address', 'folio', 'nominee',
                'advisor', 'broker', 'arn', 'date', 'dob', 'status', 'mode',
                'tax', 'statement', 'consolidated', 'account', 'not provided',
                'not updated', 'na', 'nil', 'compliant', 'ok', 'yes', 'no',
                'none', 'demat', 'bank', 'registrar', 'cams', 'kfintech',
            }
            if len(name) > 2 and low not in junk and not re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]$', name):
                name_occurrences.append((m.start(), name))

    # ── Phase 2: find ALL PAN occurrences ─────────────────────────────────────
    pan_occurrences = []    # list of (position_in_text, pan_string)
    for m in re.finditer(r'[A-Z]{5}[0-9]{4}[A-Z]', raw_text):
        pan_occurrences.append((m.start(), m.group(0)))

    # ── Phase 3: associate each name with the nearest PAN ─────────────────────
    # For each name, find the closest PAN within 1500 chars
    for name_pos, name_val in name_occurrences:
        best_pan = None
        best_dist = float('inf')
        for pan_pos, pan_val in pan_occurrences:
            dist = abs(name_pos - pan_pos)
            if dist < best_dist and dist < 1500:
                best_dist = dist
                best_pan = pan_val
        if best_pan and best_pan not in pan_name_map:
            pan_name_map[best_pan] = name_val

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

        # ── 1. Core extraction via casparser ──────────────────────────────────
        data = casparser.read_cas_pdf(temp_pdf_path, password)
        dict_data = jsonable_encoder(data)

        # ══════════════════════════════════════════════════════════════════════
        # CRITICAL: casparser Folio model uses UPPERCASE field "PAN", not "pan"
        # After jsonable_encoder, the dict key is "PAN" (uppercase).
        # All folio-level lookups MUST use 'PAN'.
        # ══════════════════════════════════════════════════════════════════════

        # ── 2. Collect PANs that casparser already assigned ───────────────────
        all_pans = set()
        for folio in dict_data.get('folios', []):
            # Note: casparser field is 'PAN' (uppercase!)
            fp = (folio.get('PAN') or '').upper().strip()
            if fp and len(fp) == 10 and re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]$', fp):
                all_pans.add(fp)

        is_single_pan = len(all_pans) <= 1
        global_investor_name = (dict_data.get('investor_info', {}).get('name', '') or '').strip()

        # ── 3. Build PAN → Investor Name map from raw text ────────────────────
        pan_investor_map = {}

        try:
            raw_text = extract_text(temp_pdf_path, password=password)
            if raw_text and len(raw_text) > 50:
                pan_investor_map = build_pan_name_map(raw_text)
                print(f"📋 PAN→Name map from text: {pan_investor_map}")
            else:
                print("⚠️  pdfminer returned empty/short text — skipping text enrichment")
        except Exception as e:
            print(f"⚠️  Text extraction failed: {e}")
            traceback.print_exc()

        # ── 4. Fallback name assignment ───────────────────────────────────────
        # For single-PAN CAS: investor_info.name is safe to use for that PAN
        if is_single_pan and global_investor_name and len(global_investor_name) > 2:
            for pan in all_pans:
                if pan not in pan_investor_map:
                    pan_investor_map[pan] = global_investor_name

        # For multi-PAN: if a PAN still has no name but investor_info provides
        # one, assign it to the FIRST PAN only (primary holder — risky for
        # others, so we leave them for frontend fallback).
        if not is_single_pan and global_investor_name and len(global_investor_name) > 2:
            # Assign to PANs that appear first in the folio list
            assigned = False
            for folio in dict_data.get('folios', []):
                fp = (folio.get('PAN') or '').upper().strip()
                if fp and fp in all_pans and fp not in pan_investor_map:
                    pan_investor_map[fp] = global_investor_name
                    assigned = True
                    break  # only assign to the first unmatched PAN

        print(f"📋 Final PAN→Name map: {pan_investor_map}")
        print(f"📋 All PANs from casparser: {all_pans}")
        print(f"📋 investor_info.name: {global_investor_name!r}")

        # Attach the map so frontend can use it
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
