import os
import json
import uuid
import glob
import time
import pandas as pd
import google.generativeai as genai
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
from pypdf import PdfReader, PdfWriter
from dotenv import load_dotenv

# Load API Key
load_dotenv()
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.join(os.getcwd(), 'data')
PROJECTS_FILE = os.path.join(BASE_DIR, 'projects.json')
ALLOWED_EXTENSIONS = {'pdf', 'xlsx', 'xls', 'csv', 'docx', 'doc'}

# --- UTILS ---
def load_projects():
    if not os.path.exists(PROJECTS_FILE): return {}
    try:
        with open(PROJECTS_FILE, 'r') as f: return json.load(f)
    except: return {}

def save_project_metadata(company_id, data):
    projects = load_projects()
    projects[company_id] = data
    with open(PROJECTS_FILE, 'w') as f: json.dump(projects, f, indent=4)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def clean_json_string(json_str):
    if "```json" in json_str:
        json_str = json_str.split("```json")[1].split("```")[0]
    elif "```" in json_str:
        json_str = json_str.split("```")[1].split("```")[0]
    return json_str.strip()

# --- SMART PDF FILTERING ---
def create_filtered_pdf(original_path, output_path):
    """
    Scans the original PDF for relevant headers. 
    Creates a NEW PDF containing only the pages with:
    - Financial Statements (BS, PL, CF, Equity)
    - All Notes pages
    Returns: List of page numbers kept (for logging/debugging).
    """
    reader = PdfReader(original_path)
    writer = PdfWriter()
    num_pages = len(reader.pages)
    
    # Headers to identify start of sections
    HEADERS = {
        "financial": [
            "statement of financial position", "balance sheet",
            "statement of profit or loss", "comprehensive income", "income statement",
            "statement of changes in equity",
            "statement of cash flows", "cash flows"
        ],
        "notes": ["notes to the financial statements"]
    }
    
    pages_to_keep = set()
    found_notes_start = False
    
    # 1. Identify Pages
    for i in range(num_pages):
        page_text = reader.pages[i].extract_text()
        if not page_text: continue
        lower_text = page_text.lower()
        
        # If inside notes section, keep all subsequent pages
        if found_notes_start:
            pages_to_keep.add(i)
            continue

        # Check for Notes Start
        if any(h in lower_text for h in HEADERS["notes"]):
            found_notes_start = True
            pages_to_keep.add(i)
            continue

        # Check for Statements
        if any(h in lower_text for h in HEADERS["financial"]):
            pages_to_keep.add(i)
    
    # Fallback: If no headers found, keep all pages (e.g. image-based PDF)
    if not pages_to_keep:
        pages_to_keep = set(range(num_pages))

    # 2. Write New PDF
    sorted_pages = sorted(list(pages_to_keep))
    for p in sorted_pages:
        writer.add_page(reader.pages[p])
    
    with open(output_path, "wb") as f:
        writer.write(f)
        
    return sorted_pages

# --- EXTRACTION ENDPOINT ---
@app.route('/extract', methods=['POST'])
def extract_data():
    try:
        data = request.json
        company_id = data.get('company_id')
        year = data.get('year')

        if not company_id or not year:
            return jsonify({"error": "Missing parameters"}), 400

        save_dir = os.path.join(BASE_DIR, company_id, str(year))
        output_file = os.path.join(save_dir, f"{company_id}_{year}_extracted.json")

        if os.path.exists(output_file):
            with open(output_file, 'r') as f:
                return jsonify(json.load(f)), 200

        response_data = {
            "trial_balance": [],
            "financial_statements": {}
        }

        # 1. Process Excel (Trial Balance)
        tb_files = glob.glob(os.path.join(save_dir, f"TB_{year}.*"))
        if tb_files:
            try:
                df = pd.read_excel(tb_files[0])
                df = df.fillna('')
                response_data["trial_balance"] = df.to_dict(orient='records')
            except Exception as e:
                print(f"Excel error: {e}")

        # 2. Process PDF (Financial Statements) via AI File Upload
        fs_files = glob.glob(os.path.join(save_dir, f"financial_report_{year}.*"))
        if fs_files:
            original_pdf_path = fs_files[0]
            temp_pdf_path = os.path.join(save_dir, f"temp_filtered_{year}.pdf")
            
            # A. Create smaller PDF with only relevant pages
            create_filtered_pdf(original_pdf_path, temp_pdf_path)
            
            # B. Upload to Gemini
            print("Uploading file to Gemini...")
            uploaded_file = genai.upload_file(temp_pdf_path, mime_type="application/pdf")
            
            # Wait for processing state
            while uploaded_file.state.name == "PROCESSING":
                print("Processing file...")
                time.sleep(2)
                uploaded_file = genai.get_file(uploaded_file.name)

            if uploaded_file.state.name == "FAILED":
                return jsonify({"error": "AI File processing failed"}), 500

            # C. Prompt
            prompt = f"""
            You are an expert financial analyst. I have attached the Financial Statements for {year}.
            
            TASKS:
            1. Analyze the 'Statement of Financial Position' (Balance Sheet).
            2. Analyze the 'Statement of Profit or Loss'.
            3. Analyze the 'Statement of Cash Flows'.
            4. Analyze the 'Notes' pages.

            OUTPUT JSON STRUCTURE:
            {{
                "statement_of_financial_position": [
                    {{ "line_item": "Non-current assets", "note_ref": "", "value": 0, "is_header": true }},
                    {{ "line_item": "Property and equipment", "note_ref": "4", "value": 382411, "is_header": false }}
                ],
                "statement_of_profit_or_loss": [ ... ],
                "statement_of_cash_flows": [ ... ],
                "notes": {{
                    "4": "Markdown string...",
                    "16": "Markdown string..."
                }}
            }}

            RULES FOR NOTES:
            - The value for each note must be a string formatted in MARKDOWN.
            - If a Note contains a table (like Property & Equipment breakdown), represent it as a Markdown Table.
            - Example Markdown Table:
              | Category | Cost | Depreciation |
              | :--- | :--- | :--- |
              | Furniture | 500 | 100 |
            - Preserve bold text using **bold** syntax.
            
            RULES FOR STATEMENTS:
            - Extract data for the YEAR {year} ONLY.
            - If a line item is a header, set value to 0 and is_header=true.
            - Accurately map the 'note_ref' column.
            
            Return ONLY raw JSON.
            """

            # D. Generate Content with File
            model = genai.GenerativeModel("gemini-2.5-flash")
            result = model.generate_content([uploaded_file, prompt])
            
            # Cleanup: Delete file from Gemini cloud to save storage/privacy (optional but good practice)
            # genai.delete_file(uploaded_file.name) 
            
            try:
                cleaned_json = clean_json_string(result.text)
                extracted_json = json.loads(cleaned_json)
                response_data["financial_statements"] = extracted_json
            except Exception as e:
                print(f"AI Parse Error: {e}")
                print(result.text)
                response_data["financial_statements"] = {"error": "Failed to parse AI response"}

        # 3. Save locally
        with open(output_file, 'w') as f:
            json.dump(response_data, f, indent=4)

        return jsonify(response_data), 200

    except Exception as e:
        print(e)
        return jsonify({"error": str(e)}), 500

