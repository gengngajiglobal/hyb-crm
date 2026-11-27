-- CRM HYB Fasa 3: App Laporan Guru, Pendaftaran Ibu Bapa, link guru dari CRM (27/11/2026)
-- Sama logik dengan apps-laporan-guru/Code.gs dan apps-pendaftaran/Code.gs.
-- Function guru_* dan daftar_* boleh dipanggil oleh anon (laman awam), tapi:
--   * guru_*: setiap panggilan semak kod link (hanya hash SHA-256 disimpan), pulangkan ID + nama pelajar sahaja.
--   * daftar_*: hanya maklumat awam tempat; daftar_hantar hanya INSERT, tak boleh baca pendaftaran lain.
--   * Had kekerapan dalam table had_cubaan.

-- ---------------------------------------------------------------- tetapan app awam
alter table tetapan add column if not exists daftar_sorok text[] not null default '{HYB-T01,HYB-T02,HYB-T05}';
alter table tetapan add column if not exists yuran_daftar numeric not null default 90;
alter table tetapan add column if not exists yuran_bulanan_daftar numeric not null default 60;
alter table tetapan add column if not exists wa_admin text not null default '60178846727';
alter table tetapan add column if not exists mula_laporan date not null default date '2026-11-01';
update tetapan set url_app_guru = 'https://gengngajiglobal.github.io/hyb-crm/guru.html' where id = 1 and url_app_guru = '';
update tetapan set url_app_daftar = 'https://gengngajiglobal.github.io/hyb-crm/daftar.html' where id = 1 and url_app_daftar = '';

-- ---------------------------------------------------------------- had kekerapan
create table if not exists had_cubaan (
  kunci  text primary key,
  mula   timestamptz not null default now(),
  bil    int not null default 0
);
alter table had_cubaan enable row level security;
alter table had_cubaan force row level security;
revoke all on had_cubaan from anon, authenticated;

-- Tambah satu cubaan; pulangkan true jika masih bawah had dalam tetingkap masa
create or replace function _had(k text, maks int, saat int) returns boolean
language plpgsql security definer set search_path = public as $$
declare b int;
begin
  insert into had_cubaan (kunci, mula, bil) values (k, now(), 1)
  on conflict (kunci) do update set
    bil = case when had_cubaan.mula < now() - make_interval(secs => saat) then 1 else had_cubaan.bil + 1 end,
    mula = case when had_cubaan.mula < now() - make_interval(secs => saat) then now() else had_cubaan.mula end
  returning bil into b;
  return b <= maks;
end $$;

create or replace function _hash(s text) returns text language sql immutable as $$
  select encode(sha256(convert_to(s, 'UTF8')), 'hex');
$$;

create or replace function _norm_nama(n text) returns text language sql immutable as $$
  select btrim(regexp_replace(regexp_replace(lower(coalesce(n, '')), '^\s*(ust\.?|ustaz|ustazah|ustzh\.?|cikgu|cg\.?)\s+', ''), '\s+', ' ', 'g'));
$$;

