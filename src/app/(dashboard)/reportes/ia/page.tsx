"use client";

import { useEffect, useState, useRef } from "react";
import { 
  Download, BrainCircuit, RefreshCw, Filter, CheckCircle2, AlertTriangle, 
  ShieldCheck, Database, Terminal, Plus, Trash2, Edit3, Save 
} from "lucide-react";
import { Topbar } from '@/components/layout/Topbar';
import { useTheme } from '@/context/ThemeContext';

type DataHealthReport = {
  total_rows_raw: number;
  nulls_filled: number;
  invalid_rows_dropped: number;
  total_rows_clean: number;
  table: string;
};

type FilterCondition = {
  column: string;
  operator: string;
  value: string;
};

export default function DataStudioPage() {
  const { dark } = useTheme();
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState("orders");
  
  const [data, setData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [report, setReport] = useState<DataHealthReport | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Builder Filtros
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  
  // Edición
  const [editingCell, setEditingCell] = useState<{row: number, col: string} | null>(null);
  const [editValue, setEditValue] = useState("");

  const API_URL = "http://localhost:8000";
  const consoleRef = useRef<HTMLDivElement>(null);

  // Cargar tablas al inicio
  useEffect(() => {
    fetch(`${API_URL}/api/schema/tables`)
      .then(res => res.json())
      .then(data => setTables(data.tables || []))
      .catch(err => console.error(err));
  }, []);

  // Fetch Data
  const fetchData = async () => {
    try {
      setLoading(true);
      setLogs(["[Frontend] Conectando con Python Data Studio..."]);
      
      const res = await fetch(`${API_URL}/api/analyze/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table_name: selectedTable,
          filters: filters
        })
      });
      if (res.ok) {
        const json = await res.json();
        setData(json.data || []);
        setColumns(json.columns || []);
        setReport(json.report);
        setLogs(prev => [...prev, ...json.logs]);
      } else {
        setLogs(prev => [...prev, "[Frontend] Error HTTP del servidor Python"]);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      setLogs(prev => [...prev, `[Frontend] Error de red: ${error}`]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  // Manejo de edición de celdas
  const startEdit = (rowIndex: number, colName: string, val: any) => {
    setEditingCell({ row: rowIndex, col: colName });
    setEditValue(val === null || val === undefined ? "" : String(val));
  };

  const saveEdit = () => {
    if (!editingCell) return;
    const newData = [...data];
    newData[editingCell.row][editingCell.col] = editValue;
    setData(newData);
    setEditingCell(null);
    setLogs(prev => [...prev, `[Frontend] Edición manual: Fila ${editingCell.row}, Columna '${editingCell.col}' actualizada a '${editValue}'`]);
  };

  const handleDownloadCSV = async () => {
    try {
      setLogs(prev => [...prev, "[Frontend] Solicitando exportación de datos editados..."]);
      const res = await fetch(`${API_URL}/api/export/custom-csv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table_name: selectedTable,
          data: data
        })
      });
      if (!res.ok) throw new Error("Network response was not ok");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `studio_export_${selectedTable}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setLogs(prev => [...prev, "[Frontend] Descarga de CSV completada."]);
    } catch (error) {
      console.error("Error downloading file:", error);
      setLogs(prev => [...prev, `[Frontend] Error en descarga: ${error}`]);
    }
  };

  const addFilter = () => {
    setFilters([...filters, { column: columns[0] || "", operator: "eq", value: "" }]);
  };
  
  const updateFilter = (index: number, field: keyof FilterCondition, val: string) => {
    const nf = [...filters];
    nf[index][field] = val;
    setFilters(nf);
  };

  const removeFilter = (index: number) => {
    setFilters(filters.filter((_, i) => i !== index));
  };

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-[#0f111a]">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[var(--orange)] opacity-[0.03] rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-500 opacity-[0.02] rounded-full blur-[140px] pointer-events-none" />
      
      <Topbar title="Data Studio Avanzado" subtitle="Extrae, filtra, audita y edita cualquier tabla del sistema con Python" />

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-8 z-10 relative">
        <div className="max-w-[1400px] mx-auto space-y-6">
          
          {/* Action Bar */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-fade-in-up">
            <div className="flex items-center gap-3">
              <Database className="w-6 h-6 text-[var(--orange)]" />
              <select 
                value={selectedTable}
                onChange={(e) => { setSelectedTable(e.target.value); setData([]); setColumns([]); setFilters([]); }}
                className="bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] text-lg font-black rounded-xl px-4 py-2 focus:ring-2 focus:ring-[var(--orange)] outline-none"
              >
                {tables.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
              </select>
            </div>

            <div className="flex gap-3 w-full md:w-auto">
              <button 
                onClick={fetchData}
                disabled={loading}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] font-bold hover:bg-[var(--bg-input)] transition-all shadow-sm disabled:opacity-50"
              >
                <RefreshCw size={16} className={loading ? "animate-spin text-[var(--orange)]" : ""} />
                Ejecutar Query
              </button>
              <button 
                onClick={handleDownloadCSV}
                disabled={data.length === 0}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-[var(--orange)] text-white font-black hover:opacity-90 shadow-[0_4px_12px_rgba(255,107,53,0.3)] transition-all active:scale-95 disabled:opacity-50 disabled:shadow-none"
              >
                <Download size={16} />
                Exportar CSV Final
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            
            {/* Sidebar Izquierda - Filtros & Data Health */}
            <div className="xl:col-span-1 space-y-6 animate-fade-in-up delay-100">
              
              {/* Filtros */}
              <div className="card p-5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-black flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <Filter className="w-4 h-4 text-[var(--orange)]" /> Constructor de Filtros
                  </h3>
                  <button onClick={addFilter} disabled={columns.length===0} className="p-1 rounded bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--orange)] disabled:opacity-50">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                
                {filters.length === 0 ? (
                  <p className="text-[11px] text-center italic" style={{ color: 'var(--text-muted)' }}>No hay filtros aplicados. Ejecuta una query primero para cargar las columnas o extraer todo.</p>
                ) : (
                  <div className="space-y-3">
                    {filters.map((f, i) => (
                      <div key={i} className="p-3 bg-[var(--bg-input)] rounded-xl border border-[var(--border)] space-y-2 relative">
                        <button onClick={() => removeFilter(i)} className="absolute top-2 right-2 text-rose-500 hover:text-rose-700">
                          <Trash2 className="w-3 h-3" />
                        </button>
                        <select value={f.column} onChange={e => updateFilter(i, "column", e.target.value)} className="w-full text-xs p-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded text-[var(--text-primary)]">
                          {columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <select value={f.operator} onChange={e => updateFilter(i, "operator", e.target.value)} className="w-full text-xs p-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded text-[var(--orange)] font-bold">
                          <option value="eq">Igual a (=)</option>
                          <option value="gt">Mayor que (&gt;)</option>
                          <option value="lt">Menor que (&lt;)</option>
                          <option value="ilike">Contiene (Texto)</option>
                        </select>
                        <input type="text" value={f.value} onChange={e => updateFilter(i, "value", e.target.value)} placeholder="Valor..." className="w-full text-xs p-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded text-[var(--text-primary)] outline-none focus:border-[var(--orange)]" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Data Health */}
              <div className="card p-5 relative overflow-hidden">
                <h3 className="text-sm font-black flex items-center gap-2 mb-4" style={{ color: 'var(--text-primary)' }}>
                  <ShieldCheck className="w-4 h-4 text-[var(--orange)]" /> Auditoría Python
                </h3>
                {report ? (
                  <div className="space-y-3 relative z-10 text-[11px]">
                    <div className="flex justify-between items-center pb-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Filas Brutas:</span>
                      <span className="font-mono font-black" style={{ color: 'var(--text-primary)' }}>{report.total_rows_raw}</span>
                    </div>
                    <div className="flex justify-between items-center pb-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
                      <span className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><AlertTriangle className="w-3 h-3 text-amber-500" /> Nulos Arreglados:</span>
                      <span className="font-mono font-black text-amber-500">{report.nulls_filled}</span>
                    </div>
                    <div className="flex justify-between items-center pb-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Corruptos Borrados:</span>
                      <span className="font-mono font-black text-rose-500">{report.invalid_rows_dropped}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1">
                      <span className="font-bold flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Datos Listos:
                      </span>
                      <span className="font-mono text-sm font-black text-emerald-500">{report.total_rows_clean}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-center italic" style={{ color: 'var(--text-muted)' }}>Ejecuta una query para auditar.</div>
                )}
              </div>
            </div>

            {/* Consola & Editor */}
            <div className="xl:col-span-3 space-y-6 animate-fade-in-up delay-200 flex flex-col h-[700px]">
              
              {/* Python Terminal */}
              <div className="bg-[#0D1117] border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col h-48 shrink-0">
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-800">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-mono font-bold text-slate-400">Python ETL Live Logs</span>
                </div>
                <div ref={consoleRef} className="flex-1 overflow-y-auto font-mono text-[10px] sm:text-[11px] leading-relaxed text-emerald-400/90 space-y-1">
                  {logs.length === 0 && <span className="text-slate-600">Esperando ejecución...</span>}
                  {logs.map((log, i) => <div key={i}>{log}</div>)}
                </div>
              </div>

              {/* Data Grid Editable */}
              <div className="card flex-1 flex flex-col overflow-hidden relative">
                <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)' }}>
                  <h3 className="text-sm font-black flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    <Edit3 className="w-4 h-4 text-[var(--orange)]" /> Data Grid (Doble Clic para Editar)
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-1 rounded bg-[var(--bg-input)]" style={{ color: 'var(--text-muted)' }}>
                    {data.length} filas renderizadas
                  </span>
                </div>
                
                <div className="flex-1 overflow-auto bg-[var(--bg-card)]">
                  {data.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center px-4">
                      <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>No hay datos para mostrar. Ajusta los filtros y presiona 'Ejecutar Query'.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left text-[11px] border-collapse min-w-max">
                      <thead className="sticky top-0 bg-[var(--bg-input)] shadow-sm z-10">
                        <tr>
                          {columns.map(col => (
                            <th key={col} className="px-4 py-2.5 font-bold uppercase tracking-wider border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.map((row, rowIndex) => (
                          <tr key={rowIndex} className="border-b hover:bg-[var(--bg-input)] transition-colors group" style={{ borderColor: 'var(--border)' }}>
                            {columns.map(col => {
                              const isEditing = editingCell?.row === rowIndex && editingCell?.col === col;
                              return (
                                <td 
                                  key={col} 
                                  className="px-4 py-2 relative" 
                                  style={{ color: 'var(--text-primary)' }}
                                  onDoubleClick={() => startEdit(rowIndex, col, row[col])}
                                >
                                  {isEditing ? (
                                    <div className="flex items-center gap-1">
                                      <input 
                                        type="text" 
                                        autoFocus
                                        value={editValue} 
                                        onChange={(e) => setEditValue(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                                        className="w-full min-w-[100px] text-[11px] p-1 border rounded bg-[var(--bg-card)] outline-none focus:border-[var(--orange)]"
                                        style={{ borderColor: 'var(--orange)', color: 'var(--orange)' }}
                                      />
                                      <button onClick={saveEdit} className="p-1 rounded bg-[var(--orange)] text-white hover:bg-orange-600"><Save className="w-3 h-3"/></button>
                                    </div>
                                  ) : (
                                    <span className="truncate max-w-[150px] inline-block cursor-pointer" title={String(row[col])}>
                                      {row[col] !== null ? String(row[col]) : <span className="text-slate-500 italic">null</span>}
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
