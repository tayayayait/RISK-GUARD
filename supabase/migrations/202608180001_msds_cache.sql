-- 202608180001_msds_cache.sql
-- M1 화학물질 MSDS 및 GHS 데이터 캐시 스키마

-- 1. 물질 마스터 (getChemList 결과)
create table if not exists public.chem_substance (
  chem_id        text primary key,          -- "001032" 선행 0 보존 -> text
  chem_name_kor  text not null,
  cas_no         text,
  un_no          text,
  ke_no          text,
  en_no          text,
  last_date      text,                      -- 공단 최종 갱신일 (형식 "2025-08-08")
  fetched_at     timestamptz not null default now()
);

create index if not exists chem_substance_cas_idx  on public.chem_substance (cas_no);
create index if not exists chem_substance_name_idx on public.chem_substance
  using gin (to_tsvector('simple', chem_name_kor));

-- 2. 섹션 원문 (getChemDetailNN 결과, 트리 복원 가능한 원본 JSONB)
create table if not exists public.chem_section (
  chem_id     text not null references public.chem_substance(chem_id) on delete cascade,
  section_no  smallint not null check (section_no between 1 and 16),
  payload     jsonb not null,               -- item[] 원본
  fetched_at  timestamptz not null default now(),
  primary key (chem_id, section_no)
);

-- 3. GHS 교차검증 기준값
create table if not exists public.chem_ghs (
  cas_no       text primary key,
  sbstn_id     text,
  signal_word  text,
  pictogram_cd text[],                      -- 캐럿 분해 후 문자열 배열
  un_no        text,
  hazard_list  jsonb,                       -- hrmflnList 원본
  fetched_at   timestamptz not null default now()
);

-- 4. 스캔 이력 (감사 추적 / 정확도 개선용)
create table if not exists public.scan_history (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  doc_type      text,
  chem_id       text,
  locale        text,
  resolved_by   text,                       -- cas | name_ko | name_en_bridge | pubchem | unresolved
  extraction    jsonb,                      -- VLM 추출 결과
  discrepancies jsonb,                      -- 교차검증 불일치
  created_at    timestamptz not null default now()
);

-- RLS 활성화
alter table public.chem_substance enable row level security;
alter table public.chem_section   enable row level security;
alter table public.chem_ghs       enable row level security;
alter table public.scan_history   enable row level security;

-- 공개 데이터: 인증된 사용자는 읽기 허용, 쓰기는 service_role 전용
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'chem_substance_read') then
    create policy chem_substance_read on public.chem_substance for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where policyname = 'chem_section_read') then
    create policy chem_section_read   on public.chem_section   for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where policyname = 'chem_ghs_read') then
    create policy chem_ghs_read       on public.chem_ghs       for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where policyname = 'scan_history_own') then
    create policy scan_history_own on public.scan_history
      for select to authenticated using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where policyname = 'scan_history_insert') then
    create policy scan_history_insert on public.scan_history
      for insert to authenticated with check (auth.uid() = user_id);
  end if;
end
$$;
