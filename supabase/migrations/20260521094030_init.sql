-- Create chats table
create table if not exists chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New Chat',
  model text not null default 'llama-3.3-70b-versatile',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create messages table
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references chats(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_chats_user_id on chats(user_id);
create index if not exists idx_chats_updated_at on chats(updated_at desc);
create index if not exists idx_messages_chat_id on messages(chat_id);
create index if not exists idx_messages_created_at on messages(created_at);

-- Enable RLS
alter table chats enable row level security;
alter table messages enable row level security;

-- RLS policies for chats
create policy "Users can view their own chats"
  on chats for select
  using (auth.uid() = user_id);

create policy "Users can create their own chats"
  on chats for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own chats"
  on chats for update
  using (auth.uid() = user_id);

create policy "Users can delete their own chats"
  on chats for delete
  using (auth.uid() = user_id);

-- RLS policies for messages
create policy "Users can view messages from their chats"
  on messages for select
  using (
    exists (
      select 1 from chats
      where chats.id = messages.chat_id
        and chats.user_id = auth.uid()
    )
  );

create policy "Users can insert messages to their chats"
  on messages for insert
  with check (
    exists (
      select 1 from chats
      where chats.id = messages.chat_id
        and chats.user_id = auth.uid()
    )
  );

create policy "Users can delete messages from their chats"
  on messages for delete
  using (
    exists (
      select 1 from chats
      where chats.id = messages.chat_id
        and chats.user_id = auth.uid()
    )
  );

-- Updated_at trigger
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at
  before update on chats
  for each row
  execute function update_updated_at_column();
