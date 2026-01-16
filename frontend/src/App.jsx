import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { useDropzone } from 'react-dropzone';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as XLSX from 'xlsx'; // Assuming installed or use CSV

const API_URL = 'http://localhost:5000';

// ==========================================
// 1. EXTRACTION VIEWER COMPONENT (Single Year)
// ==========================================
const ExtractionViewer = ({ data, year, onBack }) => {
  const [activeTab, setActiveTab] = useState('statement_of_financial_position');
  const [activeNote, setActiveNote] = useState(null);

  const fsData = data.financial_statements || {};
  const tbData = data.trial_balance || [];
  const notes = fsData.notes || {};

  const renderStatementTable = (items) => {
    if (!items || !Array.isArray(items) || items.length === 0) 
      return <div className="p-8 text-center text-gray-500 italic">No data extracted for this section.</div>;

    return (
      <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="px-6 py-3 text-left w-1/2 font-semibold">Line Item</th>
              <th className="px-4 py-3 text-center w-24 font-semibold">Note Ref</th>
              <th className="px-6 py-3 text-right font-semibold">Value ({year})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {items.map((row, idx) => (
              <tr 
                key={idx} 
                className={`${row.is_header ? 'bg-gray-50 font-bold text-gray-800' : 'hover:bg-blue-50/50 text-gray-600 transition-colors'}`}
              >
                <td className={`px-6 py-3 ${row.is_header ? '' : 'pl-10'}`}>
                  {row.line_item}
                </td>
                <td className="px-4 py-3 text-center">
                  {row.note_ref && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveNote({ id: row.note_ref, content: notes[row.note_ref] });
                      }}
                      className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-1 rounded hover:bg-blue-600 hover:text-white transition-all"
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
    <div className="flex h-[85vh] gap-6 font-sans text-gray-800">
      <div className="flex-1 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <div>
            <h2 className="font-bold text-xl text-gray-800">Extraction Results</h2>
            <p className="text-xs text-gray-500 mt-1">Fiscal Year: {year}</p>
          </div>
          <button onClick={onBack} className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50">← Back</button>
        </div>
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {['statement_of_financial_position', 'statement_of_profit_or_loss', 'statement_of_cash_flows', 'trial_balance'].map(id => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-6 py-3 text-sm font-medium whitespace-nowrap border-b-2 ${activeTab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:bg-gray-50'}`}
            >
              {id.replace(/_/g, ' ').replace('statement of ', '').toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {activeTab === 'trial_balance' ? (
             tbData.length > 0 ? (
               <div className="overflow-x-auto border rounded-lg">
                 <table className="min-w-full text-xs">
                   <thead className="bg-gray-100 text-gray-700"><tr>{Object.keys(tbData[0]).map((k, i) => <th key={i} className="px-4 py-2 text-left">{k}</th>)}</tr></thead>
                   <tbody>{tbData.map((row, i) => <tr key={i} className="hover:bg-gray-50">{Object.values(row).map((v, j) => <td key={j} className="px-4 py-2 truncate">{v}</td>)}</tr>)}</tbody>
                 </table>
               </div>
             ) : <p className="text-gray-400 italic text-center mt-10">No Excel Trial Balance uploaded (Optional).</p>
          ) : renderStatementTable(fsData[activeTab])}
        </div>
      </div>
      <div className={`w-[500px] border border-yellow-200 bg-yellow-50 rounded-xl shadow-xl flex flex-col ${activeNote ? '' : 'hidden'}`}>
        <div className="p-4 border-b border-yellow-200 bg-yellow-100/50 flex justify-between items-center">
          <h3 className="font-bold text-yellow-900">Note {activeNote?.id}</h3>
          <button onClick={() => setActiveNote(null)} className="text-yellow-700 hover:bg-yellow-200 rounded-full p-1">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 text-sm text-gray-800">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeNote?.content || ""}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 2. COMBINED VIEWER (ENHANCED)
// ==========================================
const CombinedViewer = ({ companyId, onBack }) => {
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('model'); // model, pl, bs, cf
  const [loading, setLoading] = useState(false);
  const [editingCell, setEditingCell] = useState(null); // { id, year }
  const [commentingCell, setCommentingCell] = useState(null); // { id, year }

  // Fetch Logic
  const loadData = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/consolidate`, { company_id: companyId });
      setData(res.data);
    } catch (err) { alert("Failed to load"); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [companyId]);

  // Handle Edit
  const handleValueChange = async (rowId, year, newValue, sectionKey) => {
    // Determine the unique key for adjustment
    // If it's the 'model' tab, we use CALCULATED_ prefix unless mapped
    // If it's raw tabs, we use {sectionKey}_{lineItem}_{year}
    
    let key = "";
    if (activeTab === 'model') {
       // For model, we usually don't edit calculated fields directly unless we want to override the final number
       // But the backend build_row uses ID: "CALC_{label}"
       // Let's assume we allow overriding the calculated output
       const label = rowId.replace("CALC_", "").replace(/_/g, " ");
       key = `CALCULATED_${label}_${year}`;
    } else {
       // Raw view ID format from backend: "{section_key}_{line_item}"
       // We need to reconstruct the key used in backend loop: "{section}_{line_item}_{year}"
       // The row.id passed here is already unique to the line item
       const lineItem = rowId.split(sectionKey + "_")[1];
       key = `${sectionKey}_${lineItem}_${year}`;
    }

    // Optimistic Update? No, let's trigger recalc to see impact
    try {
      await axios.post(`${API_URL}/adjustments`, {
        company_id: companyId,
        updates: [{ key, value: newValue }]
      });
      loadData(); // Reload to see effects (recalculation)
    } catch (e) { alert("Failed to save"); }
    setEditingCell(null);
  };

  const handleCommentSave = async (key, comment) => {
    try {
        await axios.post(`${API_URL}/adjustments`, {
          company_id: companyId,
          updates: [{ key, comment }]
        });
        loadData();
    } catch (e) { alert("Failed to save comment"); }
    setCommentingCell(null);
  };

  const renderTable = (rows, sectionKey) => {
    if (!data) return null;
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border-collapse border border-gray-200">
          <thead className="bg-gray-100 text-gray-700 sticky top-0 z-10">
            <tr>
              <th className="border p-3 text-left min-w-[300px] shadow-sm bg-gray-100">Line Item</th>
              {data.years.map(y => <th key={y} className="border p-3 text-right w-32 min-w-[120px] bg-gray-100">{y}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className={`group ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50 hover:bg-blue-50'}`}>
                <td className="border p-3 font-medium text-gray-700 flex justify-between items-center">
                  <span>{row.line_item}</span>
                </td>
                {data.years.map(y => {
                  // Unique Key for this cell
                  const lineItem = sectionKey === 'calculated' ? row.line_item : row.line_item;
                  const adjKey = sectionKey === 'calculated' 
                      ? `CALCULATED_${lineItem}_${y}` 
                      : `${sectionKey}_${lineItem}_${y}`;
                  
                  const hasAdj = data.adjustments && data.adjustments[adjKey];
                  const hasComment = hasAdj && hasAdj.comment;
                  const isModified = hasAdj && hasAdj.value !== undefined;

                  return (
                    <td key={y} 
                        className={`border p-1 text-right font-mono relative group-td ${isModified ? 'bg-yellow-50 font-bold text-blue-800' : 'text-gray-600'}`}
                    >
                      {editingCell?.id === row.id && editingCell?.year === y ? (
                        <input 
                          autoFocus
                          className="w-full text-right p-1 border border-blue-500 rounded outline-none bg-white"
                          defaultValue={typeof row[y] === 'number' ? row[y] : parseFloat(String(row[y]).replace('%','')) || 0}
                          onBlur={(e) => handleValueChange(row.id, y, e.target.value, sectionKey)}
                          onKeyDown={(e) => { if(e.key === 'Enter') e.target.blur(); }}
                        />
                      ) : (
                        <div className="flex items-center justify-end h-full w-full px-2 cursor-pointer hover:bg-gray-100" onClick={() => setEditingCell({ id: row.id, year: y })}>
                          <span>{typeof row[y] === 'number' ? row[y].toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0}) : row[y]}</span>
                          {hasComment && (
                             <span className="ml-2 text-[10px] text-yellow-600 cursor-help" title={hasAdj.comment}>💬</span>
                          )}
                          <button 
                            className="opacity-0 group-hover:opacity-100 group-td:hover:opacity-100 ml-2 text-[10px] text-gray-400 hover:text-blue-600"
                            onClick={(e) => { e.stopPropagation(); setCommentingCell({ key: adjKey, val: hasAdj?.comment || '' }); }}
                          >
                            📝
                          </button>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (!data) return <div className="text-center p-10">Loading Combined Model...</div>;

  return (
    <div className="flex h-[90vh] flex-col bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden relative">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-900 text-white">
        <div>
          <h2 className="font-bold text-xl">Financial Model</h2>
          <p className="text-xs text-gray-400">Values are editable. Edits trigger auto-calculation.</p>
        </div>
        <div className="flex gap-2">
           <button onClick={() => {
              const ws = XLSX.utils.json_to_sheet(data.calculated_model);
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, "Valuation");
              XLSX.writeFile(wb, "Valuation_Model.xlsx");
           }} className="px-3 py-1 bg-green-600 rounded text-sm hover:bg-green-700">Export Excel</button>
           <button onClick={onBack} className="px-3 py-1 bg-gray-700 rounded text-sm hover:bg-gray-600">Close</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 border-b px-4 gap-2 pt-2">
        {[
          { id: 'model', label: '📊 Income statement' },
          { id: 'pl', label: '📉 Profit & Loss' },
          { id: 'bs', label: '🏛 Balance Sheet' },
          { id: 'cf', label: '💸 Cash Flow' },
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-2 rounded-t-lg text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-white text-blue-600 shadow-sm translate-y-[1px]' : 'text-gray-500 hover:bg-gray-200'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-white p-6 relative">
        {loading && <div className="absolute inset-0 bg-white/50 z-20 flex items-center justify-center"><span className="bg-black text-white px-4 py-2 rounded">Recalculating...</span></div>}
        
        {activeTab === 'model' && renderTable(data.calculated_model, 'calculated')}
        {activeTab === 'pl' && renderTable(data.raw_views.pl, 'statement_of_profit_or_loss')}
        {activeTab === 'bs' && renderTable(data.raw_views.bs, 'statement_of_financial_position')}
        {activeTab === 'cf' && renderTable(data.raw_views.cf, 'statement_of_cash_flows')}
      </div>

      {/* Comment Modal */}
      {commentingCell && (
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg shadow-xl w-96 border">
            <h3 className="font-bold mb-2">Add Comment</h3>
            <textarea 
              className="w-full border p-2 rounded mb-2" 
              rows={3}
              defaultValue={commentingCell.val} 
              id="commentText"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setCommentingCell(null)} className="px-3 py-1 text-sm text-gray-500">Cancel</button>
              <button onClick={() => handleCommentSave(commentingCell.key, document.getElementById('commentText').value)} className="px-3 py-1 text-sm bg-blue-600 text-white rounded">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
// ==========================================
// 3. MAIN APP COMPONENT
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
    <div {...getRootProps()} className={`border-2 border-dashed rounded-lg p-3 flex items-center justify-between gap-3 h-16 cursor-pointer hover:shadow-sm ${status === 'done' ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-white'}`}>
      <input {...getInputProps()} />
      <span className="text-xl">{status === 'done' ? '📄' : (docType === 'Trial Balance' ? '📊' : '📂')}</span>
      <div className="flex flex-col overflow-hidden w-full">
        <span className="text-[10px] uppercase text-gray-500 font-bold">{docType}</span>
        <span className="text-xs truncate">{existingFileName || (status === 'uploading' ? 'Uploading...' : 'Drag & Drop')}</span>
      </div>
    </div>
  );
};

export default function App() {
  const [step, setStep] = useState(1);
  const [viewMode, setViewMode] = useState('project'); // 'project', 'extract', 'combined'
  const [loadingMsg, setLoadingMsg] = useState('');
  const [projectData, setProjectData] = useState(null);
  const [projectFiles, setProjectFiles] = useState({}); 
  const [extractedViewData, setExtractedViewData] = useState(null); 
  const [existingProjects, setExistingProjects] = useState([]);
  
  // New Project Form State
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
    setLoadingMsg('Creating Project...');
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
    setLoadingMsg(`AI is analyzing ${year} data...`);
    try {
      const res = await axios.post(`${API_URL}/extract`, { company_id: projectData.company_id, year });
      await refreshProjectFiles(projectData.company_id); // Update extracted status
      setExtractedViewData({ year, data: res.data });
      setViewMode('extract');
    } catch { alert("Extraction failed."); } finally { setLoadingMsg(''); }
  };

  // Check how many years have been extracted
  const extractedCount = projectFiles ? Object.values(projectFiles).filter(f => f.Extracted).length : 0;

  if (loadingMsg) return <div className="fixed inset-0 bg-white/90 z-50 flex items-center justify-center text-xl font-bold">{loadingMsg}</div>;
  if (viewMode === 'extract') return <div className="p-6 bg-gray-100 min-h-screen"><ExtractionViewer data={extractedViewData.data} year={extractedViewData.year} onBack={() => setViewMode('project')} /></div>;
  if (viewMode === 'combined') return <div className="p-6 bg-gray-100 min-h-screen"><CombinedViewer companyId={projectData.company_id} onBack={() => setViewMode('project')} /></div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center p-8 font-sans text-gray-800">
      <div className="max-w-5xl w-full bg-white rounded-2xl shadow-xl overflow-hidden min-h-[600px] flex flex-col">
        <div className="bg-gray-900 text-white px-8 py-6 flex justify-between items-center">
          <h1 className="text-2xl font-bold">{step === 1 ? 'Valuation Workspace' : projectData?.company_name}</h1>
          {step === 2 && <button onClick={() => { setStep(1); setProjectData(null); }} className="text-gray-400 text-sm hover:text-white">Switch Project</button>}
        </div>

        {step === 1 ? (
          <div className="p-8 grid md:grid-cols-2 gap-8">
            <div>
              <h2 className="font-bold text-lg mb-4">New Project</h2>
              <form onSubmit={handleInitialize} className="space-y-4">
                <input className="w-full border p-3 rounded" placeholder="Company Name" value={companyName} onChange={e => setCompanyName(e.target.value)} required />
                <div className="grid grid-cols-2 gap-4">
                  <input type="number" className="border p-3 rounded" value={startYear} onChange={e => setStartYear(e.target.value)} />
                  <input type="number" className="border p-3 rounded" value={endYear} onChange={e => setEndYear(e.target.value)} />
                </div>
                <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded font-bold">Create</button>
              </form>
            </div>
            <div>
               <h2 className="font-bold text-lg mb-4">Recent Projects</h2>
               <div className="space-y-2">
                 {existingProjects.map(p => (
                   <div key={p.id} onClick={() => { setProjectData({company_id: p.id, company_name: p.name, years: p.years}); refreshProjectFiles(p.id); setStep(2); }} className="p-3 border rounded hover:bg-gray-50 cursor-pointer">
                     {p.name}
                   </div>
                 ))}
               </div>
            </div>
          </div>
        ) : (
          <div className="p-8 bg-gray-50/30 flex-1">
            <div className="flex justify-end mb-6">
              {extractedCount >= 2 && (
                <button onClick={() => setViewMode('combined')} className="bg-purple-600 text-white px-6 py-3 rounded-lg font-bold shadow-lg hover:bg-purple-700 transition flex items-center gap-2">
                  <span>📊</span> View Combined Analysis
                </button>
              )}
            </div>
            <div className="space-y-4">
              {projectData.years.map(year => (
                <div key={year} className="bg-white p-4 rounded-xl border shadow-sm flex items-center gap-4">
                  <div className="w-16 text-center"><span className="text-2xl font-black text-gray-300">{year}</span></div>
                  <div className="flex-1 grid grid-cols-2 gap-4">
                    <UploadSlot year={year} docType="Financial Statement" companyId={projectData.company_id} existingFileName={projectFiles[year]?.["Financial Statement"]} onFileChange={() => refreshProjectFiles(projectData.company_id)} />
                    <UploadSlot year={year} docType="Trial Balance" companyId={projectData.company_id} existingFileName={projectFiles[year]?.["Trial Balance"]} onFileChange={() => refreshProjectFiles(projectData.company_id)} />
                  </div>
                  <div className="w-32">
                    <button 
                      onClick={() => handleExtract(year)}
                      disabled={!projectFiles[year]?.["Financial Statement"]}
                      className={`w-full py-3 rounded-lg font-bold text-sm ${projectFiles[year]?.["Financial Statement"] ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}
                    >
                      {projectFiles[year]?.Extracted ? 'Re-Process' : 'Process'}
                    </button>
                    {projectFiles[year]?.Extracted && (
                      <button onClick={async () => {
                         const res = await axios.post(`${API_URL}/extract`, { company_id: projectData.company_id, year });
                         setExtractedViewData({ year, data: res.data });
                         setViewMode('extract');
                      }} className="w-full mt-2 text-xs text-blue-600 hover:underline">View Results</button>
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