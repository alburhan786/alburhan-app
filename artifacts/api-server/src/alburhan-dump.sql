--
-- PostgreSQL database dump
--

\restrict 15cHVsn3HNQhbmqfyXPwzBhBPwlBNwoVGKNwTyH8eZi0tPZI0Cqo3zfM1D9MUTC

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

ALTER TABLE IF EXISTS ONLY public.reminder_logs DROP CONSTRAINT IF EXISTS reminder_logs_booking_id_bookings_id_fk;
ALTER TABLE IF EXISTS ONLY public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_booking_id_bookings_id_fk;
ALTER TABLE IF EXISTS ONLY public.package_requests DROP CONSTRAINT IF EXISTS package_requests_package_id_packages_id_fk;
ALTER TABLE IF EXISTS ONLY public.package_requests DROP CONSTRAINT IF EXISTS package_requests_customer_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.package_requests DROP CONSTRAINT IF EXISTS package_requests_booking_id_bookings_id_fk;
ALTER TABLE IF EXISTS ONLY public.customer_profiles DROP CONSTRAINT IF EXISTS customer_profiles_user_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_mobile_unique;
ALTER TABLE IF EXISTS ONLY public.staff DROP CONSTRAINT IF EXISTS staff_staff_id_unique;
ALTER TABLE IF EXISTS ONLY public.staff DROP CONSTRAINT IF EXISTS staff_qr_token_unique;
ALTER TABLE IF EXISTS ONLY public.staff DROP CONSTRAINT IF EXISTS staff_pkey;
ALTER TABLE IF EXISTS ONLY public.reminder_logs DROP CONSTRAINT IF EXISTS reminder_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.pilgrims DROP CONSTRAINT IF EXISTS pilgrims_pkey;
ALTER TABLE IF EXISTS ONLY public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_pkey;
ALTER TABLE IF EXISTS ONLY public.packages DROP CONSTRAINT IF EXISTS packages_pkey;
ALTER TABLE IF EXISTS ONLY public.package_requests DROP CONSTRAINT IF EXISTS package_requests_pkey;
ALTER TABLE IF EXISTS ONLY public.package_media DROP CONSTRAINT IF EXISTS package_media_pkey;
ALTER TABLE IF EXISTS ONLY public.otps DROP CONSTRAINT IF EXISTS otps_pkey;
ALTER TABLE IF EXISTS ONLY public.inquiries DROP CONSTRAINT IF EXISTS inquiries_pkey;
ALTER TABLE IF EXISTS ONLY public.hajj_rooms DROP CONSTRAINT IF EXISTS hajj_rooms_pkey;
ALTER TABLE IF EXISTS ONLY public.hajj_groups DROP CONSTRAINT IF EXISTS hajj_groups_pkey;
ALTER TABLE IF EXISTS ONLY public.gallery_images DROP CONSTRAINT IF EXISTS gallery_images_pkey;
ALTER TABLE IF EXISTS ONLY public.feedback DROP CONSTRAINT IF EXISTS feedback_pkey;
ALTER TABLE IF EXISTS ONLY public.documents DROP CONSTRAINT IF EXISTS documents_pkey;
ALTER TABLE IF EXISTS ONLY public.delete_audit_log DROP CONSTRAINT IF EXISTS delete_audit_log_pkey;
ALTER TABLE IF EXISTS ONLY public.customer_profiles DROP CONSTRAINT IF EXISTS customer_profiles_user_id_unique;
ALTER TABLE IF EXISTS ONLY public.customer_profiles DROP CONSTRAINT IF EXISTS customer_profiles_pkey;
ALTER TABLE IF EXISTS ONLY public.customer_notifications DROP CONSTRAINT IF EXISTS customer_notifications_pkey;
ALTER TABLE IF EXISTS ONLY public.companies DROP CONSTRAINT IF EXISTS companies_pkey;
ALTER TABLE IF EXISTS ONLY public.broadcasts DROP CONSTRAINT IF EXISTS broadcasts_pkey;
ALTER TABLE IF EXISTS ONLY public.bookings DROP CONSTRAINT IF EXISTS bookings_pkey;
ALTER TABLE IF EXISTS ONLY public.bookings DROP CONSTRAINT IF EXISTS bookings_booking_number_unique;
ALTER TABLE IF EXISTS ONLY public.attendance_logs DROP CONSTRAINT IF EXISTS attendance_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.attendance_events DROP CONSTRAINT IF EXISTS attendance_events_pkey;
ALTER TABLE IF EXISTS public.delete_audit_log ALTER COLUMN id DROP DEFAULT;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.staff;
DROP TABLE IF EXISTS public.reminder_logs;
DROP TABLE IF EXISTS public.pilgrims;
DROP TABLE IF EXISTS public.payment_transactions;
DROP TABLE IF EXISTS public.packages;
DROP TABLE IF EXISTS public.package_requests;
DROP TABLE IF EXISTS public.package_media;
DROP TABLE IF EXISTS public.otps;
DROP TABLE IF EXISTS public.inquiries;
DROP TABLE IF EXISTS public.hajj_rooms;
DROP TABLE IF EXISTS public.hajj_groups;
DROP TABLE IF EXISTS public.gallery_images;
DROP TABLE IF EXISTS public.feedback;
DROP TABLE IF EXISTS public.documents;
DROP SEQUENCE IF EXISTS public.delete_audit_log_id_seq;
DROP TABLE IF EXISTS public.delete_audit_log;
DROP TABLE IF EXISTS public.customer_profiles;
DROP TABLE IF EXISTS public.customer_notifications;
DROP TABLE IF EXISTS public.companies;
DROP TABLE IF EXISTS public.broadcasts;
DROP TABLE IF EXISTS public.bookings;
DROP TABLE IF EXISTS public.attendance_logs;
DROP TABLE IF EXISTS public.attendance_events;
DROP TYPE IF EXISTS public.user_role;
DROP TYPE IF EXISTS public.request_status;
DROP TYPE IF EXISTS public.reminder_status;
DROP TYPE IF EXISTS public.reminder_channel;
DROP TYPE IF EXISTS public.payment_mode;
DROP TYPE IF EXISTS public.package_type;
DROP TYPE IF EXISTS public.media_type;
DROP TYPE IF EXISTS public.kyc_status;
DROP TYPE IF EXISTS public.gender_type;
DROP TYPE IF EXISTS public.feedback_status;
DROP TYPE IF EXISTS public.document_uploaded_by;
DROP TYPE IF EXISTS public.document_type;
DROP TYPE IF EXISTS public.booking_status;
DROP TYPE IF EXISTS public.blood_group;
--
-- Name: blood_group; Type: TYPE; Schema: public; Owner: -
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


--
-- Name: booking_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.booking_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'confirmed',
    'cancelled',
    'partially_paid'
);


--
-- Name: document_type; Type: TYPE; Schema: public; Owner: -
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
    'other'
);


--
-- Name: document_uploaded_by; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.document_uploaded_by AS ENUM (
    'customer',
    'admin'
);


--
-- Name: feedback_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.feedback_status AS ENUM (
    'open',
    'in_progress',
    'resolved'
);


--
-- Name: gender_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gender_type AS ENUM (
    'male',
    'female',
    'other'
);


--
-- Name: kyc_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.kyc_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);


--
-- Name: media_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.media_type AS ENUM (
    'image',
    'video'
);


--
-- Name: package_type; Type: TYPE; Schema: public; Owner: -
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


--
-- Name: payment_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_mode AS ENUM (
    'cash',
    'neft',
    'upi',
    'cheque',
    'online'
);


--
-- Name: reminder_channel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reminder_channel AS ENUM (
    'whatsapp',
    'sms'
);


--
-- Name: reminder_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reminder_status AS ENUM (
    'sent',
    'failed',
    'skipped'
);


--
-- Name: request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.request_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'customer',
    'admin'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: attendance_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_events (
    id text NOT NULL,
    group_id text NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'other'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    scan_token text,
    scan_token_expires_at timestamp with time zone
);


--
-- Name: attendance_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_logs (
    id text NOT NULL,
    event_id text NOT NULL,
    pilgrim_id text NOT NULL,
    group_id text NOT NULL,
    status text DEFAULT 'present'::text NOT NULL,
    scanned_at timestamp with time zone DEFAULT now() NOT NULL,
    scanned_by text
);


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
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
    traveller_details_status text DEFAULT 'not_submitted'::text NOT NULL
);


--
-- Name: broadcasts; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: customer_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_notifications (
    id text NOT NULL,
    customer_id text NOT NULL,
    broadcast_id text,
    title text NOT NULL,
    message text NOT NULL,
    type text DEFAULT 'general'::text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: customer_profiles; Type: TABLE; Schema: public; Owner: -
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
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: delete_audit_log; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: delete_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.delete_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: delete_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.delete_audit_log_id_seq OWNED BY public.delete_audit_log.id;


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id text NOT NULL,
    booking_id text NOT NULL,
    document_type public.document_type NOT NULL,
    file_name text NOT NULL,
    file_key text NOT NULL,
    file_url text,
    uploaded_by public.document_uploaded_by DEFAULT 'customer'::public.document_uploaded_by NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: feedback; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: gallery_images; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: hajj_groups; Type: TABLE; Schema: public; Owner: -
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
    starting_serial_number integer DEFAULT 1 NOT NULL
);


--
-- Name: hajj_rooms; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: inquiries; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: otps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otps (
    id text NOT NULL,
    mobile text NOT NULL,
    otp text NOT NULL,
    used boolean DEFAULT false NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: package_media; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: package_requests; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: packages; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: payment_transactions; Type: TABLE; Schema: public; Owner: -
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
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: pilgrims; Type: TABLE; Schema: public; Owner: -
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
    room_notes text
);


--
-- Name: reminder_logs; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: staff; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    name text,
    mobile text NOT NULL,
    email text,
    role public.user_role DEFAULT 'customer'::public.user_role NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: delete_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delete_audit_log ALTER COLUMN id SET DEFAULT nextval('public.delete_audit_log_id_seq'::regclass);


--
-- Data for Name: attendance_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.attendance_events (id, group_id, name, type, created_at, scan_token, scan_token_expires_at) FROM stdin;
\.


--
-- Data for Name: attendance_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.attendance_logs (id, event_id, pilgrim_id, group_id, status, scanned_at, scanned_by) FROM stdin;
\.


