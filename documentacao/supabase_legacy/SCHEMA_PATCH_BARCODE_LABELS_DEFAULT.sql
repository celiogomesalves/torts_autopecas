
-- Add is_default column to barcode_labels table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'barcode_labels'
        AND column_name = 'is_default'
    ) THEN
        ALTER TABLE barcode_labels ADD COLUMN is_default BOOLEAN DEFAULT FALSE;
    END IF;
END $$;
