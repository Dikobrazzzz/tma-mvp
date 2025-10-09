DO $$
BEGIN
IF NOT EXISTS (
SELECT 1 FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE t.typname = 'win_status' AND n.nspname = 'public'
) THEN
CREATE TYPE win_status AS ENUM ('waiting','taken','expired');
END IF;
END $$;

create table if not exists users (
id bigserial primary key,
tg_id bigint unique not null,
lang text default 'en',
email text,
email_verified_at timestamptz,
created_at timestamptz not null default now(),
last_seen_at timestamptz,
gate_until timestamptz,
is_blocked boolean default false
);

create table if not exists otp (
id bigserial primary key,
user_id bigint not null references users(id) on delete cascade,
email text not null,
code_hash text not null,
sent_at timestamptz not null default now(),
expires_at timestamptz not null,
resend_after timestamptz not null,
attempts int not null default 0
);

create table if not exists winnings (
id bigserial primary key,
user_id bigint references users(id),
amount_cents int not null,
won_at timestamptz not null default now(),
status win_status not null default 'waiting'
);

create table if not exists claims (
id bigserial primary key,
winning_id bigint unique references winnings(id),
user_id bigint references users(id),
claimed_at timestamptz not null default now(),
tx_ref text
);

-- seed example winnings (for UI demo)
insert into users(tg_id) values (111111) on conflict do nothing;
insert into winnings(user_id, amount_cents, won_at, status)
select id, 120000, now(), 'waiting' from users where tg_id=111111;
