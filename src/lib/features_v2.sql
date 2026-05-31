-- Feature 1: Materials and site access on jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS materials_type text CHECK (materials_type IN ('none', 'requester', 'provider'));
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS access_conditions text[];

-- Feature 2: Public Q&A on jobs
CREATE TABLE IF NOT EXISTS job_questions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid        REFERENCES jobs(id) ON DELETE CASCADE NOT NULL,
  asker_id     uuid        REFERENCES auth.users(id) NOT NULL,
  question     text        NOT NULL,
  answer       text,
  answered_at  timestamptz,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE job_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view questions"
  ON job_questions FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can ask questions"
  ON job_questions FOR INSERT WITH CHECK (auth.uid() = asker_id);

CREATE POLICY "Job owner can answer questions"
  ON job_questions FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_questions.job_id
        AND jobs.requester_id = auth.uid()
    )
  );

-- Feature 2: Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type       text        NOT NULL,
  body       text        NOT NULL,
  metadata   jsonb       DEFAULT '{}',
  read       boolean     DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can create notifications"
  ON notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can mark own notifications read"
  ON notifications FOR UPDATE USING (auth.uid() = user_id);

-- Feature 4: Itemised bids
ALTER TABLE bids ADD COLUMN IF NOT EXISTS line_items         jsonb;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS available_from     text;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS estimated_duration text;
