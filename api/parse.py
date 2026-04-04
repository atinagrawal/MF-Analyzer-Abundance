from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
import casparser
import tempfile
import os
import traceback

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
        # Save to Vercel's temporary /tmp storage
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_pdf:
            temp_pdf.write(await file.read())
            temp_pdf_path = temp_pdf.name
            
        # Parse the CAS
        data = casparser.read_cas_pdf(temp_pdf_path, password)
        
        # Safely convert Pydantic models to JSON-serializable dictionaries
        encoded_data = jsonable_encoder(data)
        
        return JSONResponse(content=encoded_data)
        
    except casparser.exceptions.IncorrectPasswordError:
        raise HTTPException(status_code=401, detail="Incorrect PDF password (usually PAN in ALL CAPS)")
    except Exception as e:
        # Print the exact traceback into Vercel runtime logs for easy debugging
        print("--- PARSE ERROR ---")
        traceback.print_exc() 
        raise HTTPException(status_code=500, detail=f"Parsing error: {str(e)}")
    finally:
        # Clean up temp memory
        if os.path.exists(temp_pdf_path):
            os.remove(temp_pdf_path)
