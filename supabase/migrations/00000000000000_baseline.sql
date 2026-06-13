--
-- PostgreSQL database dump
--

\restrict Ac8Urt4CsL13Sboy9YOvTdv3Lp809riHhz3OAZD7cIGdYL4R0pgrNvc4gXdvRy5

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10

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
-- Name: enforce_booking_update_rules(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_booking_update_rules() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  actor uuid := auth.uid();
  is_provider boolean;
  is_requester boolean;
  status_changed boolean := new.status is distinct from old.status;
  transition_ok boolean := false;
begin
  -- Service-role / SQL-editor sessions are not subject to these rules.
  if actor is null then
    return new;
  end if;

  is_provider  := actor = old.provider_id;
  is_requester := actor = old.requester_id;

  -- Fixed at creation time, nobody may change them.
  if new.service_id     is distinct from old.service_id
     or new.requester_id is distinct from old.requester_id
     or new.provider_id  is distinct from old.provider_id
     or new.created_at   is distinct from old.created_at
     or new.payment_timing is distinct from old.payment_timing
     or new.quantity      is distinct from old.quantity
     or new.scheduled_date is distinct from old.scheduled_date
     or new.location_name  is distinct from old.location_name
     or new.latitude       is distinct from old.latitude
     or new.longitude      is distinct from old.longitude
     or new.location_note  is distinct from old.location_note
     or new.notes          is distinct from old.notes
  then
    raise exception 'This booking field cannot be changed after creation';
  end if;

  -- Quote and money fields: only the provider, and only while sending a quote.
  if new.quote_amount   is distinct from old.quote_amount
     or new.quote_notes   is distinct from old.quote_notes
     or new.quote_sent_at is distinct from old.quote_sent_at
     or new.total_amount  is distinct from old.total_amount
  then
    if not (is_provider and new.status = 'quote_sent') then
      raise exception 'Quote and amount fields can only be set by the provider when sending a quote';
    end if;
  end if;

  -- Quote acceptance: only the requester, only when accepting a sent quote.
  if new.quote_accepted_at is distinct from old.quote_accepted_at then
    if not (is_requester and old.status = 'quote_sent' and new.status = 'confirmed') then
      raise exception 'Only the requester can accept a quote';
    end if;
  end if;

  -- Cancellation details: only the requester, only while cancelling.
  if new.cancellation_reason is distinct from old.cancellation_reason
     or new.cancellation_note is distinct from old.cancellation_note
  then
    if not (is_requester and new.status in ('withdrawn', 'cancellation_requested')) then
      raise exception 'Cancellation details can only be set by the requester when cancelling';
    end if;
  end if;

  -- Archiving: only the provider, on finished bookings, without a status change.
  if new.provider_archive_at is distinct from old.provider_archive_at then
    if not (is_provider and not status_changed and old.status in ('withdrawn', 'cancelled')) then
      raise exception 'Only the provider can archive a withdrawn or cancelled booking';
    end if;
  end if;

  if status_changed then
    if is_provider then
      transition_ok :=
           (old.status = 'pending'                and new.status in ('confirmed', 'declined', 'cancelled', 'quote_sent'))
        or (old.status = 'quote_sent'             and new.status in ('declined', 'cancelled'))
        or (old.status = 'confirmed'              and new.status in ('in_progress', 'awaiting_completion', 'quote_sent'))
        or (old.status = 'in_progress'            and new.status = 'awaiting_completion')
        or (old.status = 'cancellation_requested' and new.status = 'cancelled');
    end if;

    if not transition_ok and is_requester then
      transition_ok :=
           (old.status in ('pending', 'quote_sent') and new.status = 'withdrawn')
        or (old.status = 'quote_sent'               and new.status = 'confirmed')
        or (old.status in ('confirmed', 'in_progress', 'awaiting_completion') and new.status = 'cancellation_requested')
        or (old.status = 'awaiting_completion'      and new.status = 'completed');
    end if;

    if not transition_ok then
      raise exception 'Booking status cannot change from % to % for this user', old.status, new.status;
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: enforce_job_question_update_rules(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_job_question_update_rules() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  -- Service-role / SQL-editor sessions are not subject to these rules.
  if auth.uid() is null then
    return new;
  end if;

  if new.job_id        is distinct from old.job_id
     or new.asker_id   is distinct from old.asker_id
     or new.question   is distinct from old.question
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Only the answer can be changed on a question';
  end if;

  return new;
end;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'role'
  );
  return new;
end;
$$;


--
-- Name: notify_bid_placed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_bid_placed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_title text;
  v_owner uuid;
begin
  select title, requester_id into v_title, v_owner from jobs where id = new.job_id;
  if v_owner is not null and v_owner <> new.provider_id then
    insert into notifications (user_id, type, body, metadata)
    values (
      v_owner,
      'new_bid',
      format('New bid of $%s NZD on "%s"', new.amount::text, coalesce(v_title, 'your job')),
      jsonb_build_object('job_id', new.job_id)
    );
  end if;
  return new;
exception when others then
  return new;
end;
$_$;


--
-- Name: notify_bid_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_bid_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_title text;
begin
  if new.status = old.status then
    return new;
  end if;

  select title into v_title from jobs where id = new.job_id;

  if new.status = 'accepted' then
    insert into notifications (user_id, type, body, metadata)
    values (
      new.provider_id,
      'bid_accepted',
      format('You got the job! Your bid of $%s NZD on "%s" was accepted.', new.amount::text, coalesce(v_title, 'a job')),
      jsonb_build_object('job_id', new.job_id)
    );
  elsif new.status = 'rejected' and old.status = 'pending' then
    insert into notifications (user_id, type, body, metadata)
    values (
      new.provider_id,
      'bid_rejected',
      format('Your bid on "%s" was not selected this time.', coalesce(v_title, 'a job')),
      jsonb_build_object('job_id', new.job_id)
    );
  end if;

  return new;
exception when others then
  return new;
end;
$_$;


--
-- Name: notify_booking_created(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_booking_created() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_title text;
  v_quote boolean;
begin
  select title, pricing_type = 'quote_required' into v_title, v_quote
  from services where id = new.service_id;
  v_title := coalesce(v_title, 'your service');

  insert into notifications (user_id, type, body, metadata)
  values (
    new.provider_id,
    'new_booking',
    case when coalesce(v_quote, false)
      then format('Quote requested for "%s". Review and send a quote.', v_title)
      else format('New booking request for "%s". Confirm or decline.', v_title)
    end,
    jsonb_build_object('booking_id', new.id, 'service_id', new.service_id)
  );
  return new;
exception when others then
  return new;
end;
$$;


--
-- Name: notify_booking_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_booking_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_title text;
begin
  if new.status = old.status then
    return new;
  end if;

  select title into v_title from services where id = new.service_id;
  v_title := coalesce(v_title, 'your service booking');

  if new.status = 'quote_sent' then
    insert into notifications (user_id, type, body, metadata)
    values (new.requester_id, 'service_quote_sent',
      format('A quote has been sent for "%s".', v_title),
      jsonb_build_object('booking_id', new.id, 'service_id', new.service_id));

  elsif new.status = 'confirmed' and old.status = 'quote_sent' then
    insert into notifications (user_id, type, body, metadata)
    values (new.provider_id, 'service_quote_accepted',
      format('Your quote for "%s" has been accepted.', v_title),
      jsonb_build_object('booking_id', new.id, 'service_id', new.service_id));

  elsif new.status = 'confirmed' and old.status = 'pending' then
    insert into notifications (user_id, type, body, metadata)
    values (new.requester_id, 'booking_confirmed',
      format('Your booking for "%s" has been confirmed by the provider.', v_title),
      jsonb_build_object('booking_id', new.id, 'service_id', new.service_id));

  elsif new.status in ('declined', 'cancelled') and old.status in ('pending', 'quote_sent') then
    insert into notifications (user_id, type, body, metadata)
    values (new.requester_id, 'booking_declined',
      format('Your booking request for "%s" was declined.', v_title),
      jsonb_build_object('booking_id', new.id, 'service_id', new.service_id));

  elsif new.status = 'cancelled' and old.status = 'cancellation_requested' then
    insert into notifications (user_id, type, body, metadata)
    values (new.requester_id, 'booking_cancelled',
      format('Your cancellation of "%s" has been confirmed.', v_title),
      jsonb_build_object('booking_id', new.id, 'service_id', new.service_id));

  elsif new.status = 'withdrawn' then
    insert into notifications (user_id, type, body, metadata)
    values (new.provider_id, 'service_booking_withdrawn',
      format('A service request for "%s" has been withdrawn.', v_title),
      jsonb_build_object('booking_id', new.id, 'service_id', new.service_id));

  elsif new.status = 'awaiting_completion' then
    insert into notifications (user_id, type, body, metadata)
    values (new.requester_id, 'booking_ready',
      format('The provider says "%s" is complete. Please confirm.', v_title),
      jsonb_build_object('booking_id', new.id, 'service_id', new.service_id));

  elsif new.status = 'completed' then
    insert into notifications (user_id, type, body, metadata)
    values (new.provider_id, 'booking_completed',
      format('"%s" has been confirmed complete. You can now review the requester.', v_title),
      jsonb_build_object('booking_id', new.id, 'service_id', new.service_id));

  elsif new.status = 'cancellation_requested' then
    insert into notifications (user_id, type, body, metadata)
    values (new.provider_id, 'booking_cancellation_requested',
      format('The requester has asked to cancel "%s". Please confirm.', v_title),
      jsonb_build_object('booking_id', new.id, 'service_id', new.service_id));
  end if;

  return new;
exception when others then
  return new;
end;
$$;


--
-- Name: notify_job_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_job_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_provider uuid;
begin
  if new.status = old.status then
    return new;
  end if;

  select provider_id into v_provider
  from bids
  where job_id = new.id and status = 'accepted'
  limit 1;

  if v_provider is null then
    return new;
  end if;

  if new.status = 'cancelled' and old.status in ('accepted', 'in_progress') then
    insert into notifications (user_id, type, body, metadata)
    values (
      v_provider,
      'job_cancelled',
      format('The job "%s" has been cancelled by the requester.', coalesce(new.title, 'a job')),
      jsonb_build_object('job_id', new.id)
    );
  elsif new.status = 'completed' then
    insert into notifications (user_id, type, body, metadata)
    values (
      v_provider,
      'job_completed',
      format('"%s" has been confirmed complete. You can now review the requester.', coalesce(new.title, 'A job')),
      jsonb_build_object('job_id', new.id)
    );
  end if;

  return new;
exception when others then
  return new;
end;
$$;


--
-- Name: notify_new_question(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_new_question() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_title text;
  v_owner uuid;
begin
  select title, requester_id into v_title, v_owner from jobs where id = new.job_id;
  if v_owner is not null and v_owner <> new.asker_id then
    insert into notifications (user_id, type, body, metadata)
    values (
      v_owner,
      'new_question',
      format('New question on your job "%s"', coalesce(v_title, 'your job')),
      jsonb_build_object('job_id', new.job_id)
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;


--
-- Name: notify_question_answered(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_question_answered() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_title text;
begin
  select title into v_title from jobs where id = new.job_id;
  insert into notifications (user_id, type, body, metadata)
  values (
    new.asker_id,
    'question_answered',
    format('Your question on "%s" has been answered', coalesce(v_title, 'a job')),
    jsonb_build_object('job_id', new.job_id)
  );
  return new;
exception when others then
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: bids; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bids (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid,
    provider_id uuid,
    amount numeric NOT NULL,
    message text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    line_items jsonb,
    available_from text,
    estimated_duration text,
    CONSTRAINT bids_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text])))
);


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_id uuid,
    requester_id uuid,
    provider_id uuid,
    quantity numeric DEFAULT 1 NOT NULL,
    total_amount numeric NOT NULL,
    payment_timing text,
    status text DEFAULT 'pending'::text,
    scheduled_date text,
    scheduled_time text,
    location_name text,
    notes text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    latitude numeric,
    longitude numeric,
    location_note text,
    quote_amount numeric,
    quote_notes text,
    quote_sent_at timestamp with time zone,
    quote_accepted_at timestamp with time zone,
    provider_archive_at timestamp with time zone,
    cancellation_reason text,
    cancellation_note text,
    CONSTRAINT bookings_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'quote_sent'::text, 'confirmed'::text, 'in_progress'::text, 'awaiting_completion'::text, 'cancellation_requested'::text, 'completed'::text, 'withdrawn'::text, 'cancelled'::text, 'declined'::text])))
);


