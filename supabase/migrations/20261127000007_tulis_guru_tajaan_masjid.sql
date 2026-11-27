-- CRM HYB Fasa 2c: tulis Guru, tetapan Penaja, Bayaran Masjid (27/11/2026)
-- Sama logik dengan Code.gs: simpanGuru, tukarStatusGuru, simpanPenaja, simpanSewaTetapan, rekodSewa.
-- janaLinkGuru / batalLinkGuru SENGAJA belum disambung: app Laporan Guru masih baca Sheet sampai Fasa 3,
-- jadi link yang dijana dalam BETA takkan berfungsi.

create or replace function _pengurus() returns akses_crm
language plpgsql stable security definer set search_path = public as $$
declare u akses_crm := _penulis();
begin
  if u.peranan not in ('Manager','Ketua') then
    raise exception 'Hanya Manager atau Ketua boleh ubah tetapan ini.' using errcode = '42501';
  end if;
  return u;
end $$;

-- ---------------------------------------------------------------- Guru
-- p = {id?, nama, tel, emel, gelaran, kawasan, status, sumber, tarikhMohon, tarikhTemuduga, tarikhMula,
--      kelayakan, catatan, tempatId?}
create or replace function simpan_guru(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u akses_crm := _penulis();
  nm text := _teks(p->>'nama', 100);
  st text := coalesce(p->>'status', '');
  gid text := nullif(p->>'id', ''); lama text; mesej text;
  tid text := nullif(p->>'tempatId', '');
begin
  if nm = '' then raise exception 'Nama guru wajib diisi.'; end if;
  if st = '' then raise exception 'Status guru wajib dipilih.'; end if;
  if st not in ('Calon','Temuduga','Latihan','Aktif','Simpanan','Tidak diteruskan') then
    raise exception 'Status guru "%" tiada dalam senarai.', st;
  end if;
  if tid is not null and not exists (select 1 from tempat where id = tid) then raise exception 'ID tempat % tidak wujud.', tid; end if;

  if gid is not null then
    select status into lama from guru where id = gid for update;
    if not found then raise exception 'ID % tidak dijumpai.', gid; end if;
    update guru set nama = nm, tel = _tel(p->>'tel'), emel = _teks(p->>'emel', 120), gelaran = _teks(p->>'gelaran', 20),
      kawasan = _teks(p->>'kawasan', 80), status = st, sumber = _teks(p->>'sumber', 80),
      tarikh_mohon = _tarikh(p->>'tarikhMohon'), tarikh_temuduga = _tarikh(p->>'tarikhTemuduga'), tarikh_mula = _tarikh(p->>'tarikhMula'),
      kelayakan = _teks(p->>'kelayakan', 1000), catatan = _teks(p->>'catatan', 1000)
    where id = gid;
    if lama is distinct from st then perform _log(u, 'Guru', gid, 'Status guru: ' || coalesce(lama, '') || ' → ' || st); end if;
    mesej := gid || ' dikemas kini';
  else
    perform pg_advisory_xact_lock(hashtext('hyb_id_guru'));
    gid := _id_baru('guru', 'HYB-G', 2);
    insert into guru (id, nama, tel, emel, gelaran, kawasan, status, sumber, tarikh_mohon, tarikh_temuduga, tarikh_mula, kelayakan, catatan)
    values (gid, nm, _tel(p->>'tel'), _teks(p->>'emel', 120), _teks(p->>'gelaran', 20), _teks(p->>'kawasan', 80), st,
            _teks(p->>'sumber', 80), _tarikh(p->>'tarikhMohon'), _tarikh(p->>'tarikhTemuduga'), _tarikh(p->>'tarikhMula'),
            _teks(p->>'kelayakan', 1000), _teks(p->>'catatan', 1000));
    perform _log(u, 'Guru', gid, 'Guru didaftar: ' || nm || ' (' || st || ')');
    mesej := gid || ' ditambah';
  end if;

  -- Tugaskan ke tempat: nama & tel guru dalam Tempat
  if tid is not null then
    update tempat set guru = nm, tel_guru = _tel(p->>'tel'), dikemas = now() where id = tid;
    perform _log(u, 'Guru', tid, nm || ' ditugaskan ke ' || tid);
    mesej := mesej || ', ditugaskan ke ' || tid;
  end if;
  return jsonb_build_object('ok', true, 'id', gid, 'mesej', mesej);
end $$;

-- p = {id, status, statusLama}
create or replace function tukar_status_guru(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u akses_crm := _penulis(); gid text := p->>'id'; st text := coalesce(p->>'status', ''); lama text;
begin
  if st not in ('Calon','Temuduga','Latihan','Aktif','Simpanan','Tidak diteruskan') then
    raise exception 'Status guru "%" tiada dalam senarai.', st;
  end if;
  select status into lama from guru where id = gid for update;
  if not found then raise exception 'ID % tidak dijumpai.', gid; end if;
  if coalesce(p->>'statusLama', '') <> '' and lama is distinct from p->>'statusLama' then
    raise exception 'Status % dah ditukar oleh orang lain kepada "%". Muat semula.', gid, lama;
  end if;
  if lama is distinct from st then
    update guru set status = st where id = gid;
    perform _log(u, 'Guru', gid, 'Status guru: ' || coalesce(lama, '') || ' → ' || st);
  end if;
  return jsonb_build_object('ok', true, 'id', gid, 'mesej', gid || ' kini ' || st);
end $$;

-- ---------------------------------------------------------------- Penaja (Manager/Ketua)
-- p = {id?, nama, tempatId, jenis, amaun, aktif, catatan}
create or replace function simpan_penaja(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u akses_crm := _pengurus();
  nm text := _teks(p->>'nama', 100);
  tid text := p->>'tempatId';
  jn text := coalesce(p->>'jenis', '');
  a numeric := _nombor(p->'amaun');
  ak boolean := not (p->'aktif' = 'false'::jsonb or p->>'aktif' = 'Tidak');
  sid text := nullif(p->>'id', ''); n int := 1;
begin
  if nm = '' then raise exception 'Nama penaja wajib diisi.'; end if;
  if not exists (select 1 from tempat where id = tid) then raise exception 'Pilih tempat yang sah.'; end if;
  if jn not in ('Tetap','Ikut pelajar') then raise exception 'Jenis tajaan "%" tiada dalam senarai.', jn; end if;
  if a is null or a <= 0 or a > 100000 then raise exception 'Amaun tidak sah.'; end if;
  if sid is not null then
    update penaja set nama = nm, tempat_id = tid, jenis = jn, amaun = a, aktif = ak, catatan = _teks(p->>'catatan', 500) where id = sid;
    if not found then raise exception 'Penaja % tidak dijumpai.', sid; end if;
    perform _log(u, 'Tempat', tid, 'Penaja ' || sid || ' dikemas kini: ' || nm || ' (' || jn || ', RM' || a || ')');
  else
    perform pg_advisory_xact_lock(hashtext('hyb_id_penaja'));
    while exists (select 1 from penaja where id = 'HYB-S' || lpad(n::text, 2, '0')) loop n := n + 1; end loop;
    sid := 'HYB-S' || lpad(n::text, 2, '0');
    insert into penaja (id, nama, tempat_id, jenis, amaun, aktif, catatan) values (sid, nm, tid, jn, a, ak, _teks(p->>'catatan', 500));
    perform _log(u, 'Tempat', tid, 'Penaja baharu ' || sid || ': ' || nm || ' (' || jn || ', RM' || a || ')');
  end if;
  return jsonb_build_object('ok', true, 'id', sid, 'mesej', 'Penaja ' || sid || ' disimpan');
end $$;

-- ---------------------------------------------------------------- Bayaran Masjid
-- p = {tempatId, penerima, amaun, aktif, cara, catatan}   (Manager/Ketua)
create or replace function simpan_sewa_tetapan(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u akses_crm := _pengurus(); tid text := p->>'tempatId'; a numeric := _nombor(p->'amaun');
  ak boolean := coalesce(p->>'aktif', '') <> 'Tidak'; pn text := _teks(p->>'penerima', 120);
begin
  if not exists (select 1 from tempat where id = tid) then raise exception 'Pilih tempat yang sah.'; end if;
  if a is null or a < 0 or a > 100000 then raise exception 'Amaun tidak sah.'; end if;
  insert into sewa_masjid (tempat_id, penerima, amaun, aktif, cara, catatan)
  values (tid, pn, a, ak, _teks(p->>'cara', 200), _teks(p->>'catatan', 500))
  on conflict (tempat_id) do update set penerima = excluded.penerima, amaun = excluded.amaun, aktif = excluded.aktif,
    cara = excluded.cara, catatan = excluded.catatan;
  perform _log(u, 'Masjid', tid, 'Tetapan bayaran masjid: ' || pn || ', RM' || a || ' sebulan' || case when ak then '' else ' (tidak aktif)' end);
  return jsonb_build_object('ok', true, 'id', tid, 'mesej', 'Tetapan bayaran masjid ' || tid || ' disimpan');
end $$;

-- p = {tempatId, bulan, status, amaun, tarikh, cara, rujukan, catatan}
create or replace function rekod_sewa(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u akses_crm := _penulis();
  tid text := p->>'tempatId'; bln text := coalesce(p->>'bulan', ''); st text := coalesce(p->>'status', '');
  masa timestamptz := now(); a numeric := 0; v_resit text := ''; asas text; m text[]; nb int; n int := 2; d date;
  ct text := _teks(p->>'catatan', 500);
begin
  if not exists (select 1 from sewa_masjid where tempat_id = tid) then raise exception 'Tempat % tiada dalam tetapan bayaran masjid.', tid; end if;
  m := regexp_match(bln, '^Yuran (\S+) (\d{4})$');
  if m is null then raise exception 'Bulan tidak sah.'; end if;
  if st not in ('Dibayar','Waive','Dibatalkan') then raise exception 'Status bayaran masjid "%" tiada dalam senarai.', st; end if;
  if st = 'Dibayar' then
    a := _nombor(p->'amaun');
    if a is null or a <= 0 or a > 100000 then raise exception 'Amaun tidak sah.'; end if;
    d := _tarikh_lepas(p->>'tarikh', 'Tarikh bayar', 2026);
    masa := _tengah_hari(d);
    nb := array_position(array['Jan','Feb','Mac','Apr','Mei','Jun','Jul','Ogo','Sep','Okt','Nov','Dis'], m[1]);
    asas := 'HYB-BM-' || right(m[2], 2) || lpad(coalesce(nb, 0)::text, 2, '0') || '-' || replace(tid, 'HYB-', '');
    perform pg_advisory_xact_lock(hashtext('hyb_resit_masjid'));
    v_resit := asas;
    while exists (select 1 from rekod_bayaran_masjid r where r.resit = v_resit) loop v_resit := asas || '-' || n; n := n + 1; end loop;
  elsif st = 'Waive' and ct = '' then
    raise exception 'Isi sebab waive (contoh: masjid kecualikan bulan ini).';
  end if;
  insert into rekod_bayaran_masjid (masa, tempat_id, bulan, status, amaun, resit, cara, rujukan, oleh, catatan)
  values (masa, tid, bln, st, a, v_resit, _teks(p->>'cara', 80), _teks(p->>'rujukan', 120), _oleh(u), ct);
  perform _log(u, 'Masjid', tid, replace(bln, 'Yuran ', '') || ': bayaran masjid ' ||
    case st when 'Dibayar' then 'RM' || a || ' dibayar (' || v_resit || ')' when 'Waive' then 'waive: ' || left(ct, 200) else 'dibatalkan' end);
  return jsonb_build_object('ok', true, 'id', tid, 'resit', v_resit, 'mesej',
    case st when 'Dibayar' then 'Bayaran ' || tid || ' direkod · resit ' || v_resit when 'Waive' then tid || ' ditanda waive' else 'Rekod ' || tid || ' dibatalkan' end);
end $$;

-- ---------------------------------------------------------------- hak akses
do $$
declare f text;
begin
  execute 'revoke all on function _pengurus() from public, anon, authenticated';
  foreach f in array array['simpan_guru(jsonb)','tukar_status_guru(jsonb)','simpan_penaja(jsonb)',
    'simpan_sewa_tetapan(jsonb)','rekod_sewa(jsonb)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
