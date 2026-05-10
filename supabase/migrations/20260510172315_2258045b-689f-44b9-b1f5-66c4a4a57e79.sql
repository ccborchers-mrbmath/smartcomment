ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS active_term text;
UPDATE public.classes SET active_term = '2026 Term 2' WHERE active_term IS NULL;

ALTER TABLE public.student_inputs ADD COLUMN IF NOT EXISTS term text;
UPDATE public.student_inputs SET term = '2026 Term 2' WHERE term IS NULL;

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS included_terms text[] NOT NULL DEFAULT ARRAY['2026 Term 1','2026 Term 2','2026 Term 3','2026 Term 4'];
UPDATE public.students SET included_terms = ARRAY['2026 Term 1','2026 Term 2','2026 Term 3','2026 Term 4'] WHERE included_terms IS NULL OR array_length(included_terms, 1) IS NULL;