-- ---------------------------------------------------------------- link guru (CRM)
-- p = {id}
create or replace function jana_link_guru(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u akses_crm := _penulis(); gid text := p->>'id'; st text; kod text; url text;
begin
  select status into st from guru where id = gid for update;
  if not found then raise exception 'Guru % tidak dijumpai. Daftar guru dahulu.', gid; end if;
  if st not in ('Aktif','Latihan','Simpanan') then
    raise exception 'Link hanya untuk guru Aktif, Latihan atau Simpanan (status sekarang: %).', st;
  end if;
  update akses_guru set aktif = false where guru_id = gid and aktif;
  kod := replace(gen_random_uuid()::text, '-', '');
  insert into akses_guru (guru_id, hash_kod, dicipta, oleh, aktif) values (gid, _hash(kod), now(), _oleh(u), true);
  perform _log(u, 'Guru', gid, 'Link laporan guru dijana (link lama, jika ada, dibatalkan)');
  select url_app_guru into url from tetapan where id = 1;
  return jsonb_build_object('ok', true, 'id', gid, 'mesej', 'Link laporan untuk ' || gid || ' dijana', 'kod', kod,
    'link', case when coalesce(url, '') <> '' then url || '?k=' || kod else '' end);
end $$;

create or replace function batal_link_guru(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u akses_crm := _penulis(); gid text := p->>'id'; n int;
begin
  update akses_guru set aktif = false where guru_id = gid and aktif;
  get diagnostics n = row_count;
  if n > 0 then perform _log(u, 'Guru', gid, 'Link laporan guru dibatalkan'); end if;
  return jsonb_build_object('ok', true, 'id', gid, 'mesej', case when n > 0 then 'Link ' || gid || ' dibatalkan' else 'Tiada link aktif' end);
end $$;

-- ---------------------------------------------------------------- App Laporan Guru (anon)
-- Semak kod. Pulangkan guru, atau null + mesej ralat (tanpa raise, supaya kiraan cubaan gagal kekal).
create or replace function _guru_kod(k text, out g guru, out ralat text)
language plpgsql security definer set search_path = public as $$
declare kod text := lower(coalesce(k, '')); gid text;
begin
  if (select bil from had_cubaan where kunci = 'guru_gagal' and mula > now() - interval '15 minutes') >= 30 then
    ralat := 'Terlalu banyak cubaan. Cuba lagi dalam 15 minit.'; return;
  end if;
  if kod !~ '^[a-f0-9]{32}$' then
    ralat := 'Link tidak lengkap. Buka semula link penuh yang diberi oleh admin HYB.';
  else
    select guru_id into gid from akses_guru where hash_kod = _hash(kod) and aktif limit 1;
    if gid is null then ralat := 'Link tidak sah atau dah dibatalkan. Minta link baru daripada admin HYB.';
    else
      select * into g from guru where id = gid;
      if g.id is null then ralat := 'Rekod guru tidak dijumpai. Hubungi admin HYB.';
      elsif g.status not in ('Aktif','Latihan','Simpanan') then ralat := 'Akses laporan tidak aktif untuk akaun ini. Hubungi admin HYB.';
      end if;
    end if;
  end if;
  if ralat is not null then g := null; perform _had('guru_gagal', 1000000, 900); end if;
end $$;

create or replace function _guru_data(g guru) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  nama_g text := btrim(coalesce(nullif(g.gelaran, '') || ' ', '') || g.nama);
  hari text[] := array['Ahad','Isnin','Selasa','Rabu','Khamis','Jumaat','Sabtu'];
  mula date := (select mula_laporan from tetapan where id = 1);
  kini date := _hari_ini();
begin
  return (
    with aktif as (select tempat_id, count(*) n from pelajar where status = 'Aktif' group by tempat_id),
    saya as (
      select t.*, t.status in ('Kelas berjalan','Berisiko') jalan,
        array(select i - 1 from generate_subscripts(hari, 1) i where t.hari_masa ~* ('\m' || hari[i] || '\M')) hr
      from tempat t where t.status <> 'Tutup' and _norm_nama(t.guru) = _norm_nama(g.nama) and _norm_nama(g.nama) <> ''),
    belum as (
      select s.id tempat_id, d::date tarikh from saya s,
        generate_series(greatest(mula, coalesce(s.tarikh_mula, mula)), kini, interval '1 day') d
      where s.jalan and extract(dow from d)::int = any(s.hr)
        and not exists (select 1 from laporan_kelas l where l.tempat_id = s.id and l.tarikh = d::date)
      order by d desc limit 20),
    nama_guru as (
      select distinct on (_norm_nama(n)) btrim(n) n from (
        select coalesce(nullif(gelaran, '') || ' ', '') || nama n from guru where status in ('Aktif','Latihan','Simpanan')
        union all select guru from tempat) x
      where _norm_nama(n) <> '' order by _norm_nama(n), n)
    select jsonb_build_object(
      'guru', jsonb_build_object('nama', nama_g),
      'hariIni', _t(kini),
      'senaraiGuru', (select coalesce(jsonb_agg(n order by n), '[]'::jsonb) from nama_guru),
      'tempat', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'nama', t.nama, 'hariMasa', t.hari_masa, 'guru', t.guru,
                   'aktif', coalesce(a.n, 0), 'saya', t.id in (select id from saya))
                   order by (t.id in (select id from saya)) desc, t.nama), '[]'::jsonb)
                 from tempat t left join aktif a on a.tempat_id = t.id where t.status <> '' and t.status <> 'Tutup'),
      'belum', (select coalesce(jsonb_agg(jsonb_build_object('tempatId', tempat_id, 'tarikh', _t(tarikh)) order by tarikh desc), '[]'::jsonb) from belum),
      'laporan', (select coalesce(jsonb_agg(jsonb_build_object('tarikh', _t(l.tarikh), 'tempatId', l.tempat_id,
                    'hadir', coalesce(to_jsonb(l.hadir), '""'::jsonb), 'topik', l.topik, 'isu', l.isu) order by l.tarikh desc, l.id desc), '[]'::jsonb)
                  from (select * from laporan_kelas where tempat_id in (select id from saya) order by tarikh desc, id desc limit 10) l)
    ));