--
-- Name: job_checkins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_checkins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid,
    user_id uuid,
    latitude numeric NOT NULL,
    longitude numeric NOT NULL,
    checkin_type text,
    photo_url text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    CONSTRAINT job_checkins_checkin_type_check CHECK ((checkin_type = ANY (ARRAY['arrived'::text, 'progress_photo'::text, 'completed'::text])))
);


--
-- Name: job_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid,
    asker_id uuid,
    question text NOT NULL,
    answer text,
    answered_by uuid,
    answered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);


--
-- Name: jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requester_id uuid,
    title text NOT NULL,
    description text NOT NULL,
    category text,
    price_type text,
    price numeric,
    status text DEFAULT 'open'::text,
    latitude numeric,
    longitude numeric,
    location_name text,
    photos text[],
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    schedule_type text DEFAULT 'flexible'::text,
    scheduled_date text,
    scheduled_time text,
    area_polygon jsonb,
    area_hectares numeric,
    location_note text,
    materials_type text,
    access_conditions text[],
    cancellation_reason text,
    cancellation_note text,
    CONSTRAINT jobs_materials_type_check CHECK ((materials_type = ANY (ARRAY['none'::text, 'requester'::text, 'provider'::text]))),
    CONSTRAINT jobs_price_type_check CHECK ((price_type = ANY (ARRAY['fixed'::text, 'open'::text]))),
    CONSTRAINT jobs_status_check CHECK ((status = ANY (ARRAY['open'::text, 'accepted'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    receiver_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    data jsonb,
    read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text,
    phone text,
    role text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    primary_role text DEFAULT 'requester'::text,
    onboarding_completed boolean DEFAULT false,
    display_name text,
    bio text,
    skills text[],
    qualifications text[],
    region text,
    address text,
    latitude numeric,
    longitude numeric,
    CONSTRAINT profiles_primary_role_check CHECK ((primary_role = ANY (ARRAY['requester'::text, 'provider'::text, 'both'::text]))),
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['requester'::text, 'provider'::text])))
);


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid,
    reviewer_id uuid NOT NULL,
    reviewee_id uuid NOT NULL,
    reviewer_role text NOT NULL,
    reviewee_role text NOT NULL,
    rating integer NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    booking_id uuid,
    CONSTRAINT reviews_job_or_booking_check CHECK (((job_id IS NOT NULL) OR (booking_id IS NOT NULL))),
    CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT reviews_reviewee_role_check CHECK ((reviewee_role = ANY (ARRAY['requester'::text, 'provider'::text]))),
    CONSTRAINT reviews_reviewer_role_check CHECK ((reviewer_role = ANY (ARRAY['requester'::text, 'provider'::text])))
);


