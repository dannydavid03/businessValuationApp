import os
import json
import uuid
import glob
import time
import pandas as pd
import numpy as np
import google.generativeai as genai
from flask import Flask, request, jsonify, send_file
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
    reader = PdfReader(original_path)
    writer = PdfWriter()
    num_pages = len(reader.pages)
    
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
    
    for i in range(num_pages):
        page_text = reader.pages[i].extract_text()
        if not page_text: continue
        lower_text = page_text.lower()
        
        if found_notes_start:
            pages_to_keep.add(i)
            continue

        if any(h in lower_text for h in HEADERS["notes"]):
            found_notes_start = True
            pages_to_keep.add(i)
            continue

        if any(h in lower_text for h in HEADERS["financial"]):
            pages_to_keep.add(i)
    
    if not pages_to_keep:
        pages_to_keep = set(range(num_pages))

    sorted_pages = sorted(list(pages_to_keep))
    for p in sorted_pages:
        writer.add_page(reader.pages[p])
    
    with open(output_path, "wb") as f:
        writer.write(f)

# --- HELPER: FIND VALUE IN EXTRACTION ---
def find_val(items, keywords):
    """ Searches a list of items for the first match of keywords and returns value. """
    if not items: return 0
    for item in items:
        line_item = str(item.get('line_item', '')).lower()
        if any(k in line_item for k in keywords):
            val = item.get('value', 0)
            if isinstance(val, (int, float)): return val
            try: return float(str(val).replace(',', '').strip())
            except: return 0
    return 0

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

        # 1. Process Excel (Trial Balance) - OPTIONAL
        tb_files = glob.glob(os.path.join(save_dir, f"TB_{year}.*"))
        if tb_files:
            try:
                df = pd.read_excel(tb_files[0])
                df = df.fillna('')
                response_data["trial_balance"] = df.to_dict(orient='records')
            except Exception as e:
                print(f"Excel error: {e}")

        # 2. Process PDF (Financial Statements)
        fs_files = glob.glob(os.path.join(save_dir, f"financial_report_{year}.*"))
        if fs_files:
            original_pdf_path = fs_files[0]
            temp_pdf_path = os.path.join(save_dir, f"temp_filtered_{year}.pdf")
            
            create_filtered_pdf(original_pdf_path, temp_pdf_path)
            
            uploaded_file = genai.upload_file(temp_pdf_path, mime_type="application/pdf")
            
            while uploaded_file.state.name == "PROCESSING":
                time.sleep(1)
                uploaded_file = genai.get_file(uploaded_file.name)

            if uploaded_file.state.name == "FAILED":
                return jsonify({"error": "AI File processing failed"}), 500

            prompt = f"""
            You are an expert financial analyst. Analyze the Financial Statements for {year}.
            
            OUTPUT JSON STRUCTURE:
            {{
                "statement_of_financial_position": [ {{ "line_item": "...", "note_ref": "...", "value": 0, "is_header": false }} ],
                "statement_of_profit_or_loss": [ ... ],
                "statement_of_cash_flows": [ ... ],
                "notes": {{ "1": "Markdown content..." }},
                "note_tables": {{ "17": [ {{ "Line_Item": "...", "{year}": "..." }} ] }}
            }}

            RULES:
            - Extract data for YEAR {year} ONLY.
            - Ensure 'value' is a number. If header, 0.
            - Preserve note references.
            - "note_tables" should extract structured tables from the notes (like PPE, Intangible Assets, Cost of Sales).
            - Return ONLY raw JSON.
            """

            model = genai.GenerativeModel("gemini-2.5-flash") # Updated model name for better speed/cost
            result = model.generate_content([uploaded_file, prompt])
            
            try:
                cleaned_json = clean_json_string(result.text)
                extracted_json = json.loads(cleaned_json)
                response_data["financial_statements"] = extracted_json
            except Exception as e:
                print(f"AI Parse Error: {e}")
                response_data["financial_statements"] = {"error": "Failed to parse AI response"}
        
        # Save locally
        with open(output_file, 'w') as f:
            json.dump(response_data, f, indent=4)

        return jsonify(response_data), 200

    except Exception as e:
        print(e)
        return jsonify({"error": str(e)}), 500

