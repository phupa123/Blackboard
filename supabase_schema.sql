-- Supabase SQL Schema for Blackboard Library
-- Copy and paste this into Supabase SQL Editor and click 'Run'

-- 1. Create the items table
CREATE TABLE IF NOT EXISTS public.items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'General',
    status TEXT DEFAULT 'use' CHECK (status IN ('use', 'not_use')),
    created_by TEXT DEFAULT 'Anonymous'
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

-- 3. Create policies for public access (or change as appropriate for your auth rules)
-- Allow anyone to read items
CREATE POLICY "Allow public read access" 
ON public.items FOR SELECT 
USING (true);

-- Allow anyone to insert items
CREATE POLICY "Allow public insert access" 
ON public.items FOR INSERT 
WITH CHECK (true);

-- Allow anyone to update items (such as changing status 'use' / 'not_use')
CREATE POLICY "Allow public update access" 
ON public.items FOR UPDATE 
USING (true);

-- Allow anyone to delete items
CREATE POLICY "Allow public delete access" 
ON public.items FOR DELETE 
USING (true);

-- 4. Enable Supabase Realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.items;
