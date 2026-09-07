-- safety_qa_history table for storing safety QA multi-turn conversations
CREATE TABLE IF NOT EXISTS public.safety_qa_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_hash TEXT NOT NULL,
  session_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '안전 상담',
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_answer_mode TEXT NOT NULL DEFAULT 'guidance',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days'),
  CONSTRAINT safety_qa_history_scope_hash_length CHECK (char_length(scope_hash) >= 32),
  CONSTRAINT safety_qa_history_messages_array CHECK (jsonb_typeof(messages) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_safety_qa_history_scope_updated
  ON public.safety_qa_history (scope_hash, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_safety_qa_history_session
  ON public.safety_qa_history (session_id);

CREATE INDEX IF NOT EXISTS idx_safety_qa_history_expires_at
  ON public.safety_qa_history (expires_at);