end $$;

create or replace function _guru_pelajar(tid text) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nama', nama) order by nama), '[]'::jsonb)
  from pelajar where tempat_id = tid and status = 'Aktif';
$$;

create or replace function guru_muat(k text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from _guru_kod(k);
  if r.ralat is not null then return jsonb_build_object('ralat', r.ralat); end if;
  return _guru_data(r.g);
end $$;

create or replace function guru_pelajar(k text, tempat text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from _guru_kod(k);
  if r.ralat is not null then return jsonb_build_object('ralat', r.ralat); end if;
  if not exists (select 1 from tempat t where t.id = guru_pelajar.tempat and t.status <> '' and t.status <> 'Tutup') then
    raise exception 'Tempat tidak sah.';
  end if;
  return _guru_pelajar(guru_pelajar.tempat);
end $$;

-- p = {tempatId, guru, tarikh, topik, isu, hadirId[], lihatId[], hadir}
create or replace function guru_hantar(k text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record; g guru; t tempat;
  pengisi text; oleh text; guru_ajar text := _teks(p->>'guru', 80);
  tk date; topik text := _teks(p->>'topik', 500); isu text := _teks(p->>'isu', 500);
  senarai text[]; hadir_id text[]; lihat text[]; hadir int; ganti text;
begin
  select * into r from _guru_kod(k);
  if r.ralat is not null then return jsonb_build_object('ralat', r.ralat); end if;
  g := r.g;
  pengisi := btrim(coalesce(nullif(g.gelaran, '') || ' ', '') || g.nama);
  oleh := 'App guru: ' || pengisi;
  select * into t from tempat where id = p->>'tempatId' and status <> '' and status <> 'Tutup';
  if t.id is null then raise exception 'Tempat tidak sah.'; end if;
  if guru_ajar = '' then raise exception 'Pilih nama guru yang mengajar.'; end if;
  if not exists (select 1 from (select coalesce(nullif(gelaran, '') || ' ', '') || nama n from guru where status in ('Aktif','Latihan','Simpanan')
                 union all select guru from tempat) x where btrim(n) = guru_ajar) then
    raise exception 'Nama guru tidak dalam senarai. Hubungi admin HYB.';
  end if;
  tk := _tarikh(p->>'tarikh');
  if tk is null then raise exception 'Tarikh kelas wajib diisi.'; end if;
  if tk > _hari_ini() then raise exception 'Tarikh kelas tidak boleh pada masa depan.'; end if;
  if tk < date '2026-01-01' then raise exception 'Tarikh kelas tidak sah.'; end if;
  if topik = '' then raise exception 'Aktiviti / topik wajib diisi.'; end if;

  perform pg_advisory_xact_lock(hashtext('hyb_laporan_guru'));
  select coalesce(array_agg(id), '{}') into senarai from pelajar where tempat_id = t.id and status = 'Aktif';
  select coalesce(array_agg(x), '{}') into hadir_id from jsonb_array_elements_text(coalesce(p->'hadirId', '[]'::jsonb)) x;
  if exists (select 1 from unnest(hadir_id) h where not h = any(senarai)) then
    raise exception 'Senarai pelajar dah berubah. Muat semula halaman.';
  end if;
  if jsonb_typeof(p->'lihatId') = 'array' then
    select coalesce(array_agg(x), '{}') into lihat from jsonb_array_elements_text(p->'lihatId') x;
    if exists (select 1 from unnest(senarai) s where not s = any(lihat)) then
      raise exception 'Senarai pelajar dah berubah (ada pelajar baru). Senarai dah dikemas kini, semak kehadiran dan tekan Hantar semula.';
    end if;
  end if;
  hadir := coalesce(array_length(hadir_id, 1), 0);
  if coalesce(array_length(senarai, 1), 0) = 0 then
    begin hadir := (p->>'hadir')::numeric; exception when others then hadir := -1; end;
    if hadir is null or hadir < 0 or hadir > 200 or (p->>'hadir')::numeric <> hadir then raise exception 'Bilangan hadir tidak sah.'; end if;
  end if;
  if exists (select 1 from laporan_kelas where tempat_id = t.id and tarikh = tk) then
    raise exception 'Laporan untuk % pada % dah dihantar.', t.nama, to_char(tk, 'DD/MM/YYYY');
  end if;

  insert into laporan_kelas (tarikh, tempat_id, guru, hadir, topik, isu, oleh) values (tk, t.id, guru_ajar, hadir, topik, isu, oleh);
  insert into kehadiran (tarikh, tempat_id, pelajar_id, nama_pelajar, status, guru, oleh)
    select tk, t.id, pl.id, left(pl.nama, 100), case when pl.id = any(hadir_id) then 'Hadir' else 'Tidak hadir' end, guru_ajar, oleh
    from pelajar pl where pl.id = any(senarai);
  ganti := case when _norm_nama(guru_ajar) <> _norm_nama(t.guru) then ' (guru ganti: ' || guru_ajar || ')' else '' end;
  insert into log (masa, jenis, ref, interaksi, oleh)
  values (now(), 'Guru', t.id, 'Laporan kelas ' || to_char(tk, 'DD/MM/YYYY') || ' melalui app guru: ' || hadir
    || case when array_length(senarai, 1) > 0 then '/' || array_length(senarai, 1) else '' end || ' hadir' || ganti
    || case when isu <> '' then '. Isu: ' || left(isu, 120) else '' end, pengisi);
  return jsonb_build_object('ok', true, 'mesej', 'Laporan ' || t.nama || ' ' || to_char(tk, 'DD/MM/YYYY') || ' diterima. Terima kasih.',
    'data', _guru_data(g));
end $$;

-- ---------------------------------------------------------------- Pendaftaran Ibu Bapa (anon)
create or replace function _tempat_awam() returns jsonb
language sql stable security definer set search_path = public as $$
  with tt as (select * from tetapan where id = 1),
  aktif as (select tempat_id, count(*) n from pelajar where status = 'Aktif' group by tempat_id)
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'nama', t.nama, 'kawasan', t.kawasan, 'hariMasa', t.hari_masa,
      'yuran', coalesce(nullif(tt.yuran_bulanan_daftar, 0), t.yuran, tt.yuran_standard),
      'recruitment', t.status = 'Recruitment',
      'penuh', coalesce(a.n, 0) >= tt.kapasiti,
      'hampir', coalesce(a.n, 0) >= tt.kapasiti - 3 and coalesce(a.n, 0) < tt.kapasiti)
    order by t.kawasan || t.nama), '[]'::jsonb)
  from tempat t cross join tt left join aktif a on a.tempat_id = t.id
  where t.nama <> '' and t.status in ('Kelas berjalan','Berisiko','Recruitment') and not t.id = any(tt.daftar_sorok);
