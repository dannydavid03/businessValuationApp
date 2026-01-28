import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { useDropzone } from 'react-dropzone';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as XLSX from 'xlsx';

const API_URL = 'http://localhost:5000';

// ==========================================
// 1. EXTRACTION VIEWER COMPONENT
// ==========================================
const ExtractionViewer = ({ data, year, onBack }) => {
  const [activeTab, setActiveTab] = useState('statement_of_financial_position');
  const [activeNote, setActiveNote] = useState(null);

  const fsData = data.financial_statements || {};
  const tbData = data.trial_balance || [];
  const notes = fsData.notes || {};

  const handleNoteClick = (noteRef) => {
    if (notes[noteRef]) {
      setActiveNote({ id: noteRef, content: notes[noteRef] });
    }
  };

  const renderStatementTable = (items) => {
    if (!items || !Array.isArray(items) || items.length === 0) 
      return <div className="p-8 text-center text-gray-500 italic">No data extracted for this section.</div>;

    return (
      <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="px-6 py-3 text-left w-1/2 font-semibold">Line Item</th>
              <th className="px-4 py-3 text-center w-24 font-semibold">Note</th>
              <th className="px-6 py-3 text-right font-semibold">Value (AED)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {items.map((row, idx) => (
              <tr 
                key={idx} 
                className={`${row.is_header ? 'bg-gray-50 font-bold text-gray-800' : 'hover:bg-blue-50/50 text-gray-600 transition-colors cursor-default'}`}
              >
                <td className={`px-6 py-3 ${row.is_header ? '' : 'pl-10'}`}>
                  {row.line_item}
                </td>
                <td className="px-4 py-3 text-center">
                  {row.note_ref && (
                    <button 
                      onClick={() => handleNoteClick(row.note_ref)}
                      className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-1 rounded hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                    >
                      {row.note_ref}
                    </button>
                  )}
                </td>
                <td className="px-6 py-3 text-right font-mono">
                  {row.value === 0 && row.is_header ? '' : row.value?.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="flex h-[88vh] gap-6 font-sans text-gray-800">
      {/* Main Content Area */}
      <div className="flex-1 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <div>
            <h2 className="font-bold text-xl text-gray-800">Financial Analysis</h2>
            <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider">Fiscal Year: {year}</p>
          </div>
          <button onClick={onBack} className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm">
            ← Exit Viewer
          </button>
        </div>
        
        <div className="flex border-b border-gray-200 bg-white sticky top-0 z-10">
          {['statement_of_financial_position', 'statement_of_profit_or_loss', 'statement_of_cash_flows', 'trial_balance'].map(id => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-6 py-4 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${activeTab === id ? 'border-blue-600 text-blue-600 bg-blue-50/30' : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
            >
              {id.replace(/_/g, ' ').replace('statement of ', '').toUpperCase()}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
          {activeTab === 'trial_balance' ? (
             tbData.length > 0 ? (
               <div className="overflow-x-auto border rounded-lg shadow-sm">
                 <table className="min-w-full text-xs">
                   <thead className="bg-gray-100 text-gray-700">
                     <tr>{Object.keys(tbData[0]).map((k, i) => <th key={i} className="px-4 py-3 text-left font-semibold border-b">{k}</th>)}</tr>
                   </thead>
                   <tbody className="divide-y divide-gray-200">
                     {tbData.map((row, i) => (
                       <tr key={i} className="hover:bg-gray-50 transition-colors">
                         {Object.values(row).map((v, j) => <td key={j} className="px-4 py-2 truncate max-w-[200px]">{v}</td>)}
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             ) : (
               <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-2">
                 <span className="text-4xl">📊</span>
                 <p className="italic">No Trial Balance data found for this period.</p>
               </div>
             )
          ) : renderStatementTable(fsData[activeTab])}
        </div>
      </div>

      {/* Persistent Sidebar for Notes */}
      <div className={`w-[450px] transition-all duration-300 transform ${activeNote ? 'translate-x-0' : 'translate-x-4 opacity-0 pointer-events-none w-0'} h-full flex flex-col`}>
        <div className="flex-1 bg-amber-50 rounded-xl shadow-xl border border-amber-200 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-amber-200 bg-amber-100/50 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="bg-amber-600 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase">Note Context</span>
              <h3 className="font-bold text-amber-900">Reference {activeNote?.id}</h3>
            </div>
            <button onClick={() => setActiveNote(null)} className="text-amber-700 hover:bg-amber-200 rounded-full p-1 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 prose prose-sm prose-amber max-w-none">
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={{
                table: ({node, ...props}) => <div className="overflow-x-auto my-4"><table className="min-w-full border-collapse border border-amber-300 bg-white/50 text-xs" {...props} /></div>,
                th: ({node, ...props}) => <th className="border border-amber-300 px-2 py-1 bg-amber-100 font-bold" {...props} />,
                td: ({node, ...props}) => <td className="border border-amber-300 px-2 py-1" {...props} />,
                p: ({node, ...props}) => <p className="leading-relaxed mb-4 text-amber-900" {...props} />,
              }}
            >
              {activeNote?.content || ""}
            </ReactMarkdown>
          </div>
          <div className="p-4 bg-amber-100/30 border-t border-amber-200 text-[10px] text-amber-600 italic">
            Note content extracted automatically via AI from financial disclosures.
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 2. COMBINED VIEWER COMPONENT (Fixed Reset Race Condition)
// ==========================================
const CombinedViewer = ({ companyId, onBack }) => {
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('is'); 
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [viewVersion, setViewVersion] = useState(0); 

  useEffect(() => {
    fetchData();
  }, [companyId]);

  // FIX 1: Return the axios promise so we can chain off it
  const fetchData = () => {
    return axios.post(`${API_URL}/consolidate`, { company_id: companyId })
      .then(res => {
        setData(res.data);
        return res.data; // Return data for chaining
      })
      .catch(err => alert("Failed to load combined view"));
  };

  // FIX 2: Wait for fetchData() to finish before incrementing viewVersion
  const handleReset = () => {
    if(!window.confirm("This will revert all manual edits to the original AI extraction. Continue?")) return;
    
    axios.post(`${API_URL}/reset_consolidated`, { company_id: companyId })
      .then(() => {
        // Chain the fetch: Get Data FIRST -> THEN Refresh View
        fetchData().then(() => {
            setViewVersion(v => v + 1); 
            setLastUpdated(null);
        });
      })
      .catch(err => alert("Reset failed"));
  };

  // --- CALCULATION ENGINE ---
  const recalculateFinancials = (currentData) => {
    const newData = JSON.parse(JSON.stringify(currentData)); // Deep Copy
    const years = newData.years;
    const isRows = newData.calculated_income_statement;
    
    // Helpers
    const findRow = (rows, labelPart) => rows.find(r => r.line_item.toLowerCase().includes(labelPart.toLowerCase()));
    const getVal = (row, year) => {
      if (!row) return 0;
      let val = row[year];
      if (typeof val === 'string') val = parseFloat(val.replace('%', '').replace(/,/g, ''));
      return isNaN(val) ? 0 : val;
    };
    const setVal = (row, year, val, isPct=false) => {
        if(row) row[year] = val; 
    };

    // 1. RECALCULATE INCOME STATEMENT
    const revenueRow = findRow(isRows, "Revenue from Operations");
    const cogsRow = findRow(isRows, "Cost Of Sales");
    const gpRow = findRow(isRows, "Gross Profit");
    const otherIncRow = findRow(isRows, "Other Income");
    const gaRow = findRow(isRows, "General & Administrative");
    const ebitdaRow = findRow(isRows, "EBITDA");
    const deprRow = findRow(isRows, "Depreciation");
    const amortRow = findRow(isRows, "Amortization");
    const intRow = findRow(isRows, "Interest Expenses");
    const niRow = findRow(isRows, "Net Income");
    const taxRow = findRow(isRows, "Taxes");

    years.forEach((year, idx) => {
      // GP
      const rev = getVal(revenueRow, year);
      const cogs = getVal(cogsRow, year);
      const gp = rev + cogs; 
      setVal(gpRow, year, gp);

      // Growth
      if (idx > 0) {
        const prevRev = getVal(revenueRow, years[idx-1]);
        const growth = prevRev !== 0 ? ((rev - prevRev) / prevRev) * 100 : 0;
        setVal(findRow(isRows, "Growth Rate"), year, growth, true);
      }

      // Margins
      setVal(findRow(isRows, "COS%"), year, rev!==0 ? Math.abs((cogs/rev)*100) : 0, true);
      setVal(findRow(isRows, "GP Margin"), year, rev!==0 ? (gp/rev)*100 : 0, true);

      // EBITDA
      const other = getVal(otherIncRow, year);
      const ga = getVal(gaRow, year);
      const ebitda = gp + other + ga;
      setVal(ebitdaRow, year, ebitda);
      setVal(findRow(isRows, "EBITDA Margin"), year, rev!==0 ? (ebitda/rev)*100 : 0, true);

      // EBIT
      const depr = getVal(deprRow, year);
      const amort = getVal(amortRow, year);
      const ebit = ebitda - depr - amort;
      setVal(findRow(isRows, "EBIT"), year, ebit);
      setVal(findRow(isRows, "EBIT Margin"), year, rev!==0 ? (ebit/rev)*100 : 0, true);

      // EBT
      const interest = getVal(intRow, year);
      const ebt = ebit - interest;
      setVal(findRow(isRows, "EBT"), year, ebt);
      setVal(findRow(isRows, "EBT Margin"), year, rev!==0 ? (ebt/rev)*100 : 0, true);

      // Net Income
      const tax = getVal(taxRow, year);
      const ni = ebt - tax;
      setVal(niRow, year, ni);
      setVal(findRow(isRows, "Net Income Margin"), year, rev!==0 ? (ni/rev)*100 : 0, true);
    });

    return newData;
  };

  const handleUpdate = () => {
    setIsUpdating(true);
    const updatedData = recalculateFinancials(data);
    
    axios.post(`${API_URL}/save_consolidated`, { company_id: companyId, data: updatedData })
      .then(() => {
        setData(updatedData);
        setViewVersion(v => v + 1); // Refresh inputs
        setLastUpdated(new Date());
        setIsUpdating(false);
      })
      .catch(err => {
        setIsUpdating(false);
        alert("Update failed");
      });
  };

  const handleCellChange = (rowIndex, year, value) => {
    const newData = { ...data }; 
    let targetList;
    if (activeTab === 'is') targetList = newData.calculated_income_statement;
    else if (activeTab === 'bs') targetList = newData.calculated_balance_sheet;
    else targetList = newData.calculated_cash_flow;

    let cleanVal = value.replace(/,/g, '').replace('%', '');
    let numVal = parseFloat(cleanVal);
    if (isNaN(numVal)) numVal = 0;

    targetList[rowIndex][year] = numVal;
    setData(newData);
  };

  const exportToExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(data.calculated_income_statement);
    XLSX.utils.book_append_sheet(wb, ws1, "Income Statement");
    if (data.calculated_balance_sheet) {
      const ws2 = XLSX.utils.json_to_sheet(data.calculated_balance_sheet);
      XLSX.utils.book_append_sheet(wb, ws2, "Balance Sheet");
    }
    if (data.calculated_cash_flow) {
      const ws3 = XLSX.utils.json_to_sheet(data.calculated_cash_flow);
      XLSX.utils.book_append_sheet(wb, ws3, "Cash Flow");
    }
    XLSX.writeFile(wb, `Valuation_Model_${companyId.slice(0,5)}.xlsx`);
  };

  if (!data) return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="animate-pulse flex flex-col items-center">
        <div className="w-12 h-12 bg-purple-200 rounded-full mb-4"></div>
        <div className="text-purple-600 font-medium">Consolidating Financials...</div>
      </div>
    </div>
  );

  let viewData = [];
  if (activeTab === 'is') viewData = data.calculated_income_statement;
  else if (activeTab === 'bs') viewData = data.calculated_balance_sheet;
  else if (activeTab === 'cf') viewData = data.calculated_cash_flow;

  return (
    <div className="flex h-[88vh] flex-col bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-purple-50">
        <div>
          <h2 className="font-bold text-xl text-purple-900">Multi-Year Consolidation</h2>
          <div className="flex gap-2 text-xs mt-1">
             <span className="text-purple-600 uppercase tracking-tighter font-semibold">Interactive Model</span>
             {lastUpdated && <span className="text-emerald-600 font-medium"> • Updated {lastUpdated.toLocaleTimeString()}</span>}
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={handleReset} className="px-4 py-2 text-xs font-bold text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            Reset Data
          </button>
          
          <button 
            onClick={handleUpdate} 
            disabled={isUpdating} 
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-black hover:bg-blue-700 shadow-md hover:shadow-lg transition-all flex items-center gap-2 transform hover:-translate-y-0.5"
          >
            {isUpdating ? 'Calculating...' : '🔄 Update & Calculate'}
          </button>

          <button onClick={exportToExcel} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 shadow-sm transition-all flex items-center gap-2">
            <span>⬇</span> XLSX
          </button>
          <button onClick={onBack} className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            ← Back
          </button>
        </div>
      </div>

      <div className="flex border-b border-gray-200 bg-white">
        {['is', 'bs', 'cf'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-4 text-sm font-bold border-b-2 transition-all ${activeTab === tab ? 'border-purple-600 text-purple-600 bg-purple-50/50' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            {tab === 'is' ? 'Income Statement' : tab === 'bs' ? 'Balance Sheet' : 'Cash Flow'}
          </button>
        ))}
      </div>
      
      <div className="flex-1 overflow-auto p-6 bg-gray-50/30">
        <table className="min-w-full text-sm border-collapse bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <thead className="bg-gray-100 text-gray-700 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="border-b p-4 text-left min-w-[320px] font-bold">Consolidated Items (AED)</th>
              {data.years.map(y => <th key={y} className="border-b p-4 text-right w-40 font-bold bg-gray-50">{y}</th>)}
            </tr>
          </thead>
          
          <tbody key={viewVersion} className="divide-y divide-gray-100">
            {viewData.map((row, idx) => (
              <tr key={idx} className={`${row.is_header ? 'bg-gray-100 font-bold' : (idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50')} hover:bg-purple-50 transition-colors`}>
                <td className={`p-4 font-medium ${row.is_header ? 'text-gray-800' : (row.line_item.includes('%') ? 'text-blue-600 italic text-xs' : 'text-gray-700 pl-8')}`}>
                  {row.line_item}
                </td>
                {data.years.map(y => (
                  <td key={y} className="p-2 text-right font-mono text-gray-600">
                    {row.is_header ? '' : (
                      <input 
                        type="text" 
                        defaultValue={typeof row[y] === 'number' ? 
                            (row.line_item.includes('%') || row.line_item.includes('Rate') 
                                ? row[y].toFixed(1) + '%' 
                                : row[y].toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})) 
                            : row[y]}
                        onBlur={(e) => handleCellChange(idx, y, e.target.value)}
                        className="w-full text-right bg-transparent border border-transparent hover:border-gray-300 focus:border-purple-500 focus:bg-white focus:outline-none rounded px-2 py-1 transition-all"
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
// ==========================================
// 3. UPLOAD AND MAIN APP
// ==========================================
const UploadSlot = ({ year, docType, companyId, existingFileName, onFileChange }) => {
  const [status, setStatus] = useState(existingFileName ? 'done' : 'idle');
  useEffect(() => { setStatus(existingFileName ? 'done' : 'idle'); }, [existingFileName]);
  
  const onDrop = useCallback(async (acceptedFiles) => {
    const formData = new FormData();
    formData.append('file', acceptedFiles[0]);
    formData.append('company_id', companyId);
    formData.append('year', year);
    formData.append('doc_type', docType);
    setStatus('uploading');
    try { await axios.post(`${API_URL}/upload`, formData); onFileChange(); } 
    catch { setStatus('error'); alert("Upload failed"); }
  }, [companyId, year, docType, onFileChange]);

  const { getRootProps, getInputProps } = useDropzone({ onDrop, multiple: false });

  return (
    <div {...getRootProps()} className={`border-2 border-dashed rounded-lg p-3 flex items-center justify-between gap-3 h-16 cursor-pointer hover:shadow-md transition-all ${status === 'done' ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 bg-white hover:border-blue-400'}`}>
      <input {...getInputProps()} />
      <span className="text-xl shrink-0">{status === 'done' ? '✅' : (docType === 'Trial Balance' ? '📊' : '📄')}</span>
      <div className="flex flex-col overflow-hidden w-full">
        <span className="text-[9px] uppercase text-gray-400 font-black tracking-widest leading-none mb-1">{docType}</span>
        <span className="text-xs truncate font-medium text-gray-600">{existingFileName || (status === 'uploading' ? 'Uploading...' : 'Drop file here')}</span>
      </div>
    </div>
  );
};

export default function App() {
  const [step, setStep] = useState(1);
  const [viewMode, setViewMode] = useState('project'); 
  const [loadingMsg, setLoadingMsg] = useState('');
  const [projectData, setProjectData] = useState(null);
  const [projectFiles, setProjectFiles] = useState({}); 
  const [extractedViewData, setExtractedViewData] = useState(null); 
  const [existingProjects, setExistingProjects] = useState([]);
  
  const [companyName, setCompanyName] = useState('');
  const [startYear, setStartYear] = useState(new Date().getFullYear() - 3);
  const [endYear, setEndYear] = useState(new Date().getFullYear() - 1);

  useEffect(() => { fetchProjects(); }, []);

  const fetchProjects = async () => {
    try { const res = await axios.get(`${API_URL}/projects`); setExistingProjects(res.data); } catch {}
  };

  const refreshProjectFiles = async (id) => {
    try { const res = await axios.get(`${API_URL}/project/${id}/files`); setProjectFiles(res.data); } catch {}
  };

  const handleInitialize = async (e) => {
    e.preventDefault();
    setLoadingMsg('Configuring Workspace...');
    const years = [];
    for (let i = parseInt(startYear); i <= parseInt(endYear); i++) years.push(String(i));
    try {
      const res = await axios.post(`${API_URL}/initialize`, { company_name: companyName, years });
      setProjectData(res.data);
      await refreshProjectFiles(res.data.company_id);
      setStep(2);
    } finally { setLoadingMsg(''); }
  };

  const handleExtract = async (year) => {
    setLoadingMsg(`AI is digitizing ${year} report...`);
    try {
      const res = await axios.post(`${API_URL}/extract`, { company_id: projectData.company_id, year });
      await refreshProjectFiles(projectData.company_id);
      setExtractedViewData({ year, data: res.data });
      setViewMode('extract');
    } catch { alert("Extraction failed."); } finally { setLoadingMsg(''); }
  };

  const extractedCount = projectFiles ? Object.values(projectFiles).filter(f => f.Extracted).length : 0;

  if (loadingMsg) return (
    <div className="fixed inset-0 bg-white/95 z-[100] flex flex-col items-center justify-center">
      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
      <div className="text-xl font-black text-gray-900 tracking-tight animate-pulse">{loadingMsg}</div>
    </div>
  );

  if (viewMode === 'extract') return <div className="p-8 bg-gray-100 min-h-screen"><ExtractionViewer data={extractedViewData.data} year={extractedViewData.year} onBack={() => setViewMode('project')} /></div>;
  if (viewMode === 'combined') return <div className="p-8 bg-gray-100 min-h-screen"><CombinedViewer companyId={projectData.company_id} onBack={() => setViewMode('project')} /></div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center p-8 font-sans text-gray-900">
      <div className="max-w-5xl w-full bg-white rounded-3xl shadow-2xl overflow-hidden min-h-[650px] flex flex-col border border-gray-100">
        <div className="bg-gray-900 text-white px-10 py-8 flex justify-between items-center">
          <div>
            <span className="text-blue-500 text-[10px] font-black uppercase tracking-[0.2em]">Financial Intelligence Unit</span>
            <h1 className="text-3xl font-black tracking-tighter">{step === 1 ? 'Workspace' : projectData?.company_name}</h1>
          </div>
          {step === 2 && <button onClick={() => { setStep(1); setProjectData(null); }} className="px-4 py-2 rounded-full border border-gray-700 text-xs font-bold hover:bg-gray-800 transition-colors uppercase tracking-widest">Switch Project</button>}
        </div>

        {step === 1 ? (
          <div className="p-10 grid md:grid-cols-5 gap-10">
            <div className="md:col-span-3">
              <h2 className="font-black text-2xl mb-6 tracking-tight">Initialize Engagement</h2>
              <form onSubmit={handleInitialize} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase text-gray-400 tracking-widest">Entity Name</label>
                  <input className="w-full border-2 border-gray-100 p-4 rounded-xl focus:border-blue-500 focus:outline-none transition-colors font-medium text-lg" placeholder="e.g. Acme Corp LLC" value={companyName} onChange={e => setCompanyName(e.target.value)} required />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase text-gray-400 tracking-widest">Start Year</label>
                    <input type="number" className="w-full border-2 border-gray-100 p-4 rounded-xl focus:border-blue-500 font-bold" value={startYear} onChange={e => setStartYear(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase text-gray-400 tracking-widest">End Year</label>
                    <input type="number" className="w-full border-2 border-gray-100 p-4 rounded-xl focus:border-blue-500 font-bold" value={endYear} onChange={e => setEndYear(e.target.value)} />
                  </div>
                </div>
                <button type="submit" className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-lg shadow-lg hover:bg-blue-700 hover:-translate-y-0.5 transition-all">Start Project</button>
              </form>
            </div>
            <div className="md:col-span-2 border-l border-gray-50 pl-10">
               <h2 className="font-black text-sm uppercase text-gray-400 mb-6 tracking-widest">Recent Ledgers</h2>
               <div className="space-y-3">
                 {existingProjects.map(p => (
                   <div key={p.id} onClick={() => { setProjectData({company_id: p.id, company_name: p.name, years: p.years}); refreshProjectFiles(p.id); setStep(2); }} className="p-4 border-2 border-gray-50 rounded-2xl hover:border-blue-100 hover:bg-blue-50/30 cursor-pointer transition-all flex items-center justify-between group">
                     <span className="font-bold text-gray-700 group-hover:text-blue-700">{p.name}</span>
                     <span className="text-[10px] bg-gray-100 px-2 py-1 rounded-md text-gray-400 font-black">OPEN</span>
                   </div>
                 ))}
                 {existingProjects.length === 0 && <p className="text-sm text-gray-400 italic">No existing projects found.</p>}
               </div>
            </div>
          </div>
        ) : (
          <div className="p-10 bg-gray-50/50 flex-1">
            <div className="flex justify-between items-center mb-8">
               <h3 className="font-black text-gray-400 uppercase tracking-widest text-xs">Period Management</h3>
              {extractedCount >= 2 && (
                <button onClick={() => setViewMode('combined')} className="bg-purple-600 text-white px-8 py-4 rounded-2xl font-black shadow-xl hover:bg-purple-700 hover:-translate-y-1 transition-all flex items-center gap-3 animate-bounce-short">
                  <span className="text-xl">📊</span> View Consolidation
                </button>
              )}
            </div>
            
            <div className="space-y-6">
              {projectData.years.map(year => (
                <div key={year} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-8 group hover:shadow-xl transition-all">
                  <div className="w-20 flex flex-col items-center">
                    <span className="text-3xl font-black text-gray-200 group-hover:text-blue-500 transition-colors">{year}</span>
                    {projectFiles[year]?.Extracted && <span className="text-[8px] font-black text-emerald-500 uppercase mt-1 tracking-tighter">Digitized</span>}
                  </div>
                  
                  <div className="flex-1 grid grid-cols-2 gap-4">
                    <UploadSlot year={year} docType="Financial Statement" companyId={projectData.company_id} existingFileName={projectFiles[year]?.["Financial Statement"]} onFileChange={() => refreshProjectFiles(projectData.company_id)} />
                    <UploadSlot year={year} docType="Trial Balance" companyId={projectData.company_id} existingFileName={projectFiles[year]?.["Trial Balance"]} onFileChange={() => refreshProjectFiles(projectData.company_id)} />
                  </div>
                  
                  <div className="w-40 flex flex-col gap-2">
                    <button 
                      onClick={() => handleExtract(year)}
                      disabled={!projectFiles[year]?.["Financial Statement"]}
                      className={`w-full py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${projectFiles[year]?.["Financial Statement"] ? 'bg-gray-900 text-white hover:bg-blue-600' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}
                    >
                      {projectFiles[year]?.Extracted ? 'Re-Analyze' : 'Analyze'}
                    </button>
                    {projectFiles[year]?.Extracted && (
                      <button onClick={async () => {
                         setLoadingMsg('Loading Results...');
                         const res = await axios.post(`${API_URL}/extract`, { company_id: projectData.company_id, year });
                         setExtractedViewData({ year, data: res.data });
                         setViewMode('extract');
                         setLoadingMsg('');
                      }} className="w-full text-[10px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-tighter text-center">View JSON Extract</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}