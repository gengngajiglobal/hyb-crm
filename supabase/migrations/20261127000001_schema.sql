-- CRM HYB: schema asas (Fasa 1, 27/11/2026)
-- Prinsip keselamatan:
--   * RLS dihidupkan pada SEMUA table tanpa policy => anon & authenticated TAK boleh baca/tulis table terus.
--   * Semua bacaan melalui function crm_data() dan semua tulisan melalui function RPC
--     yang semak peranan pengguna dalam akses_crm (security definer).
--   * ID kekal format Sheet (HYB-T01, HYB-P001, HYB-G01, HYB-S01) supaya sama dengan rekod lama.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- akses
create table akses_crm (
  emel      text primary key check (emel = lower(emel) and position('@' in emel) > 1),
  nama      text not null default '',
  peranan   text not null check (peranan in ('Manager','Ketua','Staf','Lihat')),
  aktif     boolean not null default true,
  catatan   text not null default ''
);

-- ---------------------------------------------------------------- tetapan
create table tetapan (
  id              int primary key default 1 check (id = 1),
  yuran_standard  numeric not null default 60,
  guru            numeric not null default 300,
  masjid          numeric not null default 250,
  kapasiti        numeric not null default 25,
  min_buka        numeric not null default 10,
  sasaran         numeric not null default 20,
  target          numeric not null default 30000,
  yuran_awal      numeric not null default 50,
  bulan_dipantau  text not null default ''
);

-- Senarai dropdown (Status tempat, Status pelajar, Status yuran, Sumber pelajar, Owner, Jenis log)
create table senarai (
  jenis    text not null check (jenis in ('statusTempat','statusPelajar','statusYuran','sumber','owner','jenisLog')),
  nilai    text not null,
  susunan  int  not null default 0,
  primary key (jenis, nilai)
);

-- Bulan yuran (ganti lajur "Yuran Nov 2026" dsb dalam tab Pelajar)
create table bulan_yuran (
  nama     text primary key check (nama ~ '^Yuran \S+ \d{4}$'),
  susunan  int not null
);

-- ---------------------------------------------------------------- tempat & pelajar
create table tempat (
  id               text primary key check (id ~ '^HYB-T\d+$'),
  nama             text not null,
  kawasan          text not null default '',
  pic              text not null default '',
  tel_pic          text not null default '',
  guru             text not null default '',
  tel_guru         text not null default '',
  hari_masa        text not null default '',
  tarikh_mula      date,
  status           text not null default '',
  owner            text not null default '',
  tindakan         text not null default '',
  tarikh_tindakan  date,
  catatan          text not null default '',
  yuran            numeric,
  kos_khas         numeric,             -- lajur X: kosong = guru + masjid dari Tetapan
  susunan          int not null default 0,
  dikemas          timestamptz not null default now()
);

create table pelajar (
  id               text primary key check (id ~ '^HYB-P\d+$'),
  nama             text not null,
  umur             int check (umur between 3 and 18),
  ibu_bapa         text not null default '',
  tel              text not null default '',
  tempat_id        text,               -- tiada FK: sama macam Sheet, ID salah dipapar "ID tempat tak wujud"
  tarikh_daftar    date,
  sumber           text not null default '',
  status           text not null default '',
  tarikh_berhenti  date,
  sebab_berhenti   text not null default '',
  catatan          text not null default '',
  susunan          int not null default 0,
  dikemas          timestamptz not null default now()
);
create index on pelajar (tempat_id);

create table yuran (
  pelajar_id  text not null references pelajar(id) on delete cascade,
  bulan       text not null references bulan_yuran(nama),
  status      text not null default '',
  dikemas     timestamptz not null default now(),
  primary key (pelajar_id, bulan)
);

-- Lejar bayaran (yuran bulanan, yuran pendaftaran, tajaan). Amaun negatif = batal.
create table rekod_bayaran (
  id          bigint generated always as identity primary key,
  masa        timestamptz not null,
  ref_id      text not null,          -- ID pelajar atau ID penaja
  tempat_id   text not null default '',
  bulan       text not null,          -- 'Yuran Nov 2026' atau 'Yuran pendaftaran'
  status      text not null default '',
  amaun       numeric not null default 0,
  oleh        text not null default '',
  sumber      text not null default ''
);
create index on rekod_bayaran (ref_id, bulan);
create index on rekod_bayaran (masa);

-- ---------------------------------------------------------------- kelas
create table laporan_kelas (
  id         bigint generated always as identity primary key,
  tarikh     date not null,
  tempat_id  text not null,
  guru       text not null default '',
  hadir      int,
  topik      text not null default '',
  isu        text not null default '',
  oleh       text not null default '',
  dicipta    timestamptz not null default now()
);
create index on laporan_kelas (tarikh);