$$;

create or replace function daftar_borang() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tempat', _tempat_awam(),
    'sumber', (select coalesce(jsonb_agg(nilai order by susunan, nilai), '[]'::jsonb) from senarai where jenis = 'sumber'),
    'yuranDaftar', tt.yuran_daftar, 'maksAnak', 5, 'waAdmin', tt.wa_admin, 'hariIni', _t(_hari_ini()))
  from tetapan tt where id = 1;
$$;

create or replace function _telefon(v text) returns text language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(v, ''), '\D', '', 'g');
begin
  if left(d, 2) = '60' then d := substr(d, 2); end if;
  if d !~ '^01\d{8,9}$' then return ''; end if;
  return left(d, 3) || '-' || substr(d, 4);
end $$;

create or replace function _norm_anak(s text) returns text language sql immutable as $$
  select btrim(regexp_replace(regexp_replace(lower(coalesce(s, '')), '\m(bin|binti|bt|b|bte)\M\.?', ' ', 'g'), '[^a-z0-9]+', ' ', 'g'));
$$;

-- p = {tempatId, ibuBapa, tel, emel, kawasan, sumber, mesej, gambar, pdpa, website, anak:[{nama, lahir, jantina, kesihatan}]}
create or replace function daftar_hantar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  tt tetapan; t jsonb; tid text := p->>'tempatId';
  ibu text := _teks(regexp_replace(p->>'ibuBapa', '[\x00-\x1f]', ' ', 'g'), 120);
  v_tel text := _telefon(p->>'tel');
  emel text := lower(_teks(p->>'emel', 120));
  kawasan text := _teks(p->>'kawasan', 120);
  sumber text := _teks(p->>'sumber', 60);
  mesej text := _teks(regexp_replace(p->>'mesej', '[\x00-\x1f]', ' ', 'g'), 500);
  gambar text := case p->>'gambar' when 'Ya' then 'Ya' when 'Tidak' then 'Tidak' else '' end;
  a jsonb; i int := 0; n int; lbl text; nm text; lahir date; um int; jt text;
  maxd int; maxk int; kumpulan text; rid text; ruj text[] := '{}'; nama_anak text[] := '{}'; sama text;
  kini date := _hari_ini();
