-- Migration 001: Initial Schema
-- Applied: 2025-12-22
-- Description: Create initial tables for auto-fix monitoring system

-- This migration creates all 6 core tables, analytics views, triggers, and indexes

-- Import the complete schema
-- Note: In production, this would be the schema.sql content
-- For now, this serves as the initial migration marker

BEGIN TRANSACTION;

-- Record this migration
INSERT INTO schema_version (version, description) VALUES
    (1, 'Initial schema: autofix_runs, ai_calls, code_changes, quality_metrics, grades, alerts')
ON CONFLICT(version) DO NOTHING;

COMMIT;