# --- EXISTING ENDPOINTS (Copy-Paste or Keep as is) ---
@app.route('/projects', methods=['GET'])
def get_projects():
    projects = load_projects()
    project_list = [{"id": k, **v} for k, v in projects.items()]
    return jsonify(project_list), 200

@app.route('/initialize', methods=['POST'])
def initialize_project():
    try:
        data = request.json
        company_name = data.get('company_name')
        years = data.get('years', [])
        if not company_name or not years: return jsonify({"error": "Missing params"}), 400
        company_id = str(uuid.uuid4())
        for year in years:
            os.makedirs(os.path.join(BASE_DIR, company_id, str(year)), exist_ok=True)
        save_project_metadata(company_id, {"name": company_name, "years": years})
        return jsonify({"company_id": company_id, "company_name": company_name, "years": years}), 201
    except Exception as e: return jsonify({"error": str(e)}), 500

@app.route('/upload', methods=['POST'])
def upload_file():
    try:
        if 'file' not in request.files: return jsonify({"error": "No file"}), 400
        file = request.files['file']
        company_id = request.form.get('company_id')
        year = request.form.get('year')
        doc_type = request.form.get('doc_type')
        if file and allowed_file(file.filename):
            ext = file.filename.rsplit('.', 1)[1].lower()
            if doc_type == "Financial Statement": filename = f"financial_report_{year}.{ext}"
            elif doc_type == "Trial Balance": filename = f"TB_{year}.{ext}"
            else: filename = secure_filename(file.filename)
            save_path = os.path.join(BASE_DIR, company_id, year)
            os.makedirs(save_path, exist_ok=True)
            file.save(os.path.join(save_path, filename))
            return jsonify({"message": "Saved"}), 200
        return jsonify({"error": "Invalid file"}), 400
    except Exception as e: return jsonify({"error": str(e)}), 500

@app.route('/project/<company_id>/files', methods=['GET'])
def get_project_files(company_id):
    projects = load_projects()
    if company_id not in projects: return jsonify({"error": "Not found"}), 404
    file_map = {}
    for year in projects[company_id].get('years', []):
        year_path = os.path.join(BASE_DIR, company_id, str(year))
        file_map[year] = {"Financial Statement": None, "Trial Balance": None}
        if os.path.exists(year_path):
            fs = glob.glob(os.path.join(year_path, f"financial_report_{year}.*"))
            if fs: file_map[year]["Financial Statement"] = os.path.basename(fs[0])
            tb = glob.glob(os.path.join(year_path, f"TB_{year}.*"))
            if tb: file_map[year]["Trial Balance"] = os.path.basename(tb[0])
    return jsonify(file_map), 200

@app.route('/delete_file', methods=['POST'])
def delete_file():
    try:
        data = request.json
        path = os.path.join(BASE_DIR, data['company_id'], str(data['year']))
        pattern = f"financial_report_{data['year']}.*" if data['doc_type'] == "Financial Statement" else f"TB_{data['year']}.*"
        files = glob.glob(os.path.join(path, pattern))
        if files:
            os.remove(files[0])
            return jsonify({"message": "Deleted"}), 200
        return jsonify({"error": "Not found"}), 404
    except Exception as e: return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    os.makedirs(BASE_DIR, exist_ok=True)
    app.run(debug=True, port=5000)