# --- CONSOLIDATE ENDPOINT ---
@app.route('/consolidate', methods=['POST'])
def consolidate_data():
    try:
        data = request.json
        company_id = data.get('company_id')
        if not company_id: return jsonify({"error": "Missing company_id"}), 400

        projects = load_projects()
        if company_id not in projects: return jsonify({"error": "Project not found"}), 404
        
        years = sorted(projects[company_id].get('years', []))
        consolidated = {
            "years": years,
            "calculated_income_statement": [],
            "calculated_balance_sheet": [],
            "calculated_cash_flow": [] # <--- NEW FIELD
        }

        # Temp storage for calc logic
        yearly_data = {}

        for year in years:
            extract_path = os.path.join(BASE_DIR, company_id, str(year), f"{company_id}_{year}_extracted.json")
            if os.path.exists(extract_path):
                with open(extract_path, 'r') as f:
                    full_data = json.load(f)
                    fs = full_data.get('financial_statements', {})
                    yearly_data[year] = {
                        "pl": fs.get('statement_of_profit_or_loss', []),
                        "bs": fs.get('statement_of_financial_position', []),
                        "cf": fs.get('statement_of_cash_flows', []),
                        "tb": full_data.get('trial_balance', []),
                        "note_tables": fs.get('note_tables', {})
                    }
            else:
                yearly_data[year] = {"pl": [], "bs": [], "cf": [], "tb": [], "note_tables": {}}

        # --- HELPER: BUILD ROW ---
        def build_row(label, value_map, format_as_percent=False, is_header=False):
            row = {"line_item": label, "is_header": is_header}
            if is_header:
                for y in years: row[y] = ""
            else:
                for y in years:
                    val = value_map.get(y, 0)
                    row[y] = f"{val:.1f}%" if format_as_percent else val
            return row

        # ==========================================
        # 1. INCOME STATEMENT CALCULATIONS
        # ==========================================
        
        # 1. Revenue
        rev_map = {}
        for y in years:
            rev_map[y] = find_val(yearly_data[y]['pl'], ['revenue', 'turnover', 'sales'])
        consolidated['calculated_income_statement'].append(build_row("Revenue from Operations", rev_map))

        # 2. Revenue Growth Rate
        growth_map = {}
        for i, y in enumerate(years):
            if i == 0: growth_map[y] = 0
            else:
                prev_rev = rev_map[years[i-1]]
                curr_rev = rev_map[y]
                if prev_rev != 0:
                    growth_map[y] = ((curr_rev - prev_rev) / prev_rev) * 100
                else: growth_map[y] = 0
        consolidated['calculated_income_statement'].append(build_row("Revenue Growth Rate (%)", growth_map, True))

        # 3. COGS
        cogs_map = {}
        for y in years:
            cogs_map[y] = find_val(yearly_data[y]['pl'], ['cost of sales', 'cost of revenue', 'cost of goods'])
        consolidated['calculated_income_statement'].append(build_row("Cost Of Sales", cogs_map))

        # 5. Gross Profit (Rev - COGS)
        gp_map = {}
        for y in years:
            gp_map[y] = rev_map[y] + cogs_map[y]
        consolidated['calculated_income_statement'].append(build_row("Gross Profit", gp_map))

        # 6. COGS % & GP Margin %
        cogs_pct_map = {}
        gp_margin_map = {}
        for y in years:
            rev = rev_map[y] if rev_map[y] != 0 else 1
            cogs_pct_map[y] = np.abs((cogs_map[y] / rev) * 100)
            gp_margin_map[y] = np.abs((gp_map[y] / rev) * 100)
        consolidated['calculated_income_statement'].append(build_row("COS%", cogs_pct_map, True))
        consolidated['calculated_income_statement'].append(build_row("GP Margin %", gp_margin_map, True))

        # 8. Other Income
        other_inc_map = {}
        for y in years:
            other_inc_map[y] = find_val(yearly_data[y]['pl'], ['other income'])
        consolidated['calculated_income_statement'].append(build_row("Other Income", other_inc_map))

        # 9. G&A Expenses
        ga_map = {}
        for y in years:
            ga_map[y] = find_val(yearly_data[y]['pl'], ['general', 'administrative', 'operating exp'])
        consolidated['calculated_income_statement'].append(build_row("General & Administrative Expenses", ga_map))

        # 10. G&A %
        ga_pct_map = {}
        for y in years:
            rev = rev_map[y] if rev_map[y] != 0 else 1
            ga_pct_map[y] = np.abs((ga_map[y] / rev) * 100)
        consolidated['calculated_income_statement'].append(build_row("G&A as % of Revenue", ga_pct_map, True))

        # 11. EBITDA
        ebitda_map = {}
        for y in years:
            ebitda_map[y] = gp_map[y] + other_inc_map[y] + ga_map[y]
        consolidated['calculated_income_statement'].append(build_row("EBITDA", ebitda_map))

        # 12. EBITDA Margin
        ebitda_pct_map = {}
        for y in years:
            rev = rev_map[y] if rev_map[y] != 0 else 1
            ebitda_pct_map[y] = (ebitda_map[y] / rev) * 100
        consolidated['calculated_income_statement'].append(build_row("EBITDA Margin %", ebitda_pct_map, True))

        # 13. Depreciation & Amortization
        depr_map = {}
        amort_map = {}
        for y in years:
            depr_map[y] = find_val(yearly_data[y]['pl'], ['depreciation'])
            if depr_map[y] == 0:
                depr_map[y] = find_val(yearly_data[y]['cf'], ['depreciation'])
            
            amort_map[y] = find_val(yearly_data[y]['cf'], ['amortisation'])
        
        consolidated['calculated_income_statement'].append(build_row("Depreciation", depr_map))
        consolidated['calculated_income_statement'].append(build_row("Amortization", amort_map))

        # 14. EBIT
        ebit_map = {}
        for y in years:
            ebit_map[y] = ebitda_map[y] - depr_map[y] - amort_map[y]
        consolidated['calculated_income_statement'].append(build_row("EBIT", ebit_map))

        # 15. EBIT Margin
        ebit_pct_map = {}
        for y in years:
            rev = rev_map[y] if rev_map[y] != 0 else 1
            ebit_pct_map[y] = (ebit_map[y] / rev) * 100
        consolidated['calculated_income_statement'].append(build_row("EBIT Margin %", ebit_pct_map, True))

        # 16. Interest Expenses
        int_map = {}
        for y in years:
            int_map[y] = find_val(yearly_data[y]['pl'], ['finance cost', 'interest exp'])
        consolidated['calculated_income_statement'].append(build_row("Interest Expenses", int_map))

        # 17. EBT
        ebt_map = {}
        for y in years:
            ebt_map[y] = ebit_map[y] - int_map[y]
        consolidated['calculated_income_statement'].append(build_row("EBT", ebt_map))

        # 18. EBT Margin
        ebt_pct_map = {}
        for y in years:
            rev = rev_map[y] if rev_map[y] != 0 else 1
            ebt_pct_map[y] = (ebt_map[y] / rev) * 100
        consolidated['calculated_income_statement'].append(build_row("EBT Margin %", ebt_pct_map, True))

        # 19. Taxes
        tax_map = {}
        for y in years:
            tax_map[y] = ebit_map[y] * 0.09
        consolidated['calculated_income_statement'].append(build_row("Taxes (9% on EBIT)", tax_map))

        # 20. Net Income
        ni_map = {}
        for y in years:
            ni_map[y] = ebt_map[y] - tax_map[y]
        consolidated['calculated_income_statement'].append(build_row("Net Income", ni_map))

        # 21. Net Income Margin
        ni_pct_map = {}
        for y in years:
            rev = rev_map[y] if rev_map[y] != 0 else 1
            ni_pct_map[y] = (ni_map[y] / rev) * 100
        consolidated['calculated_income_statement'].append(build_row("Net Income Margin %", ni_pct_map, True))

        # ==========================================
        # 2. BALANCE SHEET CONSOLIDATION
        # ==========================================
        
        # Structure Definition: (Label, Search Keys, IsHeader)
        # Search keys is None if it's a Header or a Total we calculate manually
        bs_structure = [
            ("Assets", None, True),
            ("Non-current assets", None, True),
            ("Property and equipment", ["property and equipment", "property, plant"], False),
            ("Intangible assets", ["intangible assets"], False),
            ("Total non-current assets", ["total non-current assets"], False), # Extracted directly or calculated? Using extraction for now to match source
            ("Current Assets", None, True),
            ("Inventories", ["inventories", "stock"], False),
            ("Trade and other receivables", ["trade and other receivables"], False),
            ("Cash and cash equivalents", ["cash and cash equivalents"], False),
            ("Total current assets", ["total current assets"], False),
            ("Total Assets", ["total assets"], False),
            
            ("Shareholders' funds and liabilities", None, True),
            ("Equity", None, True),
            ("Share capital", ["share capital"], False),
            ("Statutory reserve", ["statutory reserve"], False),
            ("Retained earnings/(accumulated losses)", ["retained earnings", "accumulated losses"], False),
            ("Total equity/(deficit)", ["total equity", "total deficit"], False),
            ("Shareholders' current accounts", ["shareholders' current", "partners' current"], False),
            ("Total shareholders' funds", ["total shareholders' funds"], False), # Fallback to total equity if funds not explicit?
            
            ("Non-current liabilities", None, True),
            ("Provision for employees' end of service benefits", ["end of service", "EOSB"], False),
            ("Bank borrowings (NC)", ["bank borrowings", "term loan"], False), # Special handling needed for duplicate names
            ("Total non-current liabilities", ["total non-current liabilities"], False),
            
            ("Current liabilities", None, True),
            ("Trade and other payables", ["trade and other payables"], False),
            ("Bank borrowings (C)", ["bank borrowings", "term loan"], False),
            ("Total current liabilities", ["total current liabilities"], False),
            ("Total liabilities", ["total liabilities"], False),
            ("Total shareholders' funds and liabilities", ["total shareholders' funds and liabilities", "total equity and liabilities"], False)
        ]

        # Helper to find specific BS items contextually
        def get_bs_value(year_bs_items, keywords, section_hint=None):
            if not year_bs_items: return 0
            
            # Simple Filter first
            matches = []
            for item in year_bs_items:
                line_item = str(item.get('line_item', '')).lower()
                if any(k in line_item for k in keywords):
                    val = item.get('value', 0)
                    try: val = float(str(val).replace(',', '').strip())
                    except: val = 0
                    matches.append(val)
            
            if not matches: return 0
            
            # Context Logic for duplicates like "Bank borrowings"
            if section_hint == "NC": # Non-Current (usually appears first)
                return matches[0]
            elif section_hint == "C": # Current (usually appears second)
                return matches[1] if len(matches) > 1 else 0
            
            return matches[0]

        for label, keywords, is_header in bs_structure:
            if is_header:
                consolidated['calculated_balance_sheet'].append(build_row(label, {}, False, True))
                continue

            row_map = {}
            for y in years:
                items = yearly_data[y]['bs']
                
                # Special handling for Bank Borrowings split
                if label == "Bank borrowings (NC)":
                    row_map[y] = get_bs_value(items, keywords, "NC")
                elif label == "Bank borrowings (C)":
                    row_map[y] = get_bs_value(items, keywords, "C")
                else:
                    row_map[y] = get_bs_value(items, keywords)
            
            # Clean up label names for display
            display_label = label.replace(" (NC)", "").replace(" (C)", "")
            consolidated['calculated_balance_sheet'].append(build_row(display_label, row_map, False, False))

            # ==========================================
        # 3. CASH FLOW CONSOLIDATION (NEW)
        # ==========================================
        
        cf_structure = [
            ("Cash flows from operating activities", None, True),
            ("Profit for the year", ["profit for the year", "profit before tax"], False),
            ("Adjustments for:", None, True),
            ("Depreciation", ["depreciation"], False),
            ("Amortisation", ["amortisation", "amortization"], False),
            ("Provision for employees' end of service benefits", ["provision for employees", "end of service benefits"], False),
            ("Operating cash flows before changes in working capital", ["operating cash flows before", "working capital"], False),
            ("Movements in:", None, True),
            ("Inventories", ["inventories"], False),
            ("Trade and other receivables", ["trade and other receivables"], False),
            ("Trade and other payables", ["trade and other payables"], False),
            ("Cash generated from operations", ["cash generated from operations"], False),
            ("Employees' end of service benefits paid", ["employees' end of service benefits paid", "benefits paid"], False),
            ("Net cash generated from operating activities", ["net cash generated from operating", "net cash from operating"], False),
            
            ("Cash flows from investing activities", None, True),
            ("Purchase of property and equipment", ["purchase of property", "acquisition of property"], False),
            ("Proceeds from disposal of property and equipment", ["proceeds from disposal"], False),
            ("Net cash generated from/ (used in) investing activities", ["net cash generated from/ (used in) investing", "net cash used in investing", "net cash from investing"], False),
            
            ("Cash flows from financing activities", None, True),
            ("Net movements in shareholders' current accounts", ["shareholders' current"], False),
            ("Net movements in bank borrowings", ["movements in bank borrowings"], False),
            ("Net movements in due from a related party", ["due from a related party", "related parties"], False),
            ("Net cash (used in)/generated from financing activities", ["net cash (used in)/generated from financing", "net cash from financing", "net cash used in financing"], False),
            
            ("Net increase in cash and cash equivalents", ["net increase in cash"], False),
            ("Cash and cash equivalents at the beginning of the year", ["beginning of the year"], False),
            ("Cash and cash equivalents at the end of the year", ["end of the year"], False)
        ]

        for label, keywords, is_header in cf_structure:
            if is_header:
                consolidated['calculated_cash_flow'].append(build_row(label, {}, False, True))
                continue

            row_map = {}
            for y in years:
                # Use standard find_val for CF items as they are usually unique in the CF list
                row_map[y] = find_val(yearly_data[y]['cf'], keywords)
            
            consolidated['calculated_cash_flow'].append(build_row(label, row_map, False, False))


        return jsonify(consolidated), 200

    except Exception as e:
        print(e)
        return jsonify({"error": str(e)}), 500

@app.route('/project/<company_id>/files', methods=['GET'])
def get_project_files(company_id):
    projects = load_projects()
    if company_id not in projects: return jsonify({"error": "Not found"}), 404
    file_map = {}
    for year in projects[company_id].get('years', []):
        year_path = os.path.join(BASE_DIR, company_id, str(year))
        file_map[year] = {
            "Financial Statement": None, 
            "Trial Balance": None,
            "Extracted": False
        }
        if os.path.exists(year_path):
            fs = glob.glob(os.path.join(year_path, f"financial_report_{year}.*"))
            if fs: file_map[year]["Financial Statement"] = os.path.basename(fs[0])
            tb = glob.glob(os.path.join(year_path, f"TB_{year}.*"))
            if tb: file_map[year]["Trial Balance"] = os.path.basename(tb[0])
            
            # Check if extracted
            extracted = os.path.join(year_path, f"{company_id}_{year}_extracted.json")
            if os.path.exists(extracted):
                 file_map[year]["Extracted"] = True

    return jsonify(file_map), 200

# --- EXISTING ENDPOINTS ---
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