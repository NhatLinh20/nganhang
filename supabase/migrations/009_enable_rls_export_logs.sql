-- 009_enable_rls_export_logs.sql
-- Enable Row Level Security (RLS) for the export_logs table

-- 1. Enable RLS
ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;

-- 2. Create Policy for SELECT (Read)
-- Users can only read their own export logs
CREATE POLICY "Users can view their own export logs"
ON public.export_logs
FOR SELECT
USING (auth.uid() = user_id);

-- 3. Create Policy for INSERT
-- Users can only insert their own export logs
CREATE POLICY "Users can insert their own export logs"
ON public.export_logs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 4. Create Policy for ADMIN (if they need full access)
-- Note: Admin uses service role key or a specific admin policy, but usually service_role bypasses RLS anyway.
-- If admin accesses via client, we can grant them access.
CREATE POLICY "Admins can view all export logs"
ON public.export_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() AND users.role = 'admin'
  )
);
