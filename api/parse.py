from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
import casparser
import tempfile
import os

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
        # Save to Vercel's temporary storage
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_pdf:
            temp_pdf.write(await file.read())
            temp_pdf_path = temp_pdf.name
            
        # Parse the CAS
        data = casparser.read_cas_pdf(temp_pdf_path, password)
        return JSONResponse(content=data)
        
    except casparser.exceptions.IncorrectPasswordError:
        raise HTTPException(status_code=401, detail="Incorrect PDF password (check PAN)")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parsing error: {str(e)}")
    finally:
        if os.path.exists(temp_pdf_path):
            os.remove(temp_pdf_path)
