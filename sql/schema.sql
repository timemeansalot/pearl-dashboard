create table if not exists machines (
  machine_name text primary key,
  worker_name text not null,
  status text not null default 'online',
  last_seen_at timestamptz not null,
  miner_running boolean not null,
  tunnel_running boolean not null,
  gpu_mode text,
  raw_payload jsonb not null
);

create table if not exists gpu_samples (
  id bigserial primary key,
  machine_name text not null references machines(machine_name) on delete cascade,
  gpu_index integer not null,
  gpu_name text not null,
  sampled_at timestamptz not null,
  temperature_c double precision not null,
  utilization_pct double precision not null,
  power_w double precision not null,
  memory_used_mib double precision not null,
  memory_total_mib double precision not null
);

create index if not exists gpu_samples_machine_time_idx
  on gpu_samples(machine_name, sampled_at desc);

create table if not exists pearl_account_snapshots (
  id bigserial primary key,
  sampled_at timestamptz not null,
  wallet_address text not null,
  worker_count integer not null,
  reported_gpus integer not null,
  reported_hashrate double precision not null,
  pending_amount text not null,
  credited_amount text not null,
  payout_amount text not null,
  onchain_balance text,
  raw_payload jsonb not null
);

create index if not exists pearl_account_snapshots_sampled_idx
  on pearl_account_snapshots(sampled_at desc);
