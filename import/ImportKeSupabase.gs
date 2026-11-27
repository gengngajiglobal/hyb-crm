/**
 * Import CRM HYB: Sheet -> Supabase (BETA, Fasa 1)
 *
 * Skrip ini BACA SAHAJA Sheet "CRM HYB 2026". Ia tidak menulis apa-apa ke Sheet,
 * dan tidak menyentuh CRM live. Setiap kali dijalankan, data BETA dalam Supabase
 * diganti dengan salinan terkini Sheet.
 *
 * Pasang (sekali):
 *  1. script.google.com > New project, nama "Import CRM HYB ke Supabase". (Projek BARU, bukan dalam CRM.)
 *  2. Tampal fail ini sebagai Code.gs. Simpan.
 *  3. Project Settings (ikon gear) > Script Properties > Add:
 *       SUPABASE_URL          = https://xxxx.supabase.co
 *       SUPABASE_SERVICE_KEY  = (service_role / secret key dari Supabase > Project Settings > API Keys)
 *       SHEET_ID              = ID Sheet "CRM HYB 2026" (bahagian panjang dalam URL Sheet)
 *       EMEL_MANAGER          = emel Google Manager (dapat peranan Manager dalam CRM baru)
 *     Kunci service_role JANGAN dikongsi dalam chat atau ditampal dalam kod.
 *  4. Pilih function importSekarang > Run. Benarkan akses (baca Sheet + sambung ke luar).
 *  5. (Pilihan) Triggers > Add Trigger > importSekarang, Time-driven, Hour timer, Every hour.
 */

const TZ = 'Asia/Kuala_Lumpur';