create table kehadiran (
  id            bigint generated always as identity primary key,
  tarikh        date not null,
  tempat_id     text not null,
  pelajar_id    text not null,
  nama_pelajar  text not null default '',
  status        text not null default '',
  guru          text not null default '',
  oleh          text not null default ''
);
create index on kehadiran (tarikh);

create table log (
  id               bigint generated always as identity primary key,
  masa             timestamptz not null default now(),
  jenis            text not null default '',
  ref              text not null default '',
  interaksi        text not null default '',
  oleh             text not null default '',
  tindakan         text not null default '',
  tarikh_tindakan  date
);
create index on log (masa);

-- ---------------------------------------------------------------- guru
create table guru (
  id               text primary key check (id ~ '^HYB-G\d+$'),
  nama             text not null,
  tel              text not null default '',
  emel             text not null default '',
  gelaran          text not null default '',
  kawasan          text not null default '',
  status           text not null default 'Calon'
                   check (status in ('Calon','Temuduga','Latihan','Aktif','Simpanan','Tidak diteruskan')),
  sumber           text not null default '',
  tarikh_mohon     date,
  tarikh_temuduga  date,
  tarikh_mula      date,
  kelayakan        text not null default '',
  catatan          text not null default ''
);

-- Link laporan guru: hanya hash SHA-256 kod disimpan
create table akses_guru (
  id        bigint generated always as identity primary key,
  guru_id   text not null references guru(id),
  hash_kod  text not null,
  dicipta   timestamptz not null default now(),
  oleh      text not null default '',
  aktif     boolean not null default true
);
create index on akses_guru (hash_kod) where aktif;

-- ---------------------------------------------------------------- peta, pendaftaran
create table lokasi (
  tempat_id  text primary key,
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  sumber     text not null default '',
  dikemas    timestamptz not null default now(),
  oleh       text not null default ''
);

create table pendaftaran (
  id          text primary key,
  dihantar    timestamptz not null default now(),
  status      text not null default 'Baru' check (status in ('Baru','Disahkan','Ditolak','Pendua')),
  tempat_id   text not null default '',
  tempat_nama text not null default '',
  nama        text not null,
  lahir       date,
  umur        int,
  jantina     text not null default '',
  ibu_bapa    text not null default '',
  tel         text not null default '',
  emel        text not null default '',
  kawasan     text not null default '',
  kesihatan   text not null default '',
  sumber      text not null default '',
  mesej       text not null default '',
  gambar      text not null default '',
  pdpa        text not null default '',
  kumpulan    text not null default '',
  pelajar_id  text not null default '',
  oleh        text not null default '',
  diproses    timestamptz,
  catatan     text not null default ''
);

-- ---------------------------------------------------------------- tajaan & bayaran masjid
create table penaja (
  id         text primary key check (id ~ '^HYB-S\d+$'),
  nama       text not null,
  tempat_id  text not null,
  jenis      text not null default 'Tetap' check (jenis in ('Tetap','Ikut pelajar')),
  amaun      numeric not null default 0,
  aktif      boolean not null default true,
  catatan    text not null default ''
);

create table sewa_masjid (
  tempat_id  text primary key,
  penerima   text not null default '',
  amaun      numeric not null default 0,
  aktif      boolean not null default true,
  cara       text not null default '',
  catatan    text not null default ''
);

create table rekod_bayaran_masjid (
  id         bigint generated always as identity primary key,
  masa       timestamptz not null default now(),
  tempat_id  text not null,
  bulan      text not null,
  status     text not null check (status in ('Dibayar','Waive','Dibatalkan')),
  amaun      numeric not null default 0,
  resit      text not null default '',
  cara       text not null default '',
  rujukan    text not null default '',
  oleh       text not null default '',
  catatan    text not null default ''
);

-- ---------------------------------------------------------------- RLS: tutup semua akses terus
do $$
declare t text;
begin
  foreach t in array array['akses_crm','tetapan','senarai','bulan_yuran','tempat','pelajar','yuran',
    'rekod_bayaran','laporan_kelas','kehadiran','log','guru','akses_guru','lokasi','pendaftaran',
    'penaja','sewa_masjid','rekod_bayaran_masjid']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- pengguna semasa
-- Pulangkan peranan pengguna yang login (null = tiada akses). Emel diambil dari token Supabase Auth.
create or replace function pengguna_semasa()
returns akses_crm
language sql stable security definer set search_path = public
as $$
  select a.* from akses_crm a
  where a.aktif
    and a.emel = lower(coalesce(auth.jwt() ->> 'email', ''))
    and coalesce((auth.jwt() -> 'user_metadata' ->> 'email_verified')::boolean, true)
  limit 1;
$$;
revoke all on function pengguna_semasa() from public, anon;
grant execute on function pengguna_semasa() to authenticated;

-- Isi awal
insert into tetapan (id) values (1);
insert into akses_crm (emel, nama, peranan) values ('muhdkhalaf@gengngajiglobal.com', 'Manager', 'Manager');