--
-- Data for Name: bookings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.bookings (id, booking_number, package_id, package_name, customer_id, customer_name, customer_mobile, customer_email, number_of_pilgrims, pilgrims, preferred_departure_date, status, total_amount, gst_amount, final_amount, payment_id, razorpay_order_id, razorpay_payment_id, invoice_number, rejection_reason, notes, is_offline, created_at, updated_at, room_type, advance_amount, group_id, paid_amount, online_paid_amount, traveller_details_status) FROM stdin;
153744b7-c630-4a71-a254-a567b1407dab	ABT26034356	06761c5c-120a-4331-8006-d6e3bc0951b9	Premium Umrah Package	4d5cf829-11bc-49ea-9a97-3db28a087bdb	8h89j89	9867114562		1	[{"name": "hhuhh", "passportNumber": "u9h9"}]	Every Week	approved	150000.00	7500.00	157500.00	\N	order_SSdxmOArNTM4Os	\N	\N	\N	8j	f	2026-03-14 14:29:14.853068	2026-03-14 16:44:34.596	\N	\N	\N	\N	0.00	not_submitted
9b5f9df6-66a2-4c97-8c66-3466f0e31bfd	ABT26038022	a22dbeb8-51b8-4e93-9a22-e562225cc2c5	Ramadan Umrah Special – Last 20 Days	\N	Ammar	9575417222	ratibammar2006@gmail.com	1	[]	\N	confirmed	140000.00	7000.00	147000.00	\N	\N	\N	INV26032695	\N	\N	t	2026-03-15 17:17:57.712553	2026-03-15 17:17:57.712553	quad	150000.00	\N	\N	0.00	not_submitted
8ad30219-9634-46ca-bbbb-c499d4dafc9a	ABT26047687	06761c5c-120a-4331-8006-d6e3bc0951b9	Premium Umrah Package	\N	mohammed 	9893989786	\N	1	[]	\N	confirmed	150000.00	7500.00	157500.00	\N	\N	\N	INV26042544	\N	\N	t	2026-04-03 10:49:06.723655	2026-04-03 11:07:18.029	quad	\N	7bbcb7cb-ad48-4e87-b93c-3ccfd92383e2	\N	0.00	not_submitted
510b7dee-619a-4b69-9e1c-1bd70058f771	ABT26033710	a22dbeb8-51b8-4e93-9a22-e562225cc2c5	Ramadan Umrah Special – Last 20 Days	4d5cf829-11bc-49ea-9a97-3db28a087bdb	mohammed 	9867114562		1	[{"name": "mohammed altaf ", "passportNumber": "R9544291"}]	28 January 2027	approved	140000.00	7000.00	147000.00	\N	order_SSt3NbaGaE0IZ0	\N	\N	\N		f	2026-03-14 11:29:04.430674	2026-03-14 12:08:02.513	\N	\N	\N	\N	0.00	not_submitted
7be67622-82aa-4a3b-8814-93b2eec836d0	ABT26031895	9a6b14e1-1c48-4852-b90b-a1d7bb459309	Burhan Budget Saver Shifting – Hajj 2027	\N	Mohammed Altaf	09867114562	khanaltaf1975@gmail.com	1	[]	\N	confirmed	650000.00	32500.00	682500.00	\N	\N	\N	INV26032391	\N	\N	t	2026-03-15 21:16:57.851963	2026-03-15 21:16:57.851963	quad	10000.00	\N	\N	0.00	not_submitted
f627345b-2527-4b40-be05-af47bf4a0f72	ABT26033123	fb7fb3dc-2910-4d99-bb92-80f4cf671508	Economy Umrah Package	2c7885ad-c6e3-4ca3-91c7-b36d71da90c8	mohammed ratib	7987488550		1	[{"name": "mohammed ratib ", "passportNumber": "Zw367398"}]	Flexible	approved	90000.00	4500.00	94500.00	\N	order_SSQbqkFarfjfQL	\N	\N	\N		f	2026-03-15 21:01:18.034176	2026-03-15 21:05:28.487	\N	\N	\N	\N	0.00	not_submitted
fcb968ef-5e83-432b-8aa3-a96d70131aea	ABT26035537	9aac5fc5-c2e7-439a-9115-8f166e993ea6	Syria Ziyarat Tour	4d5cf829-11bc-49ea-9a97-3db28a087bdb	akila bano 	7987488550		1	[{"name": "akila bano ", "passportNumber": "w3678934"}]	2025-08-15	approved	48000.00	2400.00	50400.00	\N	order_ST3CclKloGWTeU	\N	\N	\N		f	2026-03-19 10:15:05.129462	2026-03-19 10:16:13.453	\N	\N	\N	\N	0.00	not_submitted
abcd40e0-ceed-4b09-8ff3-65aad60dac4f	ABT26046308	349c3c44-52a1-42ed-bb08-bcf7b85673d0	Ramadan Umrah Full Month Package	f008a06a-b1ba-452c-857e-aeacaecf6a73	mohammed altaf	8828861122	khanaltaf1975@gmail.com	1	[{"name": "mohammed alatf ", "passportNumber": "R9544391"}]	9 January 2027	pending	180000.00	9000.00	189000.00	\N	\N	\N	\N	\N		f	2026-04-02 20:35:22.417964	2026-04-02 20:35:22.417964	\N	\N	\N	\N	0.00	not_submitted
6cb986e6-96ce-4401-9ad2-1f33446af6d5	ABT26046094	349c3c44-52a1-42ed-bb08-bcf7b85673d0	Ramadan Umrah Full Month Package	f008a06a-b1ba-452c-857e-aeacaecf6a73	mohammed altaf	8828861122	khanaltaf1975@gmail.com	1	[{"name": "mohammed alatf ", "passportNumber": "R9544391"}]	9 January 2027	pending	180000.00	9000.00	189000.00	\N	\N	\N	\N	\N		f	2026-04-02 20:35:41.929017	2026-04-02 20:35:41.929017	\N	\N	\N	\N	0.00	not_submitted
11db9fe2-1e0e-418f-9e60-516498472371	ABT26036960	9a6b14e1-1c48-4852-b90b-a1d7bb459309	Burhan Budget Saver Shifting – Hajj 2027	4d5cf829-11bc-49ea-9a97-3db28a087bdb	naeem khan 	9867114562	khan_altaf@hotmail.com	1	[{"name": "naeem khan ", "passportNumber": "R 562560"}]	Flexible	approved	650000.00	32500.00	682500.00	\N	order_SSiyWoiyzpPADy	\N	\N	\N	I need sprat booking 	f	2026-03-17 18:35:07.721062	2026-04-03 07:31:54.47	\N	\N	\N	\N	0.00	submitted
4f22c6c6-9e54-4fa8-821a-dada6ddd2e63	ABT26049541	349c3c44-52a1-42ed-bb08-bcf7b85673d0	Ramadan Umrah Full Month Package	f008a06a-b1ba-452c-857e-aeacaecf6a73	mohammed altaf	8828861122	khanaltaf1975@gmail.com	1	[{"name": "mohammed alatf ", "passportNumber": "R9544391"}]	9 January 2027	approved	180000.00	9000.00	189000.00	\N	\N	\N	\N	\N		f	2026-04-02 20:35:51.569235	2026-04-03 09:45:41.444	\N	\N	a45b795c-eb4a-4332-a7e7-a6be48af111e	\N	0.00	not_submitted
\.


--
-- Data for Name: broadcasts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.broadcasts (id, title, message, type, audience, channels, recipient_count, sent_at, sent_by) FROM stdin;
\.