begin
  if coalesce(p->>'website', '') <> '' then raise exception 'Pendaftaran tidak dapat diproses.'; end if;
  select * into tt from tetapan where id = 1;
  select x into t from jsonb_array_elements(_tempat_awam()) x where x->>'id' = tid;
  if t is null then raise exception 'Sila pilih kelas.'; end if;
  if length(ibu) < 3 then raise exception 'Nama ibu / bapa wajib diisi.'; end if;
  if v_tel = '' then raise exception 'No. telefon tidak sah. Contoh: 012-345 6789.'; end if;
  if emel <> '' and emel !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'Emel tidak sah.'; end if;
  if kawasan = '' then raise exception 'Kawasan tempat tinggal wajib diisi.'; end if;
  if gambar = '' then raise exception 'Sila pilih kebenaran gambar.'; end if;
  if p->'pdpa' is distinct from 'true'::jsonb then raise exception 'Sila baca dan bersetuju dengan notis perlindungan data peribadi.'; end if;
  n := coalesce(jsonb_array_length(case when jsonb_typeof(p->'anak') = 'array' then p->'anak' end), 0);
  if n = 0 then raise exception 'Sila isi maklumat sekurang-kurangnya seorang anak.'; end if;
  if n > 5 then raise exception 'Maksimum 5 anak dalam satu borang.'; end if;

  -- semak semua anak dahulu
  for a in select * from jsonb_array_elements(p->'anak') loop
    i := i + 1; lbl := case when n > 1 then ' (anak ' || i || ')' else '' end;
    nm := _teks(a->>'nama', 120);
    if length(nm) < 3 then raise exception 'Nama anak% wajib diisi.', lbl; end if;
    begin lahir := _tarikh(a->>'lahir'); exception when others then lahir := null; end;
    if lahir is null then raise exception 'Tarikh lahir% wajib diisi.', lbl; end if;
    um := extract(year from age(kini, lahir))::int;
    if um < 4 or um > 15 then raise exception 'Tarikh lahir% tidak sah (umur % tahun).', lbl, um; end if;
    if coalesce(a->>'jantina', '') not in ('Lelaki','Perempuan') then raise exception 'Jantina% wajib dipilih.', lbl; end if;
  end loop;

  perform pg_advisory_xact_lock(hashtext('hyb_pendaftaran'));
  if not _had('daftar_hantar', 40, 600) then raise exception 'Terlalu banyak pendaftaran serentak. Cuba lagi dalam 10 minit.'; end if;
  for a in select * from jsonb_array_elements(p->'anak') loop
    select id into sama from pendaftaran where status = 'Baru' and regexp_replace(pendaftaran.tel, '\D', '', 'g') = regexp_replace(v_tel, '\D', '', 'g')
      and _norm_anak(nama) = _norm_anak(a->>'nama') limit 1;
    if sama is not null then
      raise exception 'Pendaftaran % dah kami terima (rujukan %). Staf HYB akan hubungi tuan/puan.', _cap(a->>'nama'), sama;
    end if;
  end loop;

  select coalesce(max(substring(id from '^HYB-D(\d+)$')::int), 0), coalesce(max(substring(pendaftaran.kumpulan from '^K(\d+)$')::int), 0)
    into maxd, maxk from pendaftaran;
  kumpulan := 'K' || lpad((maxk + 1)::text, 4, '0');
  i := 0;
  for a in select * from jsonb_array_elements(p->'anak') loop
    i := i + 1;
    rid := 'HYB-D' || lpad((maxd + i)::text, 4, '0');
    lahir := _tarikh(a->>'lahir');
    insert into pendaftaran (id, dihantar, status, tempat_id, tempat_nama, nama, lahir, umur, jantina, ibu_bapa, tel, emel, kawasan,
                             kesihatan, sumber, mesej, gambar, pdpa, kumpulan)
    values (rid, now(), 'Baru', tid, t->>'nama', _teks(a->>'nama', 120), lahir, extract(year from age(kini, lahir))::int, a->>'jantina',
            ibu, v_tel, emel, kawasan, _teks(a->>'kesihatan', 300), sumber, mesej, gambar,
            'Ya, ' || to_char(now() at time zone 'Asia/Kuala_Lumpur', 'DD/MM/YYYY HH24:MI'), kumpulan);
    ruj := ruj || rid; nama_anak := nama_anak || _cap(a->>'nama');
  end loop;
  insert into log (masa, jenis, ref, interaksi, oleh, tindakan, tarikh_tindakan)
  values (now(), 'Ibu bapa', tid, 'Pendaftaran online: ' || n || ' anak (' || array_to_string(ruj, ', ') || ')'
    || case when sumber <> '' then '. Sumber: ' || sumber else '' end, 'Borang pendaftaran', 'Semak & sahkan dalam CRM', kini);

  return jsonb_build_object('ok', true, 'rujukan', to_jsonb(ruj), 'anak', to_jsonb(nama_anak),
    'tempat', jsonb_build_object('nama', t->>'nama', 'hariMasa', t->>'hariMasa', 'yuran', t->'yuran', 'recruitment', t->'recruitment'),
    'yuranDaftar', tt.yuran_daftar, 'waAdmin', tt.wa_admin);
end $$;

-- ---------------------------------------------------------------- hak akses
do $$
declare f record;
begin
  -- Semua function pembantu (nama bermula _) hanya untuk kegunaan dalaman
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and p.proname like '\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
  execute 'revoke all on function jana_link_guru(jsonb) from public, anon';
  execute 'revoke all on function batal_link_guru(jsonb) from public, anon';
  execute 'grant execute on function jana_link_guru(jsonb) to authenticated';
  execute 'grant execute on function batal_link_guru(jsonb) to authenticated';
  execute 'revoke all on function guru_muat(text) from public';
  execute 'revoke all on function guru_pelajar(text, text) from public';
  execute 'revoke all on function guru_hantar(text, jsonb) from public';
  execute 'revoke all on function daftar_borang() from public';
  execute 'revoke all on function daftar_hantar(jsonb) from public';
  execute 'grant execute on function guru_muat(text), guru_pelajar(text, text), guru_hantar(text, jsonb), daftar_borang(), daftar_hantar(jsonb) to anon, authenticated';
end $$;