--
-- Name: service_booking_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_booking_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    receiver_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: service_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id uuid NOT NULL,
    source_type text NOT NULL,
    source_image_path text,
    source_url text,
    extracted_text text,
    ai_raw_json jsonb,
    title text,
    category text,
    short_description text,
    full_description text,
    service_area text,
    pricing_type text,
    price_amount numeric,
    pricing_notes text,
    availability text,
    equipment text[] DEFAULT '{}'::text[] NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    contact_details_found text[] DEFAULT '{}'::text[] NOT NULL,
    missing_fields text[] DEFAULT '{}'::text[] NOT NULL,
    confidence_notes text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT service_drafts_source_type_check CHECK ((source_type = ANY (ARRAY['manual'::text, 'photo'::text, 'url'::text]))),
    CONSTRAINT service_drafts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'needs_review'::text, 'ready_to_publish'::text, 'published'::text])))
);


--
-- Name: services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id uuid,
    title text NOT NULL,
    description text,
    category text,
    pricing_type text,
    unit_label text,
    rate numeric NOT NULL,
    minimum_units numeric DEFAULT 1,
    travel_range_km numeric,
    availability text[],
    payment_timing text,
    includes_equipment boolean DEFAULT false,
    is_active boolean DEFAULT true,
    photos text[],
    location_name text,
    latitude numeric,
    longitude numeric,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    service_latitude numeric,
    service_longitude numeric,
    CONSTRAINT services_payment_timing_check CHECK ((payment_timing = ANY (ARRAY['upfront'::text, 'on_completion'::text]))),
    CONSTRAINT services_pricing_type_check CHECK ((pricing_type = ANY (ARRAY['hourly'::text, 'fixed'::text, 'per_unit'::text, 'day_rate'::text, 'quote_required'::text])))
);