--
-- Data for Name: companies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.companies (id, name, arabic_name, address, phone, mobile, email, website, logo_url, is_default, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: customer_notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customer_notifications (id, customer_id, broadcast_id, title, message, type, is_read, created_at) FROM stdin;
\.


--
-- Data for Name: customer_profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customer_profiles (id, user_id, name, phone, whatsapp_number, date_of_birth, gender, address, passport_number, passport_issue_date, passport_expiry_date, passport_place_of_issue, passport_image_url, photo_url, blood_group, aadhar_number, aadhar_image_url, pan_number, pan_image_url, health_certificate_url, kyc_status, admin_notes, created_at, updated_at) FROM stdin;
9ffda5c8-d681-4dff-8a5a-d05608e1f6ff	4d5cf829-11bc-49ea-9a97-3db28a087bdb	mohammed altaf 	\N	\N	1970-06-02	male	dawoodpura burhanpur 450331	R9544391	2018-04-23	2028-04-22	bhopal 	\N	/api/storage/objects/private_uploads/1775201513964_a92f5cce_1773787186248_4z34oukw1b_Altaf_new_pic_2024_.JPEG	\N	\N	\N	\N	\N	\N	approved	\N	2026-04-03 07:31:54.376446	2026-04-03 08:00:09.726
\.


--
-- Data for Name: delete_audit_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.delete_audit_log (id, action, item_type, item_id, deleted_by, ip_address, success, created_at) FROM stdin;
\.


--
-- Data for Name: documents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.documents (id, booking_id, document_type, file_name, file_key, file_url, uploaded_by, created_at) FROM stdin;
12db9217-4f6f-4e15-a367-460f7268c21b	510b7dee-619a-4b69-9e1c-1bd70058f771	pan_card	altaf pan card.pdf	uploads/1773487968243_k158loe2ti_altaf_pan_card.pdf	/api/documents/files/1773487968243_k158loe2ti_altaf_pan_card.pdf	customer	2026-03-14 11:32:50.211149
67d6e532-cdc4-4567-a314-9212ffb6f78a	510b7dee-619a-4b69-9e1c-1bd70058f771	passport	Altaf passport JPG -Compressed.jpg	uploads/1773488043878_z4nkfdy6b6_Altaf_passport_JPG_-Compressed.jpg	/api/documents/files/1773488043878_z4nkfdy6b6_Altaf_passport_JPG_-Compressed.jpg	customer	2026-03-14 11:34:04.836132
be329194-9c94-4f2b-8963-5dfa310d775e	510b7dee-619a-4b69-9e1c-1bd70058f771	aadhaar	altaf aadhar card .pdf	uploads/1773488089385_oyctiaaosfb_altaf_aadhar_card_.pdf	/api/documents/files/1773488089385_oyctiaaosfb_altaf_aadhar_card_.pdf	customer	2026-03-14 11:34:50.584828
4a7f2c6f-ba42-4524-a9b6-998c6e29c003	510b7dee-619a-4b69-9e1c-1bd70058f771	passport_photo	alburhan.png	uploads/1773488189182_u4dtececwt_alburhan.png	/api/documents/files/1773488189182_u4dtececwt_alburhan.png	customer	2026-03-14 11:36:30.630503
f8af0916-2933-4f01-b315-ab0e612a148a	f627345b-2527-4b40-be05-af47bf4a0f72	passport	Altaf passport JPG .jpg	uploads/1773608963338_tmmt2r0soq_Altaf_passport_JPG_.jpg	/api/documents/files/1773608963338_tmmt2r0soq_Altaf_passport_JPG_.jpg	customer	2026-03-15 21:09:29.279348
918574eb-1501-49ee-8508-958df1f2a640	f627345b-2527-4b40-be05-af47bf4a0f72	passport	alburhan pan card .JPG	uploads/1773608983956_tat9l61i35c_alburhan_pan_card_.JPG	/api/documents/files/1773608983956_tat9l61i35c_alburhan_pan_card_.JPG	customer	2026-03-15 21:09:44.507782
7122090d-f660-49f7-85cc-21ae928d891e	f627345b-2527-4b40-be05-af47bf4a0f72	pan_card	alburhan pan card .JPG	uploads/1773609024604_l5nbfrvrnpf_alburhan_pan_card_.JPG	/api/documents/files/1773609024604_l5nbfrvrnpf_alburhan_pan_card_.JPG	customer	2026-03-15 21:10:24.946717
3ccb82c8-2bc4-4b07-a539-1040e83737b6	f627345b-2527-4b40-be05-af47bf4a0f72	passport_photo	fruit_salad.jpeg	uploads/1773609085707_92pp6725aea_fruit_salad.jpeg	/api/documents/files/1773609085707_92pp6725aea_fruit_salad.jpeg	customer	2026-03-15 21:11:26.651089
8173f306-5fc0-4dee-95b2-0123cad465e9	f627345b-2527-4b40-be05-af47bf4a0f72	aadhaar	52A05880-B9C2-4243-9094-10D029C9C0B0.jpg	uploads/1773609118259_i49rb6dc6ua_52A05880-B9C2-4243-9094-10D029C9C0B0.jpg	/api/documents/files/1773609118259_i49rb6dc6ua_52A05880-B9C2-4243-9094-10D029C9C0B0.jpg	customer	2026-03-15 21:11:58.264719
6326fa8c-99a4-4b88-b827-f1feec0beb83	11db9fe2-1e0e-418f-9e60-516498472371	passport	1_INV_MOHAMMED ALTAF.pdf	uploads/1773772996372_57c92bvurcb_1_INV_MOHAMMED_ALTAF.pdf	/api/documents/files/1773772996372_57c92bvurcb_1_INV_MOHAMMED_ALTAF.pdf	customer	2026-03-17 18:43:16.890024
792acd63-368e-4482-a3b2-906893d2f31a	153744b7-c630-4a71-a254-a567b1407dab	passport	888d3b9e-0da9-484f-a097-e5a1f84b7137altaf aadhar .JPG	uploads/1773787051960_gneb0e0z54j_888d3b9e-0da9-484f-a097-e5a1f84b7137altaf_aadhar_.JPG	/api/documents/files/1773787051960_gneb0e0z54j_888d3b9e-0da9-484f-a097-e5a1f84b7137altaf_aadhar_.JPG	customer	2026-03-17 22:37:33.395571
d8b849a0-a3db-4ce1-9e98-9f2455f4ae7d	153744b7-c630-4a71-a254-a567b1407dab	passport	altaf pan card.pdf	uploads/1773787115137_dq1nqvv69j7_altaf_pan_card.pdf	/api/documents/files/1773787115137_dq1nqvv69j7_altaf_pan_card.pdf	customer	2026-03-17 22:38:36.627696
05c7fbad-9fd3-4ef2-9914-127740639758	153744b7-c630-4a71-a254-a567b1407dab	aadhaar	alburhan Tours gst .pdf	uploads/1773787145827_md5tmuq3kh_alburhan_Tours_gst_.pdf	/api/documents/files/1773787145827_md5tmuq3kh_alburhan_Tours_gst_.pdf	customer	2026-03-17 22:39:05.829247
fc8098c5-eb15-489c-b698-b05d507e2889	153744b7-c630-4a71-a254-a567b1407dab	pan_card	altaf aadhar card .pdf	uploads/1773787164805_6frq5elnfih_altaf_aadhar_card_.pdf	/api/documents/files/1773787164805_6frq5elnfih_altaf_aadhar_card_.pdf	customer	2026-03-17 22:39:24.880587
037dc6d3-7c31-44e1-ace8-9e1ce23e84a2	153744b7-c630-4a71-a254-a567b1407dab	pan_card	Altaf new pic 2024 .JPEG	uploads/1773787186248_4z34oukw1b_Altaf_new_pic_2024_.JPEG	/api/documents/files/1773787186248_4z34oukw1b_Altaf_new_pic_2024_.JPEG	customer	2026-03-17 22:39:46.251441
63e689ee-d435-4d4f-8da6-00ddf8d5865c	11db9fe2-1e0e-418f-9e60-516498472371	pan_card	alburhan pan card 70kb.jpeg	uploads/1773870199489_22f7foqbph8_alburhan_pan_card_70kb.jpeg	/api/documents/files/1773870199489_22f7foqbph8_alburhan_pan_card_70kb.jpeg	admin	2026-03-18 21:43:19.761889
2a2f20c7-50f2-4852-b040-2e4a7723275f	f627345b-2527-4b40-be05-af47bf4a0f72	passport	176b0143-96f7-49bb-aa6d-fd8d30f2c5a4altaf aadhar .JPG	uploads/1773915728457_fjmlki08sj_176b0143-96f7-49bb-aa6d-fd8d30f2c5a4altaf_aadhar_.JPG	/api/documents/files/1773915728457_fjmlki08sj_176b0143-96f7-49bb-aa6d-fd8d30f2c5a4altaf_aadhar_.JPG	customer	2026-03-19 10:22:08.459742
f5d0f41c-d2c5-4e26-996a-cbec2c8b3e6e	11db9fe2-1e0e-418f-9e60-516498472371	passport	alburhan 5128512 app.png	uploads/1773920108750_js4l5qoiphr_alburhan_5128512_app.png	/api/documents/files/1773920108750_js4l5qoiphr_alburhan_5128512_app.png	customer	2026-03-19 11:35:09.395054
2df241fa-cb95-4acb-90c3-802838bd83a3	11db9fe2-1e0e-418f-9e60-516498472371	passport_photo	Altaf new pic 2024 .JPEG	uploads/1773920138503_bmjtlenl5um_Altaf_new_pic_2024_.JPEG	/api/documents/files/1773920138503_bmjtlenl5um_Altaf_new_pic_2024_.JPEG	customer	2026-03-19 11:35:38.751886
6aaa48ed-976e-46c5-b676-22b68261181a	11db9fe2-1e0e-418f-9e60-516498472371	aadhaar	altaf aadhar card.JPG	uploads/1773920165354_k37z0lethxc_altaf_aadhar_card.JPG	/api/documents/files/1773920165354_k37z0lethxc_altaf_aadhar_card.JPG	customer	2026-03-19 11:36:05.360728
d07b3fdb-b931-4dc7-88a0-4412998fe4c1	fcb968ef-5e83-432b-8aa3-a96d70131aea	flight_ticket	Airline-Passenger-List-Test Hajj Group 2027 (1).pdf	uploads/1773921500850_02mfk9z7ind7_Airline-Passenger-List-Test_Hajj_Group_2027__1_.pdf	/api/documents/files/1773921500850_02mfk9z7ind7_Airline-Passenger-List-Test_Hajj_Group_2027__1_.pdf	admin	2026-03-19 11:58:21.693133
aab78dbe-9130-4b85-a536-289d57e9242f	fcb968ef-5e83-432b-8aa3-a96d70131aea	visa	sahida visa .pdf	uploads/1773921535721_yp6pcddiq7_sahida_visa_.pdf	/api/documents/files/1773921535721_yp6pcddiq7_sahida_visa_.pdf	admin	2026-03-19 11:58:56.000876
78c5142a-72b6-40d8-82bc-bd3ce7cde40a	11db9fe2-1e0e-418f-9e60-516498472371	visa	888d3b9e-0da9-484f-a097-e5a1f84b7137altaf aadhar .JPG	uploads/1773922523893_03qjisachimo_888d3b9e-0da9-484f-a097-e5a1f84b7137altaf_aadhar_.JPG	/api/documents/files/1773922523893_03qjisachimo_888d3b9e-0da9-484f-a097-e5a1f84b7137altaf_aadhar_.JPG	admin	2026-03-19 12:15:25.415239
c7a9f1d4-3c02-43d6-ba7b-6a86d5924c50	11db9fe2-1e0e-418f-9e60-516498472371	flight_ticket	2908_1445_60_CGI_MoMA_Docs.pdf	uploads/1773922538454_m271mkd71bs_2908_1445_60_CGI_MoMA_Docs.pdf	/api/documents/files/1773922538454_m271mkd71bs_2908_1445_60_CGI_MoMA_Docs.pdf	admin	2026-03-19 12:15:38.720473
1bddc07a-61ef-4ec2-aabd-3ed6ae37d506	fcb968ef-5e83-432b-8aa3-a96d70131aea	model_contract	2908_1445_60_Model_Contract.pdf	uploads/1773927309896_ifvzv177ehb_2908_1445_60_Model_Contract.pdf	/api/documents/files/1773927309896_ifvzv177ehb_2908_1445_60_Model_Contract.pdf	admin	2026-03-19 13:35:11.70061
73d71ac5-9889-4f35-bcb9-9b9be0d85a51	11db9fe2-1e0e-418f-9e60-516498472371	model_contract	2908_1445_60_Model_Contract.pdf	uploads/1773927355862_z29om2qy0zj_2908_1445_60_Model_Contract.pdf	/api/documents/files/1773927355862_z29om2qy0zj_2908_1445_60_Model_Contract.pdf	admin	2026-03-19 13:35:57.660628
\.


--
-- Data for Name: feedback; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.feedback (id, pilgrim_mobile, pilgrim_name, booking_id, company_id, group_id, group_name, rating_overall, rating_accommodation_makkah1, rating_accommodation_makkah2, rating_accommodation_madinah, rating_transportation, rating_food, rating_guide, rating_visa_documentation, comment, what_did_you_like, suggestions, would_recommend, is_complaint, status, assigned_to, internal_notes, created_at, updated_at) FROM stdin;
d31eccf6-5ab5-4442-a784-2ba36c2d6123	9800000004	Test Haji	\N	\N	\N	\N	5	\N	\N	\N	5	4	5	\N	Excellent service	Everything was perfect	\N	yes	f	open	\N	\N	2026-04-29 07:48:18.867227	2026-04-29 07:48:18.867227
55d32af9-c1dc-4156-89e2-c3aded878841	9800000001	Test Pilgrim	\N	\N	\N	\N	4	\N	\N	\N	3	5	\N	\N	Good service overall	The guides were very helpful	\N	yes	t	in_progress	\N	\N	2026-04-29 07:46:43.415612	2026-04-29 07:46:43.415612
282ea860-fb33-4d5b-9903-0125b36233f7	9800000030	Final Test	\N	\N	\N	\N	5	\N	\N	\N	3	5	\N	\N	\N	\N	\N	yes	t	open	\N	\N	2026-04-29 08:00:10.259458	2026-04-29 08:00:10.259458
0f6237d0-afd3-4649-8ab8-e633173853e7	9800000040	\N	\N	\N	\N	\N	5	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	open	\N	\N	2026-04-29 08:04:03.972341	2026-04-29 08:04:03.972341
1d9bd131-4fdf-422d-bea3-5e7ce5b10b98	9800000050	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	4	\N	\N	\N	\N	\N	\N	f	open	\N	\N	2026-04-29 08:07:54.177551	2026-04-29 08:07:54.177551
4da03f02-352e-4018-b9c2-d4f78b108cd3	9800000050	\N	\N	\N	\N	\N	6	\N	\N	\N	\N	4	\N	\N	\N	\N	\N	\N	f	open	\N	\N	2026-04-29 08:07:54.223612	2026-04-29 08:07:54.223612
c5a4e23f-07a9-4500-9fec-5126939ba6c5	9800000050	\N	\N	\N	\N	\N	5	\N	\N	\N	\N	4	\N	\N	\N	\N	\N	\N	f	open	\N	\N	2026-04-29 08:07:54.26551	2026-04-29 08:07:54.26551
2856a5e6-844e-409a-adcf-fa4b17bd01ed	9800000060	\N	\N	\N	\N	\N	4	\N	\N	\N	\N	5	\N	\N	\N	\N	\N	\N	f	open	\N	\N	2026-04-29 08:08:15.077082	2026-04-29 08:08:15.077082
\.


--
-- Data for Name: gallery_images; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.gallery_images (id, title, file_name, file_url, is_active, sort_order, uploaded_by, created_at) FROM stdin;
\.


--
-- Data for Name: hajj_groups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.hajj_groups (id, group_name, year, departure_date, return_date, flight_number, maktab_number, hotels, notes, created_at, updated_at, company_id, starting_serial_number) FROM stdin;
a45b795c-eb4a-4332-a7e7-a6be48af111e	Test Hajj Group 2027	2027	15 Jun 2027	\N	AI-101	\N	{"makkah": {"name": "Hilton Makkah", "address": "", "checkIn": "", "checkOut": ""}, "madinah": {"name": "Oberoi Madinah", "address": "", "checkIn": "", "checkOut": ""}}	\N	2026-03-14 13:37:07.765512	2026-03-14 13:37:07.765512	\N	1
7bbcb7cb-ad48-4e87-b93c-3ccfd92383e2	alburhan jan 	2026	23/03/2026	08/06/2026	Ai 808	28	{"makkah": {"name": "azka safa ", "address": "ajiyad ", "checkIn": "23/03/2026", "checkOut": "30/03/2026", "googleMapsLink": "https://maps.app.goo.gl/T6ApFFe1mx44o1bv5"}, "madinah": {"name": "ananwar al madinah ", "address": "markaziya", "checkIn": "01/04/2026", "checkOut": "08/04/2026", "googleMapsLink": "https://maps.app.goo.gl/XUJTiiz5HGreYBEt5"}, "groupLeader": "mirza askar ullah baig "}	\N	2026-03-17 16:33:51.858073	2026-03-17 16:33:51.858073	\N	1
\.


--
-- Data for Name: hajj_rooms; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.hajj_rooms (id, group_id, room_number, hotel, total_beds, room_type, floor, notes, created_at, updated_at) FROM stdin;
267cf7da-8d28-4feb-a65c-799a11068523	7bbcb7cb-ad48-4e87-b93c-3ccfd92383e2	201	makkah	2	family	\N	\N	2026-04-03 17:12:58.091172	2026-04-03 17:12:58.091172
\.


--
-- Data for Name: inquiries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.inquiries (id, name, mobile, email, message, package_interest, is_read, created_at) FROM stdin;
\.


--
-- Data for Name: otps; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.otps (id, mobile, otp, used, expires_at, created_at) FROM stdin;
3c7e778e-310a-44ad-8424-665e3a64df00	9893989786	129032	t	2026-03-11 23:55:11.145	2026-03-11 23:45:11.146332
de282189-aa51-4cee-b348-031d52631545	9893989786	460778	t	2026-03-12 00:08:32.956	2026-03-11 23:58:32.958036
2dc942ee-efdb-4406-bd79-d55a601464c2	9893989786	883611	t	2026-03-12 08:33:38.997	2026-03-12 08:23:38.998751
250cb4ba-b2db-4a42-83d6-dd3f6ae44be1	9893989786	747827	t	2026-03-14 11:33:58.055	2026-03-14 11:23:58.057395
18b5c72f-1f9a-4d90-b1be-52f00297bb89	9867114562	697564	t	2026-03-14 11:37:24.67	2026-03-14 11:27:24.670731
24e8706a-2157-4a0d-9b5d-94dd781adf91	9893989786	403159	t	2026-03-14 12:16:59.257	2026-03-14 12:06:59.258224
e9cf8b0c-bf53-4a9c-9bba-e8cea63a82e4	9867114562	969193	t	2026-03-14 12:22:40.034	2026-03-14 12:12:40.034352
74903fcb-145b-4a70-8d17-da12ad81d40d	9999999999	204408	t	2026-03-14 13:46:22.861	2026-03-14 13:36:22.862411
397ed975-53f8-4532-8c60-335a308c6705	9893989786	301537	t	2026-03-14 14:07:53.084	2026-03-14 13:57:53.086241
9643a184-df33-4551-819c-a3b3c689b66f	9867114562	355246	t	2026-03-14 14:36:00.28	2026-03-14 14:26:00.281221
c53d4cf1-01ec-4e6a-a1d2-b3bd8e7e4de4	9893989786	397844	t	2026-03-14 16:52:14.041	2026-03-14 16:42:14.043495
96e37aa3-b6e7-4778-8c82-0318bc25fbb2	9893989786	947813	t	2026-03-14 16:53:37.235	2026-03-14 16:43:37.236134
32f5bf2c-1d2f-4d06-a8ef-800157251f0a	9893989786	447593	t	2026-03-14 18:08:03.612	2026-03-14 17:58:03.61346
851ea5f5-f6a1-4d37-a9b9-732bb8d979fc	9893989786	507889	t	2026-03-14 18:44:26.388	2026-03-14 18:34:26.389997
8f034ff4-239f-458d-888a-6f995bd25b4f	9893989786	573150	t	2026-03-14 19:20:18.161	2026-03-14 19:10:18.162475
e8fb41e1-7a38-4ca6-8427-5e16ca947580	9893989786	480847	t	2026-03-14 19:41:08.896	2026-03-14 19:31:08.897681
e25c9fe7-47fa-42b5-b212-1e4092aebe9f	9893989786	199467	t	2026-03-14 19:51:22.106	2026-03-14 19:41:22.107497
77c20a2f-601f-46f5-899b-10ac45b361d1	9893989786	766115	t	2026-03-14 20:36:58.767	2026-03-14 20:26:58.767645
a32864d5-de3a-4882-8349-837888982d1d	9893989786	642130	t	2026-03-14 23:31:35.016	2026-03-14 23:21:35.017619
e6a523da-f6fc-462d-a0c7-f79d906cd0b5	9893989786	842942	t	2026-03-15 08:10:41.799	2026-03-15 08:00:41.800325
5eb8fc5a-e95c-4059-888b-6fe047d599d0	9893225590	685715	f	2026-03-15 09:59:36.988	2026-03-15 09:49:36.989436
4f742283-4b2a-4480-b429-f30be3d450c0	9867114562	142198	t	2026-03-15 09:59:52.764	2026-03-15 09:49:52.765379
3e39ced7-592b-4847-aee8-33a615f4365d	9893989786	772942	t	2026-03-15 10:02:14.915	2026-03-15 09:52:14.915444
b56f6d81-1531-4c73-bba2-3dac8644a4da	9893989786	902451	t	2026-03-15 12:19:43.727	2026-03-15 12:09:43.729299
0594382b-4226-4071-a624-3ec4295d4ca3	9893989786	167518	f	2026-03-15 16:03:49.794	2026-03-15 15:53:49.796139
6fd5a9a8-102f-4af6-bd65-9e0f87fde83b	9893225590	709522	f	2026-03-15 16:06:03.474	2026-03-15 15:56:03.475167
b205f5e2-7a80-44cc-87b8-8d045963a03a	9893989786	725542	t	2026-03-15 16:14:06.096	2026-03-15 16:04:06.097171
dd287cd7-5f5f-4d1b-b923-4cf1f77a4226	9893989786	648562	t	2026-03-15 16:44:28.596	2026-03-15 16:34:28.597776
280ad697-b2a9-4f6f-8185-ac4a2639787d	9999999999	832122	t	2026-03-15 17:19:12.059	2026-03-15 17:09:12.060644
90e15d76-8981-4cb3-8899-a6b2aafabd60	9893989786	893025	t	2026-03-15 17:25:01.647	2026-03-15 17:15:01.648007
ea4858e8-b32b-47a5-ba3c-825d5b3d93a8	9893989786	214672	t	2026-03-15 17:56:34.131	2026-03-15 17:46:34.133312
4894f034-d956-44de-97f7-4144f0da6d95	9893989786	736543	t	2026-03-15 18:22:26.043	2026-03-15 18:12:26.044952
dccdfcb1-af52-4bdc-b279-a0ee6a1e5a26	9893989786	810934	t	2026-03-15 18:40:01.697	2026-03-15 18:30:01.698961
1333c8ad-3174-4894-a49f-28e747af46b2	7987488550	235592	t	2026-03-15 21:08:20.661	2026-03-15 20:58:20.661771
c44d63df-2ee1-481b-bcf1-7b21b7ca8582	9893989786	878867	t	2026-03-15 21:12:33.575	2026-03-15 21:02:33.576197
8fca12b9-6a44-4238-af4e-b48506926085	7987488550	727453	t	2026-03-15 21:16:44.297	2026-03-15 21:06:44.297674
32db25de-74d4-4f60-94d3-46c58ec7b0ad	9893989786	306116	t	2026-03-15 21:23:54.779	2026-03-15 21:13:54.77955
9aa3e2e5-169f-411b-9bcb-4e0c540a7b79	9893989786	237030	t	2026-03-15 23:08:32.261	2026-03-15 22:58:32.262939
e1c2a4b0-080d-4265-87fc-7d5bb3a514c2	9930161806	259437	f	2026-03-15 23:56:22	2026-03-15 23:46:22.000977
1aaba8d2-119c-49bc-87d5-c85204cb98e2	9893989786	804434	t	2026-03-15 23:56:33.467	2026-03-15 23:46:33.46754
8a62b64d-83fe-44dd-8ea4-54d86f1e9f7d	9893989786	153531	t	2026-03-16 09:58:41.336	2026-03-16 09:48:41.338727
d188df4b-4923-4afb-8105-5a54a68a65cb	9893989786	343641	t	2026-03-16 11:18:18.377	2026-03-16 11:08:18.378619
443f4a6e-edfe-4b28-8129-899f1b3cf62d	9893989786	793133	t	2026-03-16 12:25:44.281	2026-03-16 12:15:44.282318
44990d56-710c-489a-8501-d5143e79efc7	9893989786	348254	t	2026-03-16 14:07:32.323	2026-03-16 13:57:32.325124
b6581383-2355-4bc0-bae0-1003a0f58926	9893989786	435011	t	2026-03-16 15:32:18.094	2026-03-16 15:22:18.095958
9a12267d-b13c-41d3-ad91-4607d1b067eb	9867114562	454831	t	2026-03-16 15:42:40.086	2026-03-16 15:32:40.087003
d1844aa0-df30-4086-a2f5-428e71bf2e37	9867114562	530104	t	2026-03-16 15:43:41.806	2026-03-16 15:33:41.806725
82991293-e335-4792-99d5-b961a0dbd76a	9867114562	554638	t	2026-03-16 15:44:38.354	2026-03-16 15:34:38.35461
6875e76d-9eb5-4128-b7cf-f7016973aeb8	9867114562	893204	t	2026-03-16 15:46:41.316	2026-03-16 15:36:41.316658
5561d76f-ca17-4eea-9339-68383fcee0f8	9893989786	341634	t	2026-03-16 15:49:59.113	2026-03-16 15:39:59.1142
0a3b9b94-d694-447f-a2dd-33dc6eb6cf0f	9893989786	130708	t	2026-03-16 17:25:51.845	2026-03-16 17:15:51.847369
c7ba40e3-e285-4434-b3ba-1e58c5ac79cf	9893989786	378332	t	2026-03-17 10:55:48.99	2026-03-17 10:45:48.991238
32525346-f332-4d45-85bc-920de08c02f0	9893989786	432725	t	2026-03-17 12:04:18.563	2026-03-17 11:54:18.565303
408a65b3-e885-46ff-9df1-f22cddc2fa60	9893989786	261766	t	2026-03-17 12:43:23.227	2026-03-17 12:33:23.2287
03da4b67-8bcc-4a02-bb7e-4b83ff49729c	9893989786	141840	t	2026-03-17 16:09:43.632	2026-03-17 15:59:43.633231
03205641-433d-4848-a53c-67418689cf21	9893989786	771606	t	2026-03-17 17:50:58.765	2026-03-17 17:40:58.767262
20ee632c-b642-4e86-9533-1b4fd56581cd	9867114562	963338	t	2026-03-17 18:38:06.639	2026-03-17 18:28:06.639745
c5eaa14c-6c67-4b6b-bd9a-fdf494c38f68	9893989786	684500	t	2026-03-17 18:45:31.07	2026-03-17 18:35:31.070681
89611cad-46b2-41db-b9d9-a4d630ef7567	9867114562	653875	t	2026-03-17 18:52:16.378	2026-03-17 18:42:16.378746
d333c356-da4e-45e8-b72c-337fd5509760	7987488550	457154	t	2026-03-17 20:50:35.974	2026-03-17 20:40:35.975792
9e5a3cbf-e1fe-42df-a9e7-20e490c8f325	9867114562	564819	t	2026-03-17 21:18:50.669	2026-03-17 21:08:50.670684
763472ec-a143-41e7-a87a-aa3ac62051b9	9893989786	647842	t	2026-03-17 21:39:02.68	2026-03-17 21:29:02.681432
cdc52c51-178a-4dcd-8239-1169e14c784c	9893989786	601348	t	2026-03-17 22:15:06.954	2026-03-17 22:05:06.955736
382d15f2-454f-47a1-9b8e-f00b98b44948	9867114562	839836	t	2026-03-17 22:20:23.609	2026-03-17 22:10:23.609708
fd5708ca-a1ed-43aa-b807-de6982101ab4	9867114562	980235	t	2026-03-17 22:38:25.681	2026-03-17 22:28:25.682869
883435b1-fc8a-49b3-9221-abb6ea518dcc	9867114562	564376	t	2026-03-18 07:39:58.807	2026-03-18 07:29:58.808897
c2790208-2ecb-429b-bd58-9241ac824474	9893989786	475745	t	2026-03-18 08:17:07.287	2026-03-18 08:07:07.288927
c02b1add-9645-48ec-ab9c-e1a45f2f7b08	9867114562	818543	t	2026-03-18 08:19:15.936	2026-03-18 08:09:15.936912
37e562f2-9e8a-4ea4-9372-b3b00955f440	9867114562	191347	t	2026-03-18 09:08:18.657	2026-03-18 08:58:18.658596
6aad387c-dd2b-4559-8118-fc4165dd3e17	9867114562	360066	t	2026-03-18 09:54:12.117	2026-03-18 09:44:12.119067
bf3e84af-c09e-41fc-b7a8-daea99d12896	9867114562	919494	t	2026-03-18 14:48:27.63	2026-03-18 14:38:27.631706
a3d4885e-7b3a-487d-8d06-117473e0dd0c	9893989786	248380	t	2026-03-18 21:50:27.212	2026-03-18 21:40:27.213766
c86c6829-0f91-4b26-ab2b-c3a924c1f7fa	9893989786	958022	f	2026-03-18 21:55:45.16	2026-03-18 21:45:45.160542
b98c9c43-b84c-4c08-b4e7-ed0663e17573	9893989786	277830	t	2026-03-19 00:34:46.563	2026-03-19 00:24:46.565138
318e4a62-683e-437b-aea6-34a563fe0381	9867114562	995431	t	2026-03-19 00:39:54.865	2026-03-19 00:29:54.866255
03bd7326-c5bd-48e5-a506-5b9f1788e01f	9893989786	575459	t	2026-03-19 10:21:22.582	2026-03-19 10:11:22.58366
a8652d0f-a327-43ba-a4ef-ca46b2241e14	9867114562	473689	t	2026-03-19 10:23:26.627	2026-03-19 10:13:26.627383
e8fd44bc-280c-4b56-9c8b-103f22e775b4	9893989786	209902	t	2026-03-19 10:25:25.025	2026-03-19 10:15:25.026455
a8387ed0-24a1-4b07-8621-4c87bccb696e	9893989786	729240	t	2026-03-19 10:26:29.187	2026-03-19 10:16:29.187449
c7719d8c-75ab-49db-81bf-b99e29315da8	9867114562	198305	t	2026-03-19 10:26:58.554	2026-03-19 10:16:58.555269
1e1e6b75-6e13-4736-b69a-ce3db88d49ed	7987488550	242802	t	2026-03-19 10:29:09.466	2026-03-19 10:19:09.466672
678c5836-a390-4610-8cb3-04148e238411	9867114562	274921	t	2026-03-19 11:44:10.401	2026-03-19 11:34:10.403197
cef887b0-f45b-4b90-be86-de13c54279b5	9893989786	252224	t	2026-03-19 12:06:36.834	2026-03-19 11:56:36.835269
d42cd1bc-da4b-44c7-89e4-56acf011a4c6	9867114562	507572	t	2026-03-19 12:20:02.714	2026-03-19 12:10:02.714412
ea2438aa-c057-4723-8df6-be8858c7ec9b	9893989786	297712	t	2026-03-19 12:22:58.521	2026-03-19 12:12:58.522344
22a4e293-71f6-4f11-b4a6-9c6e8e92871d	9867114562	614388	t	2026-03-19 12:29:59.571	2026-03-19 12:19:59.571714
da5924a2-7b38-4ba2-b786-6c49763fecb4	9893989786	895916	t	2026-03-19 13:44:20.514	2026-03-19 13:34:20.515477
3c6940ae-f412-4d35-a68b-80b8a4dd4fef	9867114562	238350	t	2026-03-19 13:46:34.935	2026-03-19 13:36:34.936113
7982daaa-29ab-40fc-8818-17246f9835f8	9893989786	268878	t	2026-03-19 14:19:19.032	2026-03-19 14:09:19.033663
bd2d72be-8bd7-4836-ba6a-dd5cc4812d45	9893989786	147268	t	2026-03-19 15:56:29.96	2026-03-19 15:46:29.961218
23b21fbb-218d-4297-8e38-8b9505495cb1	9893989786	856927	t	2026-03-19 16:16:52.087	2026-03-19 16:06:52.088981
88a3cda7-3721-41f3-8e55-0aff726dc510	9893989786	582503	t	2026-03-20 14:48:59.391	2026-03-20 14:38:59.392229
0b3177a4-bbd2-477a-b30e-1a87ae6d38a1	8828861122	693728	f	2026-03-20 15:31:14.325	2026-03-20 15:21:14.326274
40af56d7-6999-43e0-9fba-6c025402db19	9893989786	558775	t	2026-03-23 02:13:23.956	2026-03-23 02:03:23.958364
76140410-d94f-4e20-8293-2dd6f2e7e240	7987488550	327407	t	2026-03-24 21:28:39.307	2026-03-24 21:18:39.308677
37954c2e-ec44-4048-8f48-ae5405820af8	9893989786	991338	t	2026-03-24 22:32:40.835	2026-03-24 22:22:40.836515
d66531f7-bc8f-468a-b846-7b710a3ce369	9893989786	980078	t	2026-03-25 11:21:06.424	2026-03-25 11:11:06.425714
b84e0c8d-08d1-47d6-bfe8-ed9dd3b0ac73	9893989786	644855	t	2026-03-30 04:14:10.62	2026-03-30 04:04:10.621412
fd1416ec-b0fb-4910-81ff-8958b21256d7	9893989786	828830	t	2026-03-30 04:20:51.284	2026-03-30 04:10:51.285083
7f6ad1c3-a11c-4c72-a535-9d009010745f	9893989786	648671	t	2026-03-30 05:19:04.594	2026-03-30 05:09:04.595744
8a5ba3f5-a65b-4dba-92f6-88f547c45ed1	9893989786	317170	t	2026-03-30 05:51:41.975	2026-03-30 05:41:41.976985
39e054fd-f1f3-4bce-a213-dc1ea11a8274	9867114562	677738	t	2026-03-30 05:56:28.975	2026-03-30 05:46:28.97612
f2ebd38d-08b8-4825-b0d9-ca69e58c33f0	9893989786	115475	t	2026-03-30 06:07:09.843	2026-03-30 05:57:09.844222
721a4969-7fa1-4750-8e3c-7a61a1477e0f	9893989786	719162	t	2026-03-30 06:20:08.3	2026-03-30 06:10:08.301562
c82ddef3-27f7-45ea-939f-fdbcbccef836	9893989786	650311	t	2026-03-30 09:44:23.578	2026-03-30 09:34:23.579702
28c810cc-ef7b-4e5a-930d-3f76a832954d	9893989786	285716	f	2026-04-01 07:34:12.576	2026-04-01 07:24:12.578046
e61ba4f8-d5b6-4888-80dd-9f1af3238f63	9867114562	383065	t	2026-04-02 20:24:47.936	2026-04-02 20:14:47.937698
e05257dc-a0ee-437f-a225-1e912c138070	9893989786	460908	t	2026-04-02 20:26:02.922	2026-04-02 20:16:02.923086
bfdc7990-87f4-44c0-bad6-4a2f636a8e9e	8828861122	990399	t	2026-04-02 20:42:13.427	2026-04-02 20:32:13.427315
9aac5f18-540c-4a5c-91af-f33b138ed4f7	9893989786	447546	t	2026-04-02 20:48:07.903	2026-04-02 20:38:07.903516
23ff78f4-e3b5-4358-bbff-f821cdc8ab74	8828861122	535088	t	2026-04-02 20:52:01.659	2026-04-02 20:42:01.659819
56c22ea5-5194-4f4f-b4d9-ef45be6f29d5	9893989786	695724	f	2026-04-02 21:28:08.474	2026-04-02 21:18:08.474904
4c0397c7-a150-433d-a287-6fdd6aae20b5	9893989786	778587	t	2026-04-02 21:27:33.619	2026-04-02 21:17:33.620881
a6606bc9-4611-4471-8647-394041e613d6	9893989786	339861	t	2026-04-02 21:32:40.102	2026-04-02 21:22:40.10344
6b91f39e-c705-4345-a7cf-8bdfebf57040	8828861122	463564	t	2026-04-02 22:23:08.538	2026-04-02 22:13:08.540174
4261b98a-53c0-4983-87de-ae8cce8c0564	8828861122	644576	t	2026-04-02 22:48:56.332	2026-04-02 22:38:56.333431
10ac1370-2e7b-4396-a158-c62610a2f9c8	9893989786	879570	t	2026-04-02 22:51:29.649	2026-04-02 22:41:29.650243
fcfd750b-cbb9-4717-a37b-d3ed74b7028b	9867114562	693141	t	2026-04-03 07:18:33.774	2026-04-03 07:08:33.776023
3a62e79d-d103-4fe4-9d5e-14347ee3ee57	9893989786	994630	t	2026-04-03 07:43:19.345	2026-04-03 07:33:19.346133
993741ae-2c95-43a0-8e72-5ff9a6a9b19a	9867114562	679170	t	2026-04-03 08:06:25.767	2026-04-03 07:56:25.768646
57b03575-a5a0-4d89-a345-2c507129f29c	9893989786	552907	t	2026-04-03 08:07:24.495	2026-04-03 07:57:24.496027
22ec08fc-28d9-4918-a6f9-f7ce0cb884db	9893989786	600067	t	2026-04-03 09:53:33.264	2026-04-03 09:43:33.265127
b6e5a46e-c669-4ac7-a436-8ec0d5f949d7	9893989786	834095	t	2026-04-03 10:57:51.681	2026-04-03 10:47:51.682893
600ea93d-5852-4ffb-b8b0-1ddc5f5fb31f	9893989786	188828	f	2026-04-03 16:23:21.047	2026-04-03 16:13:21.048876
cb8c29ee-efc8-446b-9d4f-a11767dcd1f5	9893989786	730405	t	2026-04-03 16:24:25.79	2026-04-03 16:14:25.791104
5dd913de-6ce0-4d59-880c-a0b4e61cf837	9893989786	852141	t	2026-04-03 17:18:09.594	2026-04-03 17:08:09.595355
40d6ad31-ca26-4128-8c40-ea1e117c5b31	9893989786	867301	t	2026-04-17 12:34:07.347	2026-04-17 12:24:07.349284
c6d94e89-ec01-486b-b784-aa673dd31d90	9893989786	948209	f	2026-04-17 13:19:23.412	2026-04-17 13:09:23.413089
492439ad-9ab0-479e-b75f-4d827707cc27	9893989786	801887	t	2026-04-17 13:20:29.178	2026-04-17 13:10:29.179295
4960e77e-0014-482d-9052-2e60480fd35f	9893989786	983667	f	2026-04-29 07:51:10.013	2026-04-29 07:46:10.015174
0ff591ac-9c5b-40cd-aedf-4d243b726ce1	9893989786	833027	f	2026-04-29 07:51:17.296	2026-04-29 07:46:17.296742
eb43e652-208e-45cc-86f6-57d5bc8fb215	9893989786	630164	f	2026-04-29 07:51:17.607	2026-04-29 07:46:17.607685
b44a8f70-3727-476c-9f22-b748662dfe8c	7777777777	154374	f	2026-04-29 07:51:25.212	2026-04-29 07:46:25.212789
f321f9e7-ce8b-4342-8dcc-13c8969f843a	7777777777	609389	f	2026-04-29 07:51:25.537	2026-04-29 07:46:25.538066
9c5cc41a-fd2a-4ea3-aaca-b3d606557d19	7777777777	909341	f	2026-04-29 07:51:25.833	2026-04-29 07:46:25.833943
0c7113d0-5c2f-4ca5-9145-31329192d95c	9800000001	993366	t	2026-04-29 07:51:33.943	2026-04-29 07:46:33.944102
e6783fca-f6f3-498c-9ebf-9d4b03073c6b	9800000002	610820	t	2026-04-29 07:52:13.522	2026-04-29 07:47:13.523076
ab956851-6b16-4b82-81ef-1dc237128ae5	9800000003	255577	t	2026-04-29 07:53:03.321	2026-04-29 07:48:03.323441
050d5059-1068-4b4d-a059-f2f9be0bdfe5	9800000004	857208	t	2026-04-29 07:53:17.405	2026-04-29 07:48:17.406295
7b4f34c5-26ad-4e35-90b2-d599d1c2c987	9800000010	751198	t	2026-04-29 08:00:01.193	2026-04-29 07:55:01.194374
0c0cdb6d-aa70-4cfd-a4c3-b317cc2fe390	9800000020	591816	f	2026-04-29 08:04:09.664	2026-04-29 07:59:09.66494
571520ae-bc62-4b0e-80e2-bab38a9382ee	9800000030	311485	t	2026-04-29 08:05:08.691	2026-04-29 08:00:08.692801
e12fd63a-6745-42f9-8db2-7dc891a3f173	9800000040	134921	t	2026-04-29 08:09:02.518	2026-04-29 08:04:02.519446
21415432-862c-499b-a7bd-29154853f975	9800000041	833998	t	2026-04-29 08:09:04.012	2026-04-29 08:04:04.012797
069138a9-064a-4b61-bea8-03f053a15616	9800000050	537649	t	2026-04-29 08:12:52.692	2026-04-29 08:07:52.692602
ee8d4a60-2f29-47be-9817-e0d693d7d418	9800000060	681730	t	2026-04-29 08:13:13.543	2026-04-29 08:08:13.544544
d6d9d71a-75e6-4320-ac6c-f2fc0165ecd2	9999999999	139161	f	2026-05-05 14:37:24.305	2026-05-05 14:27:24.306677
92bf11d4-b5a5-4369-99c7-93eeb3210ed5	9893989786	820598	f	2026-05-06 16:34:28.422	2026-05-06 16:24:28.42322
466681bb-d644-4cad-9fbf-f1498d19d61f	9893989786	171080	t	2026-05-06 16:40:13.212	2026-05-06 16:30:13.213096
\.


--
-- Data for Name: package_media; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.package_media (id, package_id, type, url, caption, display_order, created_at) FROM stdin;
\.


--
-- Data for Name: package_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.package_requests (id, customer_id, package_id, booking_id, customer_name, customer_mobile, package_name, message, status, rejection_reason, created_at, updated_at, group_id, pilgrim_id) FROM stdin;
\.


--
-- Data for Name: packages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.packages (id, name, type, description, duration, price_per_person, gst_percent, includes, highlights, departure_dates, max_pilgrims, image_url, is_active, created_at, updated_at, featured, details, image_urls, video_urls) FROM stdin;
9aac5fc5-c2e7-439a-9115-8f166e993ea6	Syria Ziyarat Tour	syria_ziyarat	Visit the sacred shrines of Syria including Sayyida Zainab shrine in Damascus, Sayyida Ruqayya shrine, and other significant Islamic sites. Experience the rich history and spiritual significance of ancient Syria with our expert guides.	7 Days / 6 Nights	48000.00	5.00	["Return airfare", "Syria visa assistance", "Hotel accommodation", "Sayyida Zainab shrine visit", "Sayyida Ruqayya shrine", "Umayyad Mosque", "Old Damascus tour", "All transportation"]	["Sayyida Zainab shrine", "Sacred Islamic sites", "Experienced guide", "Damascus historical sites", "Spiritual group journey"]	["2025-05-15", "2025-08-15", "2025-11-15"]	30	\N	t	2026-03-11 23:10:34.346539	2026-03-11 23:10:34.346539	f	{}	[]	[]
e31c72f4-3f52-43d2-a5b9-005b62099611	Jordan Islamic Heritage Tour	jordan_heritage	Explore the Islamic heritage of Jordan — visit the tomb of Sayyidna Jafar ibn Abi Talib, the Battle of Mutah site, Petra, Wadi Rum, and the Dead Sea. A unique blend of Islamic history and natural wonders.	8 Days / 7 Nights	58000.00	5.00	["Return airfare", "Jordan visa", "4-star hotel accommodation", "Tomb of Jafar ibn Abi Talib", "Mutah battle site", "Petra (World Wonder)", "Wadi Rum desert camp", "Dead Sea experience", "All transportation"]	["Sayyidna Jafar shrine", "Petra & Wadi Rum", "Dead Sea float", "Islamic battle sites", "Comprehensive Jordan tour"]	["2025-04-15", "2025-07-15", "2025-10-15"]	30	\N	t	2026-03-11 23:10:34.346539	2026-03-11 23:10:34.346539	f	{}	[]	[]
0381e073-49af-4eba-8c2e-825b03da88bf	Iraq Ziyarat Tour – 10 Days	iraq_ziyarat	A deeply spiritual journey to the sacred shrines of Iraq. Visit Imam Ali shrine in Najaf, Imam Hussain shrine in Karbala, Kazmain shrine in Baghdad, and the golden-domed shrines of Samarra. Our experienced guides ensure a safe and spiritually enriching pilgrimage.	10 Days / 9 Nights	55000.00	5.00	["Return airfare from Mumbai/Delhi", "Iraq visa processing", "4-star hotel accommodation", "Transportation between all shrines", "Guided Ziyarat with scholar", "All meals included", "Baghdad-Najaf-Karbala-Baghdad circuit", "Samarra day trip"]	["Sacred Shia shrines", "Expert religious guide", "Najaf, Karbala, Kazmain, Samarra", "All meals included", "Flight + Visa included"]	["2025-04-01", "2025-06-01", "2025-08-01", "2025-10-01", "2025-12-01"]	35	\N	t	2026-03-11 23:10:34.346539	2026-03-11 23:10:34.346539	f	{}	[]	[]
fb7fb3dc-2910-4d99-bb92-80f4cf671508	Economy Umrah Package	umrah	Budget-friendly Umrah package with comfortable accommodation close to Haram. Ideal for groups and families seeking an affordable pilgrimage experience.	14 Nights / 15 Days	90000.00	5.00	["Return Airfare", "Visa Processing", "14 Nights Accommodation", "Makkah: Durrat O Sallah Hotel (1★) – 600m from Haram (12 min walk)", "Madinah: Guest Time Hotel (2★) – 200m from Masjid Nabawi", "5 Person Room Sharing", "Airport Transfers"]	["Departures Every 15 Days", "5 Person Sharing Rooms", "Close to Haram & Masjid Nabawi", "Budget-Friendly Price", "GST Extra @ 5%"]	["Every 15 Days"]	\N	/api/storage/objects/uploads/1775201739923_584cb927_IMG_6295.JPG	t	2026-03-11 22:51:13.413705	2026-04-03 07:35:40.167	f	{}	["/api/documents/files/pkg_img_1774851375513_yuqt0k0opq_IMG_6291.JPG"]	[]
c40598cf-a568-4fbe-b335-2317d7299a4a	Baitul Muqaddas – Jerusalem Tour	baitul_muqaddas	Journey to one of the holiest sites in Islam — Masjid Al-Aqsa and the Dome of the Rock in Jerusalem. Pray at the Qibla Al-Awwal, walk in the footsteps of the prophets, and experience the rich Islamic heritage of the Holy Land.	8 Days / 7 Nights	65000.00	5.00	["Return airfare", "Jordan/Israel visa assistance", "4-star hotel in Jerusalem", "Guided tour of Al-Aqsa & Dome of the Rock", "Visit to Hebron (Al-Khalil)", "Visit to Bethlehem", "Amman city tour", "All transportation"]	["Masjid Al-Aqsa prayer", "Dome of the Rock", "Hebron - Masjid Ibrahim", "Expert Islamic heritage guide", "Small group experience"]	["2025-05-01", "2025-07-01", "2025-09-01", "2025-11-01"]	25	\N	t	2026-03-11 23:10:34.346539	2026-03-11 23:10:34.346539	t	{}	[]	[]
06761c5c-120a-4331-8006-d6e3bc0951b9	Premium Umrah Package	umrah	Premium Umrah experience with 3-star hotels steps away from the holy sites. Enjoy the spiritual journey in comfort with weekly departure options.	Flexible (Weekly Departures)	150000.00	5.00	["Return Airfare", "Visa Processing", "Accommodation in 3-Star Hotels", "Makkah: Azka Safa Hotel (3★) – 200m from Haram", "Madinah: Rose Holiday Hotel (3★) – 100m from Masjid Nabawi", "Airport & Intercity Transfers", "Makkah & Madinah Ziyarat"]	["Weekly Departures", "3-Star Hotels at Prime Locations", "200m from Haram, Makkah", "100m from Masjid Nabawi, Madinah", "GST Extra @ 5%"]	["Every Week"]	20	\N	t	2026-03-11 22:51:13.413705	2026-03-11 23:19:53.476781	t	{}	[]	[]
9a6b14e1-1c48-4852-b90b-a1d7bb459309	Burhan Budget Saver Shifting – Hajj 2027	special_hajj	Our most popular Hajj package — Burhan Budget Saver Shifting. 40 days of complete Hajj experience with Moulim Category D (New Mina), stays in Makkah & Madinah, Ziyarat to Makkah, Madinah, Taif & Badar, and an extensive complimentary kit.	40 Days	650000.00	5.00	["Return Airfare", "Visa Processing", "Moulim Category D – New Mina", "Makkah (Before Hajj): 10 Days – Azizia Area, 5km from Haram", "Makkah (After Hajj): 15 Days – Grand Masa Hotel (3★) – 400m from Haram", "Madinah: 9 Days – Haya Plaza Hotel (3★) – 100m from Masjid Nabawi", "AC Bus Transport", "Ziyarat: Makkah, Madinah, Taif & Badar", "24-inch PP Bag + 20-inch PP Bag + Backpack", "Mina/Arafat Bag + Passport Bag + Shoe Bag", "Umbrella + Sunglasses + Electric Neck Fan", "Muzdalifah Sleeping Mat + Janamaz + Tasbeeh", "Printed Hajj & Umrah Guide + Ihram Belt + Ihram"]	["Most Popular Hajj Package 2027", "40 Days Complete Hajj Journey", "Moulim Category D – New Mina", "15-Piece Complimentary Kit Included", "Departure 05 May 2027 | Return 20 June 2027", "GST Extra @ 5%"]	["05 May 2027"]	10	\N	t	2026-03-11 22:51:13.413705	2026-03-11 23:20:05.519627	t	{}	[]	[]
a22dbeb8-51b8-4e93-9a22-e562225cc2c5	Ramadan Umrah Special – Last 20 Days	ramadan_umrah	Experience the last 20 blessed nights of Ramadan in the holy cities of Makkah and Madinah. Includes Laylatul Qadr (Night of Power) in Makkah.	20 Days	140000.00	5.00	["Return Airfare", "Visa Processing", "Makkah: Kayan Al Raya Hotel Ajiyad (1★) – 500m from Haram", "Madinah: Arjwan Sada Hotel – 300m from Masjid Nabawi", "4/5 Person Sharing Rooms", "Airport & Intercity Transfers", "Iftar & Suhoor Meals"]	["Laylatul Qadr in Makkah", "4/5 Person Sharing", "Last 20 Nights of Ramadan", "500m from Haram", "300m from Masjid Nabawi", "GST Extra @ 5%"]	["28 January 2027"]	\N	\N	t	2026-03-11 22:51:13.413705	2026-03-30 06:14:49.729	t	{"visa": "Umrah Visa Included", "airline": "Akasa Air", "mealPlan": "Breakfast + Dinner (Indian Menu)", "roomType": "Quad Sharing", "transport": "AC Deluxe Bus", "hotelMakkah": "Zohratu Sallah Ajiyad ", "hotelMadinah": "Lulu Madinah ", "distanceMakkah": "600 meter ", "departureCities": ["Mumbai", "Delhi"], "distanceMadinah": "300 meters", "hotelCategoryMakkah": "1 star ", "hotelCategoryMadinah": " 2 star "}	["/api/documents/files/pkg_img_1774851257544_qqieb13zhgd_IMG_6290.JPG"]	[]
598cfbce-add0-4b47-9f4a-d1fed337c715	Burhan Elite Plus – Hajj 2027	hajj	Premium Hajj 2027 package with superior hotel selections, comprehensive services and a comfortable spiritual journey.	40 Days	0.00	5.00	["Return Airfare", "Visa Processing", "4-Star Hotel in Makkah (Close to Haram)", "4-Star Hotel in Madinah (Close to Masjid Nabawi)", "Moulim Services", "AC Transport Throughout", "Ziyarat: Makkah, Madinah, Taif & Badar", "Complimentary Hajj Kit", "Meals Included"]	["4-Star Hotel Accommodations", "Departure 11 May 2027", "Comprehensive Moulim Services", "Complimentary Kit Included", "GST Extra @ 5%"]	["11 May 2027"]	\N	\N	t	2026-03-12 09:52:08.203072	2026-03-12 09:52:08.203072	f	{}	[]	[]
57c47904-1ac0-4657-849b-f5d9766a68fb	Burhan Comfort Plus – Hajj 2027	hajj	Comfortable Hajj 2027 package with 3-star accommodations and all essential services for a fulfilling pilgrimage.	40 Days	0.00	5.00	["Return Airfare", "Visa Processing", "3-Star Hotel in Makkah", "3-Star Hotel in Madinah", "Moulim Services", "AC Transport Throughout", "Ziyarat: Makkah, Madinah & Badar", "Complimentary Hajj Kit"]	["3-Star Hotel Accommodations", "Departure 11 May 2027", "All Essential Services Included", "GST Extra @ 5%"]	["11 May 2027"]	\N	\N	t	2026-03-12 09:52:08.203072	2026-03-12 09:52:08.203072	f	{}	[]	[]
f6bd3eb0-c8fc-40b2-8d98-cff68b0d8c74	Burhan Comfort – Hajj 2027	hajj	A well-rounded Hajj 2027 package ensuring comfort and convenience throughout your sacred journey.	40 Days	0.00	5.00	["Return Airfare", "Visa Processing", "3-Star Hotel in Makkah", "3-Star Hotel in Madinah", "Moulim Services", "AC Transport Throughout", "Ziyarat Included", "Hajj Kit"]	["Comfortable 3-Star Accommodations", "Departure 11 May 2027", "Value for Money", "GST Extra @ 5%"]	["11 May 2027"]	\N	\N	t	2026-03-12 09:52:08.203072	2026-03-12 09:52:08.203072	f	{}	[]	[]
333cb0a6-ccfa-46b0-8a32-7859c3c6e295	Burhan Economy Plus – Hajj 2027	hajj	A budget-friendly Hajj 2027 package without compromising on the essential services needed for your pilgrimage.	40 Days	0.00	5.00	["Return Airfare", "Visa Processing", "2-Star Hotel in Makkah", "2-Star Hotel in Madinah", "Moulim Services", "AC Transport Throughout", "Ziyarat Included", "Basic Hajj Kit"]	["Budget-Friendly Package", "Departure 11 May 2027", "All Essentials Included", "GST Extra @ 5%"]	["11 May 2027"]	\N	\N	t	2026-03-12 09:52:08.203072	2026-03-12 09:52:08.203072	f	{}	[]	[]
6b63fc56-cbce-42fa-8ec5-584a9f3f68a8	Burhan Budget Saver – Hajj 2027	hajj	Al Burhan's most economical Hajj 2027 package — affordable price with all necessary services for your sacred journey.	40 Days	0.00	5.00	["Return Airfare", "Visa Processing", "Economy Hotel in Makkah", "Economy Hotel in Madinah", "Moulim Services", "AC Transport Throughout", "Ziyarat Included", "Basic Hajj Kit"]	["Most Affordable Hajj Package", "Departure 11 May 2027", "Complete Hajj Journey", "GST Extra @ 5%"]	["11 May 2027"]	\N	\N	t	2026-03-12 09:52:08.203072	2026-03-12 09:52:08.203072	f	{}	[]	[]
349c3c44-52a1-42ed-bb08-bcf7b85673d0	Ramadan Umrah Full Month Package	ramadan_umrah	Complete Ramadan experience — spend the entire holy month in Makkah and Madinah. Includes flights on Akasa Air, 30kg baggage + Zamzam allowance, all meals (Suhoor, Iftar, Dinner), and guided Ziyarat.	32 Days (22 Nights Makkah + 12 Nights Madinah)	180000.00	5.00	["Return Flight on Akasa Air", "30 KG Baggage + Zamzam Allowance", "Visa Processing", "Makkah: 22 Days – Zohratu Sallah Hotel Bir Balila Ajiyad – 600m from Haram", "Madinah: 12 Days – Lulu Madinah Hotel (1★) – 300m from Masjid Nabawi", "5/6 Person Sharing (Makkah) | 4/5 Person Sharing (Madinah)", "AC Bus: Jeddah – Makkah – Madinah – Jeddah", "All Meals: Suhoor, Iftar & Dinner", "Makkah & Madinah Ziyarat"]	["Full Ramadan Month Package", "Departure 9 January 2027", "Akasa Air Flights Included", "All Meals Included (Suhoor, Iftar, Dinner)", "30 KG + Zamzam Baggage", "Ziyarat Included", "GST Extra @ 5%"]	["9 January 2027"]	\N	\N	t	2026-03-11 23:20:26.767388	2026-03-11 23:20:26.767388	t	{"visa": "Umrah Visa Included", "airline": "Akasa Air / Air India Express", "mealPlan": "Breakfast + Dinner (Indian Menu)", "roomType": "Quad Sharing", "transport": "AC Deluxe Bus", "hotelMakkah": "Jabal Omar Marriott", "hotelMadinah": "Shaza Al Madina", "distanceMakkah": "150 meters", "departureCities": ["Mumbai", "Delhi", "Hyderabad", "Lucknow"], "distanceMadinah": "100 meters", "hotelCategoryMakkah": "5 Star", "hotelCategoryMadinah": "5 Star"}	[]	[]
37d8f4d0-8f94-4f98-b596-f0d672709d3c	Burhan Royal Elite – Hajj 2027	hajj	Al Burhan's most premium Hajj 2027 package with elite accommodations and exclusive services for a spiritually enriching journey.	40 Days	0.00	5.00	["Return Airfare", "Visa Processing", "Premium 5-Star Hotel in Makkah (Near Haram)", "Premium 5-Star Hotel in Madinah (Near Masjid Nabawi)", "VIP Moulim Services", "AC Luxury Transport Throughout", "All Ziyarat: Makkah, Madinah, Taif & Badar", "Premium Complimentary Hajj Kit", "Dedicated Group Leader", "All Meals Included"]	["Elite 5-Star Accommodations", "Departure 11 May 2027", "VIP Moulim Category", "Premium Complimentary Kit", "Luxury AC Transport", "GST Extra @ 5%"]	["11 May 2027"]	\N	\N	t	2026-03-12 09:52:08.203072	2026-03-12 09:52:08.203072	t	{"visa": "Hajj Visa Included", "airline": "Saudi Airlines Direct", "mealPlan": "Full Board (Breakfast, Lunch, Dinner)", "roomType": "Double Sharing", "transport": "Private AC Vehicle", "hotelMakkah": "Pullman ZamZam Makkah", "hotelMadinah": "The Oberoi Madinah", "distanceMakkah": "50 meters (Haram View)", "departureCities": ["Mumbai", "Delhi", "Hyderabad", "Lucknow", "Jaipur"], "distanceMadinah": "100 meters", "hotelCategoryMakkah": "5 Star Deluxe", "hotelCategoryMadinah": "5 Star Deluxe"}	[]	[]
\.


--
-- Data for Name: payment_transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payment_transactions (id, booking_id, amount, payment_date, payment_mode, reference_number, notes, recorded_by, created_at) FROM stdin;
\.


--
-- Data for Name: pilgrims; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pilgrims (id, group_id, serial_number, full_name, passport_number, visa_number, date_of_birth, gender, blood_group, photo_url, mobile_india, mobile_saudi, address, city, state, room_number, bus_number, relation, cover_number, created_at, updated_at, medical_condition, room_type, seat_number, salutation, passport_issue_date, passport_expiry_date, passport_place_of_issue, room_hotel, room_id, barcode_id, family_id, family_relation, family_head, room_notes) FROM stdin;
ad626677-4658-479b-84c3-45ee915bf4c6	a45b795c-eb4a-4332-a7e7-a6be48af111e	2	mohammed altaf	r9544391	7854327	02061970	Male	B+	\N	9893989786	0547090786	132 laziz hotel walle 	burhanpur 	mp	405	1	Self		2026-03-14 14:03:40.764282	2026-03-14 14:03:40.764282	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N
3087311a-ff2a-4a00-97e9-35583dd579b4	a45b795c-eb4a-4332-a7e7-a6be48af111e	3	mohammed altaf	r9544391	7854327	02061970	Male	B+	\N	9893989786	0547090786	132 laziz hotel walle 	burhanpur 	mp	405	1	Self		2026-03-14 14:03:41.718728	2026-03-14 14:03:41.718728	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N
f2518cfc-ab34-474f-b763-d811ce1c54bd	a45b795c-eb4a-4332-a7e7-a6be48af111e	1	Ahmed Khan	Z1234567			Male	A+	/api/documents/files/pilgrim_1773517795603_d2jo3ine5rj_logo_al_burhan_website_.png	9876543210			Mumbai	Maharashtra	101	1	Wife	4569	2026-03-14 13:37:46.597266	2026-03-14 19:49:55.604	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N
\.


--
-- Data for Name: reminder_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.reminder_logs (id, booking_id, channel, status, sent_at, triggered_by, notes) FROM stdin;
73522cbe-5de9-4b1d-b193-96c9faadb77d	153744b7-c630-4a71-a254-a567b1407dab	whatsapp	failed	2026-05-02 04:30:00.548813	cron	WhatsApp delivery failed
6e045095-3ed1-48d0-a732-d6262b90c3bf	510b7dee-619a-4b69-9e1c-1bd70058f771	whatsapp	failed	2026-05-02 04:30:01.358906	cron	WhatsApp delivery failed
ee0b5504-ac00-4613-8582-05289298020b	f627345b-2527-4b40-be05-af47bf4a0f72	whatsapp	failed	2026-05-02 04:30:02.254907	cron	WhatsApp delivery failed
0db68d76-6090-4865-b1f3-b1e50a06c5e7	fcb968ef-5e83-432b-8aa3-a96d70131aea	whatsapp	failed	2026-05-02 04:30:03.063088	cron	WhatsApp delivery failed
bd07ccfb-877b-4da1-bd77-08585fa54dc8	abcd40e0-ceed-4b09-8ff3-65aad60dac4f	whatsapp	failed	2026-05-02 04:30:03.924544	cron	WhatsApp delivery failed
9c9aa2cc-4661-481a-9c35-2987ae020a5d	6cb986e6-96ce-4401-9ad2-1f33446af6d5	whatsapp	failed	2026-05-02 04:30:04.749107	cron	WhatsApp delivery failed
6f7c251b-6138-40ac-8102-fc01f361d643	11db9fe2-1e0e-418f-9e60-516498472371	whatsapp	failed	2026-05-02 04:30:05.562831	cron	WhatsApp delivery failed
804d14d7-9541-4885-9caa-1254d2110994	4f22c6c6-9e54-4fa8-821a-dada6ddd2e63	whatsapp	failed	2026-05-02 04:30:06.348177	cron	WhatsApp delivery failed
c3c2fba8-2253-43a0-9e76-45e819c978b1	153744b7-c630-4a71-a254-a567b1407dab	whatsapp	failed	2026-05-08 04:30:00.823269	cron	WhatsApp delivery failed
98156a4e-20ac-4cee-a222-1b679ca765c8	510b7dee-619a-4b69-9e1c-1bd70058f771	whatsapp	failed	2026-05-08 04:30:02.015937	cron	WhatsApp delivery failed
54ab552e-a36a-4222-a6f6-9abce88f3199	f627345b-2527-4b40-be05-af47bf4a0f72	whatsapp	failed	2026-05-08 04:30:03.02279	cron	WhatsApp delivery failed
10a61bc8-d935-444f-a1a8-a6b46d410cc6	fcb968ef-5e83-432b-8aa3-a96d70131aea	whatsapp	failed	2026-05-08 04:30:04.156544	cron	WhatsApp delivery failed
76fc6c65-27ea-49b9-8e0b-0175e5da7837	abcd40e0-ceed-4b09-8ff3-65aad60dac4f	whatsapp	failed	2026-05-08 04:30:05.339331	cron	WhatsApp delivery failed
9071258a-c74a-4ed8-8c44-8546ad5bc6a5	6cb986e6-96ce-4401-9ad2-1f33446af6d5	whatsapp	failed	2026-05-08 04:30:06.372965	cron	WhatsApp delivery failed
40b1a433-383d-43dd-9883-cde2b6335f8f	11db9fe2-1e0e-418f-9e60-516498472371	whatsapp	failed	2026-05-08 04:30:07.259678	cron	WhatsApp delivery failed
7dafcf60-fe85-4d85-9111-eb2f69dfe56b	4f22c6c6-9e54-4fa8-821a-dada6ddd2e63	whatsapp	failed	2026-05-08 04:30:08.109158	cron	WhatsApp delivery failed
\.


--
-- Data for Name: staff; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.staff (id, staff_id, company_id, full_name, designation, department, role, employee_code, mobile_india, blood_group, date_of_birth, address, emergency_contact, emergency_mobile, joining_date, valid_upto, photo_url, qr_token, status, notes, created_at, updated_at, group_id, father_name, aadhaar_last_4) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, name, mobile, email, role, created_at, updated_at) FROM stdin;
4d5cf829-11bc-49ea-9a97-3db28a087bdb	\N	9867114562	\N	customer	2026-03-14 11:27:24.667064	2026-03-14 11:27:24.667064
f008a06a-b1ba-452c-857e-aeacaecf6a73	\N	8828861122	\N	customer	2026-03-20 15:21:14.295934	2026-03-20 15:21:14.295934
2c7885ad-c6e3-4ca3-91c7-b36d71da90c8	\N	7987488550	\N	customer	2026-03-15 20:58:20.628621	2026-03-15 20:58:20.628621
9d5a12e3-44a3-4917-b58a-8f635a08040c	Admin	9999999999	admin@alburhantours.com	admin	2026-03-11 22:51:22.731147	2026-03-11 22:51:22.731147
0fe7c097-e26e-4d30-b538-13a6f719f2ad	mohammed altaf	9893989786	altaf@alburhantravels.com	admin	2026-03-11 23:45:10.915919	2026-03-17 17:43:31.789
0ea671c1-8b2a-483e-82b0-0b8bdeb7f625	\N	9893225590	\N	admin	2026-03-15 09:49:36.944729	2026-03-15 09:49:36.944729
7570e9bd-5671-4ef8-961f-95db5499c74a	\N	9930161806	\N	customer	2026-03-15 23:46:21.9638	2026-03-15 23:46:21.9638
\.


