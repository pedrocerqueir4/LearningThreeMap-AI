-- Add context_ranges column to store span positions as JSON
-- Format: [{"sourceNodeId": "...", "startPos": 13, "endPos": 32}]
ALTER TABLE messages ADD COLUMN context_ranges TEXT DEFAULT NULL;