--
-- Name: user_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    event_type text NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);


--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_preferences (
    user_id uuid NOT NULL,
    preferred_categories text[],
    preferred_regions text[],
    active_hours jsonb,
    last_seen_at timestamp with time zone,
    notification_preferences jsonb,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);


--
-- Name: watchlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.watchlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    job_id uuid,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);


--
-- Name: bids bids_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bids
    ADD CONSTRAINT bids_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: job_checkins job_checkins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_checkins
    ADD CONSTRAINT job_checkins_pkey PRIMARY KEY (id);


--
-- Name: job_questions job_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_questions
    ADD CONSTRAINT job_questions_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: service_booking_messages service_booking_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_booking_messages
    ADD CONSTRAINT service_booking_messages_pkey PRIMARY KEY (id);


--
-- Name: service_drafts service_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_drafts
    ADD CONSTRAINT service_drafts_pkey PRIMARY KEY (id);


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: user_activity user_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activity
    ADD CONSTRAINT user_activity_pkey PRIMARY KEY (id);


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: watchlist watchlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_pkey PRIMARY KEY (id);


--
-- Name: watchlist watchlist_user_id_job_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_user_id_job_id_key UNIQUE (user_id, job_id);


--
-- Name: reviews_booking_reviewer_role_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX reviews_booking_reviewer_role_unique ON public.reviews USING btree (booking_id, reviewer_id, reviewer_role) WHERE (booking_id IS NOT NULL);