--
-- Name: delete_audit_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.delete_audit_log_id_seq', 1, false);


--
-- Name: attendance_events attendance_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_events
    ADD CONSTRAINT attendance_events_pkey PRIMARY KEY (id);


--
-- Name: attendance_logs attendance_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_logs
    ADD CONSTRAINT attendance_logs_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_booking_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_booking_number_unique UNIQUE (booking_number);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: broadcasts broadcasts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcasts
    ADD CONSTRAINT broadcasts_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: customer_notifications customer_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_notifications
    ADD CONSTRAINT customer_notifications_pkey PRIMARY KEY (id);


--
-- Name: customer_profiles customer_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_profiles
    ADD CONSTRAINT customer_profiles_pkey PRIMARY KEY (id);


--
-- Name: customer_profiles customer_profiles_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_profiles
    ADD CONSTRAINT customer_profiles_user_id_unique UNIQUE (user_id);


--
-- Name: delete_audit_log delete_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delete_audit_log
    ADD CONSTRAINT delete_audit_log_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: feedback feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);


--
-- Name: gallery_images gallery_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_images
    ADD CONSTRAINT gallery_images_pkey PRIMARY KEY (id);


--
-- Name: hajj_groups hajj_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hajj_groups
    ADD CONSTRAINT hajj_groups_pkey PRIMARY KEY (id);