function importSekarang() {
  const props = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
  const d = bina_(ss);
  const mgr = String(props.getProperty('EMEL_MANAGER') || '').trim().toLowerCase();
  if (mgr) d.akses.unshift({ emel: mgr, nama: 'Manager', peranan: 'Manager', aktif: true, catatan: 'Pemilik' });
  const url = String(props.getProperty('SUPABASE_URL') || '').replace(/\/+$/, '');
  const key = props.getProperty('SUPABASE_SERVICE_KEY');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !key) {
    throw new Error('Isi SUPABASE_URL dan SUPABASE_SERVICE_KEY dalam Script Properties dahulu.');
  }
  const res = UrlFetchApp.fetch(url + '/rest/v1/rpc/import_penuh', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: key, Authorization: 'Bearer ' + key },
    payload: JSON.stringify({ d: d }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('Supabase ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 500));
  Logger.log('Import siap: %s', res.getContentText());
}

/* ------------------------------------------------------------------ */

function bina_(ss) {
  const d = {};
  // Tetapan
  const tt = ss.getSheetByName('Tetapan');
  const b = tt.getRange('B4:B12').getValues().map(function (r) { return num_(r[0]); });
  const rk = ss.getSheetByName('Ringkasan');
  d.tetapan = { yuranStandard: b[0], guru: b[1], masjid: b[2], kapasiti: b[3], minBuka: b[4], sasaran: b[5],
    target: b[6], yuranAwal: b[8], bulanDipantau: rk ? String(rk.getRange('B3').getDisplayValue()).trim() : '' };
  const KUNCI = { 'Status tempat': 'statusTempat', 'Status pelajar': 'statusPelajar', 'Status yuran': 'statusYuran',
    'Sumber pelajar': 'sumber', 'Owner': 'owner', 'Jenis log': 'jenisLog' };
  const grid = tt.getRange('A14:F30').getDisplayValues();
  d.senarai = [];
  grid[0].forEach(function (h, c) {
    const j = KUNCI[String(h).trim()];
    if (!j) return;
    grid.slice(1).forEach(function (r, i) { const v = String(r[c]).trim(); if (v) d.senarai.push({ jenis: j, nilai: v, susunan: i }); });
  });

  // Tempat (A-N, W, X). Lajur formula O-V tidak diambil: dikira semula dalam app.
  d.tempat = rows_(ss, 'Tempat', 24).filter(function (r) { return s_(r.v[0]); }).map(function (r) {
    const v = r.v;
    return { id: s_(v[0]), nama: s_(v[1]), kawasan: s_(v[2]), pic: s_(v[3]), tel_pic: s_(v[4]), guru: s_(v[5]),
      tel_guru: s_(v[6]), hari_masa: s_(v[7]), tarikh_mula: tkh_(v[8]), status: s_(v[9]), owner: s_(v[10]),
      tindakan: s_(v[11]), tarikh_tindakan: tkh_(v[12]), catatan: s_(v[13]), yuran: numOrNull_(v[22]),
      kos_khas: numOrNull_(v[23]), susunan: r.baris };
  });

  // Pelajar + lajur yuran bulanan
  const shP = ss.getSheetByName('Pelajar');
  const vP = shP.getDataRange().getValues();
  const head = vP[0].map(function (h) { return String(h).trim(); });
  const bulanCol = [];
  head.forEach(function (h, c) { if (/^Yuran \S+ \d{4}$/.test(h)) bulanCol.push({ nama: h, c: c }); });
  d.bulan = bulanCol.map(function (x, i) { return { nama: x.nama, susunan: i }; });
  d.pelajar = []; d.yuran = [];
  for (let i = 1; i < vP.length; i++) {
    const v = vP[i];
    if (!s_(v[0])) continue;
    const umur = numOrNull_(v[2]);
    d.pelajar.push({ id: s_(v[0]), nama: s_(v[1]), umur: umur >= 3 && umur <= 18 ? Math.round(umur) : null,
      ibu_bapa: s_(v[3]), tel: s_(v[4]), tempat_id: s_(v[5]), tarikh_daftar: tkh_(v[7]), sumber: s_(v[8]),
      status: s_(v[9]), tarikh_berhenti: tkh_(v[10]), sebab_berhenti: s_(v[11]), catatan: s_(v[12]), susunan: i + 1 });
    bulanCol.forEach(function (x) { const st = s_(v[x.c]); if (st) d.yuran.push({ pelajar_id: s_(v[0]), bulan: x.nama, status: st }); });
  }

  d.bayaran = rows_(ss, 'Rekod Bayaran', 8).filter(function (r) { return s_(r.v[1]) && s_(r.v[3]); }).map(function (r) {
    const v = r.v;
    return { masa: masa_(v[0]), ref_id: s_(v[1]), tempat_id: s_(v[2]), bulan: s_(v[3]), status: s_(v[4]),
      amaun: num_(v[5]), oleh: s_(v[6]), sumber: s_(v[7]) };
  });
  d.laporan = rows_(ss, 'Laporan Kelas', 8).filter(function (r) { return r.v[0] && s_(r.v[1]); }).map(function (r) {
    const v = r.v;
    return { tarikh: tkh_(v[0]), tempat_id: s_(v[1]), guru: s_(v[3]), hadir: numOrNull_(v[4]), topik: s_(v[5]), isu: s_(v[6]), oleh: s_(v[7]) };
  }).filter(function (x) { return x.tarikh; });
  d.kehadiran = rows_(ss, 'Kehadiran', 7).filter(function (r) { return r.v[0] && s_(r.v[2]); }).map(function (r) {
    const v = r.v;
    return { tarikh: tkh_(v[0]), tempat_id: s_(v[1]), pelajar_id: s_(v[2]), nama_pelajar: s_(v[3]), status: s_(v[4]), guru: s_(v[5]), oleh: s_(v[6]) };
  }).filter(function (x) { return x.tarikh; });
  d.log = rows_(ss, 'Log', 7).filter(function (r) { return r.v[0] || s_(r.v[3]); }).map(function (r) {
    const v = r.v;
    return { masa: masa_(v[0]), jenis: s_(v[1]), ref: s_(v[2]), interaksi: s_(v[3]), oleh: s_(v[4]), tindakan: s_(v[5]), tarikh_tindakan: tkh_(v[6]) };
  });
  d.guru = rows_(ss, 'Guru', 13).filter(function (r) { return s_(r.v[0]); }).map(function (r) {
    const v = r.v;
    return { id: s_(v[0]), nama: s_(v[1]), tel: s_(v[2]), emel: s_(v[3]), gelaran: s_(v[4]), kawasan: s_(v[5]), status: s_(v[6]),
      sumber: s_(v[7]), tarikh_mohon: tkh_(v[8]), tarikh_temuduga: tkh_(v[9]), tarikh_mula: tkh_(v[10]), kelayakan: s_(v[11]), catatan: s_(v[12]) };
  });
  d.aksesGuru = rows_(ss, 'Akses Guru', 5).filter(function (r) { return s_(r.v[0]) && s_(r.v[1]); }).map(function (r) {
    const v = r.v;
    return { guru_id: s_(v[0]), hash_kod: s_(v[1]), dicipta: masa_(v[2]), oleh: s_(v[3]), aktif: s_(v[4]) === 'Ya' };
  });
  d.lokasi = rows_(ss, 'Lokasi Tempat', 6).filter(function (r) { return s_(r.v[0]) && Number(r.v[1]) && Number(r.v[2]); }).map(function (r) {
    const v = r.v;
    return { tempat_id: s_(v[0]), lat: Number(v[1]), lng: Number(v[2]), sumber: s_(v[3]), dikemas: masa_(v[4]), oleh: s_(v[5]) };
  });
  d.pendaftaran = rows_(ss, 'Pendaftaran', 23).filter(function (r) { return s_(r.v[0]); }).map(function (r) {
    const v = r.v;
    return { id: s_(v[0]), dihantar: masa_(v[1]), status: s_(v[2]) || 'Baru', tempat_id: s_(v[3]), tempat_nama: s_(v[4]),
      nama: s_(v[5]), lahir: tkh_(v[6]), umur: numOrNull_(v[7]), jantina: s_(v[8]), ibu_bapa: s_(v[9]), tel: s_(v[10]),
      emel: s_(v[11]), kawasan: s_(v[12]), kesihatan: s_(v[13]), sumber: s_(v[14]), mesej: s_(v[15]), gambar: s_(v[16]),
      pdpa: s_(v[17]), kumpulan: s_(v[18]), pelajar_id: s_(v[19]), oleh: s_(v[20]), diproses: masa_(v[21]), catatan: s_(v[22]) };
  });
  d.penaja = rows_(ss, 'Penaja', 7).filter(function (r) { return s_(r.v[0]); }).map(function (r) {
    const v = r.v;
    return { id: s_(v[0]), nama: s_(v[1]), tempat_id: s_(v[2]), jenis: s_(v[3]) || 'Tetap', amaun: num_(v[4]), aktif: s_(v[5]) !== 'Tidak', catatan: s_(v[6]) };
  });
  d.sewa = rows_(ss, 'Sewa Masjid', 6).filter(function (r) { return s_(r.v[0]); }).map(function (r) {
    const v = r.v;
    return { tempat_id: s_(v[0]), penerima: s_(v[1]), amaun: num_(v[2]), aktif: s_(v[3]) !== 'Tidak', cara: s_(v[4]), catatan: s_(v[5]) };
  });
  d.sewaRekod = rows_(ss, 'Rekod Bayaran Masjid', 10).filter(function (r) { return s_(r.v[1]); }).map(function (r) {
    const v = r.v;
    return { masa: masa_(v[0]), tempat_id: s_(v[1]), bulan: s_(v[2]), status: s_(v[3]), amaun: num_(v[4]), resit: s_(v[5]),
      cara: s_(v[6]), rujukan: s_(v[7]), oleh: s_(v[8]), catatan: s_(v[9]) };
  });
  d.akses = rows_(ss, 'Akses CRM', 5).filter(function (r) { return s_(r.v[0]); }).map(function (r) {
    const v = r.v, a = s_(v[3]).toLowerCase();
    return { emel: s_(v[0]).toLowerCase(), nama: s_(v[1]), peranan: s_(v[2]), aktif: !(a === 'tidak' || a === 'no' || a === 'false'), catatan: s_(v[4]) };
  });
  return d;
}

/* Baca baris data (dari baris 2) sehingga baris terakhir yang ada isi lajur A. */
function rows_(ss, nama, lebar) {
  const sh = ss.getSheetByName(nama);
  if (!sh || sh.getLastRow() < 2) return [];
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, lebar).getValues();
  let akhir = v.length;
  while (akhir > 0 && String(v[akhir - 1][0]).trim() === '') akhir--;
  return v.slice(0, akhir).map(function (r, i) { return { v: r, baris: i + 2 }; });
}
function s_(x) {
  if (x instanceof Date) return Utilities.formatDate(x, TZ, 'yyyy-MM-dd');
  return x === null || x === undefined ? '' : String(x).trim();
}
function num_(x) {
  if (typeof x === 'number') return x;
  const n = parseFloat(String(x).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}
function numOrNull_(x) { return x === '' || x === null || x === undefined ? null : num_(x); }
function tkh_(x) {
  if (x instanceof Date) return Utilities.formatDate(x, TZ, 'yyyy-MM-dd');
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(x || '').trim());
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return /^\d{4}-\d{2}-\d{2}/.test(String(x || '')) ? String(x).slice(0, 10) : null;
}
function masa_(x) {
  if (x instanceof Date) return Utilities.formatDate(x, TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
  const t = tkh_(x);
  return t ? t + 'T12:00:00+08:00' : null;
}