--
-- Name: reviews_job_reviewer_role_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX reviews_job_reviewer_role_unique ON public.reviews USING btree (job_id, reviewer_id, reviewer_role) WHERE (job_id IS NOT NULL);


--
-- Name: service_booking_messages_booking_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_booking_messages_booking_created_idx ON public.service_booking_messages USING btree (booking_id, created_at);


--
-- Name: bids bids_notify_placed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bids_notify_placed AFTER INSERT ON public.bids FOR EACH ROW EXECUTE FUNCTION public.notify_bid_placed();


--
-- Name: bids bids_notify_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bids_notify_status_change AFTER UPDATE ON public.bids FOR EACH ROW EXECUTE FUNCTION public.notify_bid_status_change();


--
-- Name: bookings bookings_enforce_update_rules; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bookings_enforce_update_rules BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_update_rules();


--
-- Name: bookings bookings_notify_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bookings_notify_created AFTER INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.notify_booking_created();


--
-- Name: bookings bookings_notify_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bookings_notify_status_change AFTER UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.notify_booking_status_change();


--
-- Name: job_questions job_questions_enforce_update_rules; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER job_questions_enforce_update_rules BEFORE UPDATE ON public.job_questions FOR EACH ROW EXECUTE FUNCTION public.enforce_job_question_update_rules();


--
-- Name: job_questions job_questions_notify_answered; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER job_questions_notify_answered AFTER UPDATE ON public.job_questions FOR EACH ROW WHEN (((new.answer IS NOT NULL) AND (new.answer IS DISTINCT FROM old.answer))) EXECUTE FUNCTION public.notify_question_answered();


--
-- Name: job_questions job_questions_notify_new; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER job_questions_notify_new AFTER INSERT ON public.job_questions FOR EACH ROW EXECUTE FUNCTION public.notify_new_question();


--
-- Name: jobs jobs_notify_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER jobs_notify_status_change AFTER UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.notify_job_status_change();


--
-- Name: bids bids_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bids
    ADD CONSTRAINT bids_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;


--
-- Name: bids bids_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bids
    ADD CONSTRAINT bids_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: bookings bookings_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: bookings bookings_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: bookings bookings_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- Name: job_checkins job_checkins_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_checkins
    ADD CONSTRAINT job_checkins_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;


--
-- Name: job_checkins job_checkins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_checkins
    ADD CONSTRAINT job_checkins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: job_questions job_questions_answered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_questions
    ADD CONSTRAINT job_questions_answered_by_fkey FOREIGN KEY (answered_by) REFERENCES auth.users(id);