--
-- Name: hajj_rooms hajj_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hajj_rooms
    ADD CONSTRAINT hajj_rooms_pkey PRIMARY KEY (id);


--
-- Name: inquiries inquiries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inquiries
    ADD CONSTRAINT inquiries_pkey PRIMARY KEY (id);


--
-- Name: otps otps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otps
    ADD CONSTRAINT otps_pkey PRIMARY KEY (id);


--
-- Name: package_media package_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_media
    ADD CONSTRAINT package_media_pkey PRIMARY KEY (id);


--
-- Name: package_requests package_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_requests
    ADD CONSTRAINT package_requests_pkey PRIMARY KEY (id);


--
-- Name: packages packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packages
    ADD CONSTRAINT packages_pkey PRIMARY KEY (id);


--
-- Name: payment_transactions payment_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_pkey PRIMARY KEY (id);


--
-- Name: pilgrims pilgrims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pilgrims
    ADD CONSTRAINT pilgrims_pkey PRIMARY KEY (id);


--
-- Name: reminder_logs reminder_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_logs
    ADD CONSTRAINT reminder_logs_pkey PRIMARY KEY (id);


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (id);


--
-- Name: staff staff_qr_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_qr_token_unique UNIQUE (qr_token);


--
-- Name: staff staff_staff_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_staff_id_unique UNIQUE (staff_id);


--
-- Name: users users_mobile_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_mobile_unique UNIQUE (mobile);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: customer_profiles customer_profiles_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_profiles
    ADD CONSTRAINT customer_profiles_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: package_requests package_requests_booking_id_bookings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_requests
    ADD CONSTRAINT package_requests_booking_id_bookings_id_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;


--
-- Name: package_requests package_requests_customer_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_requests
    ADD CONSTRAINT package_requests_customer_id_users_id_fk FOREIGN KEY (customer_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: package_requests package_requests_package_id_packages_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_requests
    ADD CONSTRAINT package_requests_package_id_packages_id_fk FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE SET NULL;


--
-- Name: payment_transactions payment_transactions_booking_id_bookings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_booking_id_bookings_id_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: reminder_logs reminder_logs_booking_id_bookings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_logs
    ADD CONSTRAINT reminder_logs_booking_id_bookings_id_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- PostgreSQL database dump complete
--

\unrestrict 15cHVsn3HNQhbmqfyXPwzBhBPwlBNwoVGKNwTyH8eZi0tPZI0Cqo3zfM1D9MUTC

