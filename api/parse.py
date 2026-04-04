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
    # 1. Validate the uploaded file format
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    temp_pdf_path = ""
    try:
        # 2. Save the uploaded file to Vercel's temporary /tmp storage
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_pdf:
            temp_pdf.write(await file.read())
            temp_pdf_path = temp_pdf.name
            
        # 3. Base Extraction (Using casparser library)
        data = casparser.read_cas_pdf(temp_pdf_path, password)
        dict_data = jsonable_encoder(data)
        
        # 4. Advanced Text Enrichment Engine
        # Casparser drops unstructured text. We use pdfminer to read the raw PDF 
        # text and regex to find the missing details per folio.
        try:
            raw_text = extract_text(temp_pdf_path, password=password)
            
            for folio in dict_data.get('folios', []):
                folio_no = folio.get('folio', '')
                if not folio_no: 
                    continue
                    
                # Search for the folio number in the raw text to establish a boundary
                idx = raw_text.find(folio_no)
                if idx != -1:
                    # Grab a chunk of text around the folio number
                    chunk = raw_text[max(0, idx - 500) : min(len(raw_text), idx + 1000)]
                    
                    # Force PAN extraction if missing from base casparser
                    if not folio.get('pan'):
                        pan_match = re.search(r'[A-Z]{5}[0-9]{4}[A-Z]', chunk)
                        if pan_match: 
                            folio['pan'] = pan_match.group(0)
                    
                    # Extract specific Investor Name for this folio
                    name_match = re.search(r'(?:Name|Investor Name)\s*[:\-]?\s*([A-Za-z\s\.]+)(?:\n|$)', chunk, re.IGNORECASE)
                    if name_match: 
                        folio['investor_name'] = name_match.group(1).strip()
                        
                    # Extract Nominee Name
                    nom_match = re.search(r'(?:Nominee|Nominee Name)\s*[:\-]?\s*([A-Za-z\s\.]+)(?:\n|$)', chunk, re.IGNORECASE)
                    if nom_match: 
                        folio['nominee'] = nom_match.group(1).strip()
                        
                    # Extract Advisor Code / ARN
                    adv_match = re.search(r'(?:Advisor|ARN|Broker)\s*[:\-]?\s*([A-Za-z0-9\-\s]+)(?:\n|$)', chunk, re.IGNORECASE)
                    if adv_match: 
                        folio['advisor'] = adv_match.group(1).strip()
                        
        except Exception as e:
            # If enrichment fails, we print the error to Vercel logs but DO NOT crash,
            # because the base casparser financial data is still valid and useful.
            print("Text Enrichment failed:", e)
        
        # 5. Return the enriched JSON to the frontend
        return JSONResponse(content=dict_data)
        
    except casparser.exceptions.IncorrectPasswordError:
        raise HTTPException(status_code=401, detail="Incorrect PDF password (usually PAN in ALL CAPS)")
    
    except Exception as e:
        # Catch all other crashes, print full traceback to Vercel logs, and return 500
        print("--- PARSE ERROR ---")
        traceback.print_exc() 
        raise HTTPException(status_code=500, detail=f"Parsing error: {str(e)}")
    
    finally:
        # 6. Crucial Cleanup: Always delete the PDF from temporary storage
        if os.path.exists(temp_pdf_path): 
            os.remove(temp_pdf_path)