--
-- Name: job_questions job_questions_asker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_questions
    ADD CONSTRAINT job_questions_asker_id_fkey FOREIGN KEY (asker_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: job_questions job_questions_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_questions
    ADD CONSTRAINT job_questions_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;


--
-- Name: jobs jobs_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: messages messages_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;


--
-- Name: messages messages_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES auth.users(id);


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id);


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_reviewee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_reviewee_id_fkey FOREIGN KEY (reviewee_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: service_booking_messages service_booking_messages_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_booking_messages
    ADD CONSTRAINT service_booking_messages_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: service_booking_messages service_booking_messages_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_booking_messages
    ADD CONSTRAINT service_booking_messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: service_booking_messages service_booking_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_booking_messages
    ADD CONSTRAINT service_booking_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: service_drafts service_drafts_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_drafts
    ADD CONSTRAINT service_drafts_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: services services_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_activity user_activity_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activity
    ADD CONSTRAINT user_activity_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_preferences user_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: watchlist watchlist_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;


--
-- Name: watchlist watchlist_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: notifications Anyone can insert notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);


--
-- Name: services Anyone can view active services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active services" ON public.services FOR SELECT USING ((is_active = true));


--
-- Name: bids Anyone can view bids; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view bids" ON public.bids FOR SELECT USING (true);


--
-- Name: jobs Anyone can view open jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view open jobs" ON public.jobs FOR SELECT USING (true);


--
-- Name: profiles Anyone can view profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view profiles" ON public.profiles FOR SELECT USING (true);


--
-- Name: job_questions Anyone can view questions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view questions" ON public.job_questions FOR SELECT USING (true);


--
-- Name: service_booking_messages Booking participants can create service booking messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Booking participants can create service booking messages" ON public.service_booking_messages FOR INSERT TO authenticated WITH CHECK (((auth.uid() = sender_id) AND (EXISTS ( SELECT 1
   FROM public.bookings b
  WHERE ((b.id = service_booking_messages.booking_id) AND ((auth.uid() = b.requester_id) OR (auth.uid() = b.provider_id)) AND ((service_booking_messages.receiver_id = b.requester_id) OR (service_booking_messages.receiver_id = b.provider_id)))))));


--
-- Name: service_booking_messages Booking participants can read service booking messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Booking participants can read service booking messages" ON public.service_booking_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.bookings b
  WHERE ((b.id = service_booking_messages.booking_id) AND ((auth.uid() = b.requester_id) OR (auth.uid() = b.provider_id))))));


--
-- Name: job_questions Logged in users can ask questions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Logged in users can ask questions" ON public.job_questions FOR INSERT WITH CHECK ((auth.uid() = asker_id));


--
-- Name: service_drafts Providers can create their own service drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Providers can create their own service drafts" ON public.service_drafts FOR INSERT TO authenticated WITH CHECK ((auth.uid() = provider_id));


--
-- Name: services Providers can create their own services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Providers can create their own services" ON public.services FOR INSERT TO authenticated WITH CHECK ((auth.uid() = provider_id));


--
-- Name: service_drafts Providers can delete their own service drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Providers can delete their own service drafts" ON public.service_drafts FOR DELETE TO authenticated USING ((auth.uid() = provider_id));


--
-- Name: bids Providers can insert bids; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Providers can insert bids" ON public.bids FOR INSERT WITH CHECK ((auth.uid() = provider_id));


--
-- Name: service_drafts Providers can read their own service drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Providers can read their own service drafts" ON public.service_drafts FOR SELECT TO authenticated USING ((auth.uid() = provider_id));


--
-- Name: services Providers can read their own services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Providers can read their own services" ON public.services FOR SELECT TO authenticated USING ((auth.uid() = provider_id));


--
-- Name: bids Providers can update their bids; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Providers can update their bids" ON public.bids FOR UPDATE USING ((auth.uid() = provider_id));


--
-- Name: service_drafts Providers can update their own service drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Providers can update their own service drafts" ON public.service_drafts FOR UPDATE TO authenticated USING ((auth.uid() = provider_id)) WITH CHECK ((auth.uid() = provider_id));


