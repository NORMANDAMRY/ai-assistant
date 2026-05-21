-- Allow authenticated users to upload images
create policy "Users can upload images"
  on storage.objects for insert
  with check (
    bucket_id = 'chat-images'
    and auth.role() = 'authenticated'
  );

-- Allow users to delete their own images
create policy "Users can delete their own images"
  on storage.objects for delete
  using (
    bucket_id = 'chat-images'
    and auth.uid() = owner
  );

-- Allow public read access to images
create policy "Public can view images"
  on storage.objects for select
  using (bucket_id = 'chat-images');
