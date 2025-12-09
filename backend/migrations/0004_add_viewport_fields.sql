-- Add viewport persistence fields to conversations table
ALTER TABLE conversations ADD COLUMN viewport_x REAL;
ALTER TABLE conversations ADD COLUMN viewport_y REAL;
ALTER TABLE conversations ADD COLUMN viewport_zoom REAL;