--
-- Name: services Providers can update their own services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Providers can update their own services" ON public.services FOR UPDATE TO authenticated USING ((auth.uid() = provider_id)) WITH CHECK ((auth.uid() = provider_id));


--
-- Name: job_questions Requester can answer questions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Requester can answer questions" ON public.job_questions FOR UPDATE USING ((auth.uid() = ( SELECT jobs.requester_id
   FROM public.jobs
  WHERE (jobs.id = job_questions.job_id))));


--
-- Name: bookings Requesters can create their own bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Requesters can create their own bookings" ON public.bookings FOR INSERT TO authenticated WITH CHECK (((auth.uid() = requester_id) AND (status = 'pending'::text)));


--
-- Name: bookings Requesters can insert bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Requesters can insert bookings" ON public.bookings FOR INSERT WITH CHECK ((auth.uid() = requester_id));


--
-- Name: jobs Requesters can insert jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Requesters can insert jobs" ON public.jobs FOR INSERT WITH CHECK ((auth.uid() = requester_id));


--
-- Name: bids Requesters can update bids on their jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Requesters can update bids on their jobs" ON public.bids FOR UPDATE USING ((auth.uid() = ( SELECT jobs.requester_id
   FROM public.jobs
  WHERE (jobs.id = bids.job_id))));


--
-- Name: jobs Requesters can update their jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Requesters can update their jobs" ON public.jobs FOR UPDATE USING ((auth.uid() = requester_id));


--
-- Name: reviews Reviews are publicly readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Reviews are publicly readable" ON public.reviews FOR SELECT TO authenticated, anon USING (true);


--
-- Name: reviews Users can create their own reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own reviews" ON public.reviews FOR INSERT WITH CHECK ((auth.uid() = reviewer_id));


--
-- Name: bookings Users can delete their bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their bookings" ON public.bookings FOR DELETE USING (((auth.uid() = requester_id) OR (auth.uid() = provider_id)));


--
-- Name: user_activity Users can insert own activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own activity" ON public.user_activity FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: job_checkins Users can manage own checkins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own checkins" ON public.job_checkins USING ((auth.uid() = user_id));


--
-- Name: user_preferences Users can manage own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own preferences" ON public.user_preferences USING ((auth.uid() = user_id));


--
-- Name: messages Users can send messages as themselves; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can send messages as themselves" ON public.messages FOR INSERT WITH CHECK ((auth.uid() = sender_id));


--
-- Name: notifications Users can update own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: bookings Users can update their bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their bookings" ON public.bookings FOR UPDATE USING (((auth.uid() = requester_id) OR (auth.uid() = provider_id)));


--
-- Name: reviews Users can update their own reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own reviews" ON public.reviews FOR UPDATE USING ((auth.uid() = reviewer_id)) WITH CHECK ((auth.uid() = reviewer_id));


--
-- Name: messages Users can view messages they are part of; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view messages they are part of" ON public.messages FOR SELECT USING (((auth.uid() = sender_id) OR (auth.uid() = receiver_id)));


--
-- Name: user_activity Users can view own activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own activity" ON public.user_activity FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: notifications Users can view own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: bookings Users can view their bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their bookings" ON public.bookings FOR SELECT USING (((auth.uid() = requester_id) OR (auth.uid() = provider_id)));


--
-- Name: watchlist Users manage own watchlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own watchlist" ON public.watchlist USING ((auth.uid() = user_id));


--
-- Name: bids; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;

--
-- Name: bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: job_checkins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.job_checkins ENABLE ROW LEVEL SECURITY;

--
-- Name: job_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.job_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: service_booking_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_booking_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: service_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

