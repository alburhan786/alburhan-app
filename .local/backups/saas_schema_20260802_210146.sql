--
-- PostgreSQL database dump
--

\restrict 0TE1Nn9gGYCNMsMUXgHOdyCgAFwchIc2l2nBodwqaBrfm27ENqpt6K7SjAbGTMv

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: blood_group; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.blood_group AS ENUM (
    'A+',
    'A-',
    'B+',
    'B-',
    'AB+',
    'AB-',
    'O+',
    'O-',
    'unknown'
);


ALTER TYPE public.blood_group OWNER TO postgres;

--
-- Name: booking_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.booking_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'confirmed',
    'cancelled',
    'partially_paid'
);


ALTER TYPE public.booking_status OWNER TO postgres;

--
-- Name: document_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.document_type AS ENUM (
    'passport',
    'pan_card',
    'aadhaar',
    'passport_photo',
    'flight_ticket',
    'visa',
    'room_allotment',
    'bus_allotment',
    'model_contract',
    'tour_itinerary',
    'other',
    'hotel_voucher',
    'payment_receipt',
    'ziyarat_schedule',
    'insurance',
    'hajj_id',
    'luggage_tag',
    'emergency_contact_card',
    'medical_certificate',
    'vaccination_certificate',
    'passport_copy'
);


ALTER TYPE public.document_type OWNER TO postgres;

--
-- Name: document_uploaded_by; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.document_uploaded_by AS ENUM (
    'customer',
    'admin'
);


ALTER TYPE public.document_uploaded_by OWNER TO postgres;

--
-- Name: feedback_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.feedback_status AS ENUM (
    'open',
    'in_progress',
    'resolved'
);


ALTER TYPE public.feedback_status OWNER TO postgres;

--
-- Name: gender_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.gender_type AS ENUM (
    'male',
    'female',
    'other'
);


ALTER TYPE public.gender_type OWNER TO postgres;

--
-- Name: kyc_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.kyc_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE public.kyc_status OWNER TO postgres;

--
-- Name: media_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.media_type AS ENUM (
    'image',
    'video'
);


ALTER TYPE public.media_type OWNER TO postgres;

--
-- Name: package_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.package_type AS ENUM (
    'umrah',
    'ramadan_umrah',
    'hajj',
    'special_hajj',
    'iraq_ziyarat',
    'baitul_muqaddas',
    'syria_ziyarat',
    'jordan_heritage'
);


ALTER TYPE public.package_type OWNER TO postgres;

--
-- Name: payment_mode; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.payment_mode AS ENUM (
    'cash',
    'neft',
    'upi',
    'cheque',
    'online'
);


ALTER TYPE public.payment_mode OWNER TO postgres;

--
-- Name: reminder_channel; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.reminder_channel AS ENUM (
    'whatsapp',
    'sms'
);


ALTER TYPE public.reminder_channel OWNER TO postgres;

--
-- Name: reminder_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.reminder_status AS ENUM (
    'sent',
    'failed',
    'skipped'
);


ALTER TYPE public.reminder_status OWNER TO postgres;

--
-- Name: request_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.request_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE public.request_status OWNER TO postgres;

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_role AS ENUM (
    'customer',
    'admin',
    'branch_manager',
    'agent',
    'staff',
    'super_admin'
);


