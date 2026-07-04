-- Migration: Create question_audio table for Gemini TTS
CREATE TABLE public.question_audio (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references public.questions(id) on delete cascade not null,
  part text check (part in ('question', 'solution')) not null,
  voice text not null,
  content_hash text not null,
  audio_url text not null,
  created_at timestamptz default now() not null,
  unique (question_id, part, voice, content_hash)
);

-- Enable RLS
ALTER TABLE public.question_audio ENABLE ROW LEVEL SECURITY;

-- Allow read access for authenticated users
CREATE POLICY "Allow read access for authenticated users on question_audio"
  ON public.question_audio
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow insert access for authenticated users
CREATE POLICY "Allow insert access for authenticated users on question_audio"
  ON public.question_audio
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
