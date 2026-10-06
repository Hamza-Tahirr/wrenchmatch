// generated - do not edit; run npm run db:types

import type { Generated } from "kysely";

export interface AuditEvents {
  id: string;
  actor_user_id: string | null;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  metadata_json: Generated<string>;
  created_at: Generated<string>;
}

export interface BookingPhotos {
  id: string;
  booking_id: string;
  file_id: string;
  uploaded_by: string;
  phase: string;
  caption: string | null;
  created_at: Generated<string>;
}

export interface Bookings {
  id: string;
  request_id: string;
  quote_id: string;
  customer_id: string;
  mechanic_id: string;
  status: Generated<string>;
  payment_state: Generated<string>;
  payout_status: Generated<string>;
  service_mode: string;
  slot_start_at: string;
  slot_end_at: string;
  currency: string;
  labor_cents: number;
  parts_cents: number;
  tax_cents: number;
  fee_cents: number;
  total_cents: number;
  platform_fee_bps: number;
  platform_fee_cents: number;
  mechanic_payout_cents: number;
  quote_snapshot_json: string;
  consent_snapshot_json: string;
  is_demo_fixture: Generated<number>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
  confirmed_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
}

export interface ChangeOrders {
  id: string;
  booking_id: string;
  proposed_by: string;
  description: string;
  reason: string;
  currency: Generated<string>;
  labor_cents: Generated<number>;
  parts_cents: Generated<number>;
  tax_cents: Generated<number>;
  amount_cents: number;
  status: Generated<string>;
  payment_state: Generated<string>;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  is_demo_fixture: Generated<number>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface EmailOutbox {
  id: string;
  to_user_id: string | null;
  to_email: string;
  subject: string;
  body_text: string;
  template: string;
  delivery: Generated<string>;
  created_at: Generated<string>;
}

export interface Files {
  id: string;
  owner_user_id: string;
  purpose: string;
  storage_key: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  sha256: string;
  metadata_stripped: Generated<number>;
  original_name: string | null;
  created_at: Generated<string>;
}

export interface Invoices {
  id: string;
  booking_id: string;
  invoice_number: string;
  currency: string;
  line_items_json: string;
  labor_cents: number;
  parts_cents: number;
  tax_cents: number;
  fee_cents: number;
  total_cents: number;
  platform_fee_bps: number;
  platform_fee_cents: number;
  mechanic_payout_cents: number;
  approved_change_order_count: Generated<number>;
  notes: string | null;
  issued_by: string;
  issued_at: string;
  is_demo_fixture: Generated<number>;
}

export interface JobMatches {
  id: string;
  request_id: string;
  mechanic_id: string;
  distance_miles: number;
  rank: number;
  status: Generated<string>;
  notified_at: string;
  updated_at: Generated<string>;
}

export interface MatchEvaluations {
  request_id: string;
  mechanic_id: string;
  eligible: number;
  notified: Generated<number>;
  distance_miles: number | null;
  reasons_json: string;
  evaluated_at: string;
}

export interface MechanicAvailability {
  id: string;
  mechanic_id: string;
  weekday: number;
  start_minute: number;
  end_minute: number;
}

export interface MechanicDocuments {
  id: string;
  mechanic_id: string;
  file_id: string;
  kind: string;
  status: Generated<string>;
  expires_on: string | null;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: Generated<string>;
}

export interface MechanicGallery {
  id: string;
  mechanic_id: string;
  file_id: string;
  caption: string | null;
  sort_order: Generated<number>;
  created_at: Generated<string>;
}

export interface MechanicMakes {
  mechanic_id: string;
  make: string;
}

export interface MechanicPrivate {
  user_id: string;
  legal_name: string;
  business_name: string | null;
  phone: string;
  contact_email: string;
  garage_address_line1: string | null;
  garage_city: string | null;
  garage_state: string | null;
  garage_zip: string | null;
  insurance_policy_number: string | null;
  updated_at: Generated<string>;
}

export interface MechanicProfiles {
  user_id: string;
  display_name: string;
  bio: string | null;
  years_experience: number;
  certifications: string | null;
  service_mode: string;
  travel_radius_miles: number;
  base_zip: string;
  base_lat: number;
  base_lng: number;
  services_all_makes: Generated<number>;
  insurance_provider: string | null;
  insurance_expires_on: string | null;
  accepting_jobs: Generated<number>;
  profile_photo_file_id: string | null;
  status: Generated<string>;
  status_reason: string | null;
  status_changed_at: string | null;
  status_changed_by: string | null;
  approved_at: string | null;
  submitted_at: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface MechanicServices {
  mechanic_id: string;
  category_id: string;
  safety_approved: Generated<number>;
  safety_approved_by: string | null;
  safety_approved_at: string | null;
}

export interface Notifications {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  link_path: string | null;
  read_at: string | null;
  created_at: Generated<string>;
}

export interface PilotZips {
  zip: string;
  enabled: Generated<number>;
  metro_label: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface QuoteItems {
  id: string;
  quote_id: string;
  kind: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
  sort_order: Generated<number>;
}

export interface Quotes {
  id: string;
  request_id: string;
  mechanic_id: string;
  status: Generated<string>;
  service_mode: string;
  parts_included: number;
  currency: Generated<string>;
  labor_cents: number;
  parts_cents: number;
  tax_cents: number;
  fee_cents: number;
  total_cents: number;
  slot_start_at: string;
  slot_end_at: string;
  estimated_duration_minutes: number;
  scope: string;
  exclusions: string | null;
  notes: string | null;
  expires_at: string;
  withdrawn_at: string | null;
  is_demo_fixture: Generated<number>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface RateLimits {
  bucket_key: string;
  window_started_at: string;
  attempt_count: Generated<number>;
}

export interface RepairRequests {
  id: string;
  customer_id: string;
  status: Generated<string>;
  zip: string;
  approx_lat: number;
  approx_lng: number;
  area_label: string;
  time_zone: string;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  mileage: number;
  category_id: string;
  description: string;
  drivable: number;
  preferred_date: string;
  preferred_window: string;
  service_mode: string;
  max_garage_distance_miles: Generated<number>;
  matched_count: Generated<number>;
  submitted_at: string | null;
  expires_at: string | null;
  is_demo_fixture: Generated<number>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface RequestMedia {
  file_id: string;
  request_id: string;
  kind: string;
  shareable_before_booking: number;
  created_at: Generated<string>;
}

export interface RequestPrivate {
  request_id: string;
  contact_email: string;
  contact_phone: string;
  street_address: string | null;
  address_city: string | null;
  address_state: string | null;
  location_notes: string | null;
  consent_snapshot_json: string;
}

export interface Reviews {
  id: string;
  booking_id: string;
  customer_id: string;
  mechanic_id: string;
  rating: number;
  comment: string | null;
  is_demo_fixture: Generated<number>;
  created_at: Generated<string>;
}

export interface ServiceCategories {
  id: string;
  name: string;
  short_description: string;
  customer_notice: string | null;
  safety_sensitive: Generated<number>;
  enabled: Generated<number>;
  sort_order: number;
  updated_at: Generated<string>;
}

export interface Sessions {
  id: string;
  user_id: string;
  created_at: Generated<string>;
  expires_at: string;
  last_seen_at: Generated<string>;
}

export interface SupportRequests {
  id: string;
  user_id: string;
  role: string;
  request_id: string | null;
  booking_id: string | null;
  topic: string;
  message: string;
  status: Generated<string>;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: Generated<string>;
}

export interface Users {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  display_name: string;
  email_verified_at: string | null;
  is_demo_account: Generated<number>;
  disabled_at: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
  avatar_file_id: string | null;
}

export interface ZipCentroids {
  zip: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  time_zone: string;
  source: string;
}

export interface DB {
  audit_events: AuditEvents;
  booking_photos: BookingPhotos;
  bookings: Bookings;
  change_orders: ChangeOrders;
  email_outbox: EmailOutbox;
  files: Files;
  invoices: Invoices;
  job_matches: JobMatches;
  match_evaluations: MatchEvaluations;
  mechanic_availability: MechanicAvailability;
  mechanic_documents: MechanicDocuments;
  mechanic_gallery: MechanicGallery;
  mechanic_makes: MechanicMakes;
  mechanic_private: MechanicPrivate;
  mechanic_profiles: MechanicProfiles;
  mechanic_services: MechanicServices;
  notifications: Notifications;
  pilot_zips: PilotZips;
  quote_items: QuoteItems;
  quotes: Quotes;
  rate_limits: RateLimits;
  repair_requests: RepairRequests;
  request_media: RequestMedia;
  request_private: RequestPrivate;
  reviews: Reviews;
  service_categories: ServiceCategories;
  sessions: Sessions;
  support_requests: SupportRequests;
  users: Users;
  zip_centroids: ZipCentroids;
}
