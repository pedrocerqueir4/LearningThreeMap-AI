ALTER TABLE nodes ADD COLUMN pos_x REAL;
ALTER TABLE nodes ADD COLUMN pos_y REAL;

CREATE INDEX IF NOT EXISTS idx_nodes_position ON nodes(conversation_id, pos_x, pos_y);
