from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
from etl import extract_and_clean_data, generate_custom_csv, get_tables_schema

app = FastAPI(title="Data Studio Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class FilterCondition(BaseModel):
    column: str
    operator: str
    value: Any

class QueryParams(BaseModel):
    table_name: str
    filters: Optional[List[FilterCondition]] = None

class ExportParams(BaseModel):
    table_name: str
    data: List[Dict[str, Any]]

@app.get("/")
def read_root():
    return {"status": "ok", "service": "data-studio"}

@app.get("/api/schema/tables")
def get_tables():
    return {"tables": get_tables_schema()}

@app.post("/api/analyze/query")
def execute_query(params: QueryParams):
    # Convertir filtros a dicts
    filters_dict = [f.dict() for f in params.filters] if params.filters else None
    
    df, report, logs = extract_and_clean_data(
        table_name=params.table_name,
        filters=filters_dict
    )
    
    # Enviar las filas crudas (limpias) para la grilla de datos
    raw_data = df.to_dict(orient='records') if not df.empty else []
    
    # Obtener columnas
    columns = list(df.columns) if not df.empty else []
    
    return JSONResponse(content={
        "data": raw_data, 
        "columns": columns,
        "report": report,
        "logs": logs
    })

@app.post("/api/export/custom-csv")
def export_custom_csv(params: ExportParams):
    filename = f"studio_export_{params.table_name}.csv"
    filepath = generate_custom_csv(params.data, filename)
    
    return FileResponse(
        path=filepath,
        filename=filename,
        media_type='text/csv'
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
