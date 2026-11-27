-- CRM HYB Fasa 2b: tulis Pelajar, Tempat/Pipeline, Laporan kelas, Log (27/11/2026)
-- Sama logik dengan Code.gs: simpanTempat, tukarStatusTempat, simpanPelajar, simpanLaporan, tambahLog.

-- ---------------------------------------------------------------- pembantu
create or replace function _teks(v text, maks int) returns text language sql immutable as $$
  select left(btrim(coalesce(v, '')), maks);
$$;

-- Telefon: hanya digit, +, -, ruang (sama macam tel_)
create or replace function _tel(v text) returns text language sql immutable as $$
  select left(btrim(regexp_replace(coalesce(v, ''), '[^0-9+\- ]', '', 'g')), 20);
$$;

-- Nilai mesti ada dalam senarai Tetapan (wajib = tak boleh kosong)
create or replace function _pilih(v text, jns text, label text, wajib boolean default true) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(v, '') = '' then
    if wajib then raise exception '% wajib dipilih.', label; end if;
    return '';
  end if;
  if not exists (select 1 from senarai where jenis = jns and nilai = v) then
    raise exception '% "%" tiada dalam senarai Tetapan.', label, v;
  end if;
  return v;
end $$;

-- ID baru: awalan + (nombor terbesar + 1), diisi sifar ikut digit
create or replace function _id_baru(tbl text, awalan text, digit int) returns text
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  execute format('select coalesce(max(substring(id from %L)::int), 0) from %I where id ~ %L',
                 '^' || awalan || '(\d+)$', tbl, '^' || awalan || '\d+$') into n;
  return awalan || lpad((n + 1)::text, digit, '0');
end $$;

-- Selaraskan lejar bila status yuran satu pelajar|bulan berubah (sama macam selarasBayaran_)
create or replace function _selaras_lejar(u akses_crm, pid text, tid text, bln text, ke text) returns void
language plpgsql security definer set search_path = public as $$
declare net int; akhir numeric;
begin
  perform _kunci_lejar();
  select coalesce(sum(sign(amaun)), 0) into net from rekod_bayaran where ref_id = pid and bulan = bln;
  if ke = 'Dibayar' and net <= 0 then
    insert into rekod_bayaran (masa, ref_id, tempat_id, bulan, status, amaun, oleh, sumber)
    values (now(), pid, coalesce(tid, ''), bln, 'Dibayar', _yuran_tempat(tid), _oleh(u), 'CRM');
  elsif ke <> 'Dibayar' and net > 0 then
    select amaun into akhir from rekod_bayaran where ref_id = pid and bulan = bln and amaun > 0 order by masa desc, id desc limit 1;
    insert into rekod_bayaran (masa, ref_id, tempat_id, bulan, status, amaun, oleh, sumber)
    values (now(), pid, coalesce(tid, ''), bln, coalesce(nullif(ke, ''), '(kosong)'), -coalesce(akhir, _yuran_tempat(tid), 0), _oleh(u), 'CRM');
  end if;
end $$;