--
-- Name: user_activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: user_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: watchlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION enforce_booking_update_rules(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_booking_update_rules() TO anon;
GRANT ALL ON FUNCTION public.enforce_booking_update_rules() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_booking_update_rules() TO service_role;


--
-- Name: FUNCTION enforce_job_question_update_rules(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_job_question_update_rules() TO anon;
GRANT ALL ON FUNCTION public.enforce_job_question_update_rules() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_job_question_update_rules() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION notify_bid_placed(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_bid_placed() TO anon;
GRANT ALL ON FUNCTION public.notify_bid_placed() TO authenticated;
GRANT ALL ON FUNCTION public.notify_bid_placed() TO service_role;


--
-- Name: FUNCTION notify_bid_status_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_bid_status_change() TO anon;
GRANT ALL ON FUNCTION public.notify_bid_status_change() TO authenticated;
GRANT ALL ON FUNCTION public.notify_bid_status_change() TO service_role;


--
-- Name: FUNCTION notify_booking_created(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_booking_created() TO anon;
GRANT ALL ON FUNCTION public.notify_booking_created() TO authenticated;
GRANT ALL ON FUNCTION public.notify_booking_created() TO service_role;


--
-- Name: FUNCTION notify_booking_status_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_booking_status_change() TO anon;
GRANT ALL ON FUNCTION public.notify_booking_status_change() TO authenticated;
GRANT ALL ON FUNCTION public.notify_booking_status_change() TO service_role;


--
-- Name: FUNCTION notify_job_status_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_job_status_change() TO anon;
GRANT ALL ON FUNCTION public.notify_job_status_change() TO authenticated;
GRANT ALL ON FUNCTION public.notify_job_status_change() TO service_role;


--
-- Name: FUNCTION notify_new_question(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_new_question() TO anon;
GRANT ALL ON FUNCTION public.notify_new_question() TO authenticated;
GRANT ALL ON FUNCTION public.notify_new_question() TO service_role;


--
-- Name: FUNCTION notify_question_answered(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_question_answered() TO anon;
GRANT ALL ON FUNCTION public.notify_question_answered() TO authenticated;
GRANT ALL ON FUNCTION public.notify_question_answered() TO service_role;


--
-- Name: TABLE bids; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bids TO anon;
GRANT ALL ON TABLE public.bids TO authenticated;
GRANT ALL ON TABLE public.bids TO service_role;


--
-- Name: TABLE bookings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bookings TO anon;
GRANT ALL ON TABLE public.bookings TO authenticated;
GRANT ALL ON TABLE public.bookings TO service_role;


--
-- Name: TABLE job_checkins; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.job_checkins TO anon;
GRANT ALL ON TABLE public.job_checkins TO authenticated;
GRANT ALL ON TABLE public.job_checkins TO service_role;


--
-- Name: TABLE job_questions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.job_questions TO anon;
GRANT ALL ON TABLE public.job_questions TO authenticated;
GRANT ALL ON TABLE public.job_questions TO service_role;


--
-- Name: TABLE jobs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.jobs TO anon;
GRANT ALL ON TABLE public.jobs TO authenticated;
GRANT ALL ON TABLE public.jobs TO service_role;


--
-- Name: TABLE messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.messages TO anon;
GRANT ALL ON TABLE public.messages TO authenticated;
GRANT ALL ON TABLE public.messages TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE reviews; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reviews TO anon;
GRANT ALL ON TABLE public.reviews TO authenticated;
GRANT ALL ON TABLE public.reviews TO service_role;


--
-- Name: TABLE service_booking_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.service_booking_messages TO anon;
GRANT ALL ON TABLE public.service_booking_messages TO authenticated;
GRANT ALL ON TABLE public.service_booking_messages TO service_role;


--
-- Name: TABLE service_drafts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.service_drafts TO anon;
GRANT ALL ON TABLE public.service_drafts TO authenticated;
GRANT ALL ON TABLE public.service_drafts TO service_role;


--
-- Name: TABLE services; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.services TO anon;
GRANT ALL ON TABLE public.services TO authenticated;
GRANT ALL ON TABLE public.services TO service_role;


--
-- Name: TABLE user_activity; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_activity TO anon;
GRANT ALL ON TABLE public.user_activity TO authenticated;
GRANT ALL ON TABLE public.user_activity TO service_role;


--
-- Name: TABLE user_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_preferences TO anon;
GRANT ALL ON TABLE public.user_preferences TO authenticated;
GRANT ALL ON TABLE public.user_preferences TO service_role;


--
-- Name: TABLE watchlist; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.watchlist TO anon;
GRANT ALL ON TABLE public.watchlist TO authenticated;
GRANT ALL ON TABLE public.watchlist TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict Ac8Urt4CsL13Sboy9YOvTdv3Lp809riHhz3OAZD7cIGdYL4R0pgrNvc4gXdvRy5

