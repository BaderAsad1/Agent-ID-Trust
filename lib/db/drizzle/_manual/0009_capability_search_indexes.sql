CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS agents_handle_trgm_idx ON agents USING GIN (handle gin_trgm_ops);
CREATE INDEX IF NOT EXISTS agents_display_name_trgm_idx ON agents USING GIN (display_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS agents_description_trgm_idx ON agents USING GIN (description gin_trgm_ops);

ALTER TABLE agents ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(handle, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(display_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS agents_search_vector_idx ON agents USING GIN (search_vector);
