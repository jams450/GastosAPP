-- Monitoreo administrativo de jobs (S1/L5): historial persistente de las cinco corridas.
-- DDL idempotente y re-ejecutable. Sin datos, sin secretos, sin retención destructiva.
--
-- Una fila por intento, escrita ANTES de ejecutar el trabajo: es lo que permite distinguir
-- "corrió y falló" de "nunca corrió", y lo que autoriza al coordinador a no ejecutar cuando el
-- historial no se puede escribir.
--
-- Sin FK ni CHECK sobre job_key a propósito: las claves viven en el código (JobKeys) y agregar un
-- job no debe exigir una migración. Lo que sí es vocabulario fijo está acotado aquí: trigger y
-- status.
--
-- No hay job de retención. El historial se conserva completo y se lee paginado; borrar corridas
-- destruiría la evidencia que el módulo existe para guardar.

BEGIN;

CREATE TABLE IF NOT EXISTS job_runs (
    job_run_id SERIAL PRIMARY KEY,
    job_key VARCHAR(60) NOT NULL,
    trigger VARCHAR(20) NOT NULL CHECK (trigger IN ('automatic', 'manual')),
    status VARCHAR(20) NOT NULL
        CHECK (status IN ('running', 'succeeded', 'partial', 'failed', 'skipped', 'interrupted')),
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    finished_at TIMESTAMP WITH TIME ZONE,
    requested_by VARCHAR(100),
    items_processed INT NOT NULL DEFAULT 0 CHECK (items_processed >= 0),
    items_failed INT NOT NULL DEFAULT 0 CHECK (items_failed >= 0),
    outcome_code VARCHAR(60),
    failure_type VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100),
    -- Una corrida en curso no tiene hora de fin, y una cerrada sí. Sin este invariante
    -- 'running' e 'interrupted' no se podrían separar con una consulta, y una fila huérfana de un
    -- proceso muerto se vería igual que una viva.
    CONSTRAINT ck_job_runs_finished_matches_status
        CHECK ((status = 'running') = (finished_at IS NULL))
);

-- Historial por job, del más reciente al más viejo (pantalla de detalle y "última corrida").
CREATE INDEX IF NOT EXISTS idx_job_runs_job_started_at
    ON job_runs(job_key, started_at DESC, job_run_id DESC);

-- Historial global paginado (todas las claves juntas), sin ordenar en memoria.
CREATE INDEX IF NOT EXISTS idx_job_runs_started_at
    ON job_runs(started_at DESC, job_run_id DESC);

-- Conteos por estado para el resumen del catálogo.
CREATE INDEX IF NOT EXISTS idx_job_runs_status
    ON job_runs(status, started_at DESC);

-- Búsqueda de "la corrida en curso" y de las filas huérfanas que la reconciliación de arranque
-- marca como 'interrupted'. Índice parcial: en régimen normal esta consulta ve 0-5 filas.
CREATE INDEX IF NOT EXISTS idx_job_runs_running
    ON job_runs(job_key)
    WHERE status = 'running';

COMMIT;
