ALTER TABLE public.users
  ADD COLUMN avatar_key varchar(32),
  ADD COLUMN profile_photo_data text,
  ADD CONSTRAINT users_avatar_key_format CHECK (avatar_key IS NULL OR avatar_key ~ '^[a-z0-9-]{1,32}$'),
  ADD CONSTRAINT users_single_avatar_source CHECK (avatar_key IS NULL OR profile_photo_data IS NULL);
