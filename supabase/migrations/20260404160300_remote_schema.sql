--
-- PostgreSQL database dump
--

\restrict 6vPW2kXG9NVkhvfnKRy7axBZakTyMdu7bvvKlpMnZI15tarKmPeNfIoimpVF3ai

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: set_workflow_history_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_workflow_history_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.availability (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    day_of_week integer NOT NULL,
    period integer NOT NULL
);


--
-- Name: leave_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leave_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    day_of_week integer NOT NULL,
    period integer NOT NULL,
    reason text,
    status text DEFAULT 'pending'::text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    day_of_week integer NOT NULL,
    period integer NOT NULL
);

ALTER TABLE ONLY public.schedule REPLICA IDENTITY FULL;


--
-- Name: schedule_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    schedule_data jsonb NOT NULL,
    generated_at timestamp without time zone DEFAULT now(),
    note text
);


--
-- Name: subsidy_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subsidy_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    source_type text DEFAULT 'schedule'::text NOT NULL,
    record_month text NOT NULL,
    month_start date NOT NULL,
    month_end date NOT NULL,
    preparer_name text,
    preparer_phone text,
    prepared_date date NOT NULL,
    rows_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    over_limit_notes_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    total_hours numeric(10,1) DEFAULT 0 NOT NULL,
    total_amount numeric(10,2) DEFAULT 0 NOT NULL,
    exported_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT subsidy_records_source_type_check CHECK ((source_type = ANY (ARRAY['schedule'::text, 'record_copy'::text]))),
    CONSTRAINT subsidy_records_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'exported'::text])))
);

ALTER TABLE ONLY public.subsidy_records REPLICA IDENTITY FULL;


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    id uuid NOT NULL,
    phone text,
    updated_at timestamp without time zone DEFAULT now(),
    student_id text,
    department text,
    major text,
    student_type text,
    grade text
);

ALTER TABLE ONLY public.user_profiles REPLICA IDENTITY FULL;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    role text DEFAULT 'user'::text,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'user'::text])))
);


--
-- Name: workflow_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    input_text text NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    now_count integer DEFAULT 0 NOT NULL,
    research_count integer DEFAULT 0 NOT NULL,
    top_title text,
    top_description text,
    checklist jsonb DEFAULT '[]'::jsonb NOT NULL,
    next_suggestion text,
    shared_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: availability availability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability
    ADD CONSTRAINT availability_pkey PRIMARY KEY (id);


--
-- Name: availability availability_user_id_day_of_week_period_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability
    ADD CONSTRAINT availability_user_id_day_of_week_period_key UNIQUE (user_id, day_of_week, period);


--
-- Name: leave_requests leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_pkey PRIMARY KEY (id);


--
-- Name: schedule schedule_day_of_week_period_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule
    ADD CONSTRAINT schedule_day_of_week_period_key UNIQUE (day_of_week, period);


--
-- Name: schedule_history schedule_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_history
    ADD CONSTRAINT schedule_history_pkey PRIMARY KEY (id);


--
-- Name: schedule schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule
    ADD CONSTRAINT schedule_pkey PRIMARY KEY (id);


--
-- Name: subsidy_records subsidy_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subsidy_records
    ADD CONSTRAINT subsidy_records_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: workflow_history workflow_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_history
    ADD CONSTRAINT workflow_history_pkey PRIMARY KEY (id);


--
-- Name: idx_subsidy_records_record_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subsidy_records_record_month ON public.subsidy_records USING btree (record_month);


--
-- Name: idx_subsidy_records_status_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subsidy_records_status_updated_at ON public.subsidy_records USING btree (status, updated_at DESC);


--
-- Name: workflow_history_user_id_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflow_history_user_id_updated_at_idx ON public.workflow_history USING btree (user_id, updated_at DESC);


--
-- Name: workflow_history workflow_history_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workflow_history_set_updated_at BEFORE UPDATE ON public.workflow_history FOR EACH ROW EXECUTE FUNCTION public.set_workflow_history_updated_at();


--
-- Name: availability availability_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.availability
    ADD CONSTRAINT availability_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: leave_requests leave_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: schedule schedule_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule
    ADD CONSTRAINT schedule_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_profiles user_profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: workflow_history workflow_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_history
    ADD CONSTRAINT workflow_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: leave_requests Allow all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all" ON public.leave_requests USING (true) WITH CHECK (true);


--
-- Name: schedule_history Allow all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all" ON public.schedule_history USING (true) WITH CHECK (true);


--
-- Name: subsidy_records Allow all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all" ON public.subsidy_records USING (true) WITH CHECK (true);


--
-- Name: user_profiles Allow all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all" ON public.user_profiles USING (true) WITH CHECK (true);


--
-- Name: availability Allow all operations for anonymous users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all operations for anonymous users" ON public.availability TO anon USING (true) WITH CHECK (true);


--
-- Name: schedule Allow all operations for anonymous users on schedule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all operations for anonymous users on schedule" ON public.schedule TO anon USING (true) WITH CHECK (true);


--
-- Name: users Allow delete for anon users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow delete for anon users" ON public.users FOR DELETE TO anon USING (true);


--
-- Name: availability Allow individual delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow individual delete" ON public.availability FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: schedule Allow individual delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow individual delete" ON public.schedule FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: availability Allow individual insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow individual insert" ON public.availability FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: schedule Allow individual insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow individual insert" ON public.schedule FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: schedule Allow individual read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow individual read" ON public.schedule FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: availability Allow individual update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow individual update" ON public.availability FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: schedule Allow individual update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow individual update" ON public.schedule FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: users Allow insert for anon users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow insert for anon users" ON public.users FOR INSERT TO anon WITH CHECK (true);


--
-- Name: users Allow public read access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access" ON public.users FOR SELECT USING (true);


--
-- Name: users Allow read for anonymous users on users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow read for anonymous users on users" ON public.users FOR SELECT TO anon USING (true);


--
-- Name: availability; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;

--
-- Name: leave_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: schedule; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schedule ENABLE ROW LEVEL SECURITY;

--
-- Name: schedule_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schedule_history ENABLE ROW LEVEL SECURITY;

--
-- Name: subsidy_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subsidy_records ENABLE ROW LEVEL SECURITY;

--
-- Name: user_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workflow_history ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_history workflow_history_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workflow_history_delete_own ON public.workflow_history FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: workflow_history workflow_history_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workflow_history_insert_own ON public.workflow_history FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: workflow_history workflow_history_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workflow_history_select_own ON public.workflow_history FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: workflow_history workflow_history_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workflow_history_update_own ON public.workflow_history FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- PostgreSQL database dump complete
--

\unrestrict 6vPW2kXG9NVkhvfnKRy7axBZakTyMdu7bvvKlpMnZI15tarKmPeNfIoimpVF3ai

