import os
import pandas as pd
from supabase import create_client, Client
from dotenv import load_dotenv
import time

load_dotenv(dotenv_path="../.env.local")

url: str = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") # Use service role for backend access
supabase: Client = create_client(url, key)

def get_tables_schema():
    # Usar RPC si está disponible, o information_schema a través de postgrest
    # La forma más segura en supabase sin RPC especial es consultar la API de OpenAPI 
    # Pero una forma hacky es usar una consulta a tablas conocidas o tener un mapper, 
    # para este proyecto extraeremos vía RPC si es posible, pero si no, intentaremos un listado estático
    # expandido, idealmente en producción se usa un RPC `get_tables()`.
    
    # Asumimos las tablas principales por seguridad si no hay acceso a admin
    return ["orders", "inventory", "riders", "customers", "order_items", "delivery_details"]

def extract_and_clean_data(table_name="orders", filters=None):
    logs = []
    logs.append(f"[{time.strftime('%H:%M:%S')}] Iniciando motor ETL dinámico...")
    logs.append(f"[{time.strftime('%H:%M:%S')}] Tabla seleccionada: '{table_name}'")
    
    query = supabase.table(table_name).select('*')
    
    # Aplicar filtros dinámicos si existen
    if filters:
        for f in filters:
            col = f.get('column')
            op = f.get('operator')
            val = f.get('value')
            if col and op and val:
                logs.append(f"[{time.strftime('%H:%M:%S')}] Aplicando filtro SQL: {col} {op} {val}")
                if op == 'eq':
                    query = query.eq(col, val)
                elif op == 'gt':
                    query = query.gt(col, val)
                elif op == 'lt':
                    query = query.lt(col, val)
                elif op == 'ilike':
                    query = query.ilike(col, f"%{val}%")

    logs.append(f"[{time.strftime('%H:%M:%S')}] Ejecutando consulta en Supabase...")
    response = query.execute()
    
    report = {
        "total_rows_raw": 0,
        "nulls_filled": 0,
        "invalid_rows_dropped": 0,
        "total_rows_clean": 0,
        "table": table_name
    }
    
    if not response.data:
        logs.append(f"[{time.strftime('%H:%M:%S')}] Advertencia: 0 resultados encontrados.")
        return pd.DataFrame(), report, logs
        
    df = pd.DataFrame(response.data)
    report["total_rows_raw"] = len(df)
    logs.append(f"[{time.strftime('%H:%M:%S')}] Pandas DataFrame creado con {len(df)} filas.")
    
    # --- LIMPIEZA DINÁMICA ---
    # Convertir fechas donde existan
    for col in df.columns:
        if 'date' in col or 'created_at' in col or 'updated_at' in col:
            try:
                df[col] = pd.to_datetime(df[col])
                df[col] = df[col].dt.strftime('%Y-%m-%d %H:%M:%S')
            except:
                pass
                
    # Lógica por tabla para nulos numéricos (heurística universal simple)
    numeric_cols = df.select_dtypes(include=['float64', 'int64']).columns
    for col in numeric_cols:
        null_count = df[col].isnull().sum()
        if null_count > 0:
            report["nulls_filled"] += int(null_count)
            df[col] = df[col].fillna(0)
            logs.append(f"[{time.strftime('%H:%M:%S')}] Limpieza: Rellenados {null_count} nulos en columna '{col}'")

    # Si es orders, no permitimos totales negativos
    if table_name == 'orders' and 'total' in df.columns:
        initial_len = len(df)
        df = df[df['total'] >= 0]
        dropped = initial_len - len(df)
        report["invalid_rows_dropped"] += dropped
        if dropped > 0:
            logs.append(f"[{time.strftime('%H:%M:%S')}] Limpieza: Eliminados {dropped} registros corruptos (total negativo).")

    report["total_rows_clean"] = len(df)
    logs.append(f"[{time.strftime('%H:%M:%S')}] ETL finalizado. Datos útiles: {len(df)}")
    
    return df, report, logs

def generate_custom_csv(data_json, filename="custom_export.csv"):
    filepath = os.path.join(os.path.dirname(__file__), filename)
    df = pd.DataFrame(data_json)
    df.to_csv(filepath, index=False)
    return filepath
