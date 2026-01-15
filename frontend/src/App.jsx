import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { useDropzone } from 'react-dropzone';
// --- ADDED MISSING IMPORTS ---
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
      {/* LEFT PANEL: Main Data Tables */}
      <div className="flex-1 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <div>
            <h2 className="font-bold text-xl text-gray-800">Extraction Results</h2>
            <p className="text-xs text-gray-500 mt-1">Fiscal Year: {year}</p>
          </div>
          <button 
            onClick={onBack} 
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 hover:text-gray-900 transition shadow-sm"
          >
            ← Back to Project
          </button>
        </div>
        
        {/* Tabs */}
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {[
            { id: 'statement_of_financial_position', label: 'Balance Sheet' },
            { id: 'statement_of_profit_or_loss', label: 'Profit & Loss' },
            { id: 'statement_of_cash_flows', label: 'Cash Flows' },
            { id: 'trial_balance', label: 'Trial Balance (Excel)' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm font-medium whitespace-nowrap transition-all border-b-2 ${
                activeTab === tab.id 
                  ? 'border-blue-600 text-blue-600 bg-blue-50/30' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {activeTab === 'trial_balance' ? (
             tbData.length > 0 ? (
               <div className="overflow-x-auto border rounded-lg">
                 <table className="min-w-full text-xs">
                   <thead className="bg-gray-100 text-gray-700 uppercase tracking-wider">
                     <tr>
                       {Object.keys(tbData[0]).map((k, i) => <th key={i} className="px-4 py-2 text-left">{k}</th>)}
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-200">
                     {tbData.map((row, i) => (
                       <tr key={i} className="hover:bg-gray-50">
                         {Object.values(row).map((v, j) => <td key={j} className="px-4 py-2 truncate max-w-xs" title={v}>{v}</td>)}
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             ) : <p className="text-gray-400 italic text-center mt-10">No Excel Trial Balance uploaded.</p>
          ) : (
            renderStatementTable(fsData[activeTab])
          )}
        </div>
      </div>

      {/* RIGHT PANEL: Notes Sidebar (Markdown Enabled) */}
      <div 
        className={`w-[500px] transition-all duration-300 ease-in-out transform border border-yellow-200 bg-yellow-50 rounded-xl shadow-xl flex flex-col ${
          activeNote ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 w-0 hidden'
        }`}
      >
        <div className="p-4 border-b border-yellow-200 bg-yellow-100/50 flex justify-between items-center rounded-t-xl">
          <h3 className="font-bold text-yellow-900">Note {activeNote?.id}</h3>
          <button 
            onClick={() => setActiveNote(null)} 
            className="text-yellow-700 hover:bg-yellow-200 rounded-full p-1 transition"
          >
            ✕
          </button>
        </div>
        
        {/* MARKDOWN RENDERER AREA */}
        <div className="flex-1 overflow-y-auto p-5 text-sm text-gray-800">
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({node, ...props}) => <table className="min-w-full border-collapse border border-yellow-300 my-4 text-xs" {...props} />,
              thead: ({node, ...props}) => <thead className="bg-yellow-200" {...props} />,
              th: ({node, ...props}) => <th className="border border-yellow-300 px-2 py-1 text-left font-bold text-yellow-900" {...props} />,
              td: ({node, ...props}) => <td className="border border-yellow-300 px-2 py-1" {...props} />,
              p: ({node, ...props}) => <p className="mb-2 leading-relaxed" {...props} />,
              strong: ({node, ...props}) => <strong className="font-bold text-black" {...props} />,
            }}
          >
            {activeNote?.content || "Content not found."}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 2. UPLOAD SLOT COMPONENT
// ==========================================
const UploadSlot = ({ year, docType, companyId, existingFileName, onFileChange }) => {
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    setStatus(existingFileName ? 'done' : 'idle');
  }, [existingFileName]);

  const onDrop = useCallback(async (acceptedFiles) => {
    const selectedFile = acceptedFiles[0];
    if (!selectedFile) return;

    setStatus('uploading');
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('company_id', companyId);
    formData.append('year', year);
    formData.append('doc_type', docType);

    try {
      await axios.post(`${API_URL}/upload`, formData);
      onFileChange(); 
      setStatus('done');
    } catch (error) {
      console.error(error);
      setStatus('error');
      alert("Upload failed.");
    }
  }, [year, docType, companyId, onFileChange]);

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this file?")) return;

    try {
      await axios.post(`${API_URL}/delete_file`, {
        company_id: companyId,
        year: year,
        doc_type: docType
      });
      onFileChange();
      setStatus('idle');
    } catch (error) {
      alert("Failed to delete file");
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    multiple: false,
    disabled: status === 'done',
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 
      'application/vnd.ms-excel': ['.xls']
    }
  });

  let containerClass = "relative border-2 border-dashed rounded-lg p-4 transition-all flex items-center justify-between gap-3 h-20 ";
  if (status === 'done' || existingFileName) containerClass += "border-green-400 bg-green-50";
  else if (isDragActive) containerClass += "border-blue-400 bg-blue-50 scale-[1.02]";
  else if (status === 'error') containerClass += "border-red-400 bg-red-50";
  else containerClass += "border-gray-300 bg-white hover:border-gray-400 cursor-pointer hover:shadow-sm";

  return (
    <div {...getRootProps()} className={containerClass}>
      <input {...getInputProps()} />
      <div className="flex items-center gap-3 overflow-hidden">
        <span className="text-2xl flex-shrink-0">
          {(status === 'done' || existingFileName) ? '📄' : (docType.includes('Excel') || docType.includes('Trial') ? '📊' : '📂')}
        </span>
        <div className="flex flex-col overflow-hidden">
          <span className="font-semibold text-xs text-gray-500 uppercase tracking-wider">{docType}</span>
          <span className="text-sm text-gray-800 font-medium truncate w-32 md:w-40">
             {existingFileName || (status === 'uploading' ? 'Uploading...' : 'Drag & Drop')}
          </span>
        </div>
      </div>
      {(status === 'done' || existingFileName) && (
        <button 
          onClick={handleDelete}
          className="text-gray-400 hover:text-red-500 p-2 rounded-full hover:bg-white transition z-10"
          title="Delete File"
        >
          🗑️
        </button>
      )}
    </div>
  );
};

// ==========================================
// 3. MAIN APP COMPONENT
// ==========================================
export default function App() {
  const [step, setStep] = useState(1);
  const [loadingMsg, setLoadingMsg] = useState('');
  
  const [existingProjects, setExistingProjects] = useState([]);
  const [projectData, setProjectData] = useState(null);
  const [projectFiles, setProjectFiles] = useState({}); 
  const [extractedViewData, setExtractedViewData] = useState(null); 

  const [companyName, setCompanyName] = useState('');
  const currentYear = new Date().getFullYear();
  const [startYear, setStartYear] = useState(currentYear - 3);
  const [endYear, setEndYear] = useState(currentYear - 1);
  const [selectedYears, setSelectedYears] = useState([]);

  useEffect(() => { fetchProjects(); }, []);

  useEffect(() => {
    const years = [];
    const start = parseInt(startYear);
    const end = parseInt(endYear);
    if (!isNaN(start) && !isNaN(end) && start <= end) {
      for (let i = start; i <= end; i++) years.push(String(i));
    }
    setSelectedYears(years);
  }, [startYear, endYear]);

  const fetchProjects = async () => {
    try {
      const res = await axios.get(`${API_URL}/projects`);
      setExistingProjects(res.data);
    } catch (err) { console.error("Error fetching projects", err); }
  };

  const refreshProjectFiles = async (id) => {
    try {
      const res = await axios.get(`${API_URL}/project/${id}/files`);
      setProjectFiles(res.data);
    } catch (err) { console.error("Error fetching files", err); }
  };

  const handleInitialize = async (e) => {
    e.preventDefault();
    setLoadingMsg('Creating Project...');
    try {
      const response = await axios.post(`${API_URL}/initialize`, {
        company_name: companyName,
        years: selectedYears
      });
      const newProject = response.data;
      setProjectData(newProject);
      await refreshProjectFiles(newProject.company_id);
      fetchProjects(); 
      setStep(2); 
    } catch (error) {
      alert("Failed to create project");
    } finally {
      setLoadingMsg('');
    }
  };

  const loadExistingProject = async (project) => {
    setLoadingMsg('Loading Project...');
    try {
      setProjectData({
        company_id: project.id,
        company_name: project.name,
        years: project.years
      });
      await refreshProjectFiles(project.id);
      setStep(2);
    } finally {
      setLoadingMsg('');
    }
  };

  const handleExtract = async (year) => {
    setLoadingMsg(`AI is analyzing ${year} data... This may take up to 30s.`);
    try {
      const res = await axios.post(`${API_URL}/extract`, {
        company_id: projectData.company_id,
        year: year
      });
      setExtractedViewData({ year, data: res.data });
    } catch (err) {
      console.error(err);
      alert("Extraction failed. Please ensure files are uploaded.");
    } finally {
      setLoadingMsg('');
    }
  };

  if (loadingMsg) {
    return (
      <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
        <div className="animate-spin text-5xl mb-4">🤖</div>
        <p className="text-xl font-semibold text-gray-800">{loadingMsg}</p>
      </div>
    );
  }

  if (extractedViewData) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <ExtractionViewer 
          data={extractedViewData.data} 
          year={extractedViewData.year} 
          onBack={() => setExtractedViewData(null)} 
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center p-8 font-sans text-gray-800">
      <div className="max-w-5xl w-full bg-white rounded-2xl shadow-xl overflow-hidden min-h-[600px] flex flex-col">
        <div className="bg-gray-900 text-white px-8 py-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {step === 1 ? 'Valuation Workspace' : projectData?.company_name}
            </h1>
            {step === 2 && <p className="text-gray-400 text-xs mt-1 font-mono">ID: {projectData?.company_id}</p>}
          </div>
          {step === 2 && (
            <button 
              onClick={() => { setStep(1); setExtractedViewData(null); }} 
              className="text-gray-300 hover:text-white text-sm underline underline-offset-4"
            >
              Switch Project
            </button>
          )}
        </div>

        {step === 1 && (
          <div className="flex-1 grid md:grid-cols-5 divide-x divide-gray-100">
            <div className="md:col-span-2 p-8 bg-gray-50/50">
              <h2 className="text-lg font-bold mb-6 text-gray-800 flex items-center gap-2">
                <span>✨</span> New Project
              </h2>
              <form onSubmit={handleInitialize} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Company Name</label>
                  <input
                    type="text"
                    className="w-full rounded-lg border-gray-300 border p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Start Year</label>
                    <input type="number" className="w-full rounded-lg border-gray-300 border p-3" value={startYear} onChange={(e) => setStartYear(e.target.value)}/>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">End Year</label>
                    <input type="number" className="w-full rounded-lg border-gray-300 border p-3" value={endYear} onChange={(e) => setEndYear(e.target.value)}/>
                  </div>
                </div>
                {selectedYears.length > 0 && (
                   <div className="flex flex-wrap gap-2 mt-2">
                     {selectedYears.map(y => (
                       <span key={y} className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full font-bold">{y}</span>
                     ))}
                   </div>
                )}
                <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition shadow-lg shadow-blue-200">
                  Create Project
                </button>
              </form>
            </div>
            <div className="md:col-span-3 p-8">
              <h2 className="text-lg font-bold mb-6 text-gray-800 flex items-center gap-2">
                <span>📁</span> Recent Projects
              </h2>
              {existingProjects.length === 0 ? (
                <div className="text-center py-10 text-gray-400 border-2 border-dashed rounded-xl">
                  No projects found. Create one to get started.
                </div>
              ) : (
                <ul className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {existingProjects.map((proj) => (
                    <li key={proj.id} 
                        onClick={() => loadExistingProject(proj)}
                        className="group p-4 border border-gray-100 rounded-xl hover:bg-white hover:border-blue-200 hover:shadow-md cursor-pointer transition bg-gray-50"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="font-bold text-gray-700 group-hover:text-blue-600 transition">{proj.name}</span>
                          <div className="flex gap-1 mt-2">
                            {proj.years.slice(0, 5).map(y => <span key={y} className="text-[10px] bg-gray-200 px-1.5 py-0.5 rounded text-gray-600">{y}</span>)}
                            {proj.years.length > 5 && <span className="text-[10px] text-gray-400">+{proj.years.length - 5}</span>}
                          </div>
                        </div>
                        <span className="text-gray-300 text-2xl">›</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {step === 2 && projectData && (
          <div className="flex-1 p-8 bg-gray-50/30">
            <div className="space-y-6">
              {projectData.years.map((year) => (
                <div key={year} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-6 items-center transition hover:shadow-md">
                  <div className="md:w-24 flex-shrink-0 text-center md:text-left">
                    <span className="block text-2xl font-black text-gray-300">{year}</span>
                    <span className="text-xs text-gray-400 font-semibold uppercase">Fiscal Year</span>
                  </div>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                    <UploadSlot 
                      year={year} 
                      docType="Financial Statement" 
                      companyId={projectData.company_id}
                      existingFileName={projectFiles[year]?.["Financial Statement"]}
                      onFileChange={() => refreshProjectFiles(projectData.company_id)}
                    />
                    <UploadSlot 
                      year={year} 
                      docType="Trial Balance" 
                      companyId={projectData.company_id}
                      existingFileName={projectFiles[year]?.["Trial Balance"]}
                      onFileChange={() => refreshProjectFiles(projectData.company_id)}
                    />
                  </div>
                  <div className="md:w-32 flex-shrink-0 w-full">
                    <button 
                      onClick={() => handleExtract(year)}
                      disabled={!projectFiles[year]?.["Financial Statement"]} 
                      className={`w-full py-3 rounded-lg font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition ${
                        projectFiles[year]?.["Financial Statement"]
                          ? 'bg-purple-600 text-white hover:bg-purple-700 hover:shadow-purple-200'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                       <span>✨</span> Process
                    </button>
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