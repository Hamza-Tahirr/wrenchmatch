-- migrate:foreign-keys-off
-- Pictures people add themselves (docs/MEDIA.md): a profile picture for any account
-- (users.avatar_file_id), a mechanic's work gallery (mechanic_gallery) and before/after
-- photos on a booking (booking_photos). Every one is an image that was decoded,
-- re-encoded and stripped of all metadata (EXIF/GPS/ICC) before it was stored.
--
-- files.purpose is guarded by CHECK constraints, which SQLite cannot alter, so the files
-- table is rebuilt with the documented 12-step procedure
-- (https://www.sqlite.org/lang_altertable.html#otheralter). The first line of this file makes
-- the migration runner (src/server/db/migrate.ts) switch foreign keys off around this
-- file's transaction - otherwise DROP TABLE files would cascade into request_media,
-- mechanic_documents and mechanic_profiles - and roll everything back unless
-- PRAGMA foreign_key_check is clean afterwards. No trigger or view refers to files, so only
-- its index has to be recreated.

-- ---------------------------------------------------------------------------------
-- files: same columns and constraints as 0001, plus three image purposes
-- ---------------------------------------------------------------------------------

CREATE TABLE files_new (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL
    CHECK (purpose IN ('request_photo', 'request_video', 'mechanic_profile_photo', 'mechanic_document',
                       'user_avatar', 'mechanic_gallery', 'booking_photo')),
  storage_key TEXT NOT NULL UNIQUE
    CHECK (length(storage_key) BETWEEN 5 AND 200
      AND storage_key NOT LIKE '%..%'
      AND storage_key NOT LIKE '/%'
      AND storage_key NOT LIKE '%\%'),
  mime_type TEXT NOT NULL
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp',
                         'video/mp4', 'video/quicktime', 'video/webm',
                         'application/pdf')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  metadata_stripped INTEGER NOT NULL DEFAULT 0 CHECK (metadata_stripped IN (0, 1)),
  original_name TEXT CHECK (original_name IS NULL OR length(original_name) <= 200),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (purpose IN ('request_photo', 'mechanic_profile_photo', 'user_avatar', 'mechanic_gallery', 'booking_photo')
       AND mime_type IN ('image/jpeg', 'image/png', 'image/webp'))
    OR (purpose = 'request_video'
       AND mime_type IN ('video/mp4', 'video/quicktime', 'video/webm'))
    OR (purpose = 'mechanic_document'
       AND mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf'))
  ),
  -- every stored image must have had its EXIF/GPS metadata removed
  CHECK (mime_type NOT LIKE 'image/%' OR metadata_stripped = 1)
) STRICT;

INSERT INTO files_new (id, owner_user_id, purpose, storage_key, mime_type, size_bytes, width, height,
                       sha256, metadata_stripped, original_name, created_at)
SELECT id, owner_user_id, purpose, storage_key, mime_type, size_bytes, width, height,
       sha256, metadata_stripped, original_name, created_at
FROM files;

DROP TABLE files;
ALTER TABLE files_new RENAME TO files;
CREATE INDEX files_owner_idx ON files(owner_user_id);

-- ---------------------------------------------------------------------------------
-- Profile pictures. One current picture per account; a replaced picture is deleted.
-- A customer's picture is shown to a mechanic only on a confirmed (or later) booking
-- with that customer (src/server/storage/file-access.ts).
-- ---------------------------------------------------------------------------------

ALTER TABLE users ADD COLUMN avatar_file_id TEXT REFERENCES files(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX users_avatar_file_idx ON users(avatar_file_id);

-- ---------------------------------------------------------------------------------
-- Mechanic work gallery: up to 12 photos per mechanic (enforced by the application),
-- shown to the same people who may see the mechanic's profile photo.
-- ---------------------------------------------------------------------------------

CREATE TABLE mechanic_gallery (
  id TEXT PRIMARY KEY,
  mechanic_id TEXT NOT NULL REFERENCES mechanic_profiles(user_id) ON DELETE CASCADE,
  file_id TEXT NOT NULL UNIQUE REFERENCES files(id) ON DELETE CASCADE,
  caption TEXT CHECK (caption IS NULL OR length(trim(caption)) BETWEEN 1 AND 140),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 1000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX mechanic_gallery_mechanic_idx ON mechanic_gallery(mechanic_id, sort_order);

-- A gallery photo never moves to another mechanic or file (captions and order may change).
CREATE TRIGGER mechanic_gallery_links_are_immutable
BEFORE UPDATE OF mechanic_id, file_id ON mechanic_gallery
WHEN NEW.mechanic_id IS NOT OLD.mechanic_id OR NEW.file_id IS NOT OLD.file_id
BEGIN
  SELECT RAISE(ABORT, 'mechanic_gallery_immutable');
END;

-- ---------------------------------------------------------------------------------
-- Booking photos: before/after/other pictures added by the booking's customer or
-- mechanic. Only bookings that were confirmed (confirmed, in progress, completed or
-- disputed) take photos; pending-payment and cancelled bookings keep a closed set.
-- ---------------------------------------------------------------------------------

CREATE TABLE booking_photos (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL UNIQUE REFERENCES files(id) ON DELETE CASCADE,
  uploaded_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('before', 'after', 'other')),
  caption TEXT CHECK (caption IS NULL OR length(trim(caption)) BETWEEN 1 AND 140),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX booking_photos_booking_idx ON booking_photos(booking_id, phase, created_at);

-- The booking must be confirmed or later, the uploader must be its customer or mechanic,
-- and the file must be that uploader's own booking photo.
CREATE TRIGGER booking_photos_require_confirmed_booking
BEFORE INSERT ON booking_photos
WHEN NOT EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.id = NEW.booking_id
      AND b.status IN ('confirmed', 'in_progress', 'completed', 'disputed')
      AND NEW.uploaded_by IN (b.customer_id, b.mechanic_id)
  )
  OR NOT EXISTS (
    SELECT 1 FROM files f
    WHERE f.id = NEW.file_id AND f.purpose = 'booking_photo' AND f.owner_user_id = NEW.uploaded_by
  )
BEGIN
  SELECT RAISE(ABORT, 'booking_photos_immutable');
END;

-- A booking photo never moves to another booking, file or uploader (the caption may change).
CREATE TRIGGER booking_photos_links_are_immutable
BEFORE UPDATE OF booking_id, file_id, uploaded_by ON booking_photos
WHEN NEW.booking_id IS NOT OLD.booking_id
  OR NEW.file_id IS NOT OLD.file_id
  OR NEW.uploaded_by IS NOT OLD.uploaded_by
BEGIN
  SELECT RAISE(ABORT, 'booking_photos_immutable');
END;
