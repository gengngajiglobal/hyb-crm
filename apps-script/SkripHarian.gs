/**
 * Skrip harian CRM HYB (selepas cutover ke Supabase)
 *
 *  1. backupMalam()       setiap malam 2 pagi: salin semua data Supabase ke Sheet
 *                         "CRM HYB Salinan (baca sahaja)". Sheet dicipta automatik kali pertama.
 *  2. notifikasiDaftar()  setiap 15 minit: emel bila ada pendaftaran baru dari borang
 *                         (nama anak, umur dan kelas sahaja; tiada telefon/kesihatan, PDPA).
 *
 * Pasang (sekali, dalam projek Apps Script "Import CRM HYB ke Supabase"):
 *  1. Tambah fail baru (+ > Script), nama "SkripHarian". Tampal fail ini. Simpan.
 *     Code.gs (import) boleh dibiarkan; selepas cutover import ditutup di database.
 *  2. Project Settings > Script Properties, tambah:
 *       EMEL_NOTIFIKASI = emel penerima notifikasi (lebih dari satu: pisah dengan koma)
 *     SUPABASE_URL dan SUPABASE_SERVICE_KEY sudah ada dari skrip import.
 *  3. Pilih function pasangTrigger > Run. Benarkan akses (Sheet, emel, sambung ke luar).
 *     Ia buang trigger lama (termasuk import setiap jam) dan pasang 2 trigger baru,
 *     kemudian terus buat backup pertama. Lihat Execution log untuk link Sheet salinan.
 */

const TZ_H = 'Asia/Kuala_Lumpur';
const NAMA_SALINAN = 'CRM HYB Salinan (baca sahaja)';
const URL_CRM_BARU = 'https://gengngajiglobal.github.io/hyb-crm/';

function pasangTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('backupMalam').timeBased().atHour(2).everyDays(1).inTimezone(TZ_H).create();
  ScriptApp.newTrigger('notifikasiDaftar').timeBased().everyMinutes(15).create();
  Logger.log('Trigger dipasang: backupMalam (2 pagi setiap hari), notifikasiDaftar (setiap 15 minit).');
  backupMalam();
}

/* ------------------------------------------------------------------ backup */

function backupMalam() {
  const d = rpc_('eksport_penuh', {});
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SALINAN_ID');
  let ss;
  if (id) ss = SpreadsheetApp.openById(id);
  else {
    ss = SpreadsheetApp.create(NAMA_SALINAN);
    props.setProperty('SALINAN_ID', ss.getId());
  }
  const jadual = d.jadual || {};
  Object.keys(jadual).forEach(function (nama) { tulisTab_(ss, nama, jadual[nama]); });

  let info = ss.getSheetByName('Info');
  if (!info) info = ss.insertSheet('Info', 0);
  info.clear();
  info.getRange(1, 1, 4, 2).setValues([
    ['Backup terakhir', d.masa],
    ['Sumber', 'Supabase (CRM HYB). Sheet ini salinan BACA SAHAJA, dikemas kini setiap malam.'],
    ['CRM', URL_CRM_BARU],
    ['Nota', 'Jangan ubah data di sini. Semua perubahan dibuat dalam CRM. Mengandungi data peribadi: kongsi sebagai Viewer kepada staf yang perlu sahaja (PDPA).'],
  ]);
  const lalai = ss.getSheetByName('Sheet1');
  if (lalai && ss.getSheets().length > 1) ss.deleteSheet(lalai);
  Logger.log('Backup siap %s: %s', d.masa, ss.getUrl());
}

function tulisTab_(ss, nama, baris) {
  let sh = ss.getSheetByName(nama);
  if (!sh) sh = ss.insertSheet(nama);
  sh.clear();
  if (!baris || !baris.length) { sh.getRange(1, 1).setValue('(tiada data)'); return; }
  const kunci = [];
  baris.forEach(function (r) { Object.keys(r).forEach(function (k) { if (kunci.indexOf(k) < 0) kunci.push(k); }); });
  const nilai = [kunci].concat(baris.map(function (r) {
    return kunci.map(function (k) { return sel_(r[k]); });
  }));
  sh.getRange(1, 1, nilai.length, kunci.length).setValues(nilai);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, kunci.length).setFontWeight('bold');
}

function sel_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') v = JSON.stringify(v);
  if (typeof v === 'string') {
    if (v.length > 49000) v = v.slice(0, 49000);
    if (/^[=+\-@]/.test(v)) v = "'" + v;  // elak formula injection
  }
  return v;
}

/* ------------------------------------------------------------------ notifikasi */

function notifikasiDaftar() {
  const penerima = String(PropertiesService.getScriptProperties().getProperty('EMEL_NOTIFIKASI') || '').trim();
  if (!penerima) { Logger.log('EMEL_NOTIFIKASI belum diisi dalam Script Properties.'); return; }
  const senarai = rpc_('pendaftaran_untuk_emel', {});
  if (!senarai || !senarai.length) return;

  // Satu emel untuk setiap kelas (sama macam borang lama).
  const ikutKelas = {};
  senarai.forEach(function (r) {
    const k = r.tempat_id || r.tempat_nama || '-';
    (ikutKelas[k] = ikutKelas[k] || []).push(r);
  });
  const siap = [];
  Object.keys(ikutKelas).forEach(function (k) {
    const rows = ikutKelas[k], t = rows[0];
    try {
      MailApp.sendEmail({
        to: penerima,
        subject: 'Pendaftaran baru HYB: ' + rows.length + ' anak di ' + t.tempat_nama,
        body: 'Assalamualaikum,\n\nAda pendaftaran baru melalui borang online:\n\n' +
          rows.map(function (r) { return '- ' + r.id + ' ' + cap_(r.nama) + (r.umur ? ' (' + r.umur + ' tahun)' : ''); }).join('\n') +
          '\n\nKelas: ' + t.tempat_nama + (t.hari_masa ? ' (' + t.hari_masa + ')' : '') +
          '\n\nSila semak dan sahkan dalam CRM, menu Pendaftaran Baru.\n' + URL_CRM_BARU +
          '\n\nEmel automatik daripada borang pendaftaran HYB.',
      });
      rows.forEach(function (r) { siap.push(r.id); });
    } catch (e) {
      console.warn('Emel notifikasi gagal (' + k + '): ' + e.message);  // cuba lagi 15 minit nanti
    }
  });
  if (siap.length) rpc_('tanda_dimaklum', { ids: siap });
}

function cap_(s) {
  return String(s || '').toLowerCase().replace(/(^|[\s'-])(\S)/g, function (m, a, b) { return a + b.toUpperCase(); });
}

/* ------------------------------------------------------------------ sambungan */

function rpc_(fn, args) {
  const props = PropertiesService.getScriptProperties();
  const url = String(props.getProperty('SUPABASE_URL') || '').replace(/\/+$/, '');
  const key = props.getProperty('SUPABASE_SERVICE_KEY');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !key) {
    throw new Error('Isi SUPABASE_URL dan SUPABASE_SERVICE_KEY dalam Script Properties dahulu.');
  }
  const res = UrlFetchApp.fetch(url + '/rest/v1/rpc/' + fn, {
    method: 'post', contentType: 'application/json',
    headers: { apikey: key, Authorization: 'Bearer ' + key },
    payload: JSON.stringify(args || {}), muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('Supabase ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 500));
  return JSON.parse(res.getContentText());
}