-- ---------------------------------------------------------------- Tempat
-- p = {id?, nama, kawasan, pic, telPic, guru, telGuru, hariMasa, tarikhMula, status, owner,
--      tindakan, tarikhTindakan, catatan, yuran, kosKhas}
create or replace function simpan_tempat(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u akses_crm := _penulis();
  nm text := _teks(p->>'nama', 120);
  st text; yr numeric; kk numeric; tid text := nullif(p->>'id', ''); lama text;
begin
  if nm = '' then raise exception 'Nama masjid / surau wajib diisi.'; end if;
  st := _pilih(p->>'status', 'statusTempat', 'Status tempat');
  yr := _nombor(p->'yuran');
  if yr is null or not (yr > 0 and yr < 1000) then raise exception 'Yuran bulanan tidak sah.'; end if;
  kk := _nombor(p->'kosKhas');
  if kk is not null and not (kk >= 0 and kk < 100000) then raise exception 'Kos tetap khas tidak sah.'; end if;

  if tid is not null then
    select status into lama from tempat where id = tid for update;
    if not found then raise exception 'ID % tidak dijumpai. Mungkin dah dipadam.', tid; end if;
    update tempat set nama = nm, kawasan = _teks(p->>'kawasan', 80), pic = _teks(p->>'pic', 80), tel_pic = _tel(p->>'telPic'),
      guru = _teks(p->>'guru', 80), tel_guru = _tel(p->>'telGuru'), hari_masa = _teks(p->>'hariMasa', 60),
      tarikh_mula = _tarikh(p->>'tarikhMula'), status = st, owner = _teks(p->>'owner', 60),
      tindakan = _teks(p->>'tindakan', 200), tarikh_tindakan = _tarikh(p->>'tarikhTindakan'),
      catatan = _teks(p->>'catatan', 1000), yuran = yr, kos_khas = kk, dikemas = now()
    where id = tid;
    if lama is distinct from st then perform _log(u, 'Tempat', tid, 'Status: ' || coalesce(lama, '') || ' → ' || st); end if;
    return jsonb_build_object('ok', true, 'id', tid, 'mesej', tid || ' dikemas kini');
  end if;

  perform pg_advisory_xact_lock(hashtext('hyb_id_tempat'));
  tid := _id_baru('tempat', 'HYB-T', 2);
  insert into tempat (id, nama, kawasan, pic, tel_pic, guru, tel_guru, hari_masa, tarikh_mula, status, owner,
                      tindakan, tarikh_tindakan, catatan, yuran, kos_khas, susunan)
  values (tid, nm, _teks(p->>'kawasan', 80), _teks(p->>'pic', 80), _tel(p->>'telPic'), _teks(p->>'guru', 80),
          _tel(p->>'telGuru'), _teks(p->>'hariMasa', 60), _tarikh(p->>'tarikhMula'), st, _teks(p->>'owner', 60),
          _teks(p->>'tindakan', 200), _tarikh(p->>'tarikhTindakan'), _teks(p->>'catatan', 1000), yr, kk,
          coalesce((select max(susunan) from tempat), 0) + 1);
  perform _log(u, 'Tempat', tid, 'Tempat baharu ditambah (' || st || ')');
  return jsonb_build_object('ok', true, 'id', tid, 'mesej', tid || ' ditambah');
end $$;

-- p = {id, status, statusLama}
create or replace function tukar_status_tempat(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u akses_crm := _penulis(); tid text := p->>'id'; st text; lama text;
begin
  st := _pilih(p->>'status', 'statusTempat', 'Status tempat');
  select status into lama from tempat where id = tid for update;
  if not found then raise exception 'ID % tidak dijumpai.', tid; end if;
  if coalesce(p->>'statusLama', '') <> '' and lama is distinct from p->>'statusLama' then
    raise exception 'Status % dah ditukar oleh orang lain kepada "%". Muat semula dan cuba lagi.', tid, lama;
  end if;
  if lama is distinct from st then
    update tempat set status = st, dikemas = now() where id = tid;
    perform _log(u, 'Tempat', tid, 'Status: ' || coalesce(lama, '') || ' → ' || st);
  end if;
  return jsonb_build_object('ok', true, 'id', tid, 'mesej', tid || ' kini ' || st);
end $$;

-- ---------------------------------------------------------------- Pelajar
-- p = {id?, nama, umur, ibuBapa, tel, tempatId, tarikhDaftar, sumber, status, tarikhBerhenti,
--      sebabBerhenti, catatan, bulanYuran?, statusYuran?}
create or replace function simpan_pelajar(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u akses_crm := _penulis();
  nm text := _teks(p->>'nama', 120);
  tid text := p->>'tempatId';
  st text; um int; tb date; sebab text := _teks(p->>'sebabBerhenti', 300);
  pid text := nullif(p->>'id', ''); lama text;
  bln text := nullif(p->>'bulanYuran', ''); sy text; sy_lama text;
begin
  if nm = '' then raise exception 'Nama pelajar wajib diisi.'; end if;
  if not exists (select 1 from tempat where id = tid) then raise exception 'ID tempat tidak wujud.'; end if;
  st := _pilih(p->>'status', 'statusPelajar', 'Status pelajar');
  if coalesce(p->>'umur', '') <> '' then
    begin um := (p->>'umur')::numeric::int; exception when others then raise exception 'Umur tidak sah.'; end;
    if um < 3 or um > 18 then raise exception 'Umur tidak sah.'; end if;
  end if;
  tb := _tarikh(p->>'tarikhBerhenti');
  if st = 'Berhenti' and (tb is null or sebab = '') then raise exception 'Pelajar berhenti perlu tarikh dan sebab berhenti.'; end if;
  if bln is not null then
    if not exists (select 1 from bulan_yuran where nama = bln) then raise exception 'Lajur % tidak dijumpai.', bln; end if;
    sy := _pilih(p->>'statusYuran', 'statusYuran', 'Status yuran', false);
  end if;

  if pid is not null then
    select status into lama from pelajar where id = pid for update;
    if not found then raise exception 'ID % tidak dijumpai.', pid; end if;
    update pelajar set nama = nm, umur = um, ibu_bapa = _teks(p->>'ibuBapa', 120), tel = _tel(p->>'tel'), tempat_id = tid,
      tarikh_daftar = _tarikh(p->>'tarikhDaftar'), sumber = _pilih(p->>'sumber', 'sumber', 'Sumber', false), status = st,
      tarikh_berhenti = case when st = 'Berhenti' then tb end, sebab_berhenti = case when st = 'Berhenti' then sebab else '' end,
      catatan = _teks(p->>'catatan', 1000), dikemas = now()
    where id = pid;
    if lama is distinct from st then
      perform _log(u, 'Pelajar', pid, 'Status: ' || coalesce(lama, '') || ' → ' || st || case when st = 'Berhenti' then ' (' || sebab || ')' else '' end);
    end if;
  else
    perform pg_advisory_xact_lock(hashtext('hyb_id_pelajar'));
    pid := _id_baru('pelajar', 'HYB-P', 3);
    insert into pelajar (id, nama, umur, ibu_bapa, tel, tempat_id, tarikh_daftar, sumber, status, tarikh_berhenti,
                         sebab_berhenti, catatan, susunan)
    values (pid, nm, um, _teks(p->>'ibuBapa', 120), _tel(p->>'tel'), tid, _tarikh(p->>'tarikhDaftar'),
            _pilih(p->>'sumber', 'sumber', 'Sumber', false), st, case when st = 'Berhenti' then tb end,
            case when st = 'Berhenti' then sebab else '' end, _teks(p->>'catatan', 1000),
            coalesce((select max(susunan) from pelajar), 0) + 1);
    perform _log(u, 'Pelajar', pid, 'Pelajar baharu didaftar di ' || tid || ' (' || st || ')');
  end if;

  -- Status yuran satu bulan (pilihan) + lejar
  if bln is not null then
    sy_lama := coalesce((select status from yuran where pelajar_id = pid and bulan = bln), '');
    if sy_lama <> sy then
      if sy = '' then delete from yuran where pelajar_id = pid and bulan = bln;
      else
        insert into yuran (pelajar_id, bulan, status) values (pid, bln, sy)
        on conflict (pelajar_id, bulan) do update set status = excluded.status, dikemas = now();
      end if;
      perform _selaras_lejar(u, pid, tid, bln, sy);
    end if;
  end if;
  return jsonb_build_object('ok', true, 'id', pid, 'mesej', pid || case when p->>'id' is null or p->>'id' = '' then ' ditambah' else ' dikemas kini' end);
end $$;

-- ---------------------------------------------------------------- Laporan kelas
-- p = {tarikh, tempatId, guru, hadir, topik, isu}
create or replace function simpan_laporan(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u akses_crm := _penulis(); d date := _tarikh(p->>'tarikh'); h numeric := _nombor(p->'hadir'); tp text := _teks(p->>'topik', 500);
begin
  if d is null then raise exception 'Tarikh kelas wajib diisi.'; end if;
  if d > _hari_ini() then raise exception 'Tarikh kelas tidak boleh pada masa depan.'; end if;
  if not exists (select 1 from tempat where id = p->>'tempatId') then raise exception 'ID tempat tidak wujud.'; end if;
  if h is null or h < 0 or h > 200 or h <> trunc(h) then raise exception 'Bilangan hadir tidak sah.'; end if;
  if tp = '' then raise exception 'Aktiviti / topik wajib diisi.'; end if;
  insert into laporan_kelas (tarikh, tempat_id, guru, hadir, topik, isu, oleh)
  values (d, p->>'tempatId', _teks(p->>'guru', 80), h::int, tp, _teks(p->>'isu', 500), _oleh(u));
  return jsonb_build_object('ok', true, 'id', p->>'tempatId', 'mesej', 'Laporan kelas disimpan');
end $$;

-- ---------------------------------------------------------------- Log
-- p = {jenis, ref, interaksi, tindakan, tarikhTindakan, kemaskiniTempat}
create or replace function tambah_log(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u akses_crm := _penulis();
  jn text := _pilih(p->>'jenis', 'jenisLog', 'Jenis log');
  it text := _teks(p->>'interaksi', 1000);
  rf text := _teks(p->>'ref', 20);
  tk text := _teks(p->>'tindakan', 200);
  tt date := _tarikh(p->>'tarikhTindakan');
begin
  if it = '' then raise exception 'Interaksi wajib diisi.'; end if;
  insert into log (masa, jenis, ref, interaksi, oleh, tindakan, tarikh_tindakan) values (now(), jn, rf, it, _oleh(u), tk, tt);
  if coalesce((p->>'kemaskiniTempat')::boolean, false) and rf ~ '^HYB-T\d+$' then
    update tempat set tindakan = tk, tarikh_tindakan = tt, dikemas = now() where id = rf;
  end if;
  return jsonb_build_object('ok', true, 'id', rf, 'mesej', 'Log disimpan');
end $$;

-- ---------------------------------------------------------------- hak akses
do $$
declare f text;
begin
  foreach f in array array['_pilih(text,text,text,boolean)','_id_baru(text,text,int)','_selaras_lejar(akses_crm,text,text,text,text)']
  loop execute format('revoke all on function %s from public, anon, authenticated', f); end loop;
  foreach f in array array['simpan_tempat(jsonb)','tukar_status_tempat(jsonb)','simpan_pelajar(jsonb)',
    'simpan_laporan(jsonb)','tambah_log(jsonb)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