ALTER TYPE public.user_role OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account_opening_balances; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.account_opening_balances (
    id text NOT NULL,
    account_id text NOT NULL,
    financial_year_id text NOT NULL,
    opening_balance numeric(14,2) DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.account_opening_balances OWNER TO postgres;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.accounts (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    sub_type text,
    parent_id text,
    opening_balance numeric(14,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.accounts OWNER TO postgres;

--
-- Name: admin_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admin_events (
    id integer NOT NULL,
    event_type text NOT NULL,
    title text NOT NULL,
    description text,
    booking_id text,
    customer_name text,
    severity text DEFAULT 'info'::text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.admin_events OWNER TO postgres;

--
-- Name: admin_events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.admin_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.admin_events_id_seq OWNER TO postgres;

--
-- Name: admin_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.admin_events_id_seq OWNED BY public.admin_events.id;


--
-- Name: admin_notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admin_notifications (
    id text NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body jsonb DEFAULT '{}'::jsonb NOT NULL,
    booking_id text,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.admin_notifications OWNER TO postgres;

--
-- Name: agent_commissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.agent_commissions (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    booking_id text NOT NULL,
    booking_number text,
    agent_id text NOT NULL,
    agent_name text,
    base_amount numeric(12,2) DEFAULT 0 NOT NULL,
    commission_rate numeric(5,2) DEFAULT 0 NOT NULL,
    commission_amount numeric(12,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    approved_by text,
    approved_at timestamp with time zone,
    paid_at timestamp with time zone,
    payment_mode text,
    payment_reference text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.agent_commissions OWNER TO postgres;

--
-- Name: agent_wallet_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.agent_wallet_transactions (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    agent_id text NOT NULL,
    type text NOT NULL,
    amount numeric(12,2) NOT NULL,
    reference_id text,
    reference_type text,
    balance_after numeric(12,2),
    notes text,
    created_by text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.agent_wallet_transactions OWNER TO postgres;

--
-- Name: agents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    mobile text,
    email text,
    city text,
    branch_id uuid,
    commission_rate numeric(5,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


ALTER TABLE public.agents OWNER TO postgres;

--
-- Name: agreement_audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.agreement_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agreement_id text NOT NULL,
    action text NOT NULL,
    details jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.agreement_audit_logs OWNER TO postgres;

--
-- Name: agreements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.agreements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agreement_number text NOT NULL,
    booking_id text NOT NULL,
    customer_id text,
    status text DEFAULT 'draft'::text NOT NULL,
    terms_accepted jsonb,
    signature_data text,
    signed_at timestamp with time zone,
    signed_ip text,
    signed_user_agent text,
    otp_verified boolean DEFAULT false,
    otp_verified_at timestamp with time zone,
    signing_otp text,
    signing_otp_expires_at timestamp with time zone,
    pdf_generated boolean DEFAULT false,
    verification_token text DEFAULT gen_random_uuid(),
    cancelled_at timestamp with time zone,
    cancelled_reason text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    hotel_info jsonb,
    flight_info jsonb,
    signing_metadata jsonb,
    digital_hash text,
    revision_number integer DEFAULT 1,
    void_at timestamp with time zone,
    void_reason text,
    access_token text,
    access_token_expires_at timestamp with time zone,
    superseded_at timestamp with time zone,
    superseded_reason text,
    tcs_amount numeric(12,2),
    gst_amount numeric(12,2),
    discount_amount numeric(12,2),
    superseded_by_admin_id text,
    correction_reason text,
    old_data_snapshot jsonb,
    new_data_snapshot jsonb
);


ALTER TABLE public.agreements OWNER TO postgres;

--
-- Name: ai_conversation_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_conversation_messages (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    conversation_id text NOT NULL,
    direction text NOT NULL,
    sender_type text NOT NULL,
    channel text NOT NULL,
    message_type text DEFAULT 'text'::text NOT NULL,
    message_text text NOT NULL,
    provider_message_id text,
    request_id text,
    ai_model text,
    tool_calls jsonb,
    confidence numeric(4,3),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_conversation_messages_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))),
    CONSTRAINT ai_conversation_messages_sender_type_check CHECK ((sender_type = ANY (ARRAY['customer'::text, 'ai'::text, 'staff'::text, 'system'::text])))
);


ALTER TABLE public.ai_conversation_messages OWNER TO postgres;

--
-- Name: ai_conversations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_conversations (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    conversation_key text NOT NULL,
    channel text NOT NULL,
    external_contact_id text,
    customer_id text,
    lead_id text,
    booking_id text,
    customer_name text,
    mobile_masked text,
    language text DEFAULT 'en'::text NOT NULL,
    status text DEFAULT 'ai_active'::text NOT NULL,
    last_ai_message_at timestamp with time zone,
    last_customer_message_at timestamp with time zone,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_conversations_status_check CHECK ((status = ANY (ARRAY['ai_active'::text, 'human_required'::text, 'human_active'::text, 'closed'::text])))
);


ALTER TABLE public.ai_conversations OWNER TO postgres;

--
-- Name: ai_knowledge_base; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_knowledge_base (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    category text NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    language text DEFAULT 'en'::text NOT NULL,
    tags jsonb,
    sort_order integer,
    version integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    approval_status text DEFAULT 'pending'::text NOT NULL,
    approved_by text,
    is_active boolean DEFAULT true NOT NULL,
    last_reviewed_at timestamp with time zone,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_knowledge_base_approval_status_check CHECK ((approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT ai_knowledge_base_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text, 'archived'::text])))
);


ALTER TABLE public.ai_knowledge_base OWNER TO postgres;

--
-- Name: airline_master; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.airline_master (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    iata_code text,
    icao_code text,
    name text NOT NULL,
    country text,
    logo_url text,
    contact text,
    is_active boolean DEFAULT true,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.airline_master OWNER TO postgres;

--
-- Name: api_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.api_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    api_url text,
    api_key_encrypted text,
    extra_fields_encrypted text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by text,
    status text DEFAULT 'unknown'::text,
    last_tested timestamp with time zone,
    last_sms_status text,
    last_sms_at timestamp with time zone,
    key text,
    value text
);


ALTER TABLE public.api_settings OWNER TO postgres;

--
-- Name: assets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.assets (
    id text NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'other'::text NOT NULL,
    purchase_date text NOT NULL,
    purchase_price numeric(14,2) DEFAULT 0 NOT NULL,
    vendor text,
    serial_number text,
    warranty_date text,
    depreciation_rate numeric(6,4) DEFAULT 0.15 NOT NULL,
    location text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.assets OWNER TO postgres;

--
-- Name: attendance_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attendance_events (
    id text NOT NULL,
    group_id text NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'other'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    scan_token text,
    scan_token_expires_at timestamp without time zone
);


ALTER TABLE public.attendance_events OWNER TO postgres;

--
-- Name: attendance_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attendance_logs (
    id text NOT NULL,
    event_id text NOT NULL,
    pilgrim_id text NOT NULL,
    group_id text NOT NULL,
    status text DEFAULT 'present'::text NOT NULL,
    scanned_at timestamp without time zone DEFAULT now() NOT NULL,
    scanned_by text
);


ALTER TABLE public.attendance_logs OWNER TO postgres;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs (
    id text NOT NULL,
    actor_id text,
    actor_name text,
    action text NOT NULL,
    entity_table text NOT NULL,
    entity_id text NOT NULL,
    old_value jsonb,
    new_value jsonb,
    ip text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO postgres;

--
-- Name: automation_audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.automation_audit_logs (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    actor_type text DEFAULT 'service_token'::text NOT NULL,
    actor_id text NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    request_id text,
    ip_address text,
    before_data jsonb,
    after_data jsonb,
    result text DEFAULT 'success'::text NOT NULL,
    error_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT automation_audit_logs_result_check CHECK ((result = ANY (ARRAY['success'::text, 'failure'::text])))
);


ALTER TABLE public.automation_audit_logs OWNER TO postgres;

--
-- Name: automation_service_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.automation_service_tokens (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    token_name text NOT NULL,
    token_hash text NOT NULL,
    scopes jsonb DEFAULT '[]'::jsonb NOT NULL,
    allowed_ips jsonb,
    is_active boolean DEFAULT true NOT NULL,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    last_used_at timestamp with time zone,
    created_by text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.automation_service_tokens OWNER TO postgres;

--
-- Name: bank_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bank_settings (
    id text DEFAULT 'default'::text NOT NULL,
    bank_name text DEFAULT 'State Bank of India'::text,
    branch text DEFAULT ''::text,
    account_name text DEFAULT 'Al Burhan Tours & Travels'::text,
    account_number text DEFAULT ''::text,
    ifsc_code text DEFAULT ''::text,
    swift_code text DEFAULT ''::text,
    upi_id text DEFAULT ''::text,
    qr_code_url text DEFAULT ''::text,
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.bank_settings OWNER TO postgres;

--
-- Name: booking_audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.booking_audit_logs (
    id text NOT NULL,
    booking_id text NOT NULL,
    changed_by text,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    action text NOT NULL,
    field_name text,
    old_value text,
    new_value text
);


ALTER TABLE public.booking_audit_logs OWNER TO postgres;

--
-- Name: booking_confirmation_notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.booking_confirmation_notifications (
    id text NOT NULL,
    booking_id text NOT NULL,
    channel text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    sent_at timestamp with time zone,
    retry_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.booking_confirmation_notifications OWNER TO postgres;

--
-- Name: booking_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.booking_settings (
    id text DEFAULT 'default'::text NOT NULL,
    gst_enabled boolean DEFAULT true NOT NULL,
    gst_rate numeric(5,2) DEFAULT 5 NOT NULL,
    gst_included boolean DEFAULT false NOT NULL,
    tcs_enabled boolean DEFAULT false NOT NULL,
    tcs_rate numeric(5,2) DEFAULT 2 NOT NULL,
    tcs_included boolean DEFAULT false NOT NULL,
    discount_enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    standard_advance_pct numeric(5,2) DEFAULT 50,
    balance_due_after_days integer DEFAULT 50,
    discount_full_payment_required boolean DEFAULT true,
    block_visa_balance_pending boolean DEFAULT true,
    default_currency text DEFAULT 'INR'::text,
    sar_reference_rate numeric(8,2) DEFAULT 25.70,
    spc_charge numeric(10,2) DEFAULT 5500
);


ALTER TABLE public.booking_settings OWNER TO postgres;

--
-- Name: bookings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bookings (
    id text NOT NULL,
    booking_number text NOT NULL,
    package_id text,
    package_name text,
    customer_id text,
    customer_name text NOT NULL,
    customer_mobile text NOT NULL,
    customer_email text,
    number_of_pilgrims integer NOT NULL,
    pilgrims jsonb DEFAULT '[]'::jsonb,
    preferred_departure_date text,
    status public.booking_status DEFAULT 'pending'::public.booking_status NOT NULL,
    total_amount numeric(12,2),
    gst_amount numeric(12,2),
    final_amount numeric(12,2),
    payment_id text,
    razorpay_order_id text,
    razorpay_payment_id text,
    invoice_number text,
    rejection_reason text,
    notes text,
    is_offline boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    room_type text,
    advance_amount numeric(12,2),
    group_id text,
    paid_amount numeric(12,2),
    online_paid_amount numeric(12,2) DEFAULT '0'::numeric,
    traveller_details_status text DEFAULT 'not_submitted'::text NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by text,
    is_deleted boolean DEFAULT false NOT NULL,
    gst_rate numeric(5,2),
    taxable_amount numeric(14,2),
    discount_type text,
    discount_amount numeric(12,2) DEFAULT 0,
    discount_percentage numeric(5,2) DEFAULT 0,
    discount_reason text,
    net_amount numeric(12,2),
    gst_included boolean DEFAULT false NOT NULL,
    tcs_enabled boolean DEFAULT false NOT NULL,
    tcs_rate numeric(5,2) DEFAULT 2,
    tcs_amount numeric(12,2),
    journey_status text DEFAULT 'booking_requested'::text,
    due_date timestamp with time zone,
    branch_id uuid,
    agent_id uuid,
    ticket_status text,
    max_pilgrims integer,
    last_payment_date timestamp with time zone,
    payment_status text DEFAULT 'unpaid'::text
);


ALTER TABLE public.bookings OWNER TO postgres;

--
-- Name: branches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    city text,
    address text,
    manager_name text,
    manager_mobile text,
    manager_email text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


ALTER TABLE public.branches OWNER TO postgres;

--
-- Name: broadcasts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.broadcasts (
    id text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    type text DEFAULT 'general'::text NOT NULL,
    audience text NOT NULL,
    channels text[] DEFAULT '{}'::text[] NOT NULL,
    recipient_count integer DEFAULT 0 NOT NULL,
    sent_at timestamp without time zone DEFAULT now() NOT NULL,
    sent_by text
);


ALTER TABLE public.broadcasts OWNER TO postgres;

--
-- Name: buses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.buses (
    id text NOT NULL,
    bus_number text NOT NULL,
    group_id text NOT NULL,
    capacity integer DEFAULT 45 NOT NULL,
    vehicle_type text DEFAULT 'Coach'::text,
    driver_name text,
    driver_mobile text,
    route_description text,
    notes text,
    is_deleted boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    guide_name text
);


ALTER TABLE public.buses OWNER TO postgres;

--
-- Name: comm_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.comm_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type text NOT NULL,
    source text DEFAULT 'unknown'::text NOT NULL,
    idempotency_key text,
    dedup_hash text,
    customer_id text,
    booking_id text,
    customer_name text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    workflow_trigger text,
    status text DEFAULT 'queued'::text NOT NULL,
    error_msg text,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.comm_events OWNER TO postgres;

--
-- Name: comment_automation_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.comment_automation_rules (
    id text NOT NULL,
    rule_name text NOT NULL,
    platform text DEFAULT 'facebook'::text NOT NULL,
    keywords text[] DEFAULT '{}'::text[],
    match_type text DEFAULT 'any'::text NOT NULL,
    public_reply text,
    private_message text,
    create_lead boolean DEFAULT false,
    lead_source text DEFAULT 'facebook'::text,
    assign_to text,
    assign_to_name text,
    cooldown_minutes integer DEFAULT 60,
    is_active boolean DEFAULT true,
    trigger_count integer DEFAULT 0,
    last_triggered_at timestamp with time zone,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.comment_automation_rules OWNER TO postgres;

--
-- Name: communication_audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.communication_audit_logs (
    id integer NOT NULL,
    action text NOT NULL,
    actor_id text,
    actor_role text,
    entity_type text,
    entity_id text,
    old_values jsonb,
    new_values jsonb,
    reason text,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.communication_audit_logs OWNER TO postgres;

--
-- Name: communication_audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.communication_audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.communication_audit_logs_id_seq OWNER TO postgres;

--
-- Name: communication_audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.communication_audit_logs_id_seq OWNED BY public.communication_audit_logs.id;


--
-- Name: communication_consents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.communication_consents (
    id text NOT NULL,
    lead_id text,
    customer_id text,
    mobile text,
    email text,
    channel text NOT NULL,
    status text DEFAULT 'opted_in'::text NOT NULL,
    source text,
    consent_text text,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.communication_consents OWNER TO postgres;

--
-- Name: communication_event_mappings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.communication_event_mappings (
    id text NOT NULL,
    event_type text NOT NULL,
    channel text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    primary_provider text,
    fallback_provider text,
    template_id text,
    fallback_template_id text,
    retry_max integer DEFAULT 3 NOT NULL,
    retry_policy jsonb DEFAULT '{"delays": [300, 1800, 7200, 43200]}'::jsonb NOT NULL,
    recipient_type text DEFAULT 'customer'::text NOT NULL,
    send_timing text DEFAULT 'immediate'::text NOT NULL,
    attachment_policy text DEFAULT 'link_only'::text NOT NULL,
    notes text,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.communication_event_mappings OWNER TO postgres;

--
-- Name: communication_schedules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.communication_schedules (
    id text NOT NULL,
    event_type text NOT NULL,
    booking_id text,
    group_id text,
    recipient text NOT NULL,
    channel text NOT NULL,
    template_id text,
    scheduled_at timestamp with time zone NOT NULL,
    timezone text DEFAULT 'Asia/Kolkata'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    cancellation_reason text,
    idempotency_key text,
    template_version integer DEFAULT 1 NOT NULL,
    context jsonb,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.communication_schedules OWNER TO postgres;

--
-- Name: communication_status_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.communication_status_history (
    id integer NOT NULL,
    log_id text NOT NULL,
    status text NOT NULL,
    status_detail text,
    provider_message_id text,
    webhook_payload jsonb,
    actor text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.communication_status_history OWNER TO postgres;

--
-- Name: communication_status_history_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.communication_status_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.communication_status_history_id_seq OWNER TO postgres;

--
-- Name: communication_status_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.communication_status_history_id_seq OWNED BY public.communication_status_history.id;


--
-- Name: companies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.companies (
    id text NOT NULL,
    name text NOT NULL,
    arabic_name text,
    address text,
    phone text,
    mobile text,
    email text,
    website text,
    logo_url text,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.companies OWNER TO postgres;

--
-- Name: crm_assignment_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.crm_assignment_rules (
    id text NOT NULL,
    rule_name text NOT NULL,
    priority integer DEFAULT 10,
    method text DEFAULT 'round_robin'::text NOT NULL,
    conditions jsonb DEFAULT '{}'::jsonb,
    team_user_ids text[] DEFAULT '{}'::text[],
    assign_to_user_id text,
    assign_to_branch text,
    sla_minutes integer DEFAULT 120,
    is_active boolean DEFAULT true,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.crm_assignment_rules OWNER TO postgres;

--
-- Name: customer_ledger_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customer_ledger_entries (
    id text NOT NULL,
    booking_id text NOT NULL,
    entry_date timestamp with time zone DEFAULT now() NOT NULL,
    doc_type text NOT NULL,
    doc_number text,
    doc_id text,
    description text NOT NULL,
    debit numeric(12,2) DEFAULT 0 NOT NULL,
    credit numeric(12,2) DEFAULT 0 NOT NULL,
    running_balance numeric(12,2) DEFAULT 0 NOT NULL,
    source text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.customer_ledger_entries OWNER TO postgres;

--
-- Name: customer_notification_preferences; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customer_notification_preferences (
    customer_id text NOT NULL,
    whatsapp boolean DEFAULT true NOT NULL,
    sms boolean DEFAULT true NOT NULL,
    email boolean DEFAULT false NOT NULL,
    rcs boolean DEFAULT false NOT NULL,
    push boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.customer_notification_preferences OWNER TO postgres;

--
-- Name: customer_notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customer_notifications (
    id text NOT NULL,
    customer_id text NOT NULL,
    broadcast_id text,
    title text NOT NULL,
    message text NOT NULL,
    type text DEFAULT 'general'::text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    category text DEFAULT 'general'::text,
    action_url text,
    priority text DEFAULT 'normal'::text,
    expires_at timestamp with time zone,
    is_archived boolean DEFAULT false
);


ALTER TABLE public.customer_notifications OWNER TO postgres;

--
-- Name: customer_portal_activity; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customer_portal_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id text NOT NULL,
    booking_id text,
    action text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.customer_portal_activity OWNER TO postgres;

--
-- Name: customer_profile_edits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customer_profile_edits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id text NOT NULL,
    field_name text NOT NULL,
    old_value text,
    new_value text,
    status text DEFAULT 'pending'::text,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.customer_profile_edits OWNER TO postgres;

--
-- Name: customer_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customer_profiles (
    id text NOT NULL,
    user_id text NOT NULL,
    name text,
    phone text,
    whatsapp_number text,
    date_of_birth text,
    gender public.gender_type,
    address text,
    passport_number text,
    passport_issue_date text,
    passport_expiry_date text,
    passport_place_of_issue text,
    passport_image_url text,
    photo_url text,
    blood_group public.blood_group,
    aadhar_number text,
    aadhar_image_url text,
    pan_number text,
    pan_image_url text,
    health_certificate_url text,
    kyc_status public.kyc_status DEFAULT 'pending'::public.kyc_status NOT NULL,
    admin_notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    father_name text,
    nationality text,
    city text,
    state text,
    country text DEFAULT 'India'::text,
    passport_expiry date,
    nominee text,
    nominee_relation text
);


ALTER TABLE public.customer_profiles OWNER TO postgres;

--
-- Name: customer_push_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customer_push_tokens (
    id text NOT NULL,
    customer_id text NOT NULL,
    token text NOT NULL,
    platform text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    subscription jsonb,
    device_info text,
    updated_at timestamp with time zone DEFAULT now(),
    user_id text,
    user_type text DEFAULT 'customer'::text,
    browser text,
    operating_system text,
    last_seen timestamp with time zone DEFAULT now()
);


ALTER TABLE public.customer_push_tokens OWNER TO postgres;

--
-- Name: customer_timeline; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customer_timeline (
    id integer NOT NULL,
    customer_id text,
    booking_id text,
    event_type text NOT NULL,
    title text NOT NULL,
    description text,
    icon text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.customer_timeline OWNER TO postgres;

--
-- Name: customer_timeline_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.customer_timeline_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.customer_timeline_id_seq OWNER TO postgres;

--
-- Name: customer_timeline_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.customer_timeline_id_seq OWNED BY public.customer_timeline.id;


--
-- Name: delete_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.delete_audit_log (
    id integer NOT NULL,
    action text NOT NULL,
    item_type text NOT NULL,
    item_id text NOT NULL,
    deleted_by text NOT NULL,
    ip_address text NOT NULL,
    success boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.delete_audit_log OWNER TO postgres;

--
-- Name: delete_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.delete_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.delete_audit_log_id_seq OWNER TO postgres;

--
-- Name: delete_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.delete_audit_log_id_seq OWNED BY public.delete_audit_log.id;


--
-- Name: document_download_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.document_download_logs (
    id text NOT NULL,
    document_id text NOT NULL,
    booking_id text NOT NULL,
    customer_id text,
    downloaded_at timestamp with time zone DEFAULT now() NOT NULL,
    ip_address text
);


ALTER TABLE public.document_download_logs OWNER TO postgres;

--
-- Name: documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.documents (
    id text NOT NULL,
    booking_id text NOT NULL,
    document_type public.document_type NOT NULL,
    file_name text NOT NULL,
    file_key text NOT NULL,
    file_url text,
    uploaded_by public.document_uploaded_by DEFAULT 'customer'::public.document_uploaded_by NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    download_count integer DEFAULT 0 NOT NULL,
    last_downloaded_at timestamp with time zone,
    is_revoked boolean DEFAULT false NOT NULL,
    customer_id text,
    is_visible_to_customer boolean DEFAULT true NOT NULL,
    notification_sent boolean DEFAULT false NOT NULL,
    viewed_at timestamp with time zone,
    file_size integer,
    mime_type text,
    original_filename text,
    access_token text
);


ALTER TABLE public.documents OWNER TO postgres;

--
-- Name: drivers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.drivers (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    name text NOT NULL,
    mobile text NOT NULL,
    license_number text,
    license_expiry date,
    badge_number text,
    photo_url text,
    address text,
    emergency_contact text,
    joining_date date,
    is_active boolean DEFAULT true,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.drivers OWNER TO postgres;

--
-- Name: employee_advances; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employee_advances (
    id text NOT NULL,
    employee_id text NOT NULL,
    amount numeric(12,2) NOT NULL,
    date text NOT NULL,
    reason text,
    status text DEFAULT 'pending'::text NOT NULL,
    payroll_run_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.employee_advances OWNER TO postgres;

--
-- Name: employees; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employees (
    id text NOT NULL,
    name text NOT NULL,
    designation text,
    department text,
    mobile text,
    email text,
    bank_account text,
    ifsc text,
    pan text,
    pf_number text,
    esi_number text,
    joining_date text,
    basic_salary numeric(12,2) DEFAULT 0 NOT NULL,
    hra numeric(12,2) DEFAULT 0 NOT NULL,
    allowances jsonb DEFAULT '{}'::jsonb NOT NULL,
    total_salary numeric(12,2) DEFAULT 0 NOT NULL,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.employees OWNER TO postgres;

--
-- Name: error_request_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.error_request_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    method text,
    path text,
    status_code integer,
    duration_ms integer,
    user_id text,
    user_role text,
    ip text,
    error_msg text,
    stack_trace text,
    request_body jsonb,
    response_body text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.error_request_logs OWNER TO postgres;

--
-- Name: expenses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.expenses (
    id text NOT NULL,
    group_id text,
    category text NOT NULL,
    vendor text,
    description text NOT NULL,
    amount numeric(12,2) NOT NULL,
    date text NOT NULL,
    paid_by text,
    payment_method text DEFAULT 'cash'::text,
    invoice_number text,
    attachment_url text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'approved'::text NOT NULL,
    approved_by text,
    rejected_reason text,
    package_id text,
    vendor_id text,
    gst_percent numeric(5,2),
    cgst_amount numeric(12,2),
    sgst_amount numeric(12,2),
    igst_amount numeric(12,2),
    hsn_sac text
);


ALTER TABLE public.expenses OWNER TO postgres;

--
-- Name: fb_ads_sync; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fb_ads_sync (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    campaign_id text NOT NULL,
    campaign_name text,
    ad_set_id text,
    ad_set_name text,
    ad_id text DEFAULT ''::text NOT NULL,
    ad_name text,
    spend numeric(10,2) DEFAULT 0,
    impressions integer DEFAULT 0,
    clicks integer DEFAULT 0,
    leads_count integer DEFAULT 0,
    cpl numeric(10,2),
    date date NOT NULL,
    synced_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.fb_ads_sync OWNER TO postgres;

--
-- Name: feedback; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.feedback (
    id text NOT NULL,
    pilgrim_mobile text NOT NULL,
    pilgrim_name text,
    booking_id text,
    company_id text,
    group_id text,
    group_name text,
    rating_overall integer,
    rating_accommodation_makkah1 integer,
    rating_accommodation_makkah2 integer,
    rating_accommodation_madinah integer,
    rating_transportation integer,
    rating_food integer,
    rating_guide integer,
    rating_visa_documentation integer,
    comment text,
    what_did_you_like text,
    suggestions text,
    would_recommend text,
    is_complaint boolean DEFAULT false NOT NULL,
    status public.feedback_status DEFAULT 'open'::public.feedback_status NOT NULL,
    assigned_to text,
    internal_notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.feedback OWNER TO postgres;

--
-- Name: finance_audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.finance_audit_logs (
    id text NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    booking_id text,
    actor_id text,
    actor_name text,
    actor_role text,
    ip_address text,
    user_agent text,
    old_values jsonb,
    new_values jsonb,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.finance_audit_logs OWNER TO postgres;

--
-- Name: financial_years; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.financial_years (
    id text NOT NULL,
    name text NOT NULL,
    start_date text NOT NULL,
    end_date text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    is_closed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.financial_years OWNER TO postgres;

--
-- Name: flight_baggage; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.flight_baggage (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    pnr_id text,
    pilgrim_id text,
    booking_id text,
    tag_number text,
    pieces integer DEFAULT 1,
    weight_kg numeric(6,2),
    status text DEFAULT 'checked_in'::text,
    last_scan_location text,
    last_scan_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.flight_baggage OWNER TO postgres;

--
-- Name: fuel_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fuel_logs (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    vehicle_id text NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    liters numeric(8,2) NOT NULL,
    rate_per_liter numeric(6,2),
    amount numeric(10,2),
    odometer numeric(10,2),
    fuel_station text,
    bill_number text,
    recorded_by text,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.fuel_logs OWNER TO postgres;

--
-- Name: gallery_images; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gallery_images (
    id text NOT NULL,
    title text,
    file_name text NOT NULL,
    file_url text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    uploaded_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.gallery_images OWNER TO postgres;

--
-- Name: group_broadcast_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.group_broadcast_logs (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    group_id text NOT NULL,
    message text NOT NULL,
    channel text DEFAULT 'whatsapp'::text,
    sent_count integer DEFAULT 0,
    failed_count integer DEFAULT 0,
    sent_by text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.group_broadcast_logs OWNER TO postgres;

--
-- Name: group_flights; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.group_flights (
    id text NOT NULL,
    group_id text NOT NULL,
    flight_type text DEFAULT 'outbound'::text NOT NULL,
    airline text,
    flight_number text,
    pnr text,
    departure_airport text,
    arrival_airport text,
    departure_date text,
    departure_time text,
    arrival_date text,
    arrival_time text,
    baggage_allowance text,
    meal_type text,
    status text DEFAULT 'scheduled'::text,
    notes text,
    pilgrims_assigned jsonb DEFAULT '[]'::jsonb,
    ticket_numbers jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    terminal text
);


ALTER TABLE public.group_flights OWNER TO postgres;

--
-- Name: group_tracking; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.group_tracking (
    group_id text NOT NULL,
    current_city text,
    current_activity text,
    next_activity text,
    notes text,
    meeting_point text,
    updated_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.group_tracking OWNER TO postgres;

--
-- Name: hajj_groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.hajj_groups (
    id text NOT NULL,
    group_name text NOT NULL,
    year integer NOT NULL,
    departure_date text,
    return_date text,
    flight_number text,
    maktab_number text,
    hotels jsonb DEFAULT '{}'::jsonb,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    company_id text,
    starting_serial_number integer DEFAULT 1 NOT NULL,
    service_label text
);


ALTER TABLE public.hajj_groups OWNER TO postgres;

--
-- Name: hajj_rooms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.hajj_rooms (
    id text NOT NULL,
    group_id text NOT NULL,
    room_number text NOT NULL,
    hotel text DEFAULT 'makkah'::text NOT NULL,
    total_beds integer DEFAULT 4 NOT NULL,
    room_type text DEFAULT 'gents'::text NOT NULL,
    floor text,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.hajj_rooms OWNER TO postgres;

--
-- Name: holy_site_allocations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.holy_site_allocations (
    id text NOT NULL,
    site text NOT NULL,
    pilgrim_id text,
    family_id text,
    group_id text,
    tent_number text,
    camp_number text,
    area text,
    capacity integer,
    guide_name text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.holy_site_allocations OWNER TO postgres;

--
-- Name: hotel_checkins; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.hotel_checkins (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    hotel_id text,
    hotel_name text,
    booking_id text,
    group_id text,
    room_number text,
    room_type text,
    pilgrim_ids text,
    guest_names text NOT NULL,
    expected_checkin date,
    expected_checkout date,
    actual_checkin timestamp with time zone,
    actual_checkout timestamp with time zone,
    status text DEFAULT 'reserved'::text,
    key_handed boolean DEFAULT false,
    notes text,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.hotel_checkins OWNER TO postgres;

--
-- Name: hotel_contracts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.hotel_contracts (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    hotel_id text,
    hotel_name text NOT NULL,
    contract_number text,
    season text,
    valid_from date NOT NULL,
    valid_to date NOT NULL,
    room_type text DEFAULT 'standard'::text,
    rate_per_night numeric(10,2) NOT NULL,
    total_rooms integer DEFAULT 0,
    contracted_rooms integer DEFAULT 0,
    meal_plan text DEFAULT 'bb'::text,
    payment_terms text,
    cancellation_policy text,
    status text DEFAULT 'active'::text,
    signed_by text,
    signed_at date,
    notes text,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.hotel_contracts OWNER TO postgres;

--
-- Name: hotel_rooms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.hotel_rooms (
    id text NOT NULL,
    hotel_id text NOT NULL,
    room_number text NOT NULL,
    floor text,
    capacity integer DEFAULT 2 NOT NULL,
    bed_type text DEFAULT 'Double'::text,
    notes text,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    room_type text,
    status text DEFAULT 'vacant'::text
);


ALTER TABLE public.hotel_rooms OWNER TO postgres;

--
-- Name: hotel_vouchers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.hotel_vouchers (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    voucher_number text,
    booking_id text,
    group_id text,
    hotel_id text,
    hotel_name text NOT NULL,
    check_in_date date NOT NULL,
    check_out_date date NOT NULL,
    nights integer DEFAULT 1,
    room_type text,
    room_count integer DEFAULT 1,
    meal_plan text DEFAULT 'bb'::text,
    pilgrim_count integer DEFAULT 1,
    pilgrim_names text,
    rate_per_night numeric(10,2),
    total_amount numeric(12,2),
    status text DEFAULT 'issued'::text,
    special_requests text,
    issued_at timestamp with time zone DEFAULT now(),
    issued_by text,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.hotel_vouchers OWNER TO postgres;

--
-- Name: hotels; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.hotels (
    id text NOT NULL,
    name text NOT NULL,
    city text NOT NULL,
    address text,
    stars integer,
    group_id text,
    check_in_date text,
    check_out_date text,
    total_rooms integer,
    contact_phone text,
    notes text,
    is_deleted boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    distance_from_haram text,
    contact_person text,
    email text
);


ALTER TABLE public.hotels OWNER TO postgres;

--
-- Name: inquiries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inquiries (
    id text NOT NULL,
    name text NOT NULL,
    mobile text NOT NULL,
    email text,
    message text NOT NULL,
    package_interest text,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.inquiries OWNER TO postgres;

--
-- Name: invoice_number_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.invoice_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.invoice_number_seq OWNER TO postgres;

--
-- Name: invoices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoices (
    id text NOT NULL,
    invoice_number text NOT NULL,
    booking_id text NOT NULL,
    customer_id text,
    invoice_date timestamp with time zone DEFAULT now() NOT NULL,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    discount numeric(12,2) DEFAULT 0 NOT NULL,
    gst_amount numeric(12,2) DEFAULT 0 NOT NULL,
    tcs_amount numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    paid numeric(12,2) DEFAULT 0 NOT NULL,
    balance numeric(12,2) DEFAULT 0 NOT NULL,
    invoice_status text DEFAULT 'pending'::text NOT NULL,
    pdf_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    due_date timestamp with time zone,
    notes text,
    line_items jsonb DEFAULT '[]'::jsonb,
    gst_rate numeric(5,2),
    tcs_rate numeric(5,2),
    taxable_amount numeric(12,2),
    visa_charges numeric(12,2) DEFAULT 0,
    additional_charges numeric(12,2) DEFAULT 0,
    grand_total numeric(12,2),
    payment_status text DEFAULT 'unpaid'::text,
    issue_date timestamp with time zone,
    payment_terms text,
    customer_name text,
    package_name text,
    package_type text,
    source text,
    actor_id text,
    void_reason text,
    voided_at timestamp with time zone,
    voided_by text,
    is_void boolean DEFAULT false
);


ALTER TABLE public.invoices OWNER TO postgres;

--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.journal_entries (
    id text NOT NULL,
    entry_number text NOT NULL,
    date text NOT NULL,
    narration text NOT NULL,
    reference text,
    source text DEFAULT 'manual'::text NOT NULL,
    source_id text,
    financial_year_id text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.journal_entries OWNER TO postgres;

--
-- Name: journal_entry_lines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.journal_entry_lines (
    id text NOT NULL,
    journal_entry_id text NOT NULL,
    account_id text NOT NULL,
    debit numeric(14,2) DEFAULT 0 NOT NULL,
    credit numeric(14,2) DEFAULT 0 NOT NULL,
    narration text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.journal_entry_lines OWNER TO postgres;

--
-- Name: lead_activities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lead_activities (
    id text NOT NULL,
    lead_id text NOT NULL,
    type text NOT NULL,
    content text,
    metadata jsonb DEFAULT '{}'::jsonb,
    performed_by text,
    performed_by_name text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.lead_activities OWNER TO postgres;

--
-- Name: lead_assignment_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lead_assignment_rules (
    id integer NOT NULL,
    platform character varying(80) NOT NULL,
    assigned_name character varying(100),
    assigned_to text,
    branch_name character varying(100),
    auto_reply_text text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.lead_assignment_rules OWNER TO postgres;

--
-- Name: lead_assignment_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.lead_assignment_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.lead_assignment_rules_id_seq OWNER TO postgres;

--
-- Name: lead_assignment_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.lead_assignment_rules_id_seq OWNED BY public.lead_assignment_rules.id;


--
-- Name: lead_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lead_audit_log (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    lead_id text NOT NULL,
    user_id text,
    user_name text,
    action text NOT NULL,
    field_name text,
    old_value text,
    new_value text,
    details jsonb,
    ip_address text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.lead_audit_log OWNER TO postgres;

--
-- Name: lead_auto_followup_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lead_auto_followup_log (
    id text NOT NULL,
    lead_id text NOT NULL,
    seq_key text NOT NULL,
    channel text NOT NULL,
    status text NOT NULL,
    message text,
    sent_at timestamp with time zone DEFAULT now(),
    error text
);


ALTER TABLE public.lead_auto_followup_log OWNER TO postgres;

--
-- Name: lead_followups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lead_followups (
    id text NOT NULL,
    lead_id text NOT NULL,
    title text NOT NULL,
    description text,
    due_at timestamp with time zone,
    type text DEFAULT 'call'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    assigned_to text,
    assigned_to_name text,
    completed_at timestamp with time zone,
    completed_notes text,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    reminder_sent boolean DEFAULT false,
    upcoming_reminder_sent boolean DEFAULT false
);


ALTER TABLE public.lead_followups OWNER TO postgres;

--
-- Name: lead_web_form_submissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lead_web_form_submissions (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    form_id text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    lead_id text,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.lead_web_form_submissions OWNER TO postgres;

--
-- Name: lead_web_forms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lead_web_forms (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    name text NOT NULL,
    description text,
    fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    destination_url text,
    success_message text DEFAULT 'Thank you! We will contact you soon.'::text,
    theme_color text DEFAULT '#0A3D2A'::text,
    is_active boolean DEFAULT true,
    submissions_count integer DEFAULT 0,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.lead_web_forms OWNER TO postgres;

--
-- Name: leads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.leads (
    id text NOT NULL,
    name text NOT NULL,
    mobile text,
    email text,
    source text DEFAULT 'website'::text,
    status text DEFAULT 'new'::text,
    message text,
    package_interest text,
    budget text,
    assigned_to text,
    assigned_name text,
    follow_up_date date,
    notes text,
    conversion_booking_id text,
    converted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    platform character varying(80),
    platform_user_id character varying(255),
    whatsapp_number character varying(50),
    instagram_username character varying(100),
    facebook_name character varying(100),
    telegram_username character varying(100),
    conversation_count integer DEFAULT 0,
    last_message_at timestamp with time zone,
    priority character varying(20) DEFAULT 'normal'::character varying,
    assigned_branch character varying(100),
    auto_reply_sent boolean DEFAULT false,
    tags text[],
    inbox_status character varying(50) DEFAULT 'open'::character varying,
    unread_count integer DEFAULT 0,
    score character varying(20) DEFAULT 'cold'::character varying,
    score_factors jsonb DEFAULT '{}'::jsonb,
    passport_number text,
    aadhaar_last4 text,
    pan_number text,
    assignment_notified_at timestamp with time zone,
    followup_due_at timestamp with time zone,
    pipeline_stage text DEFAULT 'new_lead'::text,
    first_name text,
    last_name text,
    city text,
    state text,
    country text DEFAULT 'India'::text,
    num_travellers integer DEFAULT 1,
    travel_month text,
    meta_lead_id text,
    utm_params jsonb DEFAULT '{}'::jsonb,
    lead_number text,
    lost_reason text,
    expected_conversion_amount numeric(14,2) DEFAULT 0,
    last_communication_at timestamp with time zone,
    pipeline_updated_at timestamp with time zone DEFAULT now(),
    campaign_id text,
    campaign_name text,
    ad_set_id text,
    ad_set_name text,
    ad_id text,
    ad_name text,
    form_id text,
    ai_score integer,
    ai_next_action text,
    ai_scored_at timestamp with time zone,
    ai_score_factors jsonb,
    converted_booking_id text,
    source_campaign text,
    source_ad_id text,
    fb_ad_spend numeric(10,2),
    revenue_attributed numeric(10,2),
    package_interest_id text,
    room_preference text,
    travellers_count integer
);


ALTER TABLE public.leads OWNER TO postgres;

--
-- Name: leave_balances; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.leave_balances (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    employee_id text NOT NULL,
    leave_type_id text,
    leave_type_name text,
    year integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer NOT NULL,
    allocated integer DEFAULT 0,
    used integer DEFAULT 0,
    pending integer DEFAULT 0,
    balance integer GENERATED ALWAYS AS (((allocated - used) - pending)) STORED,
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.leave_balances OWNER TO postgres;

--
-- Name: leave_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.leave_requests (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    employee_id text NOT NULL,
    leave_type_id text,
    leave_type_name text,
    from_date date NOT NULL,
    to_date date NOT NULL,
    days integer NOT NULL,
    reason text,
    status text DEFAULT 'pending'::text,
    approved_by text,
    approved_at timestamp with time zone,
    rejected_reason text,
    half_day boolean DEFAULT false,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.leave_requests OWNER TO postgres;

--
-- Name: leave_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.leave_types (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    name text NOT NULL,
    days_allowed integer DEFAULT 0,
    is_paid boolean DEFAULT true,
    carry_forward boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.leave_types OWNER TO postgres;

--
-- Name: loyalty_points; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.loyalty_points (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id text NOT NULL,
    customer_name text,
    customer_mobile text,
    total_points integer DEFAULT 0 NOT NULL,
    redeemed_points integer DEFAULT 0 NOT NULL,
    tier text DEFAULT 'bronze'::text NOT NULL,
    bookings_count integer DEFAULT 0 NOT NULL,
    total_spent numeric(12,2) DEFAULT 0 NOT NULL,
    last_activity timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.loyalty_points OWNER TO postgres;

--
-- Name: loyalty_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.loyalty_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id text NOT NULL,
    points integer NOT NULL,
    type text DEFAULT 'credit'::text NOT NULL,
    reason text,
    source text DEFAULT 'system'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.loyalty_transactions OWNER TO postgres;

--
-- Name: luggage_tags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.luggage_tags (
    id text NOT NULL,
    tag_number text NOT NULL,
    pilgrim_id text,
    booking_id text,
    pilgrim_name text,
    group_id text,
    weight numeric(6,2),
    status text DEFAULT 'assigned'::text,
    location text,
    delivery_status text DEFAULT 'pending'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.luggage_tags OWNER TO postgres;

--
-- Name: maintenance_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.maintenance_logs (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    vehicle_id text NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    type text DEFAULT 'routine'::text,
    description text NOT NULL,
    cost numeric(10,2),
    vendor text,
    odometer numeric(10,2),
    next_service_date date,
    next_service_km numeric(10,2),
    status text DEFAULT 'completed'::text,
    bill_number text,
    recorded_by text,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.maintenance_logs OWNER TO postgres;

--
-- Name: marketing_campaigns; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.marketing_campaigns (
    id text NOT NULL,
    name text NOT NULL,
    message text NOT NULL,
    channel text NOT NULL,
    segment text NOT NULL,
    subject text,
    status text DEFAULT 'draft'::text NOT NULL,
    total_recipients integer DEFAULT 0,
    sent_count integer DEFAULT 0,
    failed_count integer DEFAULT 0,
    created_by text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    interested_count integer DEFAULT 0,
    bookings_generated integer DEFAULT 0,
    revenue_generated numeric(14,2) DEFAULT 0,
    roi_percent numeric(8,2) DEFAULT 0,
    channel_tag text,
    opened_count integer DEFAULT 0,
    clicked_count integer DEFAULT 0,
    replies_count integer DEFAULT 0,
    tenant_id text DEFAULT 'default'::text NOT NULL,
    campaign_type text DEFAULT 'awareness'::text NOT NULL,
    budget numeric(12,2) DEFAULT 0,
    spend numeric(12,2) DEFAULT 0,
    impressions integer DEFAULT 0,
    leads_gen integer DEFAULT 0,
    conversions integer DEFAULT 0,
    revenue_attr numeric(12,2) DEFAULT 0,
    start_date date,
    end_date date,
    notes text
);


ALTER TABLE public.marketing_campaigns OWNER TO postgres;

--
-- Name: medical_cases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.medical_cases (
    id text NOT NULL,
    pilgrim_id text NOT NULL,
    group_id text,
    case_type text DEFAULT 'general'::text NOT NULL,
    description text,
    severity text DEFAULT 'low'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    handled_by text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.medical_cases OWNER TO postgres;

--
-- Name: meta_delivery_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.meta_delivery_logs (
    id text NOT NULL,
    wamid text,
    status text,
    "timestamp" timestamp with time zone,
    conversation_id text,
    error_code integer,
    error_title text,
    raw_payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.meta_delivery_logs OWNER TO postgres;

--
-- Name: meta_media_cache; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.meta_media_cache (
    id text NOT NULL,
    media_id text NOT NULL,
    filename text,
    content_type text,
    file_hash text,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.meta_media_cache OWNER TO postgres;

--
-- Name: meta_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.meta_messages (
    id text NOT NULL,
    wamid text,
    recipient text NOT NULL,
    template_name text,
    event_type text,
    booking_id text,
    customer_id text,
    status text DEFAULT 'queued'::text NOT NULL,
    http_status integer,
    error_message text,
    retry_count integer DEFAULT 0 NOT NULL,
    next_retry_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.meta_messages OWNER TO postgres;

--
-- Name: meta_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.meta_templates (
    id text NOT NULL,
    template_name text NOT NULL,
    status text,
    category text,
    language text DEFAULT 'en'::text,
    components jsonb,
    variable_count integer DEFAULT 0,
    event_type text,
    synced_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.meta_templates OWNER TO postgres;

--
-- Name: meta_token_status; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.meta_token_status (
    id text DEFAULT 'current'::text NOT NULL,
    token_valid boolean DEFAULT false,
    phone_number text,
    verified_name text,
    waba_id text,
    permissions text,
    token_expires_at timestamp with time zone,
    error_message text,
    last_checked_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.meta_token_status OWNER TO postgres;

--
-- Name: notification_auto_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_auto_settings (
    key text NOT NULL,
    value text DEFAULT 'true'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notification_auto_settings OWNER TO postgres;

--
-- Name: notification_campaigns; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_campaigns (
    id text NOT NULL,
    name text NOT NULL,
    audience_type text NOT NULL,
    audience_id text,
    channel text NOT NULL,
    message text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    total_count integer DEFAULT 0 NOT NULL,
    sent_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


ALTER TABLE public.notification_campaigns OWNER TO postgres;

--
-- Name: notification_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_logs (
    id text NOT NULL,
    notification_id text,
    event_type text NOT NULL,
    customer_id text,
    booking_id text,
    channel text NOT NULL,
    template text,
    recipient text,
    message text,
    status text DEFAULT 'pending'::text NOT NULL,
    provider_response jsonb,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    retry_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    provider_name text,
    api_endpoint text,
    http_status integer,
    request_payload jsonb,
    error_code text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    customer_name text,
    booking_number text,
    wamid text,
    sender_id text,
    message_id text,
    delivery_status text DEFAULT 'unknown'::text,
    last_status_check timestamp with time zone,
    read_at timestamp with time zone,
    template_id text,
    template_name text,
    idempotency_key text,
    provider_message_id text,
    failed_at timestamp with time zone,
    error_message text,
    superseded_at timestamp with time zone,
    superseded_by text,
    canonical_event text,
    is_test boolean DEFAULT false NOT NULL,
    is_manual_resend boolean DEFAULT false NOT NULL,
    original_log_id text,
    rendered_preview text,
    request_payload_safe jsonb,
    permanently_failed_at timestamp with time zone,
    next_retry_at timestamp with time zone,
    business_reference text,
    scheduled_message_id text
);


ALTER TABLE public.notification_logs OWNER TO postgres;

--
-- Name: notification_logs_dup_audit; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_logs_dup_audit (
    id text NOT NULL,
    snapshot_at timestamp with time zone DEFAULT now() NOT NULL,
    original_id text NOT NULL,
    booking_id text,
    event_type text,
    channel text,
    status text,
    created_at timestamp with time zone,
    superseded_by text,
    reason text
);


ALTER TABLE public.notification_logs_dup_audit OWNER TO postgres;

--
-- Name: notification_retry_queue; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_retry_queue (
    id text NOT NULL,
    notification_log_id text,
    event_type text NOT NULL,
    channel text NOT NULL,
    customer_id text,
    booking_id text,
    recipient text NOT NULL,
    message text NOT NULL,
    context jsonb,
    retry_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    last_error text,
    next_retry_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notification_retry_queue OWNER TO postgres;

--
-- Name: notification_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_settings (
    id text NOT NULL,
    event_type text NOT NULL,
    channel text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    template_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notification_settings OWNER TO postgres;

--
-- Name: notification_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_templates (
    id text NOT NULL,
    name text NOT NULL,
    event_type text,
    channel text NOT NULL,
    subject text,
    body text NOT NULL,
    variables jsonb DEFAULT '[]'::jsonb,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    meta_template_id text,
    botbee_template_id text,
    dlt_template_id text,
    dlt_entity_id text,
    sender_id text,
    provider text DEFAULT 'generic'::text,
    language text DEFAULT 'en'::text,
    category text DEFAULT 'UTILITY'::text,
    header_text text,
    footer_text text,
    buttons jsonb DEFAULT '[]'::jsonb,
    html_body text,
    rcs_agent_id text,
    rcs_campaign_id text,
    rich_card jsonb DEFAULT '{}'::jsonb,
    priority integer DEFAULT 0,
    enabled boolean DEFAULT true,
    variable_count integer DEFAULT 0,
    variable_mapping jsonb DEFAULT '[]'::jsonb,
    last_success_at timestamp with time zone,
    last_failure_at timestamp with time zone,
    last_failure_reason text,
    provider_template_id text,
    provider_template_name text,
    approval_status text DEFAULT 'approved'::text NOT NULL,
    required_variables jsonb DEFAULT '[]'::jsonb,
    optional_variables jsonb DEFAULT '[]'::jsonb,
    fallback_template_id text,
    last_tested_at timestamp with time zone,
    version integer DEFAULT 1 NOT NULL,
    created_by text,
    updated_by text
);


ALTER TABLE public.notification_templates OWNER TO postgres;

--
-- Name: oauth_connections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.oauth_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    platform text NOT NULL,
    account_name text,
    account_id text,
    access_token text,
    refresh_token text,
    token_expiry timestamp with time zone,
    scope text,
    extra jsonb DEFAULT '{}'::jsonb,
    connected_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    connection_status text DEFAULT 'unknown'::text,
    last_refresh_at timestamp with time zone,
    last_error text,
    last_api_call_at timestamp with time zone
);


ALTER TABLE public.oauth_connections OWNER TO postgres;

--
-- Name: offline_payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.offline_payments (
    id text NOT NULL,
    booking_id text NOT NULL,
    customer_id text,
    customer_name text,
    mobile text,
    email text,
    amount_paid numeric(12,2),
    payment_date text,
    payment_time text,
    bank_name text,
    branch_name text,
    payment_method text,
    utr_number text,
    sender_account_last4 text,
    remarks text,
    proof_url text,
    status text DEFAULT 'pending'::text NOT NULL,
    rejection_reason text,
    verified_at timestamp with time zone,
    verified_by text,
    verified_by_name text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    payment_reference text,
    admin_remarks text
);


ALTER TABLE public.offline_payments OWNER TO postgres;

--
-- Name: orientation_resources; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orientation_resources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    category text DEFAULT 'general'::text,
    resource_type text DEFAULT 'article'::text,
    content text,
    external_url text,
    file_url text,
    thumbnail_url text,
    language text DEFAULT 'en'::text,
    is_published boolean DEFAULT true,
    view_count integer DEFAULT 0,
    sort_order integer DEFAULT 0,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.orientation_resources OWNER TO postgres;

--
-- Name: otps; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.otps (
    id text NOT NULL,
    mobile text NOT NULL,
    otp text NOT NULL,
    used boolean DEFAULT false NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    otp_hash text,
    purpose text DEFAULT 'customer'::text
);


ALTER TABLE public.otps OWNER TO postgres;

--
-- Name: package_media; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.package_media (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    package_id character varying NOT NULL,
    type public.media_type DEFAULT 'image'::public.media_type NOT NULL,
    url text NOT NULL,
    caption text,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.package_media OWNER TO postgres;

--
-- Name: package_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.package_requests (
    id text NOT NULL,
    customer_id text,
    package_id text,
    booking_id text,
    customer_name text NOT NULL,
    customer_mobile text NOT NULL,
    package_name text,
    message text,
    status public.request_status DEFAULT 'pending'::public.request_status NOT NULL,
    rejection_reason text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    group_id text,
    pilgrim_id text
);


ALTER TABLE public.package_requests OWNER TO postgres;

--
-- Name: packages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.packages (
    id text NOT NULL,
    name text NOT NULL,
    type public.package_type NOT NULL,
    description text,
    duration text,
    price_per_person numeric(12,2) NOT NULL,
    gst_percent numeric(5,2) DEFAULT '5'::numeric NOT NULL,
    includes jsonb DEFAULT '[]'::jsonb,
    highlights jsonb DEFAULT '[]'::jsonb,
    departure_dates jsonb DEFAULT '[]'::jsonb,
    max_pilgrims integer,
    image_url text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    featured boolean DEFAULT false NOT NULL,
    details jsonb DEFAULT '{}'::jsonb,
    image_urls jsonb DEFAULT '[]'::jsonb,
    video_urls jsonb DEFAULT '[]'::jsonb
);


ALTER TABLE public.packages OWNER TO postgres;

--
-- Name: payment_audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment_audit_logs (
    id text NOT NULL,
    transaction_id text NOT NULL,
    booking_id text NOT NULL,
    action text NOT NULL,
    old_amount numeric(12,2),
    new_amount numeric(12,2),
    old_mode text,
    new_mode text,
    old_date text,
    new_date text,
    changed_by text,
    changed_by_name text,
    change_reason text,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.payment_audit_logs OWNER TO postgres;

--
-- Name: payment_schedules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment_schedules (
    id text NOT NULL,
    tenant_id text DEFAULT 'alburhan'::text NOT NULL,
    booking_id text NOT NULL,
    customer_id text NOT NULL,
    installment_number integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    due_date date NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    paid_date date,
    paid_amount numeric(12,2),
    payment_transaction_id text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.payment_schedules OWNER TO postgres;

--
-- Name: payment_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment_transactions (
    id text NOT NULL,
    booking_id text NOT NULL,
    amount numeric(12,2) NOT NULL,
    payment_date text NOT NULL,
    payment_mode public.payment_mode NOT NULL,
    reference_number text,
    notes text,
    recorded_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    bank_name text,
    received_by text,
    edited_at timestamp with time zone,
    edited_by text,
    deleted_at timestamp with time zone,
    deleted_by text,
    deletion_reason text,
    is_deleted boolean DEFAULT false NOT NULL,
    is_reconciled boolean DEFAULT false NOT NULL,
    reconciled_date text,
    reconciled_by text,
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.payment_transactions OWNER TO postgres;

--
-- Name: payroll_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payroll_entries (
    id text NOT NULL,
    payroll_run_id text NOT NULL,
    employee_id text NOT NULL,
    month text NOT NULL,
    component_name text NOT NULL,
    component_type text DEFAULT 'earning'::text NOT NULL,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.payroll_entries OWNER TO postgres;

--
-- Name: payroll_runs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payroll_runs (
    id text NOT NULL,
    employee_id text NOT NULL,
    month text NOT NULL,
    present_days numeric(5,2) DEFAULT 26 NOT NULL,
    working_days numeric(5,2) DEFAULT 26 NOT NULL,
    gross_salary numeric(12,2) DEFAULT 0 NOT NULL,
    basic_salary numeric(12,2) DEFAULT 0 NOT NULL,
    hra numeric(12,2) DEFAULT 0 NOT NULL,
    allowances jsonb DEFAULT '{}'::jsonb NOT NULL,
    pf_deduction numeric(12,2) DEFAULT 0 NOT NULL,
    esi_deduction numeric(12,2) DEFAULT 0 NOT NULL,
    tds_deduction numeric(12,2) DEFAULT 0 NOT NULL,
    advance_deduction numeric(12,2) DEFAULT 0 NOT NULL,
    other_deductions numeric(12,2) DEFAULT 0 NOT NULL,
    total_deductions numeric(12,2) DEFAULT 0 NOT NULL,
    net_salary numeric(12,2) DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.payroll_runs OWNER TO postgres;

--
-- Name: pdf_audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pdf_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    username character varying(50),
    action character varying(100) NOT NULL,
    resource_type character varying(50),
    resource_id character varying(200),
    resource_name character varying(500),
    details jsonb DEFAULT '{}'::jsonb,
    ip_address character varying(50),
    user_agent text,
    severity character varying(20) DEFAULT 'info'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pdf_audit_logs_severity_check CHECK (((severity)::text = ANY ((ARRAY['info'::character varying, 'warning'::character varying, 'critical'::character varying])::text[])))
);


ALTER TABLE public.pdf_audit_logs OWNER TO postgres;

--
-- Name: pdf_backups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pdf_backups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    filename character varying(500) NOT NULL,
    storage_path character varying(1000) NOT NULL,
    size_bytes bigint,
    file_count integer,
    status character varying(20) DEFAULT 'completed'::character varying NOT NULL,
    triggered_by character varying(50) DEFAULT 'manual'::character varying,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.pdf_backups OWNER TO postgres;

--
-- Name: pdf_file_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pdf_file_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_id uuid NOT NULL,
    version integer NOT NULL,
    storage_path character varying(1000) NOT NULL,
    size_bytes bigint,
    checksum character varying(64),
    operation character varying(100),
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.pdf_file_versions OWNER TO postgres;

--
-- Name: pdf_files; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pdf_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(500) NOT NULL,
    original_name character varying(500) NOT NULL,
    storage_path character varying(1000) NOT NULL,
    size_bytes bigint,
    page_count integer,
    folder_id uuid,
    owner_id uuid,
    checksum character varying(64),
    is_deleted boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    erp_source character varying(100),
    erp_id character varying(200),
    has_password boolean DEFAULT false NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    description text,
    current_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.pdf_files OWNER TO postgres;

--
-- Name: pdf_folders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pdf_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    parent_id uuid,
    owner_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.pdf_folders OWNER TO postgres;

--
-- Name: pdf_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pdf_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.pdf_sessions OWNER TO postgres;

--
-- Name: pdf_users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pdf_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username character varying(50) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'viewer'::character varying NOT NULL,
    totp_secret character varying(200),
    totp_enabled boolean DEFAULT false NOT NULL,
    totp_pending boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    session_timeout_minutes integer DEFAULT 240 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login timestamp with time zone,
    CONSTRAINT pdf_users_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'editor'::character varying, 'viewer'::character varying])::text[])))
);


ALTER TABLE public.pdf_users OWNER TO postgres;

--
-- Name: pilgrim_bus_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pilgrim_bus_assignments (
    id text NOT NULL,
    bus_id text NOT NULL,
    pilgrim_id text NOT NULL,
    seat_number text,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.pilgrim_bus_assignments OWNER TO postgres;

--
-- Name: pilgrim_room_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pilgrim_room_assignments (
    id text NOT NULL,
    hotel_id text NOT NULL,
    room_id text NOT NULL,
    pilgrim_id text NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.pilgrim_room_assignments OWNER TO postgres;

--
-- Name: pilgrims; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pilgrims (
    id text NOT NULL,
    group_id text NOT NULL,
    serial_number integer NOT NULL,
    full_name text NOT NULL,
    passport_number text,
    visa_number text,
    date_of_birth text,
    gender text,
    blood_group text,
    photo_url text,
    mobile_india text,
    mobile_saudi text,
    address text,
    city text,
    state text,
    room_number text,
    bus_number text,
    relation text,
    cover_number text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    medical_condition text,
    room_type text,
    seat_number text,
    salutation text,
    passport_issue_date text,
    passport_expiry_date text,
    passport_place_of_issue text,
    room_hotel text,
    room_id text,
    barcode_id text,
    family_id text,
    family_relation text,
    family_head boolean DEFAULT false,
    room_notes text,
    visa_status text,
    visa_type text,
    visa_applied_date text,
    visa_received_date text
);


ALTER TABLE public.pilgrims OWNER TO postgres;

--
-- Name: pilgrims_families; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pilgrims_families (
    id text NOT NULL,
    group_id text NOT NULL,
    family_name text,
    head_pilgrim_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.pilgrims_families OWNER TO postgres;

--
-- Name: pnr_passengers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pnr_passengers (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    pnr_id text NOT NULL,
    pilgrim_id text,
    pilgrim_name text,
    passport_number text,
    seat_number text,
    ticket_number text,
    status text DEFAULT 'confirmed'::text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.pnr_passengers OWNER TO postgres;

--
-- Name: pnr_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pnr_records (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    pnr_number text NOT NULL,
    booking_id text,
    group_id text,
    airline_id text,
    airline_name text,
    flight_number text,
    sector text,
    departure_date date,
    departure_time text,
    arrival_time text,
    seat_count integer DEFAULT 0,
    seat_numbers text,
    status text DEFAULT 'active'::text,
    ticket_numbers text,
    issued_at timestamp with time zone,
    issued_by text,
    cancelled_at timestamp with time zone,
    cancellation_reason text,
    fare_amount numeric(12,2),
    tax_amount numeric(12,2),
    notes text,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.pnr_records OWNER TO postgres;

--
-- Name: provider_health_status; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.provider_health_status (
    provider text NOT NULL,
    channel text NOT NULL,
    display_name text NOT NULL,
    circuit_state text DEFAULT 'closed'::text NOT NULL,
    consecutive_failures integer DEFAULT 0 NOT NULL,
    last_success_at timestamp with time zone,
    last_failure_at timestamp with time zone,
    last_failure_reason text,
    last_test_at timestamp with time zone,
    last_test_result text,
    total_sent_24h integer DEFAULT 0 NOT NULL,
    total_failed_24h integer DEFAULT 0 NOT NULL,
    avg_response_ms integer,
    is_enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.provider_health_status OWNER TO postgres;

--
-- Name: purchase_order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.purchase_order_items (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    po_id text NOT NULL,
    description text NOT NULL,
    quantity numeric(10,3) DEFAULT 1,
    unit_price numeric(12,2) DEFAULT 0,
    total_price numeric(12,2) DEFAULT 0,
    received_qty numeric(10,3) DEFAULT 0,
    account_id text
);


ALTER TABLE public.purchase_order_items OWNER TO postgres;

--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.purchase_orders (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    po_number text,
    vendor_id text,
    vendor_name text NOT NULL,
    category text DEFAULT 'others'::text,
    status text DEFAULT 'draft'::text NOT NULL,
    order_date date DEFAULT CURRENT_DATE NOT NULL,
    expected_date date,
    subtotal numeric(12,2) DEFAULT 0,
    tax_amount numeric(12,2) DEFAULT 0,
    total_amount numeric(12,2) DEFAULT 0,
    notes text,
    approved_by text,
    approved_at timestamp with time zone,
    received_at timestamp with time zone,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.purchase_orders OWNER TO postgres;

--
-- Name: push_campaigns; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.push_campaigns (
    id text NOT NULL,
    title text NOT NULL,
    body text,
    url text,
    filter text DEFAULT 'all'::text,
    total_tokens integer DEFAULT 0,
    sent integer DEFAULT 0,
    failed integer DEFAULT 0,
    status text DEFAULT 'completed'::text,
    sent_by text,
    error text,
    sent_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.push_campaigns OWNER TO postgres;

--
-- Name: rcs_template_mappings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.rcs_template_mappings (
    erp_event text NOT NULL,
    template_name text DEFAULT ''::text NOT NULL,
    template_id text,
    alt_template_id text,
    carrier text DEFAULT 'jio'::text,
    template_type text DEFAULT 'transactional'::text,
    variables_required text[] DEFAULT '{}'::text[],
    enabled boolean DEFAULT true,
    last_success_at timestamp with time zone,
    last_failure_at timestamp with time zone,
    last_failure_reason text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.rcs_template_mappings OWNER TO postgres;

--
-- Name: receipt_number_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.receipt_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.receipt_number_seq OWNER TO postgres;

--
-- Name: receipts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.receipts (
    id text NOT NULL,
    receipt_number text NOT NULL,
    payment_id text NOT NULL,
    booking_id text NOT NULL,
    customer_id text,
    customer_name text,
    booking_number text,
    package_name text,
    payment_date text,
    payment_method text,
    reference_number text,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    total_paid numeric(12,2) DEFAULT 0 NOT NULL,
    outstanding_balance numeric(12,2) DEFAULT 0 NOT NULL,
    received_by text,
    company_name text DEFAULT 'Al Burhan Tours & Travels'::text NOT NULL,
    pdf_path text,
    is_void boolean DEFAULT false NOT NULL,
    void_reason text,
    voided_at timestamp with time zone,
    voided_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.receipts OWNER TO postgres;

--
-- Name: refund_number_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.refund_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.refund_number_seq OWNER TO postgres;

--
-- Name: refunds; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.refunds (
    id text NOT NULL,
    refund_number text NOT NULL,
    booking_id text NOT NULL,
    payment_id text,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    refund_method text DEFAULT 'bank_transfer'::text NOT NULL,
    refund_reason text NOT NULL,
    reference_number text,
    requested_by text,
    approved_by text,
    status text DEFAULT 'pending'::text NOT NULL,
    approved_at timestamp with time zone,
    processed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.refunds OWNER TO postgres;

--
-- Name: reminder_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reminder_logs (
    id text NOT NULL,
    booking_id text NOT NULL,
    channel public.reminder_channel DEFAULT 'whatsapp'::public.reminder_channel NOT NULL,
    status public.reminder_status DEFAULT 'sent'::public.reminder_status NOT NULL,
    sent_at timestamp without time zone DEFAULT now() NOT NULL,
    triggered_by text DEFAULT 'cron'::text NOT NULL,
    notes text
);


ALTER TABLE public.reminder_logs OWNER TO postgres;

--
-- Name: salary_components; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.salary_components (
    id text NOT NULL,
    employee_id text NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'earning'::text NOT NULL,
    calculation text DEFAULT 'fixed'::text NOT NULL,
    value numeric(12,2) DEFAULT 0 NOT NULL,
    basis text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.salary_components OWNER TO postgres;

--
-- Name: salary_slips; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.salary_slips (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    employee_id text NOT NULL,
    payroll_run_id text,
    month integer NOT NULL,
    year integer NOT NULL,
    basic_salary numeric(12,2) DEFAULT 0,
    hra numeric(12,2) DEFAULT 0,
    conveyance numeric(12,2) DEFAULT 0,
    other_allowances numeric(12,2) DEFAULT 0,
    gross_salary numeric(12,2) DEFAULT 0,
    pf_deduction numeric(12,2) DEFAULT 0,
    esi_deduction numeric(12,2) DEFAULT 0,
    tds_deduction numeric(12,2) DEFAULT 0,
    advance_deduction numeric(12,2) DEFAULT 0,
    other_deductions numeric(12,2) DEFAULT 0,
    total_deductions numeric(12,2) DEFAULT 0,
    net_salary numeric(12,2) DEFAULT 0,
    days_present integer DEFAULT 0,
    days_absent integer DEFAULT 0,
    days_leave integer DEFAULT 0,
    payment_mode text DEFAULT 'bank_transfer'::text,
    paid_at timestamp with time zone,
    status text DEFAULT 'draft'::text,
    notes text,
    generated_by text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.salary_slips OWNER TO postgres;

--
-- Name: scheduled_notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scheduled_notifications (
    id text NOT NULL,
    event_type text NOT NULL,
    channel text NOT NULL,
    recipient text NOT NULL,
    customer_id text,
    booking_id text,
    customer_name text,
    message text NOT NULL,
    subject text,
    scheduled_at timestamp with time zone NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.scheduled_notifications OWNER TO postgres;

--
-- Name: sender_ids; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sender_ids (
    id text NOT NULL,
    sender_id text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    default_sender boolean DEFAULT false NOT NULL,
    header_type text,
    creator text,
    header_classification text,
    valid_till date,
    registration_date date,
    operator_status text,
    global_status text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.sender_ids OWNER TO postgres;

--
-- Name: session; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


ALTER TABLE public.session OWNER TO postgres;

--
-- Name: social_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.social_messages (
    id integer NOT NULL,
    platform character varying(80) NOT NULL,
    message_id character varying(255),
    sender_id character varying(255),
    sender_name character varying(255),
    sender_phone character varying(50),
    message_text text,
    message_type character varying(50) DEFAULT 'text'::character varying,
    media_url text,
    raw_data jsonb,
    lead_id integer,
    lead_text_id text,
    status character varying(50) DEFAULT 'unread'::character varying,
    assigned_to integer,
    notes text,
    replied_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    is_internal_note boolean DEFAULT false,
    direction character varying(20) DEFAULT 'incoming'::character varying,
    replied_by text,
    reply_text text,
    delivery_status text DEFAULT 'sent'::text,
    template_used text,
    read_at timestamp with time zone
);


ALTER TABLE public.social_messages OWNER TO postgres;

--
-- Name: social_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.social_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.social_messages_id_seq OWNER TO postgres;

--
-- Name: social_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.social_messages_id_seq OWNED BY public.social_messages.id;


--
-- Name: social_platform_configs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.social_platform_configs (
    id integer NOT NULL,
    platform character varying(80) NOT NULL,
    enabled boolean DEFAULT false,
    status character varying(50) DEFAULT 'disconnected'::character varying,
    api_key_encrypted text,
    extra_fields_encrypted text,
    webhook_url text,
    webhook_verified boolean DEFAULT false,
    last_tested timestamp with time zone,
    last_sync timestamp with time zone,
    test_result jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.social_platform_configs OWNER TO postgres;

--
-- Name: social_platform_configs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.social_platform_configs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.social_platform_configs_id_seq OWNER TO postgres;

--
-- Name: social_platform_configs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.social_platform_configs_id_seq OWNED BY public.social_platform_configs.id;


--
-- Name: staff; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.staff (
    id text NOT NULL,
    staff_id text,
    company_id text DEFAULT 'alburhan'::text NOT NULL,
    full_name text NOT NULL,
    designation text,
    department text,
    role text DEFAULT 'airport_staff'::text NOT NULL,
    employee_code text,
    mobile_india text,
    blood_group text,
    date_of_birth text,
    address text,
    emergency_contact text,
    emergency_mobile text,
    joining_date text,
    valid_upto text,
    photo_url text,
    qr_token text,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    group_id text,
    father_name text,
    aadhaar_last_4 text
);


ALTER TABLE public.staff OWNER TO postgres;

--
-- Name: staff_id_seq_abt; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.staff_id_seq_abt
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.staff_id_seq_abt OWNER TO postgres;

--
-- Name: staff_id_seq_hzn; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.staff_id_seq_hzn
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.staff_id_seq_hzn OWNER TO postgres;

--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.suppliers (
    id text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    contact_name text,
    contact_mobile text,
    contact_email text,
    address text,
    city text,
    country text,
    gst_number text,
    payment_terms text,
    notes text,
    contract_expiry date,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.suppliers OWNER TO postgres;

--
-- Name: support_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.support_messages (
    id text NOT NULL,
    ticket_id text NOT NULL,
    sender_type text NOT NULL,
    sender_id text NOT NULL,
    sender_name text,
    message text NOT NULL,
    attachment_url text,
    is_internal boolean DEFAULT false NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT support_messages_sender_type_check CHECK ((sender_type = ANY (ARRAY['customer'::text, 'admin'::text])))
);


ALTER TABLE public.support_messages OWNER TO postgres;

--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.support_tickets (
    id text NOT NULL,
    ticket_number text NOT NULL,
    customer_id text NOT NULL,
    booking_id text,
    subject text NOT NULL,
    category text DEFAULT 'general'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    assigned_to text,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.support_tickets OWNER TO postgres;

--
-- Name: tasks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tasks (
    id text NOT NULL,
    title text NOT NULL,
    description text,
    priority text DEFAULT 'medium'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    assigned_to text,
    assigned_name text,
    due_date date,
    category text DEFAULT 'general'::text,
    booking_id text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


ALTER TABLE public.tasks OWNER TO postgres;

--
-- Name: tent_allocations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tent_allocations (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    group_id text NOT NULL,
    pilgrim_id text NOT NULL,
    mina_camp text,
    tent_number text,
    bed_number text,
    maktab_number text,
    maktab_name text,
    maktab_area text,
    arafat_camp text,
    muzdalifah_camp text,
    status text DEFAULT 'allocated'::text,
    notes text,
    allocated_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.tent_allocations OWNER TO postgres;

--
-- Name: transport_routes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.transport_routes (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    name text NOT NULL,
    from_location text NOT NULL,
    to_location text NOT NULL,
    distance_km numeric(8,2),
    estimated_mins integer,
    route_type text DEFAULT 'airport_transfer'::text,
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.transport_routes OWNER TO postgres;

--
-- Name: transport_trips; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.transport_trips (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    vehicle_id text,
    driver_id text,
    route_id text,
    group_id text,
    booking_id text,
    trip_date date NOT NULL,
    departure_time text,
    arrival_time text,
    from_location text,
    to_location text,
    passenger_count integer DEFAULT 0,
    status text DEFAULT 'scheduled'::text,
    odometer_start numeric(10,2),
    odometer_end numeric(10,2),
    notes text,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.transport_trips OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id text NOT NULL,
    name text,
    mobile text NOT NULL,
    email text,
    role public.user_role DEFAULT 'customer'::public.user_role NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    admin_role text DEFAULT 'read_only'::text NOT NULL,
    assigned_group_ids text[] DEFAULT '{}'::text[] NOT NULL,
    blood_group text,
    emergency_contact_name text,
    emergency_contact_mobile text,
    profile_photo_url text,
    state text,
    city text,
    country text,
    password_hash text,
    is_active boolean DEFAULT true NOT NULL,
    kyc_status text DEFAULT 'pending'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    is_verified boolean DEFAULT false NOT NULL,
    branch_id text
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: vehicles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vehicles (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    reg_number text NOT NULL,
    type text DEFAULT 'bus'::text,
    make text,
    model text,
    year integer,
    capacity integer DEFAULT 40,
    fuel_type text DEFAULT 'diesel'::text,
    color text,
    insurance_expiry date,
    permit_expiry date,
    fitness_expiry date,
    pollution_expiry date,
    is_active boolean DEFAULT true,
    current_driver_id text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.vehicles OWNER TO postgres;

--
-- Name: vendor_bill_payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vendor_bill_payments (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    bill_id text NOT NULL,
    amount numeric(12,2) NOT NULL,
    payment_mode text DEFAULT 'bank_transfer'::text,
    payment_date date DEFAULT CURRENT_DATE,
    reference text,
    notes text,
    created_by text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.vendor_bill_payments OWNER TO postgres;

--
-- Name: vendor_bills; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vendor_bills (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    bill_number text,
    vendor_id text,
    vendor_name text NOT NULL,
    po_id text,
    invoice_number text,
    bill_date date DEFAULT CURRENT_DATE NOT NULL,
    due_date date,
    subtotal numeric(12,2) DEFAULT 0,
    tax_amount numeric(12,2) DEFAULT 0,
    total_amount numeric(12,2) DEFAULT 0 NOT NULL,
    paid_amount numeric(12,2) DEFAULT 0,
    status text DEFAULT 'pending'::text NOT NULL,
    notes text,
    approved_by text,
    approved_at timestamp with time zone,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.vendor_bills OWNER TO postgres;

--
-- Name: vendors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vendors (
    id text NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'other'::text NOT NULL,
    gst_number text,
    pan text,
    bank_account text,
    ifsc text,
    contact text,
    email text,
    address text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.vendors OWNER TO postgres;

--
-- Name: wa_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.wa_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    display_name text NOT NULL,
    category text DEFAULT 'UTILITY'::text NOT NULL,
    language text DEFAULT 'en'::text NOT NULL,
    status text DEFAULT 'local'::text NOT NULL,
    header_type text DEFAULT 'none'::text NOT NULL,
    header_text text,
    body_text text NOT NULL,
    footer_text text,
    buttons jsonb DEFAULT '[]'::jsonb NOT NULL,
    variables jsonb DEFAULT '[]'::jsonb NOT NULL,
    event_type text,
    meta_template_name text,
    enabled boolean DEFAULT true NOT NULL,
    is_builtin boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    template_id text
);


ALTER TABLE public.wa_templates OWNER TO postgres;

--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.webhook_events (
    id text NOT NULL,
    platform text NOT NULL,
    event_type text NOT NULL,
    payload jsonb,
    processed boolean DEFAULT false,
    processed_at timestamp with time zone,
    error text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.webhook_events OWNER TO postgres;

--
-- Name: workflow_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workflow_logs (
    id integer NOT NULL,
    trigger_type text NOT NULL,
    booking_id text,
    customer_id text,
    customer_name text,
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    retry_count integer DEFAULT 0 NOT NULL,
    execution_time_ms integer,
    context jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


ALTER TABLE public.workflow_logs OWNER TO postgres;

--
-- Name: workflow_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.workflow_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.workflow_logs_id_seq OWNER TO postgres;

--
-- Name: workflow_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.workflow_logs_id_seq OWNED BY public.workflow_logs.id;


--
-- Name: workflow_queue; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workflow_queue (
    id integer NOT NULL,
    trigger_type text NOT NULL,
    booking_id text,
    customer_id text,
    context jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    scheduled_at timestamp with time zone DEFAULT now() NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.workflow_queue OWNER TO postgres;

--
-- Name: workflow_queue_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.workflow_queue_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.workflow_queue_id_seq OWNER TO postgres;

--
-- Name: workflow_queue_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.workflow_queue_id_seq OWNED BY public.workflow_queue.id;


--
-- Name: workflow_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workflow_rules (
    id integer NOT NULL,
    name text NOT NULL,
    trigger_type text NOT NULL,
    description text,
    enabled boolean DEFAULT true NOT NULL,
    group_name text DEFAULT 'general'::text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.workflow_rules OWNER TO postgres;

--
-- Name: workflow_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.workflow_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.workflow_rules_id_seq OWNER TO postgres;

--
-- Name: workflow_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.workflow_rules_id_seq OWNED BY public.workflow_rules.id;


--
-- Name: ziyarat_attendance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ziyarat_attendance (
    id integer NOT NULL,
    schedule_id text NOT NULL,
    pilgrim_id text NOT NULL,
    checked_in boolean DEFAULT false,
    check_in_time timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ziyarat_attendance OWNER TO postgres;

--
-- Name: ziyarat_attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ziyarat_attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ziyarat_attendance_id_seq OWNER TO postgres;

--
-- Name: ziyarat_attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ziyarat_attendance_id_seq OWNED BY public.ziyarat_attendance.id;


--
-- Name: ziyarat_schedules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ziyarat_schedules (
    id text NOT NULL,
    name text NOT NULL,
    location text NOT NULL,
    city text DEFAULT 'Makkah'::text NOT NULL,
    schedule_date text NOT NULL,
    departure_time text,
    return_time text,
    bus_id text,
    group_id text,
    guide_name text,
    guide_mobile text,
    capacity integer DEFAULT 50,
    notes text,
    status text DEFAULT 'scheduled'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ziyarat_schedules OWNER TO postgres;

--
-- Name: admin_events id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_events ALTER COLUMN id SET DEFAULT nextval('public.admin_events_id_seq'::regclass);


--
-- Name: communication_audit_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.communication_audit_logs ALTER COLUMN id SET DEFAULT nextval('public.communication_audit_logs_id_seq'::regclass);


--
-- Name: communication_status_history id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.communication_status_history ALTER COLUMN id SET DEFAULT nextval('public.communication_status_history_id_seq'::regclass);


--
-- Name: customer_timeline id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_timeline ALTER COLUMN id SET DEFAULT nextval('public.customer_timeline_id_seq'::regclass);


--
-- Name: delete_audit_log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.delete_audit_log ALTER COLUMN id SET DEFAULT nextval('public.delete_audit_log_id_seq'::regclass);


--
-- Name: lead_assignment_rules id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_assignment_rules ALTER COLUMN id SET DEFAULT nextval('public.lead_assignment_rules_id_seq'::regclass);


--
-- Name: social_messages id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.social_messages ALTER COLUMN id SET DEFAULT nextval('public.social_messages_id_seq'::regclass);


--
-- Name: social_platform_configs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.social_platform_configs ALTER COLUMN id SET DEFAULT nextval('public.social_platform_configs_id_seq'::regclass);


--
-- Name: workflow_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflow_logs ALTER COLUMN id SET DEFAULT nextval('public.workflow_logs_id_seq'::regclass);


--
-- Name: workflow_queue id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflow_queue ALTER COLUMN id SET DEFAULT nextval('public.workflow_queue_id_seq'::regclass);


--
-- Name: workflow_rules id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflow_rules ALTER COLUMN id SET DEFAULT nextval('public.workflow_rules_id_seq'::regclass);


--
-- Name: ziyarat_attendance id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ziyarat_attendance ALTER COLUMN id SET DEFAULT nextval('public.ziyarat_attendance_id_seq'::regclass);


--
-- Name: account_opening_balances account_opening_balances_account_id_financial_year_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_opening_balances
    ADD CONSTRAINT account_opening_balances_account_id_financial_year_id_key UNIQUE (account_id, financial_year_id);


--
-- Name: account_opening_balances account_opening_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_opening_balances
    ADD CONSTRAINT account_opening_balances_pkey PRIMARY KEY (id);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: admin_events admin_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_events
    ADD CONSTRAINT admin_events_pkey PRIMARY KEY (id);


--
-- Name: admin_notifications admin_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_notifications
    ADD CONSTRAINT admin_notifications_pkey PRIMARY KEY (id);


--
-- Name: agent_commissions agent_commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_commissions
    ADD CONSTRAINT agent_commissions_pkey PRIMARY KEY (id);


--
-- Name: agent_wallet_transactions agent_wallet_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_wallet_transactions
    ADD CONSTRAINT agent_wallet_transactions_pkey PRIMARY KEY (id);


--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (id);


--
-- Name: agreement_audit_logs agreement_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agreement_audit_logs
    ADD CONSTRAINT agreement_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: agreements agreements_agreement_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agreements
    ADD CONSTRAINT agreements_agreement_number_key UNIQUE (agreement_number);


--
-- Name: agreements agreements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agreements
    ADD CONSTRAINT agreements_pkey PRIMARY KEY (id);


--
-- Name: agreements agreements_verification_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agreements
    ADD CONSTRAINT agreements_verification_token_key UNIQUE (verification_token);


--
-- Name: ai_conversation_messages ai_conversation_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_conversation_messages
    ADD CONSTRAINT ai_conversation_messages_pkey PRIMARY KEY (id);


--
-- Name: ai_conversations ai_conversations_conversation_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_conversation_key_key UNIQUE (conversation_key);


--
-- Name: ai_conversations ai_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_pkey PRIMARY KEY (id);


--
-- Name: ai_knowledge_base ai_knowledge_base_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_knowledge_base
    ADD CONSTRAINT ai_knowledge_base_pkey PRIMARY KEY (id);


--
-- Name: airline_master airline_master_iata_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.airline_master
    ADD CONSTRAINT airline_master_iata_code_key UNIQUE (iata_code);


--
-- Name: airline_master airline_master_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.airline_master
    ADD CONSTRAINT airline_master_pkey PRIMARY KEY (id);


--
-- Name: api_settings api_settings_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_settings
    ADD CONSTRAINT api_settings_key_key UNIQUE (key);


--
-- Name: api_settings api_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_settings
    ADD CONSTRAINT api_settings_pkey PRIMARY KEY (id);


--
-- Name: api_settings api_settings_provider_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_settings
    ADD CONSTRAINT api_settings_provider_key UNIQUE (provider);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: attendance_events attendance_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_events
    ADD CONSTRAINT attendance_events_pkey PRIMARY KEY (id);


--
-- Name: attendance_logs attendance_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_logs
    ADD CONSTRAINT attendance_logs_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: automation_audit_logs automation_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_audit_logs
    ADD CONSTRAINT automation_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: automation_service_tokens automation_service_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_service_tokens
    ADD CONSTRAINT automation_service_tokens_pkey PRIMARY KEY (id);


--
-- Name: automation_service_tokens automation_service_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.automation_service_tokens
    ADD CONSTRAINT automation_service_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: bank_settings bank_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bank_settings
    ADD CONSTRAINT bank_settings_pkey PRIMARY KEY (id);


--
-- Name: booking_audit_logs booking_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.booking_audit_logs
    ADD CONSTRAINT booking_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: booking_confirmation_notifications booking_confirmation_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.booking_confirmation_notifications
    ADD CONSTRAINT booking_confirmation_notifications_pkey PRIMARY KEY (id);


--
-- Name: booking_settings booking_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.booking_settings
    ADD CONSTRAINT booking_settings_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_booking_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_booking_number_unique UNIQUE (booking_number);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: broadcasts broadcasts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.broadcasts
    ADD CONSTRAINT broadcasts_pkey PRIMARY KEY (id);


--
-- Name: buses buses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.buses
    ADD CONSTRAINT buses_pkey PRIMARY KEY (id);


--
-- Name: comm_events comm_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comm_events
    ADD CONSTRAINT comm_events_pkey PRIMARY KEY (id);


--
-- Name: comment_automation_rules comment_automation_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comment_automation_rules
    ADD CONSTRAINT comment_automation_rules_pkey PRIMARY KEY (id);


--
-- Name: communication_audit_logs communication_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.communication_audit_logs
    ADD CONSTRAINT communication_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: communication_consents communication_consents_email_channel_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.communication_consents
    ADD CONSTRAINT communication_consents_email_channel_key UNIQUE (email, channel);


--
-- Name: communication_consents communication_consents_mobile_channel_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.communication_consents
    ADD CONSTRAINT communication_consents_mobile_channel_key UNIQUE (mobile, channel);


--
-- Name: communication_consents communication_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.communication_consents
    ADD CONSTRAINT communication_consents_pkey PRIMARY KEY (id);


--
-- Name: communication_event_mappings communication_event_mappings_event_type_channel_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.communication_event_mappings
    ADD CONSTRAINT communication_event_mappings_event_type_channel_key UNIQUE (event_type, channel);


--
-- Name: communication_event_mappings communication_event_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.communication_event_mappings
    ADD CONSTRAINT communication_event_mappings_pkey PRIMARY KEY (id);


--
-- Name: communication_schedules communication_schedules_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.communication_schedules
    ADD CONSTRAINT communication_schedules_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: communication_schedules communication_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.communication_schedules
    ADD CONSTRAINT communication_schedules_pkey PRIMARY KEY (id);


--
-- Name: communication_status_history communication_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.communication_status_history
    ADD CONSTRAINT communication_status_history_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: crm_assignment_rules crm_assignment_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.crm_assignment_rules
    ADD CONSTRAINT crm_assignment_rules_pkey PRIMARY KEY (id);


--
-- Name: customer_ledger_entries customer_ledger_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_ledger_entries
    ADD CONSTRAINT customer_ledger_entries_pkey PRIMARY KEY (id);


--
-- Name: customer_notification_preferences customer_notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_notification_preferences
    ADD CONSTRAINT customer_notification_preferences_pkey PRIMARY KEY (customer_id);


--
-- Name: customer_notifications customer_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_notifications
    ADD CONSTRAINT customer_notifications_pkey PRIMARY KEY (id);


--
-- Name: customer_portal_activity customer_portal_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_portal_activity
    ADD CONSTRAINT customer_portal_activity_pkey PRIMARY KEY (id);


--
-- Name: customer_profile_edits customer_profile_edits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_profile_edits
    ADD CONSTRAINT customer_profile_edits_pkey PRIMARY KEY (id);


--
-- Name: customer_profiles customer_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_profiles
    ADD CONSTRAINT customer_profiles_pkey PRIMARY KEY (id);


--
-- Name: customer_profiles customer_profiles_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_profiles
    ADD CONSTRAINT customer_profiles_user_id_unique UNIQUE (user_id);


--
-- Name: customer_push_tokens customer_push_tokens_customer_id_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_push_tokens
    ADD CONSTRAINT customer_push_tokens_customer_id_token_key UNIQUE (customer_id, token);


--
-- Name: customer_push_tokens customer_push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_push_tokens
    ADD CONSTRAINT customer_push_tokens_pkey PRIMARY KEY (id);


--
-- Name: customer_timeline customer_timeline_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_timeline
    ADD CONSTRAINT customer_timeline_pkey PRIMARY KEY (id);


--
-- Name: delete_audit_log delete_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.delete_audit_log
    ADD CONSTRAINT delete_audit_log_pkey PRIMARY KEY (id);


--
-- Name: document_download_logs document_download_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_download_logs
    ADD CONSTRAINT document_download_logs_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: drivers drivers_license_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_license_number_key UNIQUE (license_number);


--
-- Name: drivers drivers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_pkey PRIMARY KEY (id);


--
-- Name: employee_advances employee_advances_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_advances
    ADD CONSTRAINT employee_advances_pkey PRIMARY KEY (id);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: error_request_logs error_request_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.error_request_logs
    ADD CONSTRAINT error_request_logs_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: fb_ads_sync fb_ads_sync_campaign_id_ad_id_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fb_ads_sync
    ADD CONSTRAINT fb_ads_sync_campaign_id_ad_id_date_key UNIQUE (campaign_id, ad_id, date);


--
-- Name: fb_ads_sync fb_ads_sync_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fb_ads_sync
    ADD CONSTRAINT fb_ads_sync_pkey PRIMARY KEY (id);


--
-- Name: feedback feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);


--
-- Name: finance_audit_logs finance_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_audit_logs
    ADD CONSTRAINT finance_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: financial_years financial_years_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.financial_years
    ADD CONSTRAINT financial_years_pkey PRIMARY KEY (id);


--
-- Name: flight_baggage flight_baggage_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flight_baggage
    ADD CONSTRAINT flight_baggage_pkey PRIMARY KEY (id);


--
-- Name: flight_baggage flight_baggage_tag_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flight_baggage
    ADD CONSTRAINT flight_baggage_tag_number_key UNIQUE (tag_number);


--
-- Name: fuel_logs fuel_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fuel_logs
    ADD CONSTRAINT fuel_logs_pkey PRIMARY KEY (id);


--
-- Name: gallery_images gallery_images_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gallery_images
    ADD CONSTRAINT gallery_images_pkey PRIMARY KEY (id);


--
-- Name: group_broadcast_logs group_broadcast_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.group_broadcast_logs
    ADD CONSTRAINT group_broadcast_logs_pkey PRIMARY KEY (id);


--
-- Name: group_flights group_flights_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.group_flights
    ADD CONSTRAINT group_flights_pkey PRIMARY KEY (id);


--
-- Name: group_tracking group_tracking_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.group_tracking
    ADD CONSTRAINT group_tracking_pkey PRIMARY KEY (group_id);


--
-- Name: hajj_groups hajj_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hajj_groups
    ADD CONSTRAINT hajj_groups_pkey PRIMARY KEY (id);


--
-- Name: hajj_rooms hajj_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hajj_rooms
    ADD CONSTRAINT hajj_rooms_pkey PRIMARY KEY (id);


--
-- Name: holy_site_allocations holy_site_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.holy_site_allocations
    ADD CONSTRAINT holy_site_allocations_pkey PRIMARY KEY (id);


--
-- Name: hotel_checkins hotel_checkins_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hotel_checkins
    ADD CONSTRAINT hotel_checkins_pkey PRIMARY KEY (id);


--
-- Name: hotel_contracts hotel_contracts_contract_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hotel_contracts
    ADD CONSTRAINT hotel_contracts_contract_number_key UNIQUE (contract_number);


--
-- Name: hotel_contracts hotel_contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hotel_contracts
    ADD CONSTRAINT hotel_contracts_pkey PRIMARY KEY (id);


--
-- Name: hotel_rooms hotel_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hotel_rooms
    ADD CONSTRAINT hotel_rooms_pkey PRIMARY KEY (id);


--
-- Name: hotel_vouchers hotel_vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hotel_vouchers
    ADD CONSTRAINT hotel_vouchers_pkey PRIMARY KEY (id);


--
-- Name: hotel_vouchers hotel_vouchers_voucher_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hotel_vouchers
    ADD CONSTRAINT hotel_vouchers_voucher_number_key UNIQUE (voucher_number);


--
-- Name: hotels hotels_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hotels
    ADD CONSTRAINT hotels_pkey PRIMARY KEY (id);


--
-- Name: inquiries inquiries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inquiries
    ADD CONSTRAINT inquiries_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);


--
-- Name: journal_entry_lines journal_entry_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_pkey PRIMARY KEY (id);


--
-- Name: lead_activities lead_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_pkey PRIMARY KEY (id);


--
-- Name: lead_assignment_rules lead_assignment_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_assignment_rules
    ADD CONSTRAINT lead_assignment_rules_pkey PRIMARY KEY (id);


--
-- Name: lead_audit_log lead_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_audit_log
    ADD CONSTRAINT lead_audit_log_pkey PRIMARY KEY (id);


--
-- Name: lead_auto_followup_log lead_auto_followup_log_lead_id_seq_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_auto_followup_log
    ADD CONSTRAINT lead_auto_followup_log_lead_id_seq_key_key UNIQUE (lead_id, seq_key);


--
-- Name: lead_auto_followup_log lead_auto_followup_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_auto_followup_log
    ADD CONSTRAINT lead_auto_followup_log_pkey PRIMARY KEY (id);


--
-- Name: lead_followups lead_followups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_followups
    ADD CONSTRAINT lead_followups_pkey PRIMARY KEY (id);


--
-- Name: lead_web_form_submissions lead_web_form_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_web_form_submissions
    ADD CONSTRAINT lead_web_form_submissions_pkey PRIMARY KEY (id);


--
-- Name: lead_web_forms lead_web_forms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_web_forms
    ADD CONSTRAINT lead_web_forms_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: leave_balances leave_balances_employee_id_leave_type_id_year_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT leave_balances_employee_id_leave_type_id_year_key UNIQUE (employee_id, leave_type_id, year);


--
-- Name: leave_balances leave_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT leave_balances_pkey PRIMARY KEY (id);


--
-- Name: leave_requests leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_pkey PRIMARY KEY (id);


--
-- Name: leave_types leave_types_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_types
    ADD CONSTRAINT leave_types_name_key UNIQUE (name);


--
-- Name: leave_types leave_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_types
    ADD CONSTRAINT leave_types_pkey PRIMARY KEY (id);


--
-- Name: loyalty_points loyalty_points_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loyalty_points
    ADD CONSTRAINT loyalty_points_customer_id_key UNIQUE (customer_id);


--
-- Name: loyalty_points loyalty_points_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loyalty_points
    ADD CONSTRAINT loyalty_points_pkey PRIMARY KEY (id);


--
-- Name: loyalty_transactions loyalty_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_pkey PRIMARY KEY (id);


--
-- Name: luggage_tags luggage_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.luggage_tags
    ADD CONSTRAINT luggage_tags_pkey PRIMARY KEY (id);


--
-- Name: luggage_tags luggage_tags_tag_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.luggage_tags
    ADD CONSTRAINT luggage_tags_tag_number_key UNIQUE (tag_number);


--
-- Name: maintenance_logs maintenance_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.maintenance_logs
    ADD CONSTRAINT maintenance_logs_pkey PRIMARY KEY (id);


--
-- Name: marketing_campaigns marketing_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.marketing_campaigns
    ADD CONSTRAINT marketing_campaigns_pkey PRIMARY KEY (id);


--
-- Name: medical_cases medical_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.medical_cases
    ADD CONSTRAINT medical_cases_pkey PRIMARY KEY (id);


--
-- Name: meta_delivery_logs meta_delivery_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meta_delivery_logs
    ADD CONSTRAINT meta_delivery_logs_pkey PRIMARY KEY (id);


--
-- Name: meta_media_cache meta_media_cache_file_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meta_media_cache
    ADD CONSTRAINT meta_media_cache_file_hash_key UNIQUE (file_hash);


--
-- Name: meta_media_cache meta_media_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meta_media_cache
    ADD CONSTRAINT meta_media_cache_pkey PRIMARY KEY (id);


--
-- Name: meta_messages meta_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meta_messages
    ADD CONSTRAINT meta_messages_pkey PRIMARY KEY (id);


--
-- Name: meta_messages meta_messages_wamid_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meta_messages
    ADD CONSTRAINT meta_messages_wamid_key UNIQUE (wamid);


--
-- Name: meta_templates meta_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meta_templates
    ADD CONSTRAINT meta_templates_pkey PRIMARY KEY (id);


--
-- Name: meta_templates meta_templates_template_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meta_templates
    ADD CONSTRAINT meta_templates_template_name_key UNIQUE (template_name);


--
-- Name: meta_token_status meta_token_status_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.meta_token_status
    ADD CONSTRAINT meta_token_status_pkey PRIMARY KEY (id);


--
-- Name: notification_auto_settings notification_auto_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_auto_settings
    ADD CONSTRAINT notification_auto_settings_pkey PRIMARY KEY (key);


--
-- Name: notification_campaigns notification_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_campaigns
    ADD CONSTRAINT notification_campaigns_pkey PRIMARY KEY (id);


--
-- Name: notification_logs_dup_audit notification_logs_dup_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_logs_dup_audit
    ADD CONSTRAINT notification_logs_dup_audit_pkey PRIMARY KEY (id);


--
-- Name: notification_logs notification_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_logs
    ADD CONSTRAINT notification_logs_pkey PRIMARY KEY (id);


--
-- Name: notification_retry_queue notification_retry_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_retry_queue
    ADD CONSTRAINT notification_retry_queue_pkey PRIMARY KEY (id);


--
-- Name: notification_settings notification_settings_event_type_channel_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_event_type_channel_key UNIQUE (event_type, channel);


--
-- Name: notification_settings notification_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_pkey PRIMARY KEY (id);


--
-- Name: notification_templates notification_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_pkey PRIMARY KEY (id);


--
-- Name: oauth_connections oauth_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.oauth_connections
    ADD CONSTRAINT oauth_connections_pkey PRIMARY KEY (id);


--
-- Name: oauth_connections oauth_connections_provider_platform_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.oauth_connections
    ADD CONSTRAINT oauth_connections_provider_platform_key UNIQUE (provider, platform);


--
-- Name: offline_payments offline_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_payments
    ADD CONSTRAINT offline_payments_pkey PRIMARY KEY (id);


--
-- Name: offline_payments offline_payments_utr_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.offline_payments
    ADD CONSTRAINT offline_payments_utr_number_key UNIQUE (utr_number);


--
-- Name: orientation_resources orientation_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orientation_resources
    ADD CONSTRAINT orientation_resources_pkey PRIMARY KEY (id);


--
-- Name: otps otps_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.otps
    ADD CONSTRAINT otps_pkey PRIMARY KEY (id);


--
-- Name: package_media package_media_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.package_media
    ADD CONSTRAINT package_media_pkey PRIMARY KEY (id);


--
-- Name: package_requests package_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.package_requests
    ADD CONSTRAINT package_requests_pkey PRIMARY KEY (id);


--
-- Name: packages packages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.packages
    ADD CONSTRAINT packages_pkey PRIMARY KEY (id);


--
-- Name: payment_audit_logs payment_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_audit_logs
    ADD CONSTRAINT payment_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: payment_schedules payment_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_schedules
    ADD CONSTRAINT payment_schedules_pkey PRIMARY KEY (id);


--
-- Name: payment_transactions payment_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_pkey PRIMARY KEY (id);


--
-- Name: payroll_entries payroll_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payroll_entries
    ADD CONSTRAINT payroll_entries_pkey PRIMARY KEY (id);


--
-- Name: payroll_runs payroll_runs_employee_id_month_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_employee_id_month_key UNIQUE (employee_id, month);


--
-- Name: payroll_runs payroll_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_pkey PRIMARY KEY (id);


--
-- Name: pdf_audit_logs pdf_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pdf_audit_logs
    ADD CONSTRAINT pdf_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: pdf_backups pdf_backups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pdf_backups
    ADD CONSTRAINT pdf_backups_pkey PRIMARY KEY (id);


--
-- Name: pdf_file_versions pdf_file_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pdf_file_versions
    ADD CONSTRAINT pdf_file_versions_pkey PRIMARY KEY (id);


--
-- Name: pdf_files pdf_files_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pdf_files
    ADD CONSTRAINT pdf_files_pkey PRIMARY KEY (id);


--
-- Name: pdf_folders pdf_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pdf_folders
    ADD CONSTRAINT pdf_folders_pkey PRIMARY KEY (id);


--
-- Name: pdf_sessions pdf_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pdf_sessions
    ADD CONSTRAINT pdf_sessions_pkey PRIMARY KEY (id);


--
-- Name: pdf_users pdf_users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pdf_users
    ADD CONSTRAINT pdf_users_email_key UNIQUE (email);


--
-- Name: pdf_users pdf_users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pdf_users
    ADD CONSTRAINT pdf_users_pkey PRIMARY KEY (id);


--
-- Name: pdf_users pdf_users_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pdf_users
    ADD CONSTRAINT pdf_users_username_key UNIQUE (username);


--
-- Name: pilgrim_bus_assignments pilgrim_bus_assignments_bus_id_pilgrim_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pilgrim_bus_assignments
    ADD CONSTRAINT pilgrim_bus_assignments_bus_id_pilgrim_id_key UNIQUE (bus_id, pilgrim_id);


--
-- Name: pilgrim_bus_assignments pilgrim_bus_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pilgrim_bus_assignments
    ADD CONSTRAINT pilgrim_bus_assignments_pkey PRIMARY KEY (id);


--
-- Name: pilgrim_room_assignments pilgrim_room_assignments_pilgrim_id_hotel_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pilgrim_room_assignments
    ADD CONSTRAINT pilgrim_room_assignments_pilgrim_id_hotel_id_key UNIQUE (pilgrim_id, hotel_id);


--
-- Name: pilgrim_room_assignments pilgrim_room_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pilgrim_room_assignments
    ADD CONSTRAINT pilgrim_room_assignments_pkey PRIMARY KEY (id);


--
-- Name: pilgrims_families pilgrims_families_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pilgrims_families
    ADD CONSTRAINT pilgrims_families_pkey PRIMARY KEY (id);


--
-- Name: pilgrims pilgrims_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pilgrims
    ADD CONSTRAINT pilgrims_pkey PRIMARY KEY (id);


--
-- Name: pnr_passengers pnr_passengers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pnr_passengers
    ADD CONSTRAINT pnr_passengers_pkey PRIMARY KEY (id);


--
-- Name: pnr_records pnr_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pnr_records
    ADD CONSTRAINT pnr_records_pkey PRIMARY KEY (id);


--
-- Name: provider_health_status provider_health_status_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.provider_health_status
    ADD CONSTRAINT provider_health_status_pkey PRIMARY KEY (provider);


--
-- Name: purchase_order_items purchase_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_po_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_po_number_key UNIQUE (po_number);


--
-- Name: push_campaigns push_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.push_campaigns
    ADD CONSTRAINT push_campaigns_pkey PRIMARY KEY (id);


--
-- Name: rcs_template_mappings rcs_template_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.rcs_template_mappings
    ADD CONSTRAINT rcs_template_mappings_pkey PRIMARY KEY (erp_event);


--
-- Name: receipts receipts_payment_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_payment_id_key UNIQUE (payment_id);


--
-- Name: receipts receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_pkey PRIMARY KEY (id);


--
-- Name: receipts receipts_receipt_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_receipt_number_key UNIQUE (receipt_number);


--
-- Name: refunds refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);


--
-- Name: refunds refunds_refund_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_refund_number_key UNIQUE (refund_number);


--
-- Name: reminder_logs reminder_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reminder_logs
    ADD CONSTRAINT reminder_logs_pkey PRIMARY KEY (id);


--
-- Name: salary_components salary_components_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salary_components
    ADD CONSTRAINT salary_components_pkey PRIMARY KEY (id);


--
-- Name: salary_slips salary_slips_employee_id_month_year_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salary_slips
    ADD CONSTRAINT salary_slips_employee_id_month_year_key UNIQUE (employee_id, month, year);


--
-- Name: salary_slips salary_slips_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salary_slips
    ADD CONSTRAINT salary_slips_pkey PRIMARY KEY (id);


--
-- Name: scheduled_notifications scheduled_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scheduled_notifications
    ADD CONSTRAINT scheduled_notifications_pkey PRIMARY KEY (id);


--
-- Name: sender_ids sender_ids_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sender_ids
    ADD CONSTRAINT sender_ids_pkey PRIMARY KEY (id);


--
-- Name: sender_ids sender_ids_sender_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sender_ids
    ADD CONSTRAINT sender_ids_sender_id_key UNIQUE (sender_id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: social_messages social_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.social_messages
    ADD CONSTRAINT social_messages_pkey PRIMARY KEY (id);


--
-- Name: social_platform_configs social_platform_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.social_platform_configs
    ADD CONSTRAINT social_platform_configs_pkey PRIMARY KEY (id);


--
-- Name: social_platform_configs social_platform_configs_platform_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.social_platform_configs
    ADD CONSTRAINT social_platform_configs_platform_key UNIQUE (platform);


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (id);


--
-- Name: staff staff_qr_token_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_qr_token_unique UNIQUE (qr_token);


--
-- Name: staff staff_staff_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_staff_id_unique UNIQUE (staff_id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: support_messages support_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_ticket_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_ticket_number_key UNIQUE (ticket_number);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: tent_allocations tent_allocations_group_id_pilgrim_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tent_allocations
    ADD CONSTRAINT tent_allocations_group_id_pilgrim_id_key UNIQUE (group_id, pilgrim_id);


--
-- Name: tent_allocations tent_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tent_allocations
    ADD CONSTRAINT tent_allocations_pkey PRIMARY KEY (id);


--
-- Name: transport_routes transport_routes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transport_routes
    ADD CONSTRAINT transport_routes_pkey PRIMARY KEY (id);


--
-- Name: transport_trips transport_trips_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transport_trips
    ADD CONSTRAINT transport_trips_pkey PRIMARY KEY (id);


--
-- Name: users users_mobile_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_mobile_unique UNIQUE (mobile);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vehicles vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);


--
-- Name: vehicles vehicles_reg_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_reg_number_key UNIQUE (reg_number);


--
-- Name: vendor_bill_payments vendor_bill_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendor_bill_payments
    ADD CONSTRAINT vendor_bill_payments_pkey PRIMARY KEY (id);


--
-- Name: vendor_bills vendor_bills_bill_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendor_bills
    ADD CONSTRAINT vendor_bills_bill_number_key UNIQUE (bill_number);


--
-- Name: vendor_bills vendor_bills_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendor_bills
    ADD CONSTRAINT vendor_bills_pkey PRIMARY KEY (id);


--
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);


--
-- Name: wa_templates wa_templates_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wa_templates
    ADD CONSTRAINT wa_templates_name_key UNIQUE (name);


--
-- Name: wa_templates wa_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wa_templates
    ADD CONSTRAINT wa_templates_pkey PRIMARY KEY (id);


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);


--
-- Name: workflow_logs workflow_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflow_logs
    ADD CONSTRAINT workflow_logs_pkey PRIMARY KEY (id);


--
-- Name: workflow_queue workflow_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflow_queue
    ADD CONSTRAINT workflow_queue_pkey PRIMARY KEY (id);


--
-- Name: workflow_rules workflow_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflow_rules
    ADD CONSTRAINT workflow_rules_pkey PRIMARY KEY (id);


--
-- Name: workflow_rules workflow_rules_trigger_type_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflow_rules
    ADD CONSTRAINT workflow_rules_trigger_type_key UNIQUE (trigger_type);


--
-- Name: ziyarat_attendance ziyarat_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ziyarat_attendance
    ADD CONSTRAINT ziyarat_attendance_pkey PRIMARY KEY (id);


--
-- Name: ziyarat_attendance ziyarat_attendance_schedule_id_pilgrim_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ziyarat_attendance
    ADD CONSTRAINT ziyarat_attendance_schedule_id_pilgrim_id_key UNIQUE (schedule_id, pilgrim_id);


--
-- Name: ziyarat_schedules ziyarat_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ziyarat_schedules
    ADD CONSTRAINT ziyarat_schedules_pkey PRIMARY KEY (id);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_session_expire" ON public.session USING btree (expire);


--
-- Name: aal_action_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX aal_action_idx ON public.automation_audit_logs USING btree (action, created_at DESC);


--
-- Name: aal_actor_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX aal_actor_idx ON public.automation_audit_logs USING btree (actor_id, created_at DESC);


--
-- Name: aal_entity_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX aal_entity_idx ON public.automation_audit_logs USING btree (entity_type, entity_id);


--
-- Name: aal_idem_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX aal_idem_idx ON public.automation_audit_logs USING btree (((after_data ->> 'idempotency_key'::text))) WHERE ((after_data ->> 'idempotency_key'::text) IS NOT NULL);


--
-- Name: ac_channel_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ac_channel_idx ON public.ai_conversations USING btree (channel);


--
-- Name: ac_key_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ac_key_idx ON public.ai_conversations USING btree (conversation_key);


--
-- Name: ac_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ac_status_idx ON public.ai_conversations USING btree (status);


--
-- Name: accounts_code_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX accounts_code_idx ON public.accounts USING btree (code);


--
-- Name: acm_conv_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX acm_conv_idx ON public.ai_conversation_messages USING btree (conversation_id, created_at DESC);


--
-- Name: acm_dir_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX acm_dir_idx ON public.ai_conversation_messages USING btree (direction);


--
-- Name: admin_notif_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX admin_notif_created_idx ON public.admin_notifications USING btree (created_at DESC);


--
-- Name: admin_notif_unread_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX admin_notif_unread_idx ON public.admin_notifications USING btree (is_read) WHERE (is_read = false);


--
-- Name: agreements_access_token_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX agreements_access_token_idx ON public.agreements USING btree (access_token) WHERE (access_token IS NOT NULL);


--
-- Name: agreements_booking_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX agreements_booking_id_idx ON public.agreements USING btree (booking_id);


--
-- Name: agreements_booking_revision_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX agreements_booking_revision_uniq ON public.agreements USING btree (booking_id, revision_number) WHERE (status = 'pending_signature'::text);


--
-- Name: agreements_customer_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX agreements_customer_id_idx ON public.agreements USING btree (customer_id);


--
-- Name: agreements_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX agreements_status_idx ON public.agreements USING btree (status);


--
-- Name: agreements_token_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX agreements_token_idx ON public.agreements USING btree (verification_token);


--
-- Name: akb_cat_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX akb_cat_idx ON public.ai_knowledge_base USING btree (category, sort_order);


--
-- Name: akb_lang_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX akb_lang_idx ON public.ai_knowledge_base USING btree (language);


--
-- Name: akb_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX akb_status_idx ON public.ai_knowledge_base USING btree (status, is_active);


--
-- Name: al_actor_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX al_actor_idx ON public.audit_logs USING btree (actor_id);


--
-- Name: al_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX al_created_idx ON public.audit_logs USING btree (created_at);


--
-- Name: al_entity_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX al_entity_idx ON public.audit_logs USING btree (entity_table, entity_id);


--
-- Name: ast_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ast_active_idx ON public.automation_service_tokens USING btree (is_active) WHERE (is_active = true);


--
-- Name: ast_hash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ast_hash_idx ON public.automation_service_tokens USING btree (token_hash);


--
-- Name: bcn_booking_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX bcn_booking_idx ON public.booking_confirmation_notifications USING btree (booking_id);


--
-- Name: bookings_customer_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX bookings_customer_id_idx ON public.bookings USING btree (customer_id);


--
-- Name: bookings_group_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX bookings_group_id_idx ON public.bookings USING btree (group_id);


--
-- Name: bookings_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX bookings_status_idx ON public.bookings USING btree (status);


--
-- Name: cal_action_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX cal_action_idx ON public.communication_audit_logs USING btree (action);


--
-- Name: cal_actor_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX cal_actor_idx ON public.communication_audit_logs USING btree (actor_id);


--
-- Name: cal_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX cal_created_idx ON public.communication_audit_logs USING btree (created_at DESC);


--
-- Name: ce_booking_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ce_booking_idx ON public.comm_events USING btree (booking_id);


--
-- Name: ce_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ce_created_idx ON public.comm_events USING btree (created_at DESC);


--
-- Name: ce_customer_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ce_customer_idx ON public.comm_events USING btree (customer_id);


--
-- Name: ce_dedup_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ce_dedup_idx ON public.comm_events USING btree (dedup_hash) WHERE (dedup_hash IS NOT NULL);


--
-- Name: ce_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ce_type_idx ON public.comm_events USING btree (event_type);


--
-- Name: cle_booking_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX cle_booking_idx ON public.customer_ledger_entries USING btree (booking_id);


--
-- Name: cle_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX cle_date_idx ON public.customer_ledger_entries USING btree (booking_id, entry_date);


--
-- Name: cpa_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX cpa_created_idx ON public.customer_portal_activity USING btree (created_at DESC);


--
-- Name: cpa_customer_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX cpa_customer_idx ON public.customer_portal_activity USING btree (customer_id);


--
-- Name: cpe_customer_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX cpe_customer_idx ON public.customer_profile_edits USING btree (customer_id);


--
-- Name: cpe_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX cpe_status_idx ON public.customer_profile_edits USING btree (status);


--
-- Name: cs_booking_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX cs_booking_idx ON public.communication_schedules USING btree (booking_id);


--
-- Name: cs_scheduled_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX cs_scheduled_idx ON public.communication_schedules USING btree (scheduled_at);


--
-- Name: cs_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX cs_status_idx ON public.communication_schedules USING btree (status);


--
-- Name: csh_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX csh_created_idx ON public.communication_status_history USING btree (created_at DESC);


--
-- Name: csh_log_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX csh_log_id_idx ON public.communication_status_history USING btree (log_id);


--
-- Name: ddl_booking_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ddl_booking_idx ON public.document_download_logs USING btree (booking_id);


--
-- Name: ddl_doc_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ddl_doc_idx ON public.document_download_logs USING btree (document_id);


--
-- Name: ea_employee_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ea_employee_idx ON public.employee_advances USING btree (employee_id);


--
-- Name: erl_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX erl_created_idx ON public.error_request_logs USING btree (created_at DESC);


--
-- Name: erl_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX erl_status_idx ON public.error_request_logs USING btree (status_code);


--
-- Name: fal_action_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX fal_action_idx ON public.finance_audit_logs USING btree (action);


--
-- Name: fal_booking_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX fal_booking_idx ON public.finance_audit_logs USING btree (booking_id);


--
-- Name: fal_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX fal_created_idx ON public.finance_audit_logs USING btree (created_at DESC);


--
-- Name: idx_agent_commissions_agent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_agent_commissions_agent ON public.agent_commissions USING btree (agent_id);


--
-- Name: idx_agent_commissions_booking; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_agent_commissions_booking ON public.agent_commissions USING btree (booking_id);


--
-- Name: idx_agent_commissions_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_agent_commissions_status ON public.agent_commissions USING btree (status);


--
-- Name: idx_agent_wallet_agent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_agent_wallet_agent ON public.agent_wallet_transactions USING btree (agent_id);


--
-- Name: idx_attendance_logs_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_logs_event_id ON public.attendance_logs USING btree (event_id);


--
-- Name: idx_baggage_pnr; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_baggage_pnr ON public.flight_baggage USING btree (pnr_id);


--
-- Name: idx_bookings_customer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_customer ON public.bookings USING btree (customer_id);


--
-- Name: idx_bookings_dep_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_dep_date ON public.bookings USING btree (preferred_departure_date);


--
-- Name: idx_bookings_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_bookings_status ON public.bookings USING btree (status);


--
-- Name: idx_consents_lead; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_consents_lead ON public.communication_consents USING btree (lead_id);


--
-- Name: idx_consents_mobile; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_consents_mobile ON public.communication_consents USING btree (mobile);


--
-- Name: idx_crm_assignment_rules_priority; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_crm_assignment_rules_priority ON public.crm_assignment_rules USING btree (priority, is_active);


--
-- Name: idx_docs_access_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_docs_access_token ON public.documents USING btree (access_token) WHERE (access_token IS NOT NULL);


--
-- Name: idx_drivers_mobile; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_drivers_mobile ON public.drivers USING btree (mobile);


--
-- Name: idx_form_sub_form; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_form_sub_form ON public.lead_web_form_submissions USING btree (form_id, created_at DESC);


--
-- Name: idx_fuel_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fuel_date ON public.fuel_logs USING btree (date);


--
-- Name: idx_fuel_vehicle; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fuel_vehicle ON public.fuel_logs USING btree (vehicle_id);


--
-- Name: idx_gbl_group; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_gbl_group ON public.group_broadcast_logs USING btree (group_id);


--
-- Name: idx_hc_hotel; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_hc_hotel ON public.hotel_contracts USING btree (hotel_id);


--
-- Name: idx_hc_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_hc_status ON public.hotel_contracts USING btree (status);


--
-- Name: idx_hci_booking; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_hci_booking ON public.hotel_checkins USING btree (booking_id);


--
-- Name: idx_hci_hotel; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_hci_hotel ON public.hotel_checkins USING btree (hotel_id);


--
-- Name: idx_hci_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_hci_status ON public.hotel_checkins USING btree (status);


--
-- Name: idx_hv_booking; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_hv_booking ON public.hotel_vouchers USING btree (booking_id);


--
-- Name: idx_hv_group; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_hv_group ON public.hotel_vouchers USING btree (group_id);


--
-- Name: idx_lb_employee; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lb_employee ON public.leave_balances USING btree (employee_id);


--
-- Name: idx_lead_activities_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_activities_created ON public.lead_activities USING btree (created_at DESC);


--
-- Name: idx_lead_activities_lead; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_activities_lead ON public.lead_activities USING btree (lead_id);


--
-- Name: idx_lead_activities_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_activities_type ON public.lead_activities USING btree (type);


--
-- Name: idx_lead_audit_lead; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_audit_lead ON public.lead_audit_log USING btree (lead_id, created_at DESC);


--
-- Name: idx_lead_auto_followup_lead; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_auto_followup_lead ON public.lead_auto_followup_log USING btree (lead_id);


--
-- Name: idx_lead_followups_due; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_followups_due ON public.lead_followups USING btree (due_at);


--
-- Name: idx_lead_followups_lead; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_followups_lead ON public.lead_followups USING btree (lead_id);


--
-- Name: idx_lead_followups_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_followups_status ON public.lead_followups USING btree (status);


--
-- Name: idx_leads_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leads_status ON public.leads USING btree (status);


--
-- Name: idx_loyalty_transactions_customer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_loyalty_transactions_customer ON public.loyalty_transactions USING btree (customer_id);


--
-- Name: idx_lr_dates; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lr_dates ON public.leave_requests USING btree (from_date, to_date);


--
-- Name: idx_lr_employee; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lr_employee ON public.leave_requests USING btree (employee_id);


--
-- Name: idx_lr_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lr_status ON public.leave_requests USING btree (status);


--
-- Name: idx_maint_vehicle; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_maint_vehicle ON public.maintenance_logs USING btree (vehicle_id);


--
-- Name: idx_mc_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mc_status ON public.marketing_campaigns USING btree (status, start_date DESC);


--
-- Name: idx_mc_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mc_tenant ON public.marketing_campaigns USING btree (tenant_id);


--
-- Name: idx_meta_delivery_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meta_delivery_status ON public.meta_delivery_logs USING btree (status, created_at);


--
-- Name: idx_meta_delivery_wamid; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meta_delivery_wamid ON public.meta_delivery_logs USING btree (wamid);


--
-- Name: idx_meta_media_hash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meta_media_hash ON public.meta_media_cache USING btree (file_hash);


--
-- Name: idx_meta_messages_booking; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meta_messages_booking ON public.meta_messages USING btree (booking_id);


--
-- Name: idx_meta_messages_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meta_messages_status ON public.meta_messages USING btree (status, next_retry_at);


--
-- Name: idx_meta_messages_wamid; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meta_messages_wamid ON public.meta_messages USING btree (wamid);


--
-- Name: idx_meta_templates_event; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_meta_templates_event ON public.meta_templates USING btree (event_type);


--
-- Name: idx_nl_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_nl_created ON public.notification_logs USING btree (created_at DESC);


--
-- Name: idx_nl_event; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_nl_event ON public.notification_logs USING btree (event_type);


--
-- Name: idx_nl_idempotency; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_nl_idempotency ON public.notification_logs USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: idx_nl_message_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_nl_message_id ON public.notification_logs USING btree (message_id) WHERE (message_id IS NOT NULL);


--
-- Name: idx_nl_provider_msg; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_nl_provider_msg ON public.notification_logs USING btree (provider_message_id) WHERE (provider_message_id IS NOT NULL);


--
-- Name: idx_nl_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_nl_status ON public.notification_logs USING btree (status);


--
-- Name: idx_notification_logs_channel; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notification_logs_channel ON public.notification_logs USING btree (channel);


--
-- Name: idx_payment_transactions_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payment_transactions_created_at ON public.payment_transactions USING btree (created_at DESC);


--
-- Name: idx_pilgrims_barcode_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pilgrims_barcode_id ON public.pilgrims USING btree (barcode_id);


--
-- Name: idx_pilgrims_family_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pilgrims_family_id ON public.pilgrims USING btree (family_id);


--
-- Name: idx_pilgrims_mobile_india; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pilgrims_mobile_india ON public.pilgrims USING btree (mobile_india);


--
-- Name: idx_pnr_booking; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pnr_booking ON public.pnr_records USING btree (booking_id);


--
-- Name: idx_pnr_group; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pnr_group ON public.pnr_records USING btree (group_id);


--
-- Name: idx_pnr_passengers_pnr; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pnr_passengers_pnr ON public.pnr_passengers USING btree (pnr_id);


--
-- Name: idx_pnr_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pnr_status ON public.pnr_records USING btree (status);


--
-- Name: idx_po_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_po_status ON public.purchase_orders USING btree (status);


--
-- Name: idx_po_vendor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_po_vendor ON public.purchase_orders USING btree (vendor_id);


--
-- Name: idx_poi_po; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_poi_po ON public.purchase_order_items USING btree (po_id);


--
-- Name: idx_ps_booking; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ps_booking ON public.payment_schedules USING btree (booking_id);


--
-- Name: idx_ps_due_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ps_due_status ON public.payment_schedules USING btree (due_date, status);


--
-- Name: idx_push_campaigns_sent_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_push_campaigns_sent_at ON public.push_campaigns USING btree (sent_at DESC);


--
-- Name: idx_push_tokens_last_seen; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_push_tokens_last_seen ON public.customer_push_tokens USING btree (last_seen DESC);


--
-- Name: idx_push_tokens_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_push_tokens_user_id ON public.customer_push_tokens USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_push_tokens_user_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_push_tokens_user_type ON public.customer_push_tokens USING btree (user_type);


--
-- Name: idx_reminder_logs_booking_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reminder_logs_booking_id ON public.reminder_logs USING btree (booking_id);


--
-- Name: idx_reminder_logs_sent_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reminder_logs_sent_at ON public.reminder_logs USING btree (sent_at DESC);


--
-- Name: idx_social_messages_lead; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_social_messages_lead ON public.social_messages USING btree (lead_text_id);


--
-- Name: idx_social_messages_lead_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_social_messages_lead_created ON public.social_messages USING btree (lead_text_id, created_at DESC);


--
-- Name: idx_social_messages_message_id_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_social_messages_message_id_uniq ON public.social_messages USING btree (message_id) WHERE (message_id IS NOT NULL);


--
-- Name: idx_social_messages_platform; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_social_messages_platform ON public.social_messages USING btree (platform);


--
-- Name: idx_social_messages_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_social_messages_status ON public.social_messages USING btree (status);


--
-- Name: idx_ss_employee; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ss_employee ON public.salary_slips USING btree (employee_id);


--
-- Name: idx_ss_period; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ss_period ON public.salary_slips USING btree (year, month);


--
-- Name: idx_ss_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ss_status ON public.salary_slips USING btree (status);


--
-- Name: idx_ta_group; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ta_group ON public.tent_allocations USING btree (group_id);


--
-- Name: idx_ta_pilgrim; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ta_pilgrim ON public.tent_allocations USING btree (pilgrim_id);


--
-- Name: idx_trips_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_trips_date ON public.transport_trips USING btree (trip_date);


--
-- Name: idx_trips_driver; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_trips_driver ON public.transport_trips USING btree (driver_id);


--
-- Name: idx_trips_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_trips_status ON public.transport_trips USING btree (status);


--
-- Name: idx_trips_vehicle; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_trips_vehicle ON public.transport_trips USING btree (vehicle_id);


--
-- Name: idx_vb_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vb_status ON public.vendor_bills USING btree (status);


--
-- Name: idx_vb_vendor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vb_vendor ON public.vendor_bills USING btree (vendor_id);


--
-- Name: idx_vehicles_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vehicles_active ON public.vehicles USING btree (is_active);


--
-- Name: idx_vehicles_reg; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vehicles_reg ON public.vehicles USING btree (reg_number);


--
-- Name: idx_webhook_events_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_webhook_events_created ON public.webhook_events USING btree (created_at DESC);


--
-- Name: idx_webhook_events_platform; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_webhook_events_platform ON public.webhook_events USING btree (platform, event_type);


--
-- Name: inv_booking_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX inv_booking_idx ON public.invoices USING btree (booking_id);


--
-- Name: jel_account_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX jel_account_idx ON public.journal_entry_lines USING btree (account_id);


--
-- Name: jel_entry_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX jel_entry_idx ON public.journal_entry_lines USING btree (journal_entry_id);


--
-- Name: leads_source_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX leads_source_idx ON public.leads USING btree (source);


--
-- Name: leads_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX leads_status_idx ON public.leads USING btree (status);


--
-- Name: nl_booking_number_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX nl_booking_number_idx ON public.notification_logs USING btree (booking_number);


--
-- Name: nl_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX nl_created_idx ON public.notification_logs USING btree (created_at DESC);


--
-- Name: nl_event_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX nl_event_idx ON public.notification_logs USING btree (event_type);


--
-- Name: nl_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX nl_status_idx ON public.notification_logs USING btree (status);


--
-- Name: nl_updated_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX nl_updated_idx ON public.notification_logs USING btree (updated_at);


--
-- Name: notification_logs_booking_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX notification_logs_booking_id_idx ON public.notification_logs USING btree (booking_id);


--
-- Name: nrq_booking_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX nrq_booking_idx ON public.notification_retry_queue USING btree (booking_id);


--
-- Name: nrq_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX nrq_status_idx ON public.notification_retry_queue USING btree (status, next_retry_at);


--
-- Name: offline_payments_booking_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX offline_payments_booking_idx ON public.offline_payments USING btree (booking_id);


--
-- Name: offline_payments_customer_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX offline_payments_customer_idx ON public.offline_payments USING btree (customer_id);


--
-- Name: offline_payments_ref_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX offline_payments_ref_idx ON public.offline_payments USING btree (payment_reference) WHERE (payment_reference IS NOT NULL);


--
-- Name: or_category_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX or_category_idx ON public.orientation_resources USING btree (category);


--
-- Name: or_published_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX or_published_idx ON public.orientation_resources USING btree (is_published);


--
-- Name: pdf_audit_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pdf_audit_created_idx ON public.pdf_audit_logs USING btree (created_at DESC);


--
-- Name: pdf_audit_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pdf_audit_user_idx ON public.pdf_audit_logs USING btree (user_id);


--
-- Name: pe_run_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pe_run_idx ON public.payroll_entries USING btree (payroll_run_id);


--
-- Name: pilgrims_group_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pilgrims_group_id_idx ON public.pilgrims USING btree (group_id);


--
-- Name: pt_booking_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pt_booking_idx ON public.payment_transactions USING btree (booking_id);


--
-- Name: rec_booking_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rec_booking_idx ON public.receipts USING btree (booking_id);


--
-- Name: rec_payment_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rec_payment_idx ON public.receipts USING btree (payment_id);


--
-- Name: ref_booking_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ref_booking_idx ON public.refunds USING btree (booking_id);


--
-- Name: sc_employee_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sc_employee_idx ON public.salary_components USING btree (employee_id);


--
-- Name: sm_ticket_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sm_ticket_idx ON public.support_messages USING btree (ticket_id);


--
-- Name: sn_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sn_status_idx ON public.scheduled_notifications USING btree (status, scheduled_at);


--
-- Name: st_customer_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX st_customer_idx ON public.support_tickets USING btree (customer_id);


--
-- Name: st_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX st_status_idx ON public.support_tickets USING btree (status);


--
-- Name: suppliers_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX suppliers_type_idx ON public.suppliers USING btree (type);


--
-- Name: tasks_due_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX tasks_due_idx ON public.tasks USING btree (due_date);


--
-- Name: tasks_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX tasks_status_idx ON public.tasks USING btree (status);


--
-- Name: timeline_booking_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX timeline_booking_idx ON public.customer_timeline USING btree (booking_id);


--
-- Name: timeline_customer_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX timeline_customer_idx ON public.customer_timeline USING btree (customer_id);


--
-- Name: uq_notification_logs_idempotency; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_notification_logs_idempotency ON public.notification_logs USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: uq_payment_transactions_reference_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_payment_transactions_reference_number ON public.payment_transactions USING btree (reference_number) WHERE (reference_number IS NOT NULL);


--
-- Name: wf_logs_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX wf_logs_created_idx ON public.workflow_logs USING btree (created_at DESC);


--
-- Name: wf_logs_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX wf_logs_status_idx ON public.workflow_logs USING btree (status);


--
-- Name: agents agents_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: ai_conversation_messages ai_conversation_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_conversation_messages
    ADD CONSTRAINT ai_conversation_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.ai_conversations(id) ON DELETE CASCADE;


--
-- Name: communication_status_history communication_status_history_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.communication_status_history
    ADD CONSTRAINT communication_status_history_log_id_fkey FOREIGN KEY (log_id) REFERENCES public.notification_logs(id) ON DELETE CASCADE;


--
-- Name: customer_profiles customer_profiles_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customer_profiles
    ADD CONSTRAINT customer_profiles_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: employee_advances employee_advances_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_advances
    ADD CONSTRAINT employee_advances_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: fuel_logs fuel_logs_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fuel_logs
    ADD CONSTRAINT fuel_logs_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id);


--
-- Name: leave_balances leave_balances_leave_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT leave_balances_leave_type_id_fkey FOREIGN KEY (leave_type_id) REFERENCES public.leave_types(id);


--
-- Name: leave_requests leave_requests_leave_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_leave_type_id_fkey FOREIGN KEY (leave_type_id) REFERENCES public.leave_types(id);


--
-- Name: maintenance_logs maintenance_logs_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.maintenance_logs
    ADD CONSTRAINT maintenance_logs_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id);


--
-- Name: notification_logs notification_logs_superseded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_logs
    ADD CONSTRAINT notification_logs_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES public.notification_logs(id) ON DELETE SET NULL;


--
-- Name: package_requests package_requests_booking_id_bookings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.package_requests
    ADD CONSTRAINT package_requests_booking_id_bookings_id_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;


--
-- Name: package_requests package_requests_customer_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.package_requests
    ADD CONSTRAINT package_requests_customer_id_users_id_fk FOREIGN KEY (customer_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: package_requests package_requests_package_id_packages_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.package_requests
    ADD CONSTRAINT package_requests_package_id_packages_id_fk FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE SET NULL;


--
-- Name: payment_transactions payment_transactions_booking_id_bookings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_booking_id_bookings_id_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: payroll_entries payroll_entries_payroll_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payroll_entries
    ADD CONSTRAINT payroll_entries_payroll_run_id_fkey FOREIGN KEY (payroll_run_id) REFERENCES public.payroll_runs(id) ON DELETE CASCADE;


--
-- Name: payroll_runs payroll_runs_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: pdf_audit_logs pdf_audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pdf_audit_logs
    ADD CONSTRAINT pdf_audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.pdf_users(id);


--
-- Name: pdf_file_versions pdf_file_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pdf_file_versions
    ADD CONSTRAINT pdf_file_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.pdf_users(id);


--
-- Name: pdf_file_versions pdf_file_versions_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pdf_file_versions
    ADD CONSTRAINT pdf_file_versions_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.pdf_files(id) ON DELETE CASCADE;


--
-- Name: pdf_files pdf_files_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pdf_files
    ADD CONSTRAINT pdf_files_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.pdf_users(id);


--
-- Name: pdf_files pdf_files_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pdf_files
    ADD CONSTRAINT pdf_files_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.pdf_folders(id) ON DELETE SET NULL;


--
-- Name: pdf_files pdf_files_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pdf_files
    ADD CONSTRAINT pdf_files_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.pdf_users(id);


--
-- Name: pdf_folders pdf_folders_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pdf_folders
    ADD CONSTRAINT pdf_folders_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.pdf_users(id);


--
-- Name: pdf_folders pdf_folders_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pdf_folders
    ADD CONSTRAINT pdf_folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.pdf_folders(id) ON DELETE CASCADE;


--
-- Name: pdf_sessions pdf_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pdf_sessions
    ADD CONSTRAINT pdf_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.pdf_users(id);


--
-- Name: pnr_passengers pnr_passengers_pnr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pnr_passengers
    ADD CONSTRAINT pnr_passengers_pnr_id_fkey FOREIGN KEY (pnr_id) REFERENCES public.pnr_records(id) ON DELETE CASCADE;


--
-- Name: purchase_order_items purchase_order_items_po_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_po_id_fkey FOREIGN KEY (po_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


--
-- Name: reminder_logs reminder_logs_booking_id_bookings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reminder_logs
    ADD CONSTRAINT reminder_logs_booking_id_bookings_id_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: salary_components salary_components_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.salary_components
    ADD CONSTRAINT salary_components_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: support_messages support_messages_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: transport_trips transport_trips_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transport_trips
    ADD CONSTRAINT transport_trips_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);


--
-- Name: transport_trips transport_trips_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transport_trips
    ADD CONSTRAINT transport_trips_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id);


--
-- Name: vendor_bill_payments vendor_bill_payments_bill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendor_bill_payments
    ADD CONSTRAINT vendor_bill_payments_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.vendor_bills(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 0TE1Nn9gGYCNMsMUXgHOdyCgAFwchIc2l2nBodwqaBrfm27ENqpt6K7SjAbGTMv

