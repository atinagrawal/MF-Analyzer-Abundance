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
            
        # 1. Base Extraction (Using casparser library for financial math)
        data = casparser.read_cas_pdf(temp_pdf_path, password)
        dict_data = jsonable_encoder(data)
        
        # 2. Advanced Text Enrichment Engine (For Names, PANs, Advisors, Nominees)
        try:
            raw_text = extract_text(temp_pdf_path, password=password)
            
            for folio in dict_data.get('folios', []):
                folio_no = folio.get('folio', '')
                if not folio_no: 
                    continue
                    
                # Find exact occurrences of the folio number
                match_iter = re.finditer(re.escape(folio_no), raw_text)
                indices = [m.start() for m in match_iter]
                
                if indices:
                    idx = indices[0] # Use the first occurrence
                    
                    # Scan backwards for Investor Info, forwards for Advisor/Nominee Info
                    text_before = raw_text[max(0, idx - 2500) : idx]
                    text_after = raw_text[idx : min(len(raw_text), idx + 1500)]
                    
                    # 1. Force PAN extraction (Closest PAN before this Folio)
                    if not folio.get('pan'):
                        pan_matches = re.findall(r'[A-Z]{5}[0-9]{4}[A-Z]', text_before)
                        if pan_matches: 
                            folio['pan'] = pan_matches[-1] # Get nearest
                    
                    # 2. Extract Specific Investor Name (Closest Name before this Folio)
                    name_matches = re.findall(r'(?:Name|Investor Name)\s*[:\-]?\s*([A-Za-z\s]+?)(?:\s+PAN|\s+KYC|\s+Email|\n)', text_before, re.IGNORECASE)
                    if name_matches: 
                        clean_name = name_matches[-1].strip()
                        if len(clean_name) > 3:
                            folio['investor_name'] = clean_name
                            
                    # 3. Extract Nominee (Immediately after Folio)
                    nom_match = re.search(r'(?:Nominee|Nominee Name)\s*[:\-]?\s*([A-Za-z\s]+?)(?:\n|\s{2,})', text_after, re.IGNORECASE)
                    if nom_match: 
                        clean_nom = nom_match.group(1).strip()
                        if clean_nom.lower() not in ['not provided', 'not updated', 'na', '-']:
                            folio['nominee'] = clean_nom
                            
                    # 4. Extract Advisor / ARN (Immediately after Folio)
                    adv_match = re.search(r'(?:Advisor|Broker|ARN|Distributor)\s*[:\-]?\s*([A-Za-z0-9\-\s]+?)(?:\n|\s{2,})', text_after, re.IGNORECASE)
                    if adv_match: 
                        folio['advisor'] = adv_match.group(1).strip()
                    else:
                        # Fallback: Just look for ARN-XXXXXX pattern
                        arn_match = re.search(r'(ARN\s*-\s*[0-9]+)', text_after, re.IGNORECASE)
                        if arn_match:
                            folio['advisor'] = arn_match.group(1).strip()
                            
        except Exception as e:
            print("Text Enrichment failed:", e)
        
        return JSONResponse(content=dict_data)
        
    except casparser.exceptions.IncorrectPasswordError:
        raise HTTPException(status_code=401, detail="Incorrect PDF password (usually PAN in ALL CAPS)")
    except Exception as e:
        traceback.print_exc() 
        raise HTTPException(status_code=500, detail=f"Parsing error: {str(e)}")
    finally:
        if os.path.exists(temp_pdf_path): os.remove(temp_pdf_path)
