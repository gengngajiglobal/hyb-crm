(function () {
'use strict';

/* =================================================================
   CRM HYB — Fasa 1 (read-only): Dashboard + Senarai Pelajar
   Semua kiraan ikut peraturan dalam brief, seksyen 5.
   ================================================================= */

var BLN = ['Jan','Feb','Mac','Apr','Mei','Jun','Jul','Ogo','Sep','Okt','Nov','Dis'];
var HARI = ['Ahad','Isnin','Selasa','Rabu','Khamis','Jumaat','Sabtu'];
var JALAN = ['Kelas berjalan','Berisiko'];
var RUTIN = [ // sama dengan jadual rutin dalam skrin Kutipan Yuran
  { h: 1,  a: 2,  t: 'Invois',          d: 'Invois yuran bulan ini keluar dari sistem invois.' },
  { h: 3,  a: 10, t: 'WhatsApp',        d: 'Hantar peringatan WhatsApp kepada ibu bapa yang belum bayar.' },
  { h: 11, a: 20, t: 'Telefon',         d: 'Telefon ibu bapa yang masih belum bayar, rekod dalam log.' },
  { h: 22, a: 28, t: 'Peringatan invois', d: 'Hantar peringatan invois kepada yang masih belum bayar.' },
  { h: 29, a: 31, t: 'Tertunggak',      d: 'Tukar status Belum bayar kepada Tertunggak.' }
];

var S = {
  D: null, bulan: '', view: 'dashboard',
  f: { q: '', tab: 'Aktif', tempat: '', yuran: '', sumber: '', umur: '' },
  sort: { k: 'id', d: 1 }
};

/* ---------- utiliti ---------- */
function $(s) { return document.querySelector(s); }
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function num(v) {
  if (typeof v === 'number') return v;
  if (v == null || v === '' || v === '-') return 0;
  var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}
function rm(n) {
  var s = 'RM' + Math.abs(Math.round(n)).toLocaleString('en-MY');
  return n < 0 ? '-' + s : s;
}
function pct(x) { return (x == null || !isFinite(x)) ? '–' : Math.round(x * 100) + '%'; }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function tarikh(v) {
  if (!v) return null;
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return new Date(+m[1], m[2] - 1, +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(v);
  if (m) return new Date(+m[3], m[2] - 1, +m[1]);
  return null;
}
function fmt(d) { return d ? pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() : ''; }
function fmtV(v) { return fmt(tarikh(v)) || (v || ''); }
function today() { var d = window.PREVIEW_TODAY ? new Date(window.PREVIEW_TODAY) : new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function hariBeza(a, b) { return Math.round((a - b) / 86400000); }
function label(b) { return String(b || '').replace(/^Yuran\s+/, ''); }
function bulanIni() {
  var t = today();
  return 'Yuran ' + BLN[t.getMonth()] + ' ' + t.getFullYear();
}
function isBulanIni() { return S.bulan === bulanIni(); }
function cap(s) { return String(s || '').toLowerCase().replace(/(^|\s|-)\S/g, function (c) { return c.toUpperCase(); }); }

var CHIP = {
  'Dibayar': 'c-g', 'Kelas berjalan': 'c-g', 'Aktif': 'c-g',
  'Belum bayar': 'c-y', 'Recruitment': 'c-y', 'Daftar': 'c-y', 'Cari guru': 'c-y',
  'Tertunggak': 'c-r', 'Berisiko': 'c-r',
  'Ditaja': 'c-b', 'Setuju collab': 'c-b', 'Approach': 'c-b',
  'Dikecualikan': 'c-p', 'Lead': 'c-p', 'Dikenal pasti': 'c-p',
  'Tutup': 'c-k', 'Berhenti': 'c-k'
};
function chip(v, cls) {
  if (!v) return '<span class="chip c-o">kosong</span>';
  return '<span class="chip ' + (cls || CHIP[v] || 'c-k') + '">' + esc(v) + '</span>';
}
var DOT = { 'Dibayar': 'g', 'Belum bayar': 'y', 'Tertunggak': 'r', 'Ditaja': 'b', 'Dikecualikan': 'k' };

function waNo(tel) {
  var d = String(tel || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.indexOf('60') === 0) return d;
  if (d.charAt(0) === '0') return '6' + d;
  if (d.charAt(0) === '1') return '60' + d;
  return d;
}
function waLink(tel, msg) {
  var n = waNo(tel);
  return n ? 'https://wa.me/' + n + '?text=' + encodeURIComponent(msg) : '';
}
function msgPeringatan(p) {
  var t = tempatById(p.tempatId);
  var yuran = t ? (num(t.yuran) || S.D.tetapan.yuranStandard) : S.D.tetapan.yuranStandard;
  return 'Assalamualaikum ' + (p.ibuBapa || 'tuan/puan') + '. Ini peringatan mesra daripada HYB ' +
    (p.tempatNama || '') + '. Yuran ' + label(S.bulan) + ' untuk ' + cap(p.nama) + ' sebanyak RM' + yuran +
    ' masih belum kami terima. Jika sudah bayar, abaikan mesej ini. Terima kasih.';
}
function msgUmum(p) {
  return 'Assalamualaikum ' + (p.ibuBapa || 'tuan/puan') + ', saya dari HYB ' + (p.tempatNama || '') +
    ' berkenaan ' + cap(p.nama) + '.';
}

var ICON = {
  dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  pipe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.7 3 2.5 3.5 5.2"/></svg>',
  cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/></svg>',
  form: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  masjid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21h18M5 21v-8h14v8M12 3c-2.5 2.2-4 3.6-4 6h8c0-2.4-1.5-3.8-4-6zM9 21v-4a3 3 0 0 1 6 0v4"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>',
  wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.5 1.1 2.7.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  guru: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c2 2 10 2 12 0v-5"/></svg>',
  hadir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 12l3 3 5-6"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  lagi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 4v11M7 10l5 5 5-5M4 20h16"/></svg>'
};

var NAV = [
  { k: 'dashboard', t: 'Dashboard', i: 'dash' },
  { k: 'pipeline', t: 'Pipeline Tempat', i: 'pipe' },
  { k: 'peta', t: 'Peta Tempat', i: 'map' },
  { k: 'profil', t: 'Profil Tempat', i: 'home' },
  { k: 'guru', t: 'Guru', i: 'guru' },
  { k: 'kalendar', t: 'Kalendar', i: 'cal' },
  { k: 'kehadiran', t: 'Kehadiran Kelas', i: 'hadir' },
  { k: 'pelajar', t: 'Senarai Pelajar', i: 'user' },
  { k: 'daftar', t: 'Pendaftaran Baru', i: 'form' },
  { k: 'kutipan', t: 'Kutipan Yuran', i: 'cash' },
  { k: 'laporan', t: 'Laporan', i: 'chart' },
  { k: 'masjid', t: 'Bayaran Masjid', i: 'masjid', spec: 1 }
];

/* ---------- data ---------- */
var TMAP = {};
function tempatById(id) { return TMAP[id]; }

function muat() {
  $('#view').innerHTML = '<div class="loading"><div><div class="spin"></div>Memuatkan data dari Sheet...</div></div>';
  if (window.google && google.script && google.script.run) {
    google.script.run
      .withSuccessHandler(function (s) { siap(JSON.parse(s)); })
      .withFailureHandler(function (e) {
        $('#view').innerHTML = '<div class="err"><b>Gagal baca Sheet.</b><br>' + esc(e && e.message || e) + '</div>';
      })
      .getData();
  } else if (window.PREVIEW_DATA) {
    setTimeout(function () { siap(JSON.parse(JSON.stringify(window.PREVIEW_DATA))); }, 250);
  } else {
    $('#view').innerHTML = '<div class="err">Tiada sumber data.</div>';
  }
}

function siap(D, kekal) {
  S.D = D;
  TMAP = {};
  D.tempat.forEach(function (t) { TMAP[t.id] = t; });
  if (!S.bulan || D.bulanList.indexOf(S.bulan) < 0) {
    S.bulan = D.bulanList.indexOf(bulanIni()) > -1 ? bulanIni()
      : (D.bulanList.indexOf(D.bulanDipantau) > -1 ? D.bulanDipantau : D.bulanList[0]);
  }
  var b = [];
  if (D.simulasi) b.push(D.simulasi);
  else if (D.preview) b.push('Preview dengan data sebenar Sheet (snapshot 04/11/2026). Nama pelajar dipendekkan, nama dan nombor ibu bapa disembunyikan. App sebenar dalam Apps Script papar data penuh secara live. Dalam preview, perubahan hanya disimpan sementara dalam browser, bukan ke Sheet.');
  if (D.amaran && D.amaran.length) b.push('Struktur Sheet berubah: ' + D.amaran.join('; '));
  $('#banner').innerHTML = b.map(function (x) { return '<div class="banner">' + esc(x) + '</div>'; }).join('');
  $('#sideFoot').innerHTML = '<b>' + esc(D.user.nama) + '</b> · ' + esc(D.user.peranan) +
    '<br><span class="ro">' + (bolehTulis() ? 'Boleh edit' : 'Lihat sahaja') + ' · Fasa 5</span>';
  render(kekal);
}

/* ---------- kiraan (brief seksyen 5) ---------- */
function kosTempat(t, std) {
  var k = t && t.kosKhas;
  return (k === '' || k === null || k === undefined || isNaN(+k)) ? std : +k;
}
function kira() {
  var D = S.D, T = D.tetapan, b = S.bulan, now = today();
  var kosSetiap = num(T.guru) + num(T.masjid);
  var per = {};
  D.tempat.forEach(function (t) {
    per[t.id] = { aktif: 0, dibayar: 0, belum: 0, tertunggak: 0, ditaja: 0, kecuali: 0, kosong: 0, wang: 0, yuran: num(t.yuran) || num(T.yuranStandard) };
  });
  var tot = { aktif: 0, dibayar: 0, belum: 0, tertunggak: 0, ditaja: 0, kecuali: 0, kosong: 0,
    berhenti: 0, lead: 0, daftar: 0, tanpaTempat: 0 };
  var K = { 'Dibayar': 'dibayar', 'Belum bayar': 'belum', 'Tertunggak': 'tertunggak', 'Ditaja': 'ditaja', 'Dikecualikan': 'kecuali' };
  D.pelajar.forEach(function (p) {
    if (p.status === 'Berhenti') tot.berhenti++;
    if (p.status === 'Lead') tot.lead++;
    if (p.status === 'Daftar') tot.daftar++;
    if (p.status !== 'Aktif') return;
    var k = K[p.yuran[b]] || 'kosong';
    tot.aktif++; tot[k]++;
    if (per[p.tempatId]) { per[p.tempatId].aktif++; per[p.tempatId][k]++; if (k === 'dibayar') per[p.tempatId].wang += amaunBayar(p.id, b) || per[p.tempatId].yuran; } else tot.tanpaTempat++;
  });

  var TJ = tajaanTempat(b), TD = daftarTempat(b);
  var rows = D.tempat.map(function (t) {
    var r = per[t.id], jalan = JALAN.indexOf(t.status) > -1;
    var yuran = num(t.yuran) || num(T.yuranStandard);
    var hasil = r.aktif * yuran, kos = jalan ? Math.max(0, kosTempat(t, kosSetiap) - sewaWaive(t.id, b)) : 0;
    var perlu = r.aktif - r.ditaja - r.kecuali;
    var tt = tarikh(t.tarikhTindakan);
    return {
      t: t, id: t.id, jalan: jalan, yuran: yuran,
      aktif: r.aktif, dibayar: r.dibayar, belum: r.belum, tertunggak: r.tertunggak,
      ditaja: r.ditaja, kecuali: r.kecuali, kosong: r.kosong,
      hasil: hasil, kos: kos, untung: hasil - kos, kutipanYuran: r.wang, kutipanKadar: r.dibayar * yuran, tajaan: TJ[t.id] || 0, daftar: TD[t.id] || 0, kutipan: r.wang + (TJ[t.id] || 0) + (TD[t.id] || 0),
      perlu: perlu, pk: perlu > 0 ? r.dibayar / perlu : null,
      kap: r.aktif / (num(T.kapasiti) || 25),
      tt: tt, lewat: !!(tt && tt < now && t.status !== 'Tutup'),
      rugi: jalan && hasil - kos < 0
    };
  });

  var s = function (k) { return rows.reduce(function (a, r) { return a + r[k]; }, 0); };
  var jalanN = rows.filter(function (r) { return r.jalan; }).length;
  var hasil = s('hasil'), kos = s('kos'), kutipan = s('kutipan'), kutipanYuran = s('kutipanYuran'), tajaan = s('tajaan'), daftar = s('daftar');
  var perluBayar = tot.aktif - tot.ditaja - tot.kecuali;
  return {
    rows: rows, tot: tot, kosSetiap: kosSetiap,
    kelasJalan: jalanN,
    recruit: rows.filter(function (r) { return r.t.status === 'Recruitment'; }).length,
    purata: jalanN ? tot.aktif / jalanN : 0,
    hasil: hasil, kos: kos, untungPotensi: hasil - kos, kutipan: kutipan, kutipanYuran: kutipanYuran, tajaan: tajaan, daftar: daftar,
    perluBayar: perluBayar,
    pk: perluBayar > 0 ? tot.dibayar / perluBayar : null,
    pm: hasil > 0 ? kos / hasil : null,
    untungSebenar: kutipan - kos,
    pTarget: num(T.target) ? kutipan / num(T.target) : 0,
    pPotensiTarget: num(T.target) ? hasil / num(T.target) : 0,
    perluTarget: Math.ceil(num(T.target) / (num(T.yuranStandard) || 60)),
    bawahPM: rows.filter(function (r) { return r.jalan && r.hasil < r.kos; }).length,
    lewat: rows.filter(function (r) { return r.lewat; }).length
  };
}

/* ---------- shell / nav ---------- */
var MNAV_UTAMA = ['dashboard', 'kutipan', 'pelajar', 'guru'];
function navBadge(k) { return k === 'daftar' ? nDaftarBaru() : k === 'masjid' ? nSewaBelum() : 0; }
function navHtml(mobile) {
  var h = NAV.filter(function (n) { return !mobile || MNAV_UTAMA.indexOf(n.k) > -1; })
    .map(function (n) {
      var on = ' class="' + (S.view === n.k ? 'on' : '') + (n.spec ? ' spec' : '') + '"';
      var dis = n.f ? ' disabled title="Akan datang dalam Fasa ' + n.f + '"' : '';
      var nb = navBadge(n.k);
      return '<button data-nav="' + n.k + '"' + on + dis + '>' + ICON[n.i] + '<span>' +
        (mobile ? n.t.split(' ')[n.k === 'pelajar' ? 1 : 0] : n.t) + '</span>' +
        (n.f && !mobile ? '<span class="soon">F' + n.f + '</span>' : '') +
        (nb && !mobile ? '<span class="nb">' + nb + '</span>' : '') + '</button>';
    }).join('');
  if (mobile) {
    var lain = NAV.filter(function (n) { return MNAV_UTAMA.indexOf(n.k) < 0; });
    var nbL = lain.reduce(function (a, n) { return a + (navBadge(n.k) || 0); }, 0);
    var onL = lain.some(function (n) { return n.k === S.view; });
    var cur = onL ? NAV.filter(function (n) { return n.k === S.view; })[0] : null;
    h += '<button data-nav="__lagi"' + (onL ? ' class="on"' : '') + '>' + ICON.lagi + '<span>' + (cur ? esc(cur.t.split(' ')[0]) : 'Lagi') + '</span>' +
      (nbL ? '<span class="mnav-nb">' + nbL + '</span>' : '') + '</button>';
  }
  return h;
}
function bukaLagi() {
  $('#overlay').innerHTML = '<div class="scrim" data-close></div><div class="mnav-sheet"><div class="mnav-h"><b>Semua menu</b><button class="x-btn" data-close>×</button></div><div class="mnav-g">' +
    NAV.map(function (n) {
      var nb = navBadge(n.k);
      return '<button data-nav="' + n.k + '" class="' + (S.view === n.k ? 'on' : '') + (n.spec ? ' spec' : '') + '"' + (n.f ? ' disabled' : '') + '>' + ICON[n.i] +
        '<span>' + esc(n.t) + '</span>' + (nb ? '<i>' + nb + '</i>' : '') + '</button>';
    }).join('') + '</div></div>';
}

function render(kekal) {
  $('#nav').innerHTML = navHtml(false);
  $('#bnav').innerHTML = navHtml(true);
  if (S.view === 'pelajar') renderPelajar();
  else if (S.view === 'pipeline') renderPipeline();
  else if (S.view === 'profil') renderProfil();
  else if (S.view === 'guru') renderGuru();
  else if (S.view === 'kutipan') renderKutipan();
  else if (S.view === 'kalendar') renderKalendar();
  else if (S.view === 'laporan') renderLaporan();
  else if (S.view === 'masjid') renderMasjid();
  else if (S.view === 'kehadiran') renderKehadiran();
  else if (S.view === 'peta') renderPeta();
  else if (S.view === 'daftar') renderDaftar();
  else renderDashboard();
  if (!kekal) window.scrollTo(0, 0);
}

function monthSelect() {
  return '<select class="sel" data-bulan>' + S.D.bulanList.map(function (b) {
    return '<option value="' + esc(b) + '"' + (b === S.bulan ? ' selected' : '') + '>' + esc(label(b)) +
      (b === bulanIni() ? ' (bulan ini)' : '') + '</option>';
  }).join('') + '</select>';
}

function eyebrow() {
  var t = today();
  return HARI[t.getDay()] + ', ' + fmt(t) + ' · Data dimuat ' + esc((S.D.dijana || '').slice(11, 16));
}

/* ================================================================
   DASHBOARD
   ================================================================ */
function renderDashboard() {
  var D = S.D, T = D.tetapan, k = kira(), bl = label(S.bulan);

  var kpi = function (l, v, s, cls) {
    return '<div class="card kpi"><div class="l">' + l + '</div><div class="v ' + (cls || '') + '">' + v +
      '</div><div class="s">' + s + '</div></div>';
  };
  var pkCls = k.pk == null ? '' : (k.pk >= k.pm ? 'pos' : 'neg');

  var h = '';
  h += '<div class="top"><div><div class="eyebrow">' + eyebrow() + '</div><h1>Dashboard <em>HYB</em></h1></div>' +
    '<div class="top-r">' + monthSelect() +
    '<button class="btn" data-act="salin">' + ICON.copy + 'Salin ringkasan</button>' +
    '<button class="btn" data-act="muat">' + ICON.refresh + 'Muat semula</button></div></div>';

  // KPI
  h += '<div class="grid kpis">' +
    kpi('Pelajar aktif', k.tot.aktif, 'di ' + D.tempat.filter(function (t) { return t.status !== 'Tutup'; }).length + ' tempat' +
      (k.tot.lead + k.tot.daftar ? ' · ' + (k.tot.lead + k.tot.daftar) + ' lead/daftar' : '')) +
    kpi('Kelas berjalan', k.kelasJalan, k.recruit + ' dalam recruitment · purata ' + k.purata.toFixed(1)) +
    kpi('Hasil potensi', rm(k.hasil), 'kos ' + rm(k.kos) + ' · untung ' + rm(k.untungPotensi)) +
    kpi('Kutipan ' + esc(bl), rm(k.kutipan), k.tot.dibayar + ' pelajar dah bayar' + (k.tajaan ? ' · tajaan ' + rm(k.tajaan) : '') + (k.daftar ? ' · pendaftaran ' + rm(k.daftar) : '')) +
    kpi('% kutipan', pct(k.pk),
      '<div class="bar" style="margin:6px 0 4px"><i class="' + (pkCls === 'pos' ? 'g' : 'r') + '" style="width:' +
      Math.min(100, (k.pk || 0) * 100) + '%"></i><span class="mk" style="left:' + Math.min(100, (k.pm || 0) * 100) +
      '%"></span></div>Pulang modal: ' + pct(k.pm), pkCls) +
    kpi('Untung sebenar', rm(k.untungSebenar), 'kutipan tolak kos tetap', k.untungSebenar < 0 ? 'neg' : 'pos') +
    '</div>';

  // Baris 2: tindakan + (rutin, kelas minggu ini)
  h += '<div class="grid two">';
  h += '<div class="stack">' + cardTindakan(k) + cardTarget(k) + '</div>';
  h += '<div class="stack">' + cardRutin(k) + cardMinggu() + '</div>';
  h += '</div>';

  // Prestasi setiap tempat
  h += cardTempat(k);

  // Baris bawah
  h += '<div class="grid three" style="margin-top:14px">' + cardPipeline() + cardSemakData(k) + cardSemakAngka(k) + '</div>';

  $('#view').innerHTML = h;
}

function cardTindakan(k) {
  var now = today(), items = [], T = S.D.tetapan;
  var lepas7 = isBulanIni() && now.getDate() >= 11; // dah masuk fasa telefon (11hb)
  k.rows.forEach(function (r) {
    var t = r.t;
    if (r.lewat) items.push({ s: 0, dot: 'r', t: t.tindakan || 'Tindakan belum diisi', d: t.nama + ' · ' + t.id,
      x: chip('LEWAT ' + hariBeza(now, r.tt) + ' hari', 'c-r') });
    else if (r.tt && t.status !== 'Tutup' && hariBeza(r.tt, now) <= 7) items.push({ s: 2, dot: 'y', t: t.tindakan || 'Tindakan', d: t.nama + ' · ' + fmt(r.tt),
      x: chip(hariBeza(r.tt, now) === 0 ? 'Hari ini' : hariBeza(r.tt, now) + ' hari lagi', 'c-y') });
    var tunggak = r.belum + r.tertunggak;
    if (tunggak > 0) items.push({ s: lepas7 ? 1 : 3, dot: lepas7 ? 'r' : 'y',
      t: tunggak + ' ibu bapa belum bayar yuran ' + label(S.bulan), d: t.nama + ' · ' + r.dibayar + '/' + r.perlu + ' dah bayar' + (lepas7 ? ' · dah masuk fasa telefon' : ''),
      x: '<button class="link" data-goto-pelajar="' + esc(t.id) + '" data-yuran="belum">Lihat senarai</button>' });
    if (r.rugi) items.push({ s: 1, dot: 'r', t: 'Hasil potensi bawah kos tetap', d: t.nama + ' · ' + rm(r.hasil) + ' vs ' + rm(r.kos), x: chip('RUGI', 'c-r') });
    if (r.jalan && !t.guru) items.push({ s: 2, dot: 'y', t: 'Guru belum direkod', d: t.nama + ' · ' + t.id, x: '' });
    if (r.aktif > num(T.kapasiti)) items.push({ s: 4, dot: 'b', t: 'Melebihi kapasiti (' + r.aktif + '/' + T.kapasiti + ')',
      d: t.nama + ' · pertimbang buka kelas kedua', x: '' });
    if (t.status === 'Recruitment') {
      var kurang = num(T.minBuka) - r.aktif;
      items.push({ s: 4, dot: kurang > 0 ? 'b' : 'g', t: kurang > 0 ? 'Perlu ' + kurang + ' lagi pendaftaran untuk buka kelas' : 'Cukup ' + r.aktif + ' pendaftaran, sedia buka kelas',
        d: t.nama + ' · ' + r.aktif + '/' + T.minBuka + ' minimum' + (t.guru ? '' : ' · guru belum ada'), x: '' });
    }
    if (r.jalan && isBulanIni() && now.getDate() >= 15 && r.kutipan < r.kos)
      items.push({ s: 2, dot: 'y', t: 'Kutipan belum tutup kos', d: t.nama + ' · ' + rm(r.kutipan) + ' / ' + rm(r.kos), x: '' });
  });
  itemLaporanLewat().forEach(function (i) { items.push(i); });
  itemSewa().forEach(function (i) { items.push(i); });
  itemDaftarBaru().forEach(function (i) { items.push(i); });
  if (k.tot.kosong) items.push({ s: 3, dot: 'y', t: k.tot.kosong + ' pelajar aktif tiada status yuran ' + label(S.bulan),
    d: 'Isi status dalam tab Pelajar', x: '<button class="link" data-goto-pelajar="" data-yuran="(kosong)">Lihat</button>' });
  items.sort(function (a, b) { return a.s - b.s; });

  var h = '<div class="card"><div class="card-h"><h3>Tindakan perlu dibuat</h3><span class="sub">' + items.length + ' perkara</span></div><div class="card-b">';
  if (!items.length) h += '<div class="empty">Tiada tindakan tertunggak. Bagus.</div>';
  else h += '<ul class="todo">' + items.slice(0, 12).map(function (i) {
    return '<li><span class="dot ' + i.dot + '"></span><div><div class="t">' + esc(i.t) + '</div><div class="d">' + esc(i.d) +
      '</div></div><div class="x">' + i.x + '</div></li>';
  }).join('') + '</ul>' + (items.length > 12 ? '<div class="empty">+' + (items.length - 12) + ' lagi</div>' : '');
  return h + '</div></div>';
}

function cardTarget(k) {
  var T = S.D.tetapan;
  var row = function (l, v, p, cls) {
    return '<div style="margin-top:10px"><div style="display:flex;font-size:12.5px;margin-bottom:5px"><span>' + l +
      '</span><b style="margin-left:auto">' + v + ' <span style="color:var(--mute);font-weight:500">(' + pct(p) + ')</span></b></div>' +
      '<div class="bar"><i class="' + cls + '" style="width:' + Math.min(100, p * 100) + '%"></i></div></div>';
  };
  return '<div class="card"><div class="card-h"><h3>Ke arah target ' + rm(num(T.target)) + ' sebulan</h3></div><div class="card-b">' +
    row('Hasil potensi (jika semua bayar)', rm(k.hasil), k.pPotensiTarget, '') +
    row('Kutipan sebenar ' + label(S.bulan), rm(k.kutipan), k.pTarget, 'y') +
    row('Pelajar aktif berbanding ' + k.perluTarget + ' yang diperlukan', k.tot.aktif + ' pelajar', k.tot.aktif / k.perluTarget, 'g') +
    '<div class="hint">Dengan ' + k.kelasJalan + ' kelas berjalan dan sasaran ' + T.sasaran + ' pelajar setiap tempat, HYB perlu kira-kira <b>' +
    Math.ceil(k.perluTarget / (num(T.sasaran) || 20)) + ' tempat</b> untuk capai target.</div></div></div>';
}

function cardRutin() {
  var now = today(), cur = isBulanIni(), d = now.getDate();
  var next = null;
  var h = '<div class="card"><div class="card-h"><h3>Rutin kutipan ' + esc(label(S.bulan)) + '</h3></div><div class="card-b"><div class="rutin">';
  RUTIN.forEach(function (r) {
    var st = '';
    if (cur) { if (d > r.a) st = 'done'; else if (d >= r.h) st = 'now'; }
    if (cur && !next && d <= r.a) next = r;
    h += '<div class="rs ' + st + '"><div class="n">' + r.h + '</div><b>' + r.t + '</b>' + r.h + (r.h === 3 || r.h === 11 ? '-' + r.a : '') + 'hb</div>';
  });
  h += '</div>';
  if (cur && next) {
    var gap = next.h - d;
    h += '<div class="hint"><b>' + (gap <= 0 ? 'Hari ini (' + d + 'hb)' : gap + ' hari lagi (' + next.h + 'hb)') + ':</b> ' + esc(next.d) + '</div>';
  } else if (cur) {
    h += '<div class="hint">Rutin bulan ini dah habis. Semak senarai tertunggak.</div>';
  } else {
    h += '<div class="hint">Anda sedang lihat bulan lain. Rutin ditanda ikut bulan semasa sahaja.</div>';
  }
  return h + '</div></div>';
}

function cardMinggu() {
  var now = today(), list = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    var hn = HARI[d.getDay()];
    S.D.tempat.forEach(function (t) {
      if (t.status === 'Tutup') return;
      var hm = String(t.hariMasa || '');
      if (new RegExp('\\b' + hn + '\\b', 'i').test(hm)) list.push({ d: d, t: t, masa: hm.replace(new RegExp(hn, 'i'), '').trim() });
    });
  }
  var lap = {};
  (S.D.laporan || []).forEach(function (l) { lap[l.tempatId + '|' + fmtV(l.tarikh)] = l; });
  var aktif = {};
  S.D.pelajar.forEach(function (p) { if (p.status === 'Aktif') aktif[p.tempatId] = (aktif[p.tempatId] || 0) + 1; });
  var tanpa = S.D.tempat.filter(function (t) { return JALAN.indexOf(t.status) > -1 && !t.hariMasa; });

  var h = '<div class="card"><div class="card-h"><h3>Kelas 7 hari akan datang</h3><span class="sub r">' + list.length + ' sesi</span></div><div class="card-b">';
  if (!list.length) h += '<div class="empty">Tiada kelas dijadualkan.</div>';
  h += '<ul class="wk">' + list.map(function (x) {
    var isT = +x.d === +now;
    return '<li class="click" data-profil="' + esc(x.t.id) + '"><div class="dbox' + (isT ? ' today' : '') + '"><b>' + x.d.getDate() + '</b><span>' + HARI[x.d.getDay()].slice(0, 3) + '</span></div>' +
      '<div style="min-width:0"><div class="nm">' + esc(x.t.nama) + '</div><div class="m" style="font-size:12px;color:var(--mute)">' +
      esc(cap(x.masa) || 'Masa belum diisi') + ' · ' + esc(x.t.guru || 'guru belum direkod') + '</div></div>' +
      '<div style="margin-left:auto;text-align:right">' + (x.t.status === 'Recruitment' ? chip('Recruitment') : '<span class="m" style="font-size:12px;color:var(--mute)">' + (aktif[x.t.id] || 0) + ' pelajar</span>') + '</div></li>';
  }).join('') + '</ul>';
  if (tanpa.length) h += '<div class="hint">' + tanpa.length + ' kelas berjalan belum ada hari & masa dalam tab Tempat.</div>';
  return h + '</div></div>';
}

function cardTempat(k) {
  var T = S.D.tetapan, rows = k.rows.slice().sort(function (a, b) {
    var o = S.D.senarai.statusTempat || [];
    var x = o.indexOf(b.t.status) - o.indexOf(a.t.status);
    return x || (a.id < b.id ? -1 : 1);
  });
  var h = '<div class="card"><div class="card-h"><h3>Prestasi setiap tempat</h3><span class="sub">' + esc(label(S.bulan)) +
    ' · kos tetap ' + rm(k.kosSetiap) + ' sebulan bagi kelas berjalan</span></div><div class="tw"><table><thead><tr>' +
    '<th>Tempat</th><th>Status</th><th>Guru / hari</th><th>Pelajar / ' + T.kapasiti + '</th><th class="n">Yuran</th>' +
    '<th class="n">Hasil potensi</th><th class="n">Kos</th><th class="n">Untung potensi</th><th class="n">Dah bayar</th>' +
    '<th class="n">% kutipan</th><th class="n">Kutipan</th></tr></thead><tbody>';
  rows.forEach(function (r) {
    var t = r.t, capCls = r.kap > 1 ? 'r' : (r.aktif < num(T.pulangModal) ? 'y' : 'g');
    var pkChip = r.pk == null ? (r.ditaja ? chip('Ditaja') : '<span class="m">–</span>')
      : (!r.jalan ? chip(pct(r.pk), 'c-k') : chip(pct(r.pk), r.pk >= (r.hasil ? r.kos / r.hasil : 0) ? 'c-g' : (r.pk >= 0.25 ? 'c-y' : 'c-r')));
    h += '<tr><td><button class="nm-btn" data-profil="' + esc(t.id) + '">' + esc(t.nama) + '</button>' +
      '<div class="m">' + esc(t.id) + (t.kawasan ? ' · ' + esc(t.kawasan) : '') + '</div></td>' +
      '<td>' + chip(t.status) + (r.lewat ? ' ' + chip('LEWAT', 'c-r') : '') + (r.rugi ? ' ' + chip('RUGI', 'c-r') : '') + '</td>' +
      '<td>' + (t.guru ? esc(t.guru) : '<span class="m">belum ada</span>') + '<div class="m">' + esc(t.hariMasa || '–') + '</div></td>' +
      '<td><div class="cap"><div class="bar"><i class="' + capCls + '" style="width:' + Math.min(100, r.kap * 100) + '%"></i></div><span>' + r.aktif + '</span></div></td>' +
      '<td class="n">' + rm(r.yuran) + '</td><td class="n">' + rm(r.hasil) + '</td><td class="n">' + (r.kos ? rm(r.kos) : '–') + '</td>' +
      '<td class="n' + (r.untung < 0 ? ' neg' : '') + '">' + rm(r.untung) + '</td>' +
      '<td class="n">' + (r.perlu > 0 ? r.dibayar + '/' + r.perlu : '–') + '</td><td class="n">' + pkChip + '</td>' +
      '<td class="n">' + (r.kutipan ? rm(r.kutipan) : '–') + '</td></tr>';
  });
  h += '</tbody><tfoot><tr><td>Jumlah</td><td>' + k.kelasJalan + ' berjalan</td><td></td><td class="n" style="text-align:left">' + k.tot.aktif + ' pelajar</td><td></td>' +
    '<td class="n">' + rm(k.hasil) + '</td><td class="n">' + rm(k.kos) + '</td><td class="n">' + rm(k.untungPotensi) + '</td>' +
    '<td class="n">' + k.tot.dibayar + '/' + k.perluBayar + '</td><td class="n">' + pct(k.pk) + '</td><td class="n">' + rm(k.kutipan) + '</td></tr></tfoot></table></div></div>';
  return h;
}

function cardPipeline() {
  var st = S.D.senarai.statusTempat || [], c = {};
  S.D.tempat.forEach(function (t) { c[t.status] = (c[t.status] || 0) + 1; });
  return '<div class="card"><div class="card-h"><h3>Pipeline tempat</h3><span class="sub r">' + S.D.tempat.length + ' ID tempat</span></div><div class="card-b"><div class="pipe">' +
    st.map(function (s) { return '<div class="' + (c[s] ? '' : 'z') + '"><b>' + (c[s] || 0) + '</b><span>' + esc(s) + '</span></div>'; }).join('') +
    '</div><div class="hint">Kanban penuh (seret kad untuk tukar status) masuk Fasa 2.</div></div></div>';
}

function cardSemakData(k) {
  var D = S.D, out = [];
  var ids = {}, dup = [];
  D.pelajar.forEach(function (p) { if (p.id) { if (ids[p.id]) dup.push(p.id); ids[p.id] = 1; } });
  var tanpaTel = D.preview ? null : D.pelajar.filter(function (p) { return p.status === 'Aktif' && !p.tel; }).length;
  var berhentiTanpa = D.pelajar.filter(function (p) { return p.status === 'Berhenti' && (!p.tarikhBerhenti || !p.sebabBerhenti); }).length;
  var recAktif = D.pelajar.filter(function (p) { var t = TMAP[p.tempatId]; return p.status === 'Aktif' && t && JALAN.indexOf(t.status) < 0; }).length;
  var tanpaSumber = D.pelajar.filter(function (p) { return p.status !== 'Lead' && !p.sumber; }).length;
  var tanpaDaftar = D.pelajar.filter(function (p) { return p.status === 'Aktif' && !p.tarikhDaftar; }).length;
  var add = function (bad, warn, t, v) { out.push({ c: bad ? 'no' : (warn ? 'wn' : 'ok'), i: bad ? '✕' : (warn ? '!' : '✓'), t: t, v: v }); };
  add(dup.length, 0, 'ID pelajar pendua', dup.length ? dup.join(', ') : 'tiada');
  add(k.tot.tanpaTempat, 0, 'Pelajar aktif dengan ID tempat tak wujud', k.tot.tanpaTempat);
  add(0, k.tot.kosong, 'Pelajar aktif tanpa status yuran ' + label(S.bulan), k.tot.kosong);
  if (tanpaTel != null) add(0, tanpaTel, 'Pelajar aktif tanpa no. tel ibu bapa', tanpaTel);
  add(0, berhentiTanpa, 'Berhenti tanpa tarikh atau sebab', berhentiTanpa);
  add(0, tanpaDaftar, 'Pelajar aktif tanpa tarikh daftar', tanpaDaftar);
  add(0, tanpaSumber > D.pelajar.length / 2 ? 1 : 0, 'Sumber pelajar kosong', tanpaSumber + ' pelajar');
  add(0, recAktif, 'Pelajar "Aktif" di tempat belum berjalan', recAktif);
  var nota = recAktif ? '<div class="hint">' + recAktif + ' pelajar di tempat Recruitment berstatus Aktif dan Belum bayar. Mereka masuk dalam pembahagi % kutipan, jadi % kutipan nampak lebih rendah dari sebenar. Pertimbang guna status Daftar sehingga kelas mula.</div>' : '';
  return '<div class="card"><div class="card-h"><h3>Semakan data</h3><span class="sub r">kualiti Sheet</span></div><div class="card-b"><ul class="chk">' +
    out.map(function (o) { return '<li><span class="' + o.c + '">' + o.i + '</span><span>' + esc(o.t) + '</span><span class="v">' + esc(o.v) + '</span></li>'; }).join('') +
    '</ul>' + nota + '</div></div>';
}

function cardSemakAngka(k) {
  var D = S.D, R = D.ringkasan || [];
  var h = '<div class="card"><div class="card-h"><h3>Semak angka vs tab Ringkasan</h3></div><div class="card-b">';
  if (!R.length) return h + '<div class="empty">Tab Ringkasan tiada atau tiada akses.</div></div></div>';
  if (D.bulanDipantau !== S.bulan) {
    return h + '<div class="hint">Tab Ringkasan sedang pantau <b>' + esc(label(D.bulanDipantau)) + '</b>. Tukar bulan ke ' +
      esc(label(D.bulanDipantau)) + ' untuk semak, atau tukar sel B3 dalam Sheet.</div></div></div>';
  }
  var kKadar = k.rows.reduce(function (a, r) { return a + r.kutipanKadar; }, 0);
  var M = {
    'Tempat dengan kelas berjalan': k.kelasJalan, 'Pelajar aktif': k.tot.aktif, 'Purata pelajar setiap tempat': k.purata,
    'Hasil potensi (RM)': k.hasil, 'Kos tetap (RM)': k.kos, 'Untung potensi (RM)': k.untungPotensi,
    // Sheet kira kutipan = bilangan Dibayar × yuran tempat, jadi banding dengan kiraan yang sama
    'Pelajar dah bayar': k.tot.dibayar, 'Pelajar tertunggak': k.tot.tertunggak, 'Kutipan sebenar (RM)': kKadar,
    '% kutipan': k.pk, '% kutipan untuk pulang modal': k.pm, 'Untung sebenar (RM)': kKadar - k.kos,
    'Target hasil sebulan (RM)': num(D.tetapan.target), '% capai target': num(D.tetapan.target) ? kKadar / num(D.tetapan.target) : 0,
    'Pelajar aktif diperlukan untuk target': k.perluTarget, 'Tempat di bawah titik pulang modal': k.bawahPM,
    'Tempat dengan tindakan lewat': k.lewat, 'Pelajar berhenti (jumlah)': k.tot.berhenti,
    'Pelajar ditaja / dikecualikan': k.tot.ditaja + k.tot.kecuali
  };
  var ok = 0, bad = 0, li = '';
  R.forEach(function (r) {
    if (!(r.metrik in M)) return;
    var a = M[r.metrik], b = num(r.nilai), isP = r.metrik.charAt(0) === '%';
    var same = isP ? Math.round((a || 0) * 100) === Math.round(b * 100) : Math.abs((a || 0) - b) < 0.06;
    same ? ok++ : bad++;
    var appV = isP ? pct(a) : (/\(RM\)/.test(r.metrik) ? rm(a) : (Math.round(a * 10) / 10));
    li += '<li><span class="' + (same ? 'ok' : 'no') + '">' + (same ? '✓' : '✕') + '</span><span>' + esc(r.metrik) + '</span><span class="v">' +
      (same ? esc(r.papar) : 'App ' + esc(appV) + ' · Sheet ' + esc(r.papar)) + '</span></li>';
  });
  // semakan setiap tempat vs lajur formula O-U
  var tb = [];
  k.rows.forEach(function (r) {
    var s = r.t.sheet || {};
    [['aktif', 'Pelajar aktif'], ['hasil', 'Hasil'], ['kos', 'Kos'], ['untung', 'Untung'], ['dibayar', 'Dibayar'], ['kutipan', 'Kutipan']].forEach(function (f) {
      var av = f[0] === 'kutipan' ? r.kutipanKadar : r[f[0]]; // Sheet lajur U = Dibayar × yuran tempat (tanpa tajaan/pendaftaran/amaun lain)
      if (Math.abs(num(s[f[0]]) - av) > 0.5) tb.push(r.id + ' ' + f[1] + ': app ' + av + ', Sheet ' + (s[f[0]] === '' ? 'kosong' : s[f[0]]));
    });
  });
  h += '<div style="font-size:13px;margin-bottom:8px">' + (bad ? chip(bad + ' tak sama', 'c-r') + ' ' : '') + chip(ok + ' sama', 'c-g') +
    ' ' + (tb.length ? chip(tb.length + ' beza tab Tempat', 'c-r') : chip('Tab Tempat O-U sama', 'c-g')) + '</div>';
  h += '<ul class="chk" style="max-height:290px;overflow:auto">' + li + '</ul>';
  if (tb.length) h += '<div class="hint">' + tb.map(esc).join('<br>') + '</div>';
  var lain = D.pelajar.filter(function (p) { return p.status === 'Aktif' && p.yuran[S.bulan] === 'Dibayar' && TMAP[p.tempatId] && amaunLain(p, S.bulan); });
  if (lain.length) h += '<div class="hint" style="margin-top:8px">' + lain.length + ' bayaran ' + esc(label(S.bulan)) + ' dengan amaun lain dari yuran tempat (' +
    lain.slice(0, 8).map(function (p) { return esc(p.id + amaunLain(p, S.bulan).replace(' · ', ' ')); }).join(', ') + (lain.length > 8 ? '…' : '') +
    '). Dashboard kira kutipan ikut amaun sebenar (' + rm(k.kutipanYuran) + '), Sheet kira ikut kadar yuran (' + rm(kKadar) + '). Beza ini dijangka.</div>';
  return h + '</div></div>';
}

function teksRingkasan() {
  var k = kira(), T = S.D.tetapan, bl = label(S.bulan);
  var L = [];
  L.push('*Ringkasan HYB, ' + bl + '* (' + fmt(today()) + ')');
  L.push('');
  L.push('Pelajar aktif: ' + k.tot.aktif + ' (' + k.kelasJalan + ' kelas berjalan, ' + k.recruit + ' recruitment)');
  L.push('Hasil potensi: ' + rm(k.hasil) + ' | Kos tetap: ' + rm(k.kos));
  L.push('Kutipan setakat ini: ' + rm(k.kutipan) + ' (' + k.tot.dibayar + '/' + k.perluBayar + ' pelajar, ' + pct(k.pk) + ')');
  L.push('Pulang modal perlu: ' + pct(k.pm) + ' kutipan');
  L.push('Untung sebenar: ' + rm(k.untungSebenar));
  L.push('Target ' + rm(num(T.target)) + ': ' + pct(k.pTarget) + ' dicapai');
  L.push('');
  L.push('*Belum bayar ikut tempat:*');
  k.rows.filter(function (r) { return r.belum + r.tertunggak > 0; }).forEach(function (r) {
    L.push('- ' + r.t.nama + ': ' + (r.belum + r.tertunggak) + ' (' + r.dibayar + '/' + r.perlu + ' dah bayar)');
  });
  return L.join('\n');
}

/* ================================================================
   SENARAI PELAJAR
   ================================================================ */
function tapis() {
  var f = S.f, q = f.q.trim().toLowerCase(), b = S.bulan;
  return S.D.pelajar.filter(function (p) {
    if (f.tab !== 'Semua' && p.status !== f.tab) return false;
    if (f.tempat && p.tempatId !== f.tempat) return false;
    if (f.sumber && (p.sumber || '(kosong)') !== f.sumber) return false;
    if (f.yuran) {
      var y = p.yuran[b] || '';
      if (f.yuran === 'belum') { if (y !== 'Belum bayar' && y !== 'Tertunggak') return false; }
      else if (f.yuran === '(kosong)') { if (y) return false; }
      else if (y !== f.yuran) return false;
    }
    if (f.umur) {
      var u = num(p.umur);
      if (f.umur === '<7' && !(u < 7)) return false;
      if (f.umur === '7-9' && !(u >= 7 && u <= 9)) return false;
      if (f.umur === '10-12' && !(u >= 10 && u <= 12)) return false;
      if (f.umur === '>12' && !(u > 12)) return false;
    }
    if (q) {
      var hay = [p.id, p.nama, p.ibuBapa, p.tel, p.tempatNama, p.tempatId].join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  });
}

function susun(list) {
  var k = S.sort.k, d = S.sort.d, b = S.bulan;
  var val = function (p) {
    if (k === 'yuran') return p.yuran[b] || 'zz';
    if (k === 'umur') return num(p.umur);
    if (k === 'daftar') return p.tarikhDaftar || '9999';
    return String(p[k] || '').toLowerCase();
  };
  return list.slice().sort(function (a, c) { var x = val(a), y = val(c); return (x < y ? -1 : x > y ? 1 : 0) * d; });
}

function renderPelajar() {
  var D = S.D, f = S.f;
  var cnt = { Semua: D.pelajar.length };
  D.pelajar.forEach(function (p) { cnt[p.status] = (cnt[p.status] || 0) + 1; });
  var tabs = ['Aktif', 'Lead', 'Daftar', 'Berhenti', 'Semua'];
  var sumber = {};
  D.pelajar.forEach(function (p) { sumber[p.sumber || '(kosong)'] = 1; });

  var h = '<div class="top"><div><div class="eyebrow">' + eyebrow() + '</div><h1>Senarai <em>Pelajar</em></h1></div>' +
    '<div class="top-r">' + monthSelect() +
    (bolehTulis() ? '<button class="btn pri" data-act="pelajar-baru">' + ICON.plus + 'Pelajar baharu</button>' : '') +
    '<button class="btn" data-act="csv">' + ICON.dl + 'Export CSV</button>' +
    '<button class="btn" data-act="muat">' + ICON.refresh + 'Muat semula</button></div></div>';

  h += '<div class="card"><div class="filters"><div class="tabs">' + tabs.map(function (t) {
    return '<button data-tab="' + t + '"' + (f.tab === t ? ' class="on"' : '') + '>' + t + '<span class="c">' + (cnt[t] || 0) + '</span></button>';
  }).join('') + '</div><div class="grow"></div>' +
    '<input class="inp" id="q" placeholder="Cari nama, ID, ibu bapa, no. tel..." value="' + esc(f.q) + '"></div>';

  h += '<div class="filters">' +
    '<select class="sel" data-f="tempat"><option value="">Semua tempat</option>' + D.tempat.map(function (t) {
      return '<option value="' + esc(t.id) + '"' + (f.tempat === t.id ? ' selected' : '') + '>' + esc(t.id + ' · ' + t.nama) + '</option>';
    }).join('') + '</select>' +
    '<select class="sel" data-f="yuran"><option value="">Yuran ' + esc(label(S.bulan)) + ': semua</option>' +
    '<option value="belum"' + (f.yuran === 'belum' ? ' selected' : '') + '>Belum bayar + Tertunggak</option>' +
    (D.senarai.statusYuran || []).map(function (y) { return '<option' + (f.yuran === y ? ' selected' : '') + '>' + esc(y) + '</option>'; }).join('') +
    '<option value="(kosong)"' + (f.yuran === '(kosong)' ? ' selected' : '') + '>(kosong)</option></select>' +
    '<select class="sel" data-f="umur"><option value="">Semua umur</option>' + ['<7', '7-9', '10-12', '>12'].map(function (u) {
      return '<option value="' + u + '"' + (f.umur === u ? ' selected' : '') + '>' + esc(u) + ' tahun</option>';
    }).join('') + '</select>' +
    '<select class="sel" data-f="sumber"><option value="">Semua sumber</option>' + Object.keys(sumber).sort().map(function (s) {
      return '<option' + (f.sumber === s ? ' selected' : '') + '>' + esc(s) + '</option>';
    }).join('') + '</select>' +
    (f.tempat || f.yuran || f.umur || f.sumber || f.q ? '<button class="btn sm" data-act="reset">Kosongkan tapisan</button>' : '') +
    '</div><div id="plist"></div></div>';

  $('#view').innerHTML = h;
  renderPList();
}

function renderPList() {
  var list = susun(tapis()), b = S.bulan, bi = S.D.bulanList.indexOf(b), D = S.D;
  var c = { Dibayar: 0, 'Belum bayar': 0, Tertunggak: 0, Ditaja: 0, Dikecualikan: 0, '': 0 };
  list.forEach(function (p) { var y = p.yuran[b] || ''; c[y] = (c[y] || 0) + 1; });
  var belumList = list.filter(function (p) { var y = p.yuran[b]; return y === 'Belum bayar' || y === 'Tertunggak'; });

  var h = '<div class="summary"><span><b>' + list.length + '</b> pelajar</span>' +
    '<span>Dibayar <b>' + c.Dibayar + '</b></span><span>Belum bayar <b>' + c['Belum bayar'] + '</b></span>' +
    '<span>Tertunggak <b>' + c.Tertunggak + '</b></span><span>Ditaja <b>' + c.Ditaja + '</b></span>' +
    (c.Dikecualikan ? '<span>Dikecualikan <b>' + c.Dikecualikan + '</b></span>' : '') +
    (c[''] ? '<span>Kosong <b>' + c[''] + '</b></span>' : '') +
    (belumList.length ? '<span style="margin-left:auto"><button class="link" data-act="salin-belum">Salin senarai belum bayar (' + belumList.length + ')</button></span>' : '') +
    '</div>';

  var th = function (k, t, cls) {
    var ar = S.sort.k === k ? (S.sort.d > 0 ? ' ↑' : ' ↓') : '';
    return '<th class="s ' + (cls || '') + '" data-sort="' + k + '">' + t + ar + '</th>';
  };
  h += '<div class="tw ptable"><table><thead><tr>' + th('id', 'ID') + th('nama', 'Nama pelajar') + th('umur', 'Umur', 'n') +
    th('ibuBapa', 'Ibu / bapa') + th('tempatId', 'Tempat') + th('daftar', 'Daftar') + th('status', 'Status') +
    th('yuran', 'Yuran ' + esc(label(b))) + '<th>12 bulan</th><th></th></tr></thead><tbody>';
  if (!list.length) h += '<tr><td colspan="10" class="empty" style="text-align:center;padding:30px">Tiada pelajar ikut tapisan ini.</td></tr>';
  list.forEach(function (p) {
    var link = waLink(p.tel, (p.yuran[b] === 'Belum bayar' || p.yuran[b] === 'Tertunggak') ? msgPeringatan(p) : msgUmum(p));
    h += '<tr class="click" data-p="' + esc(p.id) + '"><td class="m" style="white-space:nowrap">' + esc(p.id) + '</td>' +
      '<td><span class="nm">' + esc(cap(p.nama)) + '</span>' + (p.catatan ? '<div class="m">' + esc(p.catatan) + '</div>' : '') + '</td>' +
      '<td class="n">' + esc(p.umur) + '</td>' +
      '<td>' + (p.ibuBapa ? esc(p.ibuBapa) : '<span class="m">' + (D.preview ? 'disembunyi' : '–') + '</span>') + '</td>' +
      '<td>' + esc(p.tempatId) + '<div class="m">' + esc(p.tempatNama) + '</div></td>' +
      '<td class="m">' + esc(fmtV(p.tarikhDaftar)) + '</td>' +
      '<td>' + chip(p.status) + '</td><td>' + (p.status === 'Aktif' ? chip(p.yuran[b]) + (bayarBoleh(p) ? ' <button class="btn sm bayar" data-act="bayar-pantas" data-id="' + esc(p.id) + '" title="Tanda Dibayar untuk ' + esc(label(b)) + '">✓ Bayar</button>' : '') : '<span class="m">–</span>') + '</td>' +
      '<td>' + strip(p, bi) + '</td>' +
      '<td>' + (link ? '<a class="btn sm wa" href="' + esc(link) + '" target="_blank" rel="noopener" data-stop>' + ICON.wa + 'WhatsApp</a>'
        : '<span class="btn sm wa" style="opacity:.45" title="' + (D.preview ? 'Nombor disembunyi dalam preview' : 'Tiada nombor') + '">' + ICON.wa + 'WhatsApp</span>') + '</td></tr>';
  });
  h += '</tbody></table></div>';

  h += '<div class="pcards">' + list.map(function (p) {
    var link = waLink(p.tel, (p.yuran[b] === 'Belum bayar' || p.yuran[b] === 'Tertunggak') ? msgPeringatan(p) : msgUmum(p));
    return '<div class="pc" data-p="' + esc(p.id) + '"><div style="min-width:0"><div class="nm">' + esc(cap(p.nama)) + '</div>' +
      '<div class="m" style="font-size:12px;color:var(--mute)">' + esc(p.id + ' · ' + p.umur + ' thn · ' + p.tempatId) + '</div>' +
      '<div style="margin-top:6px">' + strip(p, bi) + '</div></div><div class="x">' +
      (p.status === 'Aktif' ? chip(p.yuran[b]) : chip(p.status)) +
      (bayarBoleh(p) ? '<button class="btn sm bayar" data-act="bayar-pantas" data-id="' + esc(p.id) + '">✓ Bayar</button>' : '') +
      (link ? '<a class="btn sm wa" href="' + esc(link) + '" target="_blank" rel="noopener" data-stop>' + ICON.wa + '</a>' : '') + '</div></div>';
  }).join('') + '</div>';

  $('#plist').innerHTML = h;
}

function bayarBoleh(p) {
  var y = p.yuran[S.bulan] || '';
  return bolehTulis() && p.status === 'Aktif' && (y === 'Belum bayar' || y === 'Tertunggak');
}

function strip(p, bi) {
  return '<div class="months">' + S.D.bulanList.map(function (m, i) {
    var y = p.yuran[m] || '';
    return '<i class="' + (DOT[y] || '') + (i === bi ? ' cur' : '') + '" title="' + esc(label(m) + ': ' + (y || 'kosong')) + '"></i>';
  }).join('') + '</div>';
}

function bukaPelajar(id) {
  var p = S.D.pelajar.filter(function (x) { return x.id === id; })[0];
  if (!p) return;
  var t = TMAP[p.tempatId] || {}, D = S.D;
  var w1 = waLink(p.tel, msgPeringatan(p)), w2 = waLink(p.tel, msgUmum(p));
  var h = '<div class="scrim" data-close></div><div class="drawer"><div class="drawer-h"><div><div class="eyebrow">' + esc(p.id) + '</div><h2>' +
    esc(cap(p.nama)) + '</h2><div style="margin-top:6px">' + chip(p.status) + ' ' + (p.status === 'Aktif' ? chip(p.yuran[S.bulan]) : '') +
    '</div></div><button class="x-btn" data-close>×</button></div><div class="drawer-b">';
  h += '<dl class="kv"><dt>Umur</dt><dd>' + esc(p.umur || '–') + ' tahun</dd>' +
    '<dt>Tempat</dt><dd>' + esc(t.nama || p.tempatNama || '–') + '<div class="m" style="font-size:12px;color:var(--mute)">' + esc(p.tempatId + (t.hariMasa ? ' · ' + t.hariMasa : '') + (t.guru ? ' · ' + t.guru : '')) + '</div></dd>' +
    '<dt>Ibu / bapa</dt><dd>' + esc(p.ibuBapa || (D.preview ? 'disembunyi dalam preview' : '–')) + '</dd>' +
    '<dt>No. tel</dt><dd>' + esc(p.tel || (D.preview ? 'disembunyi dalam preview' : '–')) + '</dd>' +
    '<dt>Tarikh daftar</dt><dd>' + esc(fmtV(p.tarikhDaftar) || '–') + '</dd>' +
    '<dt>Sumber</dt><dd>' + esc(p.sumber || '–') + '</dd>' +
    (p.status === 'Berhenti' ? '<dt>Berhenti</dt><dd>' + esc(fmtV(p.tarikhBerhenti) || 'tarikh belum diisi') + '<div class="m" style="font-size:12px;color:var(--mute)">' + esc(p.sebabBerhenti || 'sebab belum diisi') + '</div></dd>' : '') +
    (p.catatan ? '<dt>Catatan</dt><dd>' + esc(p.catatan) + '</dd>' : '') + '</dl>';
  if (w1) h += '<div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn wa" href="' + esc(w1) + '" target="_blank" rel="noopener">' + ICON.wa + 'Peringatan yuran</a>' +
    '<a class="btn wa" href="' + esc(w2) + '" target="_blank" rel="noopener">' + ICON.wa + 'Mesej biasa</a></div>';
  h += '<div class="sec-h">Status yuran 12 bulan</div><div class="mgrid">' + D.bulanList.map(function (m) {
    return '<div><b>' + esc(label(m)) + '</b>' + (bolehTulis() && p.status === 'Aktif' ? '<button class="mbtn" data-yc="' + esc(p.id) + '" data-bln="' + esc(m) + '" title="Klik untuk tukar">' + chip(p.yuran[m]) + '</button>' : chip(p.yuran[m])) +
      (p.yuran[m] === 'Dibayar' ? (bolehTulis() ? '<button class="tb-btn' + (tarikhBayar(p.id, m) ? '' : ' tiada') + '" data-act="tb-edit" data-id="' + esc(p.id) + '" data-bln="' + esc(m) + '">' + (tarikhBayar(p.id, m) ? fmt(tarikh(tarikhBayar(p.id, m))) : 'isi tarikh') + esc(amaunLain(p, m)) + '</button>'
        : '<span class="m" style="font-size:11.5px">' + (tarikhBayar(p.id, m) ? fmt(tarikh(tarikhBayar(p.id, m))) : '') + '</span>') : '') + '</div>';
  }).join('') + '</div>';
  h += blokDaftar(p);
  h += blokKehadiran(p);
  if (bolehTulis() && p.status === 'Aktif') h += '<div class="sec-h">Tanda yuran ' + esc(label(S.bulan)) + '</div><div class="ybtns">' +
    (D.senarai.statusYuran || []).map(function (y) { var on = (p.yuran[S.bulan] || '') === y;
      return '<button class="btn sm' + (on ? ' on' : '') + '" data-act="drawer-yuran" data-id="' + esc(p.id) + '" data-ke="' + esc(y) + '"' + (on ? ' disabled' : '') + '><i class="yc ' + (KELAS_Y[y] || '') + '">' + (SINGKAT[y] || '·') + '</i>' + esc(y) + '</button>'; }).join('') + '</div>';
  if (bolehTulis()) h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn" data-act="edit-pelajar" data-id="' + esc(p.id) + '">' + ICON.edit + 'Edit pelajar</button>' +
    '<button class="btn" data-act="log-pelajar" data-id="' + esc(p.id) + '">' + ICON.plus + 'Tambah log</button></div>';
  var lg = (D.log || []).filter(function (l) { return l.ref === p.id; }).sort(function (a, b) { return a.tarikh < b.tarikh ? 1 : -1; });
  h += '<div class="sec-h">Log (' + lg.length + ')</div>' + (lg.length ? '<ul class="tl">' + lg.map(itemLog).join('') + '</ul>' : '<div class="empty">Belum ada log untuk pelajar ini.</div>');
  h += '</div></div>';
  $('#overlay').innerHTML = h;
}

/* ---------- modal / toast / export ---------- */
function modalTeks(tajuk, teks) {
  $('#overlay').innerHTML = '<div class="scrim" data-close></div><div class="modal"><h3>' + esc(tajuk) + '</h3>' +
    '<textarea id="mtxt" readonly>' + esc(teks) + '</textarea><div class="row"><button class="btn" data-close>Tutup</button>' +
    '<button class="btn pri" data-act="copy-modal">' + ICON.copy + 'Salin</button></div></div>';
  var ta = $('#mtxt'); ta.focus(); ta.select();
}
function salin() {
  var ta = $('#mtxt'); if (!ta) return;
  ta.select();
  var ok = false;
  try { ok = document.execCommand('copy'); } catch (e) {}
  if (!ok && navigator.clipboard) { navigator.clipboard.writeText(ta.value).then(function () { toast('Disalin'); }, function () { toast('Tekan Ctrl+C / tahan untuk salin'); }); return; }
  toast(ok ? 'Disalin. Tampal dalam WhatsApp.' : 'Tekan Ctrl+C / tahan untuk salin');
}
var tt;
function toast(m) { var e = $('#toast'); e.textContent = m; e.classList.add('on'); clearTimeout(tt); tt = setTimeout(function () { e.classList.remove('on'); }, 2200); }

function exportCsv() {
  // PDPA: CSV tidak mengandungi no. telefon ibu bapa.
  var list = susun(tapis()), b = S.bulan;
  var head = ['ID pelajar', 'Nama pelajar', 'Umur', 'Nama ibu / bapa', 'ID tempat', 'Nama tempat', 'Tarikh daftar', 'Sumber', 'Status', label(b)];
  var cell = function (v) {
    var s = String(v == null ? '' : v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // elak formula injection bila dibuka dalam Excel/Sheets
    return '"' + s.replace(/"/g, '""') + '"';
  };
  var rows = [head.map(cell).join(',')].concat(list.map(function (p) {
    return [p.id, cap(p.nama), p.umur, p.ibuBapa, p.tempatId, p.tempatNama, fmtV(p.tarikhDaftar), p.sumber, p.status, p.yuran[b] || ''].map(cell).join(',');
  }));
  var blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'pelajar-hyb-' + label(b).replace(/\s/g, '-').toLowerCase() + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  toast(list.length + ' pelajar diexport (tanpa no. telefon)');
}

function teksBelum() {
  var b = S.bulan, by = {};
  tapis().forEach(function (p) {
    var y = p.yuran[b];
    if (y !== 'Belum bayar' && y !== 'Tertunggak') return;
    (by[p.tempatNama || p.tempatId] = by[p.tempatNama || p.tempatId] || []).push(p);
  });
  var L = ['*Belum bayar yuran ' + label(b) + '* (' + fmt(today()) + ')'];
  Object.keys(by).forEach(function (t) {
    L.push(''); L.push('*' + t + '* (' + by[t].length + ')');
    by[t].forEach(function (p, i) { L.push((i + 1) + '. ' + cap(p.nama) + (p.yuran[b] === 'Tertunggak' ? ' (tertunggak)' : '')); });
  });
  return L.join('\n');
}

/* ================================================================
   FASA 2: tulis ke Sheet, Pipeline, Profil Tempat, borang
   ================================================================ */
var BOLEH_TULIS = ['Manager', 'Ketua', 'Staf'];
function bolehTulis() { return !!(S.D && BOLEH_TULIS.indexOf(S.D.user.peranan) > -1); }
function bolehLaporan(tid) {
  if (bolehTulis()) return true;
  return !!(S.D && S.D.user.peranan === 'Guru' && (S.D.user.tempat || []).indexOf(tid) > -1);
}
function isoHari(d) { d = d || today(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function uniq(a) { var o = {}; a.forEach(function (x) { if (x) o[x] = 1; }); return Object.keys(o).sort(); }

/* ---------- hantar ke server (atau simulasi dalam preview) ---------- */
function hantar(fn, payload, ok, gagal) {
  var err = function (m) { if (gagal) gagal(m); else toast(m); };
  if (window.google && google.script && google.script.run) {
    var r = google.script.run
      .withSuccessHandler(function (s) { var res = JSON.parse(s); siap(res.data, true); if (ok) ok(res); })
      .withFailureHandler(function (e) { var m = (e && e.message) || String(e);
        if (/HTTP 401|NetworkError|Authorization is required/i.test(m)) m = 'Login Google tamat atau browser ada lebih dari satu akaun Google. Muat semula halaman, atau buka CRM dalam Incognito / profil Chrome yang hanya ada akaun GNG. Perubahan tadi BELUM disimpan.';
        err(m); });
    if (fn === 'tukarStatusTempat') r.tukarStatusTempat(payload.id, payload.status, payload.statusLama);
    else if (fn === 'tukarStatusGuru') r.tukarStatusGuru(payload.id, payload.status, payload.statusLama);
    else if (fn === 'janaLinkGuru' || fn === 'batalLinkGuru') r[fn](payload.id);
    else r[fn](JSON.stringify(payload));
  } else {
    setTimeout(function () {
      try { var res = SIM[fn](payload); simSelarasBayaran(); siap(S.D, true); if (ok) ok(res); }
      catch (e) { err(e.message); }
    }, 300);
  }
}

/* Simulasi untuk preview sahaja: ubah data dalam browser, tiada apa ditulis ke Sheet. */
var SIM_AMAUN = {}, SIM_TB = '';
function simSelarasBayaran() {
  // Tiru selarasBayaran_ di Code.gs: banding status Dibayar dengan lejar
  var B = S.D.bayaran = (S.D.bayaran || []).slice(), net = {}, akhir = {}, d = new Date(), tbS = SIM_TB || KS.tarikh;
  var masa = tbS && tbS !== isoHari(today()) ? tbS + 'T12:00' : isoHari(today()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  B.forEach(function (x) { var k = x.pelajarId + '|' + x.bulan; net[k] = (net[k] || 0) + (x.amaun > 0 ? 1 : -1); if (x.amaun > 0) akhir[k] = x.amaun; });
  S.D.pelajar.forEach(function (p) {
    S.D.bulanList.forEach(function (b) {
      var k = p.id + '|' + b, st = p.yuran[b] || '', ada = (net[k] || 0) > 0;
      var y = num((TMAP[p.tempatId] || {}).yuran) || num(S.D.tetapan.yuranStandard);
      if (st === 'Dibayar' && !ada) B.push({ masa: masa, pelajarId: p.id, tempatId: p.tempatId, bulan: b, status: st, amaun: SIM_AMAUN[k] || y, oleh: S.D.user.nama, sumber: 'CRM' });
      else if (st !== 'Dibayar' && ada) B.push({ masa: masa, pelajarId: p.id, tempatId: p.tempatId, bulan: b, status: st || '(kosong)', amaun: -(akhir[k] || y), oleh: S.D.user.nama, sumber: 'CRM' });
    });
  });
  SIM_AMAUN = {}; SIM_TB = '';
}
function masaKini() { var d = new Date(); return isoHari(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function simLog(jenis, ref, teks, tindakan, tt) {
  S.D.log.push({ tarikh: masaKini(), jenis: jenis, ref: ref, interaksi: teks, oleh: S.D.user.nama, tindakan: tindakan || '', tarikhTindakan: tt || '' });
}
function simId(list, awal, dig) {
  var max = 0, re = new RegExp('^' + awal + '(\\d+)$');
  list.forEach(function (x) { var m = re.exec(x.id); if (m) max = Math.max(max, +m[1]); });
  var s = String(max + 1); while (s.length < dig) s = '0' + s;
  return awal + s;
}
var MEDAN_T = ['nama', 'kawasan', 'pic', 'telPic', 'guru', 'telGuru', 'hariMasa', 'tarikhMula', 'status', 'owner', 'tindakan', 'tarikhTindakan', 'catatan', 'kosKhas'];
var MEDAN_P = ['nama', 'umur', 'ibuBapa', 'tel', 'tempatId', 'tarikhDaftar', 'sumber', 'status', 'tarikhBerhenti', 'sebabBerhenti', 'catatan'];
function salinMedan(dst, src, keys) { keys.forEach(function (k) { dst[k] = src[k] == null ? '' : src[k]; }); return dst; }
var SIM = {
  simpanLokasi: function (p) {
    if (!TMAP[p.id]) throw new Error('Tempat ' + p.id + ' tidak wujud.');
    var lat = +p.lat, lng = +p.lng;
    if (!(lat > 0.5 && lat < 7.6 && lng > 99.5 && lng < 119.5)) throw new Error('Lokasi di luar Malaysia. Pin semula di peta.');
    S.D.lokasi = S.D.lokasi || {};
    var ada = !!S.D.lokasi[p.id];
    S.D.lokasi[p.id] = { lat: lat, lng: lng, sumber: p.sumber || 'Manual' };
    simLog('Tempat', p.id, (ada ? 'Lokasi dikemas kini' : 'Lokasi dipin') + ' di peta');
    return { ok: true, id: p.id, mesej: 'Lokasi ' + p.id + ' disimpan' };
  },
  buangLokasi: function (p) {
    if (S.D.lokasi) delete S.D.lokasi[p.id];
    simLog('Tempat', p.id, 'Pin lokasi dibuang dari peta');
    return { ok: true, id: p.id, mesej: 'Pin ' + p.id + ' dibuang' };
  },
  simpanTempat: function (p) {
    var t = p.id && TMAP[p.id];
    if (t) {
      var lama = t.status; salinMedan(t, p, MEDAN_T); t.yuran = +p.yuran;
      if (lama !== t.status) simLog('Tempat', t.id, 'Status: ' + lama + ' → ' + t.status);
      return { ok: true, id: t.id, mesej: t.id + ' dikemas kini' };
    }
    var id = simId(S.D.tempat, 'HYB-T', 2);
    S.D.tempat.push(salinMedan({ id: id, yuran: +p.yuran, sheet: {} }, p, MEDAN_T));
    simLog('Tempat', id, 'Tempat baharu ditambah (' + p.status + ')');
    return { ok: true, id: id, mesej: id + ' ditambah' };
  },
  tukarStatusTempat: function (p) {
    var t = TMAP[p.id]; t.status = p.status;
    simLog('Tempat', p.id, 'Status: ' + p.statusLama + ' → ' + p.status);
    return { ok: true, id: p.id, mesej: p.id + ' kini ' + p.status };
  },
  simpanPelajar: function (p) {
    var x = p.id && S.D.pelajar.filter(function (q) { return q.id === p.id; })[0], baru = !x;
    if (baru) { x = { id: simId(S.D.pelajar, 'HYB-P', 3), yuran: {} }; S.D.bulanList.forEach(function (b) { x.yuran[b] = ''; }); S.D.pelajar.push(x); }
    var lama = x.status;
    salinMedan(x, p, MEDAN_P);
    x.tempatNama = (TMAP[x.tempatId] || {}).nama || '';
    if (p.bulanYuran) x.yuran[p.bulanYuran] = p.statusYuran || '';
    if (baru) simLog('Pelajar', x.id, 'Pelajar baharu didaftar di ' + x.tempatId + ' (' + x.status + ')');
    else if (lama !== x.status) simLog('Pelajar', x.id, 'Status: ' + lama + ' → ' + x.status);
    return { ok: true, id: x.id, mesej: x.id + (baru ? ' ditambah' : ' dikemas kini') };
  },
  simpanLaporan: function (p) {
    S.D.laporan.push({ tarikh: p.tarikh, tempatId: p.tempatId, tempatNama: (TMAP[p.tempatId] || {}).nama, guru: p.guru, hadir: +p.hadir, topik: p.topik, isu: p.isu, oleh: S.D.user.nama });
    return { ok: true, id: p.tempatId, mesej: 'Laporan kelas disimpan' };
  },
  simpanGuru: function (p) {
    S.D.guru = S.D.guru || [];
    var g = p.id && S.D.guru.filter(function (x) { return x.id === p.id; })[0], baru = !g;
    if (baru) { g = { id: simId(S.D.guru, 'HYB-G', 2) }; S.D.guru.push(g); }
    var lama = g.status;
    ['nama', 'tel', 'emel', 'gelaran', 'kawasan', 'status', 'sumber', 'tarikhMohon', 'tarikhTemuduga', 'tarikhMula', 'kelayakan', 'catatan'].forEach(function (k) { g[k] = p[k] || ''; });
    simLog('Guru', g.id, baru ? 'Guru didaftar: ' + g.nama + ' (' + g.status + ')' : (lama !== g.status ? 'Status guru: ' + lama + ' → ' + g.status : 'Maklumat guru dikemas kini'));
    var m = g.id + (baru ? ' ditambah' : ' dikemas kini');
    if (p.tempatId && TMAP[p.tempatId]) { TMAP[p.tempatId].guru = g.nama; TMAP[p.tempatId].telGuru = g.tel; simLog('Guru', p.tempatId, g.nama + ' ditugaskan ke ' + p.tempatId); m += ', ditugaskan ke ' + p.tempatId; }
    return { ok: true, id: g.id, mesej: m };
  },
  kemaskiniYuran: function (p) {
    SIM_AMAUN = {}; SIM_TB = p.tarikhBayar || '';
    p.ubah.forEach(function (x) { var q = cariPelajar(x.id); if (q) q.yuran[p.bulan] = x.ke; if (x.ke === 'Dibayar' && x.amaun) SIM_AMAUN[x.id + '|' + p.bulan] = +x.amaun; });
    simLog('Pelajar', p.ubah.length === 1 ? p.ubah[0].id : '', 'Yuran ' + label(p.bulan) + ': ' + p.ubah.length + ' pelajar dikemas kini' + (p.sebab ? ' (' + p.sebab + ')' : ''));
    return { ok: true, mesej: p.ubah.length + ' status yuran ' + label(p.bulan) + ' dikemas kini' };
  },
  tukarTarikhBayar: function (p) {
    var B = S.D.bayaran = (S.D.bayaran || []).slice(), i, jumpa = -1;
    for (i = B.length - 1; i >= 0; i--) if (B[i].pelajarId === p.id && B[i].bulan === p.bulan && B[i].amaun > 0) { jumpa = i; break; }
    var q = cariPelajar(p.id);
    if (jumpa < 0) B.push({ masa: p.tarikh + 'T12:00', pelajarId: p.id, tempatId: q.tempatId, bulan: p.bulan, status: 'Dibayar', amaun: num((TMAP[q.tempatId] || {}).yuran) || num(S.D.tetapan.yuranStandard), oleh: S.D.user.nama, sumber: 'CRM (tarikh diisi)' });
    var lamaA = jumpa < 0 ? B[B.length - 1].amaun : B[jumpa].amaun, tukarA = p.amaun && +p.amaun !== lamaA;
    if (jumpa < 0) jumpa = B.length - 1;
    B[jumpa] = Object.assign({}, B[jumpa], { masa: p.tarikh + 'T12:00' }, tukarA ? { amaun: +p.amaun } : {});
    simLog('Pelajar', p.id, p.bulan + ': tarikh bayar ditetapkan ' + fmt(tarikh(p.tarikh)) + (tukarA ? '; amaun RM' + lamaA + ' → RM' + p.amaun + (p.sebab ? ' (' + p.sebab + ')' : '') : ''));
    return { ok: true, id: p.id, mesej: (tukarA ? 'Tarikh & amaun bayaran ' : 'Tarikh bayar ') + p.id + ' dikemas kini' };
  },
  simpanPenaja: function (p) {
    var L = S.D.penaja = S.D.penaja || [], x = p.id && cariPenaja(p.id), baru = !x;
    if (baru) { x = { id: simId(L, 'HYB-S', 2) }; L.push(x); }
    x.nama = p.nama; x.tempatId = p.tempatId; x.jenis = p.jenis; x.amaun = +p.amaun; x.aktif = p.aktif !== 'Tidak'; x.catatan = p.catatan || '';
    simLog('Tempat', p.tempatId, (baru ? 'Penaja baharu ' : 'Penaja dikemas kini ') + x.id + ': ' + x.nama + ' (' + x.jenis + ', RM' + x.amaun + ')');
    return { ok: true, id: x.id, mesej: 'Penaja ' + x.id + ' disimpan' };
  },
  simpanSewaTetapan: function (p) {
    var W = S.D.sewa = S.D.sewa || { tetapan: [], rekod: [] }, x = sewaCfg(p.tempatId);
    if (!x) { x = { tempatId: p.tempatId }; W.tetapan.push(x); }
    x.penerima = p.penerima; x.amaun = +p.amaun; x.aktif = p.aktif !== 'Tidak'; x.cara = p.cara || ''; x.catatan = p.catatan || '';
    simLog('Masjid', p.tempatId, 'Tetapan bayaran masjid: ' + x.penerima + ', RM' + x.amaun + ' sebulan');
    return { ok: true, id: p.tempatId, mesej: 'Tetapan bayaran masjid ' + p.tempatId + ' disimpan' };
  },
  rekodSewa: function (p) {
    var W = S.D.sewa = S.D.sewa || { tetapan: [], rekod: [] }, resit = '';
    if (p.status === 'Waive' && !String(p.catatan || '').trim()) throw new Error('Isi sebab waive (contoh: masjid kecualikan bulan ini).');
    if (p.status === 'Dibayar') {
      var tb = tarikhBulan(p.bulan), asas = 'HYB-BM-' + String(tb.y).slice(2) + pad(tb.m + 1) + '-' + p.tempatId.replace('HYB-', ''), n = 2;
      resit = asas; while (W.rekod.some(function (r) { return r.resit === resit; })) resit = asas + '-' + (n++);
    }
    W.rekod.push({ masa: p.status === 'Dibayar' ? p.tarikh + 'T12:00' : masaKini(), tempatId: p.tempatId, bulan: p.bulan, status: p.status, amaun: p.status === 'Dibayar' ? +p.amaun : 0,
      resit: resit, cara: p.cara || '', rujukan: p.rujukan || '', oleh: S.D.user.nama, catatan: p.catatan || '' });
    simLog('Masjid', p.tempatId, label(p.bulan) + ': bayaran masjid ' + (p.status === 'Dibayar' ? 'RM' + p.amaun + ' dibayar (' + resit + ')' : p.status === 'Waive' ? 'waive: ' + p.catatan : 'dibatalkan'));
    return { ok: true, id: p.tempatId, resit: resit, mesej: p.status === 'Dibayar' ? 'Bayaran ' + p.tempatId + ' direkod · resit ' + resit : p.status === 'Waive' ? p.tempatId + ' ditanda waive' : 'Rekod ' + p.tempatId + ' dibatalkan' };
  },
  bayarPendaftaran: function (p) {
    var q = cariPelajar(p.id), B = S.D.bayaran = (S.D.bayaran || []).slice(), lama = daftarBayar(p.id).rm;
    if (lama > 0) B.push({ masa: masaKini(), pelajarId: q.id, tempatId: q.tempatId, bulan: BULAN_DAFTAR, status: 'Pendaftaran dibatalkan', amaun: -lama, oleh: S.D.user.nama, sumber: 'Pendaftaran (pembetulan)' });
    B.push({ masa: p.tarikh + 'T12:00', pelajarId: q.id, tempatId: q.tempatId, bulan: BULAN_DAFTAR, status: 'Pendaftaran', amaun: +p.amaun, oleh: S.D.user.nama, sumber: 'Pendaftaran' });
    simLog('Pelajar', q.id, 'Yuran pendaftaran RM' + p.amaun + ' dibayar ' + fmt(tarikh(p.tarikh)));
    return { ok: true, id: q.id, mesej: 'Yuran pendaftaran ' + q.id + ' direkod' };
  },
  batalPendaftaran: function (p) {
    var q = cariPelajar(p.id), B = S.D.bayaran = (S.D.bayaran || []).slice(), lama = daftarBayar(p.id).rm;
    if (!(lama > 0)) throw new Error('Tiada yuran pendaftaran direkod.');
    B.push({ masa: masaKini(), pelajarId: q.id, tempatId: q.tempatId, bulan: BULAN_DAFTAR, status: 'Pendaftaran dibatalkan', amaun: -lama, oleh: S.D.user.nama, sumber: 'Pendaftaran (dibatalkan)' });
    simLog('Pelajar', q.id, 'Yuran pendaftaran RM' + lama + ' dibatalkan');
    return { ok: true, id: q.id, mesej: 'Yuran pendaftaran dibatalkan' };
  },
  terimaTajaan: function (p) {
    var pj = cariPenaja(p.penajaId), B = S.D.bayaran = (S.D.bayaran || []).slice(), lama = tajaanDiterima(p.penajaId, p.bulan).rm;
    if (lama > 0) B.push({ masa: masaKini(), pelajarId: pj.id, tempatId: pj.tempatId, bulan: p.bulan, status: 'Tajaan dibatalkan', amaun: -lama, oleh: S.D.user.nama, sumber: 'Tajaan (pembetulan)' });
    B.push({ masa: p.tarikh + 'T12:00', pelajarId: pj.id, tempatId: pj.tempatId, bulan: p.bulan, status: 'Tajaan', amaun: +p.amaun, oleh: S.D.user.nama, sumber: 'Tajaan: ' + pj.nama });
    simLog('Tempat', pj.tempatId, p.bulan + ': tajaan ' + pj.nama + ' RM' + p.amaun + ' diterima ' + fmt(tarikh(p.tarikh)));
    return { ok: true, id: pj.id, mesej: 'Tajaan ' + pj.nama + ' ' + label(p.bulan) + ' direkod' };
  },
  batalTajaan: function (p) {
    var pj = cariPenaja(p.penajaId), B = S.D.bayaran = (S.D.bayaran || []).slice(), lama = tajaanDiterima(p.penajaId, p.bulan).rm;
    if (!(lama > 0)) throw new Error('Tiada tajaan direkod untuk bulan ini.');
    B.push({ masa: masaKini(), pelajarId: pj.id, tempatId: pj.tempatId, bulan: p.bulan, status: 'Tajaan dibatalkan', amaun: -lama, oleh: S.D.user.nama, sumber: 'Tajaan (dibatalkan)' });
    simLog('Tempat', pj.tempatId, p.bulan + ': tajaan ' + pj.id + ' RM' + lama + ' dibatalkan');
    return { ok: true, id: pj.id, mesej: 'Tajaan dibatalkan' };
  },
  janaLinkGuru: function (p) {
    var kod = ''; for (var i = 0; i < 32; i++) kod += '0123456789abcdef'[Math.floor(Math.random() * 16)];
    S.D.aksesGuru = S.D.aksesGuru || {}; S.D.aksesGuru[p.id] = { dicipta: masaKini(), oleh: S.D.user.nama };
    simLog('Guru', p.id, 'Link laporan guru dijana (link lama, jika ada, dibatalkan)');
    return { ok: true, mesej: 'Link laporan untuk ' + p.id + ' dijana', kod: kod, link: 'https://script.google.com/macros/s/CONTOH-APP-GURU/exec?k=' + kod };
  },
  batalLinkGuru: function (p) {
    if (S.D.aksesGuru) delete S.D.aksesGuru[p.id];
    simLog('Guru', p.id, 'Link laporan guru dibatalkan');
    return { ok: true, mesej: 'Link ' + p.id + ' dibatalkan' };
  },
  tukarStatusGuru: function (p) {
    simLog('Guru', p.id, 'Status guru: ' + p.statusLama + ' → ' + p.status);
    return { ok: true, id: p.id, mesej: p.id + ' kini ' + p.status };
  },
  sahkanDaftar: function (p) {
    var d = cariDaftar(p.id);
    if (!d || d.status !== 'Baru') throw new Error(p.id + ' dah diproses. Muat semula.');
    var t = TMAP[p.tempatId]; if (!t) throw new Error('ID tempat tidak wujud.');
    var res = SIM.simpanPelajar({ nama: d.nama, umur: d.umur, ibuBapa: d.ibuBapa, tel: d.tel, tempatId: p.tempatId, tarikhDaftar: isoHari(),
      sumber: (S.D.senarai.sumber || []).indexOf(d.sumber) > -1 ? d.sumber : '', status: p.status,
      catatan: 'Daftar online ' + d.id + '. Lahir ' + fmtV(d.lahir) + ', ' + d.jantina + (d.kesihatan ? '. Kesihatan: ' + d.kesihatan : '') + (p.catatan ? '. ' + p.catatan : '') });
    d.status = 'Disahkan'; d.pelajarId = res.id; d.oleh = S.D.user.nama; d.diproses = masaKini(); d.catatan = p.catatan || '';
    d.tempatId = t.id; d.tempatNama = t.nama;
    return { ok: true, id: res.id, mesej: cap(d.nama) + ' kini pelajar ' + res.id };
  },
  tolakDaftar: function (p) {
    var d = cariDaftar(p.id);
    if (!d || d.status !== 'Baru') throw new Error(p.id + ' dah diproses. Muat semula.');
    d.status = p.status === 'Pendua' ? 'Pendua' : 'Ditolak'; d.oleh = S.D.user.nama; d.diproses = masaKini(); d.catatan = p.catatan || '';
    simLog('Ibu bapa', d.tempatId, 'Pendaftaran online ' + d.id + ' ditanda ' + d.status);
    return { ok: true, id: d.id, mesej: d.id + ' ditanda ' + d.status };
  },
  tambahLog: function (p) {
    simLog(p.jenis, p.ref, p.interaksi, p.tindakan, p.tarikhTindakan);
    if (p.kemaskiniTempat && TMAP[p.ref]) { TMAP[p.ref].tindakan = p.tindakan || ''; TMAP[p.ref].tarikhTindakan = p.tarikhTindakan || ''; }
    return { ok: true, id: p.ref, mesej: 'Log disimpan' };
  }
};

/* ---------- borang generik ---------- */
var FORM = {};
function bukaBorang(cfg) {
  FORM = cfg;
  var v = cfg.nilai || {};
  var h = '<div class="scrim" data-close></div><div class="modal form" role="dialog" aria-modal="true"><div class="mh"><div><h3>' + esc(cfg.tajuk) + '</h3>' +
    (cfg.sub ? '<div class="msub">' + esc(cfg.sub) + '</div>' : '') + '</div><button class="x-btn" data-close aria-label="Tutup">×</button></div>' +
    '<form id="frm" novalidate><div class="fgrid">' + cfg.fields.map(function (f) { return medan(f, v[f.k]); }).join('') + '</div>' +
    '<div class="ferr" id="ferr" hidden></div><div class="row"><button type="button" class="btn" data-close>Batal</button>' +
    '<button type="submit" class="btn pri" id="fsub">' + esc(cfg.butang || 'Simpan') + '</button></div></form></div>';
  $('#overlay').innerHTML = h;
  kemasKiniPapar();
  var first = document.querySelector('#frm input:not([disabled]), #frm select, #frm textarea');
  if (first) first.focus();
}
function medan(f, val) {
  if (val == null || val === '') val = f.def != null ? f.def : '';
  var id = 'f_' + f.k, cls = 'fld' + (f.full ? ' full' : '');
  if (f.type === 'checkbox') {
    return '<label class="' + cls + ' fchk" data-fk="' + f.k + '"><input type="checkbox" id="' + id + '"' + (val ? ' checked' : '') + '> <span>' + esc(f.l) + '</span></label>';
  }
  var inp;
  if (f.type === 'select') {
    inp = '<select id="' + id + '"' + (f.dis ? ' disabled' : '') + '>' + (f.kosong === false ? '' : '<option value="">' + esc(f.kosong || 'Pilih...') + '</option>') +
      (f.opts || []).map(function (o) {
        var ov = typeof o === 'object' ? o.v : o, ol = typeof o === 'object' ? o.l : o;
        return '<option value="' + esc(ov) + '"' + (String(ov) === String(val) ? ' selected' : '') + '>' + esc(ol) + '</option>';
      }).join('') + '</select>';
  } else if (f.type === 'textarea') {
    inp = '<textarea id="' + id + '" rows="' + (f.rows || 3) + '" placeholder="' + esc(f.ph || '') + '">' + esc(val) + '</textarea>';
  } else {
    inp = '<input id="' + id + '" type="' + (f.type || 'text') + '" value="' + esc(val) + '"' + (f.ph ? ' placeholder="' + esc(f.ph) + '"' : '') +
      (f.min != null ? ' min="' + f.min + '"' : '') + (f.max != null ? ' max="' + f.max + '"' : '') +
      (f.list ? ' list="' + id + '_l"' : '') + (f.dis ? ' disabled' : '') + ' autocomplete="off">' +
      (f.list ? '<datalist id="' + id + '_l">' + f.list.map(function (o) { return '<option value="' + esc(o) + '">'; }).join('') + '</datalist>' : '');
  }
  return '<label class="' + cls + '" data-fk="' + f.k + '"><span>' + esc(f.l) + (f.req ? ' <b class="req">*</b>' : '') + '</span>' + inp +
    (f.help ? '<small>' + esc(f.help) + '</small>' : '') + '</label>';
}
function nilaiBorang() {
  var v = {};
  (FORM.fields || []).forEach(function (f) {
    var el = document.getElementById('f_' + f.k);
    if (el) v[f.k] = f.type === 'checkbox' ? el.checked : el.value.trim();
  });
  return v;
}
function kemasKiniPapar() {
  if (!FORM.fields) return;
  var v = nilaiBorang();
  FORM.fields.forEach(function (f) {
    if (!f.show) return;
    var el = document.querySelector('[data-fk="' + f.k + '"]');
    if (el) el.hidden = !f.show(v);
  });
}
function tunjukRalat(m) { var e = $('#ferr'); if (e) { e.textContent = m; e.hidden = false; } }

/* ---------- borang: tempat ---------- */
function borangTempat(t, isi) {
  var D = S.D, T = D.tetapan, baru = !t;
  t = t || {}; isi = isi || {};
  bukaBorang({
    tajuk: baru ? 'Tempat baharu' : 'Edit tempat', sub: baru ? 'ID tempat dijana automatik selepas simpan.' : t.id + ' · ' + t.nama,
    fn: 'simpanTempat', butang: baru ? 'Tambah tempat' : 'Simpan',
    nilai: baru ? { status: (D.senarai.statusTempat || [])[0], owner: (D.senarai.owner || [])[0] || '', yuran: T.yuranStandard, nama: isi.nama || '', kawasan: isi.kawasan || '', catatan: isi.catatan || '' } : t,
    fields: [
      { k: 'nama', l: 'Nama masjid / surau', req: 1, full: 1, ph: 'Contoh: Masjid Al-Hidayah Sentul Pasar' },
      { k: 'kawasan', l: 'Kawasan', list: uniq(D.tempat.map(function (x) { return x.kawasan; })) },
      { k: 'status', l: 'Status', type: 'select', opts: D.senarai.statusTempat || [], req: 1, kosong: false },
      { k: 'pic', l: 'PIC AJK' },
      { k: 'telPic', l: 'No. tel AJK', type: 'tel', ph: '012-345 6789' },
      { k: 'guru', l: 'Guru', list: uniq(D.tempat.map(function (x) { return x.guru; }).concat((D.guru || []).filter(function (g) { return ['Aktif', 'Latihan', 'Simpanan'].indexOf(g.status) > -1; }).map(function (g) { return (g.gelaran ? g.gelaran + ' ' : '') + g.nama; }))) },
      { k: 'telGuru', l: 'No. tel guru', type: 'tel', ph: '012-345 6789' },
      { k: 'hariMasa', l: 'Hari & masa kelas', list: ['Sabtu pagi', 'Ahad pagi', 'Sabtu petang', 'Ahad petang'], help: 'Mula dengan nama hari supaya kelas muncul dalam jadual minggu ini.' },
      { k: 'tarikhMula', l: 'Tarikh mula kelas', type: 'date' },
      { k: 'yuran', l: 'Yuran bulanan (RM)', type: 'number', req: 1, min: 1, help: 'RM' + T.yuranAwal + ' kelas awal, RM' + T.yuranStandard + ' tempat baru.' },
      { k: 'kosKhas', l: 'Kos tetap khas (RM)', type: 'number', min: 0, help: 'Kosongkan untuk guna kos standard RM' + (num(T.guru) + num(T.masjid)) + '. Isi jika tempat ini ada kos lain.' },
      { k: 'owner', l: 'Owner', type: 'select', opts: D.senarai.owner || [] },
      { k: 'tindakan', l: 'Tindakan seterusnya', full: 1, ph: 'Contoh: Jumpa AJK bincang tarikh mula' },
      { k: 'tarikhTindakan', l: 'Tarikh tindakan', type: 'date' },
      { k: 'catatan', l: 'Catatan', type: 'textarea', full: 1 }
    ],
    semak: function (v) {
      if (!(+v.yuran > 0)) return 'Yuran bulanan mesti nombor lebih dari 0.';
      if (v.tindakan && !v.tarikhTindakan) return 'Isi tarikh tindakan supaya sistem boleh beri amaran bila lewat.';
      return '';
    },
    pre: function (v) { v.id = t.id || ''; return v; },
    lepas: function (res) {
      if (baru && isi.lokasi) { if (/^Google/.test(isi.lokasi.sumber)) { PETA.gm = null; } hantar('simpanLokasi', { id: res.id, lat: isi.lokasi.lat, lng: isi.lokasi.lng, sumber: isi.lokasi.sumber }, function () { toast(res.id + ' ditambah ke Pipeline dan dipin di peta'); }); return; }
      if (baru) { S.tempatAktif = res.id; S.view = 'profil'; render(); }
    }
  });
}

/* ---------- borang: pelajar ---------- */
function borangPelajar(p, tempatId) {
  var D = S.D, baru = !p;
  p = p || {};
  var tid = p.tempatId || tempatId || '';
  var tObj = TMAP[tid];
  var defStatus = tObj && JALAN.indexOf(tObj.status) < 0 ? 'Daftar' : 'Aktif';
  var nilai = baru ? { tempatId: tid, status: defStatus, tarikhDaftar: isoHari() } : Object.assign({}, p, { statusYuran: p.yuran[S.bulan] || '' });
  bukaBorang({
    tajuk: baru ? 'Pelajar baharu' : 'Edit pelajar', sub: baru ? 'ID pelajar dijana automatik selepas simpan.' : p.id + ' · ' + cap(p.nama),
    fn: 'simpanPelajar', butang: baru ? 'Daftar pelajar' : 'Simpan', nilai: nilai,
    fields: [
      { k: 'nama', l: 'Nama pelajar', req: 1, full: 1, ph: 'Nama penuh seperti dalam sijil lahir' },
      { k: 'umur', l: 'Umur', type: 'number', min: 3, max: 18 },
      { k: 'tempatId', l: 'Tempat', type: 'select', req: 1, opts: D.tempat.filter(function (t) { return t.status !== 'Tutup' || t.id === tid; }).map(function (t) { return { v: t.id, l: t.id + ' · ' + t.nama }; }) },
      { k: 'ibuBapa', l: 'Nama ibu / bapa' },
      { k: 'tel', l: 'No. tel ibu / bapa', type: 'tel', ph: '012-345 6789', help: 'Untuk butang WhatsApp. Guru tidak nampak nombor ini.' },
      { k: 'tarikhDaftar', l: 'Tarikh daftar', type: 'date' },
      { k: 'sumber', l: 'Sumber', type: 'select', opts: D.senarai.sumber || [] },
      { k: 'status', l: 'Status', type: 'select', req: 1, kosong: false, opts: D.senarai.statusPelajar || [], help: 'Guna Daftar jika kelas belum mula, supaya tak masuk kiraan % kutipan.' },
      { k: 'statusYuran', l: 'Yuran ' + label(S.bulan), type: 'select', kosong: '(kosong)', opts: D.senarai.statusYuran || [], show: function (v) { return v.status === 'Aktif'; } },
      { k: 'tarikhBerhenti', l: 'Tarikh berhenti', type: 'date', req: 1, show: function (v) { return v.status === 'Berhenti'; } },
      { k: 'sebabBerhenti', l: 'Sebab berhenti', req: 1, full: 1, show: function (v) { return v.status === 'Berhenti'; } },
      { k: 'catatan', l: 'Catatan', type: 'textarea', full: 1 }
    ],
    pre: function (v) { v.id = p.id || ''; v.bulanYuran = S.bulan; if (v.status !== 'Aktif' && baru) v.statusYuran = ''; return v; },
    lepas: baru ? function (res) { if (res && res.id && cariPelajar(res.id)) modalDaftar(res.id, true); } : null
  });
}

/* ---------- borang: laporan kelas ---------- */
function borangLaporan(tempatId, tarikhKelas) {
  var D = S.D, t = TMAP[tempatId] || {};
  var opts = D.tempat.filter(function (x) { return bolehLaporan(x.id) && x.status !== 'Tutup'; }).map(function (x) { return { v: x.id, l: x.id + ' · ' + x.nama }; });
  bukaBorang({
    tajuk: 'Laporan kelas', sub: 'Diisi selepas setiap sesi kelas.', fn: 'simpanLaporan', butang: 'Simpan laporan',
    nilai: { tarikh: tarikhKelas || isoHari(), tempatId: tempatId || '', guru: t.guru || '' },
    fields: [
      { k: 'tarikh', l: 'Tarikh kelas', type: 'date', req: 1, max: isoHari() },
      { k: 'tempatId', l: 'Tempat', type: 'select', req: 1, opts: opts },
      { k: 'guru', l: 'Guru', list: uniq(D.tempat.map(function (x) { return x.guru; }).concat((D.guru || []).filter(function (g) { return ['Aktif', 'Latihan', 'Simpanan'].indexOf(g.status) > -1; }).map(function (g) { return (g.gelaran ? g.gelaran + ' ' : '') + g.nama; }))) },
      { k: 'hadir', l: 'Bilangan hadir', type: 'number', req: 1, min: 0, max: 200 },
      { k: 'topik', l: 'Aktiviti / topik', type: 'textarea', req: 1, full: 1, ph: 'Contoh: Suloh m/s 12-14, bacaan surah Al-Fil, adab makan' },
      { k: 'isu', l: 'Isu atau perhatian', type: 'textarea', full: 1, ph: 'Contoh: 3 pelajar tak hadir 2 minggu berturut' }
    ],
    semak: function (v) { if (v.tarikh > isoHari()) return 'Tarikh kelas tidak boleh pada masa depan.'; return ''; }
  });
}

/* ---------- borang: log ---------- */
function borangLog(ref, jenis) {
  var D = S.D, isT = /^HYB-T\d+$/.test(ref || ''), t = TMAP[ref];
  bukaBorang({
    tajuk: 'Tambah log', sub: ref ? ref + ' · ' + (t ? t.nama : cap(((D.pelajar.filter(function (p) { return p.id === ref; })[0]) || {}).nama || '')) : '',
    fn: 'tambahLog', butang: 'Simpan log',
    nilai: { jenis: jenis || (isT ? 'Tempat' : 'Ibu bapa'), ref: ref || '', kemaskiniTempat: isT },
    fields: [
      { k: 'jenis', l: 'Jenis', type: 'select', req: 1, kosong: false, opts: D.senarai.jenisLog || [] },
      { k: 'ref', l: 'ID rujukan', ph: 'HYB-T01 atau HYB-P001', list: D.tempat.map(function (x) { return x.id; }) },
      { k: 'interaksi', l: 'Apa yang berlaku', type: 'textarea', req: 1, full: 1, rows: 4, ph: 'Contoh: Telefon PIC AJK, setuju mula kelas 15/11' },
      { k: 'tindakan', l: 'Tindakan seterusnya' },
      { k: 'tarikhTindakan', l: 'Tarikh tindakan', type: 'date' },
      { k: 'kemaskiniTempat', l: 'Jadikan ini tindakan seterusnya untuk tempat (ganti yang lama)', type: 'checkbox', full: 1, show: function (v) { return /^HYB-T\d+$/.test(v.ref); } }
    ],
    semak: function (v) { if (v.tindakan && !v.tarikhTindakan) return 'Isi tarikh untuk tindakan seterusnya.'; return ''; },
    pre: function (v) { if (!/^HYB-T\d+$/.test(v.ref)) v.kemaskiniTempat = false; return v; }
  });
}

/* ---------- pengesahan dalam page ---------- */
var SAHKAN = null;
function sahkan(tajuk, teks, fn) {
  SAHKAN = fn;
  $('#overlay').innerHTML = '<div class="scrim" data-close></div><div class="modal"><h3>' + esc(tajuk) + '</h3><p style="margin:0;color:var(--ink-2)">' + esc(teks) +
    '</p><div class="row"><button class="btn" data-close>Batal</button><button class="btn pri" data-act="sahkan-ya">Ya, teruskan</button></div></div>';
}

/* ---------- tukar status tempat (kanban / profil) ---------- */
function tukarStatus(id, status) {
  var t = TMAP[id];
  if (!t || t.status === status || !bolehTulis()) { render(true); return; }
  var jalan = function () {
    var lama = t.status;
    t.status = status; render(true);
    hantar('tukarStatusTempat', { id: id, status: status, statusLama: lama },
      function (res) { toast(res.mesej); },
      function (m) { var x = TMAP[id]; if (x) x.status = lama; render(true); toast('Tak berjaya: ' + m); });
  };
  if (status === 'Tutup' || status === 'Berisiko') {
    sahkan('Tukar ' + t.nama + ' kepada "' + status + '"?',
      status === 'Tutup' ? 'Kos tetap tempat ini tidak lagi dikira. Pelajar tidak dipadam, status mereka kekal sehingga anda ubah.' : 'Tempat akan ditanda berisiko dan muncul dengan chip merah.',
      jalan);
    var batal = function () { render(true); };
    SAHKAN_BATAL = batal;
  } else jalan();
}
var SAHKAN_BATAL = null;

/* ---------- PIPELINE ---------- */
function renderPipeline() {
  var D = S.D, k = kira(), st = D.senarai.statusTempat || [], by = {};
  k.rows.forEach(function (r) { by[r.id] = r; });
  var now = today(), tulis = bolehTulis();
  var h = '<div class="top"><div><div class="eyebrow">' + eyebrow() + '</div><h1>Pipeline <em>Tempat</em></h1></div><div class="top-r">' +
    (tulis ? '<button class="btn pri" data-act="tempat-baru">' + ICON.plus + 'Tempat baharu</button>' : '') +
    '<button class="btn" data-act="muat">' + ICON.refresh + 'Muat semula</button></div></div>';
  h += '<div class="hint" style="margin:0 0 12px">' + (tulis ? 'Seret kad ke lajur lain untuk tukar status. Setiap perubahan direkod dalam tab Log. Di telefon, tukar status dalam Profil Tempat.' : 'Paparan sahaja.') + '</div>';
  h += '<div class="kanban">' + st.map(function (s) {
    var list = D.tempat.filter(function (t) { return t.status === s; });
    var jum = list.reduce(function (a, t) { return a + (by[t.id] ? by[t.id].aktif : 0); }, 0);
    return '<section class="kcol' + (list.length ? '' : ' kosong') + '" data-drop="' + esc(s) + '"><header>' + chip(s) + '<b>' + list.length + '</b>' + (jum ? '<small>' + jum + ' pelajar</small>' : '') + '</header><div class="kbody">' +
      (list.length ? list.map(function (t) { return kad(t, by[t.id], now, tulis); }).join('') : '<div class="kempty">' + (tulis ? 'Seret ke sini' : 'Tiada') + '</div>') +
      '</div></section>';
  }).join('') + '</div>';
  var lain = D.tempat.filter(function (t) { return st.indexOf(t.status) < 0; });
  if (lain.length) h += '<div class="hint">' + lain.length + ' tempat ada status yang tiada dalam senarai Tetapan: ' + esc(lain.map(function (t) { return t.id + ' (' + (t.status || 'kosong') + ')'; }).join(', ')) + '</div>';
  $('#view').innerHTML = h;
}
function kad(t, r, now, tulis) {
  r = r || { aktif: 0, kap: 0 };
  var T = S.D.tetapan, chips = '';
  if (r.lewat) chips += chip('LEWAT ' + hariBeza(now, r.tt) + 'h', 'c-r');
  if (r.rugi) chips += chip('RUGI', 'c-r');
  if (r.aktif > num(T.kapasiti)) chips += chip('Penuh', 'c-b');
  if (t.status === 'Recruitment') chips += chip(r.aktif + '/' + T.minBuka + ' min', r.aktif >= num(T.minBuka) ? 'c-g' : 'c-y');
  return '<article class="kcard" draggable="' + (tulis ? 'true' : 'false') + '" data-card="' + esc(t.id) + '" data-profil="' + esc(t.id) + '">' +
    '<div class="kt">' + esc(t.nama) + '</div><div class="km">' + esc(t.id) + (t.kawasan ? ' · ' + esc(t.kawasan) : '') + '</div>' +
    '<div class="km">' + (t.guru ? esc(t.guru) : '<i>Guru belum ada</i>') + (t.hariMasa ? ' · ' + esc(t.hariMasa) : '') + '</div>' +
    '<div class="cap" style="margin-top:8px"><div class="bar"><i class="' + (r.kap > 1 ? 'r' : r.aktif < num(T.pulangModal) ? 'y' : 'g') + '" style="width:' + Math.min(100, r.kap * 100) + '%"></i></div><span>' + r.aktif + '/' + T.kapasiti + '</span></div>' +
    (chips ? '<div class="kchips">' + chips + '</div>' : '') +
    (t.tindakan ? '<div class="kn' + (r.lewat ? ' lewat' : '') + '">→ ' + esc(t.tindakan) + (t.tarikhTindakan ? ' · ' + esc(fmtV(t.tarikhTindakan)) : '') + '</div>' : '') +
    '</article>';
}

/* ---------- PROFIL TEMPAT ---------- */
function itemLog(l) {
  return '<li><span class="tl-d">' + esc(fmtV(String(l.tarikh).slice(0, 10))) + (String(l.tarikh).length > 10 ? ' ' + esc(String(l.tarikh).slice(11, 16)) : '') + '</span>' +
    '<div><div>' + chip(l.jenis, l.jenis === 'Laporan' ? 'c-g' : 'c-k') + ' ' + esc(l.interaksi) + '</div>' +
    '<div class="m">' + esc(l.oleh || '') + (l.ref && l.jenis !== 'Laporan' ? ' · ' + esc(l.ref) : '') +
    (l.tindakan ? ' · seterusnya: ' + esc(l.tindakan) + (l.tarikhTindakan ? ' (' + esc(fmtV(l.tarikhTindakan)) + ')' : '') : '') + '</div></div></li>';
}

function renderProfil() {
  var D = S.D;
  if (!S.tempatAktif || !TMAP[S.tempatAktif]) S.tempatAktif = (D.tempat[0] || {}).id;
  var t = TMAP[S.tempatAktif];
  if (!t) { $('#view').innerHTML = '<div class="empty">Belum ada tempat.</div>'; return; }
  var k = kira(), r = k.rows.filter(function (x) { return x.id === t.id; })[0], T = D.tetapan, now = today(), tulis = bolehTulis();
  var pel = D.pelajar.filter(function (p) { return p.tempatId === t.id; });
  var pelIds = {}; pel.forEach(function (p) { pelIds[p.id] = 1; });
  var lap = (D.laporan || []).filter(function (l) { return l.tempatId === t.id; }).sort(function (a, b) { return a.tarikh < b.tarikh ? 1 : -1; });
  var tl = (D.log || []).filter(function (l) { return l.ref === t.id || pelIds[l.ref]; })
    .concat(lap.map(function (l) { return { tarikh: l.tarikh, jenis: 'Laporan', interaksi: 'Kelas: ' + l.hadir + ' hadir. ' + l.topik + (l.isu ? ' Isu: ' + l.isu : ''), oleh: l.oleh || l.guru }; }))
    .sort(function (a, b) { return a.tarikh < b.tarikh ? 1 : -1; });

  var h = '<div class="top"><div><div class="eyebrow">Profil tempat · ' + esc(t.id) + (t.kawasan ? ' · ' + esc(t.kawasan) : '') + '</div><h1>' + esc(t.nama) + '</h1>' +
    '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">' + chip(t.status) + (r.lewat ? chip('LEWAT', 'c-r') : '') + (r.rugi ? chip('RUGI', 'c-r') : '') +
    (r.aktif > num(T.kapasiti) ? chip('Melebihi kapasiti', 'c-b') : '') + '</div></div><div class="top-r">' +
    '<select class="sel" data-pilih-tempat aria-label="Pilih tempat">' + D.tempat.map(function (x) {
      return '<option value="' + esc(x.id) + '"' + (x.id === t.id ? ' selected' : '') + '>' + esc(x.id + ' · ' + x.nama) + '</option>';
    }).join('') + '</select>' +
    (tulis ? '<button class="btn" data-act="edit-tempat">' + ICON.edit + 'Edit</button>' : '') +
    (bolehLaporan(t.id) ? '<button class="btn" data-act="laporan-baru">' + ICON.plus + 'Laporan kelas</button>' : '') +
    (tulis ? '<button class="btn pri" data-act="pelajar-baru-tempat">' + ICON.plus + 'Pelajar</button>' : '') + '</div></div>';

  // Banner tindakan seterusnya
  if (t.tindakan || t.tarikhTindakan) {
    var beza = r.tt ? hariBeza(r.tt, now) : null;
    h += '<div class="alert ' + (r.lewat ? 'r' : 'y') + '"><b>Tindakan seterusnya:</b> ' + esc(t.tindakan || '(tiada keterangan)') +
      (r.tt ? ' · ' + fmt(r.tt) + ' (' + (beza < 0 ? 'lewat ' + (-beza) + ' hari' : beza === 0 ? 'hari ini' : beza + ' hari lagi') + ')' : '') + '</div>';
  } else if (t.status !== 'Tutup') {
    h += '<div class="alert k">Tiada tindakan seterusnya untuk tempat ini.' + (tulis ? ' Tambah melalui log di bawah.' : '') + '</div>';
  }

  h += '<div class="grid two">';

  // KIRI
  var pmPelajar = r.yuran ? Math.ceil(kosTempat(t, k.kosSetiap) / r.yuran) : 0;
  var stat = function (l, v, cls) { return '<div class="st"><span>' + l + '</span><b class="' + (cls || '') + '">' + v + '</b></div>'; };
  h += '<div class="stack"><div class="card"><div class="card-h"><h3>Ekonomi tempat</h3><span class="sub">yuran ' + rm(r.yuran) + ' · ' + esc(label(S.bulan)) + '</span></div><div class="card-b">' +
    '<div class="stats">' + stat('Hasil potensi', rm(r.hasil)) + stat('Kos tetap', r.kos ? rm(r.kos) : '–') +
    stat('Untung potensi', rm(r.untung), r.untung < 0 ? 'neg' : 'pos') + stat('Kutipan ' + esc(label(S.bulan)), rm(r.kutipan)) + '</div>' +
    '<div style="margin-top:16px"><div style="display:flex;font-size:12.5px;margin-bottom:6px"><span>Pelajar aktif</span><b style="margin-left:auto">' + r.aktif + ' / ' + T.kapasiti + '</b></div>' +
    '<div class="bar big"><i class="' + (r.kap > 1 ? 'r' : r.aktif < pmPelajar ? 'y' : 'g') + '" style="width:' + Math.min(100, r.kap * 100) + '%"></i>' +
    '<span class="mk" style="left:' + Math.min(100, pmPelajar / num(T.kapasiti) * 100) + '%" title="Pulang modal"></span>' +
    '<span class="mk soft" style="left:' + Math.min(100, num(T.sasaran) / num(T.kapasiti) * 100) + '%" title="Sasaran"></span></div>' +
    '<div class="legend"><span>Pulang modal ' + pmPelajar + '</span><span>Sasaran ' + T.sasaran + '</span><span>Kapasiti ' + T.kapasiti + '</span></div></div>' +
    '<div class="hint">' + (r.ditaja && r.ditaja === r.aktif ? 'Semua pelajar ditaja. Kutipan bulanan tidak dikejar.'
      : (r.aktif < pmPelajar ? 'Perlu <b>' + (pmPelajar - r.aktif) + ' pelajar lagi</b> untuk pulang modal (' + pmPelajar + ' pelajar × ' + rm(r.yuran) + ' = ' + rm(pmPelajar * r.yuran) + ').'
      : 'Dah lepas pulang modal. ' + (r.aktif < num(T.sasaran) ? (num(T.sasaran) - r.aktif) + ' lagi untuk capai sasaran ' + T.sasaran + '.' : 'Dah capai sasaran.')) +
      (r.perlu > 0 ? ' Kutipan ' + label(S.bulan) + ': <b>' + r.dibayar + '/' + r.perlu + '</b> (' + pct(r.pk) + ').' : '')) + '</div>' +
    '</div></div>';

  // Log aktiviti + borang ringkas
  h += '<div class="card"><div class="card-h"><h3>Log aktiviti</h3><span class="sub r">' + tl.length + ' rekod</span></div><div class="card-b">';
  if (tulis) {
    h += '<div class="qlog"><textarea id="ql_txt" rows="2" placeholder="Apa yang berlaku? Contoh: Telefon PIC, AJK setuju tambah slot Ahad"></textarea>' +
      '<div class="qrow"><select id="ql_jenis" class="sel" aria-label="Jenis log">' + (D.senarai.jenisLog || []).map(function (j) { return '<option' + (j === 'Tempat' ? ' selected' : '') + '>' + esc(j) + '</option>'; }).join('') + '</select>' +
      '<input id="ql_tindakan" class="sel grow" placeholder="Tindakan seterusnya (pilihan)">' +
      '<input id="ql_tarikh" class="sel" type="date" aria-label="Tarikh tindakan">' +
      '<button class="btn pri" data-act="ql-simpan">Simpan log</button></div>' +
      (t.tindakan ? '<label class="fchk" style="margin-top:8px"><input type="checkbox" id="ql_selesai"> <span>Tindakan semasa ("' + esc(t.tindakan) + '") dah selesai</span></label>' : '') +
      '<div class="ferr" id="ql_err" hidden></div></div>';
  }
  h += tl.length ? '<ul class="tl">' + tl.slice(0, 40).map(itemLog).join('') + '</ul>' : '<div class="empty">Belum ada log atau laporan kelas.</div>';
  h += '</div></div></div>';

  // KANAN
  var kv = function (l, v) { return '<dt>' + l + '</dt><dd>' + (v || '<span class="m">–</span>') + '</dd>'; };
  var telLink = function (tel, nama) {
    if (!tel) return '';
    var w = waLink(tel, 'Assalamualaikum ' + (nama || '') + ', saya dari HYB berkenaan kelas di ' + t.nama + '.');
    return esc(tel) + (w ? ' <a class="btn sm wa" href="' + esc(w) + '" target="_blank" rel="noopener">' + ICON.wa + '</a>' : '');
  };
  h += '<div class="stack"><div class="card"><div class="card-h"><h3>Maklumat</h3></div><div class="card-b"><dl class="kv">' +
    kv('Hari & masa', esc(t.hariMasa)) + kv('Tarikh mula', esc(fmtV(t.tarikhMula))) + kv('Owner', esc(t.owner)) +
    kv('PIC AJK', esc(t.pic) + (t.telPic ? '<div>' + telLink(t.telPic, t.pic) + '</div>' : '')) +
    kv('Guru', esc(t.guru) + (t.telGuru ? '<div>' + telLink(t.telGuru, t.guru) + '</div>' : '')) +
    kv('Catatan', esc(t.catatan)) + '</dl>' +
    (tulis ? '<label class="fld"><span>Tukar status</span><select class="sel" data-status-tempat="' + esc(t.id) + '">' + (D.senarai.statusTempat || []).map(function (s) {
      return '<option' + (s === t.status ? ' selected' : '') + '>' + esc(s) + '</option>';
    }).join('') + '</select></label>' : '') + '</div></div>';

  // Pelajar
  var aktif = pel.filter(function (p) { return p.status === 'Aktif'; });
  var lain = pel.filter(function (p) { return p.status !== 'Aktif'; });
  h += '<div class="card"><div class="card-h"><h3>Pelajar</h3><span class="sub">' + aktif.length + ' aktif' + (lain.length ? ' · ' + lain.length + ' lain' : '') + '</span>' +
    '<button class="link r" data-goto-pelajar="' + esc(t.id) + '">Buka senarai</button></div><div class="card-b"><ul class="plist">' +
    aktif.concat(lain).map(function (p) {
      return '<li class="click" data-p="' + esc(p.id) + '"><div style="min-width:0"><div class="nm">' + esc(cap(p.nama)) + '</div><div class="m">' + esc(p.id) + (p.umur ? ' · ' + esc(p.umur) + ' thn' : '') + '</div></div>' +
        '<div style="margin-left:auto">' + (p.status === 'Aktif' ? chip(p.yuran[S.bulan]) : chip(p.status)) + '</div></li>';
    }).join('') + '</ul>' + (pel.length ? '' : '<div class="empty">Belum ada pelajar.</div>') + '</div></div>';

  // Laporan kelas terkini
  var purata = lap.length ? lap.slice(0, 4).reduce(function (a, l) { return a + num(l.hadir); }, 0) / Math.min(4, lap.length) : 0;
  h += '<div class="card"><div class="card-h"><h3>Laporan kelas</h3><span class="sub r">' + lap.length + ' sesi</span></div><div class="card-b">' +
    (lap.length ? '<div class="hint" style="margin:0 0 10px">Purata hadir 4 sesi terakhir: <b>' + purata.toFixed(1) + '</b> daripada ' + r.aktif + ' aktif (' + pct(r.aktif ? purata / r.aktif : null) + ')</div>' +
      '<ul class="tl">' + lap.slice(0, 5).map(function (l) {
        return '<li><span class="tl-d">' + esc(fmtV(l.tarikh)) + '</span><div><div><b>' + esc(l.hadir) + ' hadir</b> · ' + esc(l.topik) + '</div>' + (l.isu ? '<div class="m">Isu: ' + esc(l.isu) + '</div>' : '') + '</div></li>';
      }).join('') + '</ul>'
      : '<div class="empty">Belum ada laporan kelas.</div>') + '</div></div></div>';

  h += '</div>';
  $('#view').innerHTML = h;
}

function simpanLogRingkas() {
  var t = TMAP[S.tempatAktif]; if (!t) return;
  var txt = $('#ql_txt').value.trim(), tind = $('#ql_tindakan').value.trim(), tt = $('#ql_tarikh').value, sel = $('#ql_selesai');
  var e = $('#ql_err');
  var ralat = !txt ? 'Tulis apa yang berlaku dahulu.' : (tind && !tt ? 'Isi tarikh untuk tindakan seterusnya.' : '');
  if (ralat) { e.textContent = ralat; e.hidden = false; return; }
  var btn = document.querySelector('[data-act="ql-simpan"]'); btn.disabled = true; btn.textContent = 'Menyimpan...';
  hantar('tambahLog', { jenis: $('#ql_jenis').value, ref: t.id, interaksi: txt, tindakan: tind, tarikhTindakan: tt, kemaskiniTempat: !!tind || !!(sel && sel.checked) },
    function (res) { toast(res.mesej); },
    function (m) { btn.disabled = false; btn.textContent = 'Simpan log'; e.textContent = m; e.hidden = false; });
}

/* ---------- aksi Fasa 2 (dipanggil dari pengendali klik utama) ---------- */
function aksiFasa2(a, el) {
  var id = el.getAttribute('data-id');
  var cariP = function () { return S.D.pelajar.filter(function (p) { return p.id === id; })[0]; };
  switch (a) {
    case 'tempat-baru': borangTempat(); return true;
    case 'edit-tempat': borangTempat(TMAP[S.tempatAktif]); return true;
    case 'pelajar-baru': borangPelajar(null, S.f.tempat || ''); return true;
    case 'pelajar-baru-tempat': borangPelajar(null, S.tempatAktif); return true;
    case 'edit-pelajar': borangPelajar(cariP()); return true;
    case 'log-pelajar': borangLog(id, 'Ibu bapa'); return true;
    case 'laporan-baru': borangLaporan(S.tempatAktif); return true;
    case 'ql-simpan': simpanLogRingkas(); return true;
    case 'guru-baru': borangGuru(); return true;
    case 'edit-guru': borangGuru((S.D.guru || []).filter(function (g) { return g.id === id; })[0]); return true;
    case 'daftar-guru': var nm = el.getAttribute('data-nama'), tg = S.D.tempat.filter(function (t) { return t.guru === nm; })[0] || {};
      borangGuru(null, { nama: nm.replace(/^\s*(ust\.?|ustaz|ustazah)\s+/i, ''), gelaran: /^\s*ustazah/i.test(nm) ? 'Ustazah' : (/^\s*ust/i.test(nm) ? 'Ustaz' : ''), tel: tg.telGuru || '', kawasan: tg.kawasan || '', tarikhMula: tg.tarikhMula || '' }); return true;
    case 'sahkan-ya': var f = SAHKAN; SAHKAN = null; SAHKAN_BATAL = null; $('#overlay').innerHTML = ''; if (f) f(); return true;
  }
  return false;
}

document.addEventListener('submit', function (e) {
  if (e.target.id !== 'frm') return;
  e.preventDefault();
  var v = nilaiBorang(), err = [];
  FORM.fields.forEach(function (f) {
    var el = document.querySelector('[data-fk="' + f.k + '"]');
    if (el && el.hidden) return;
    if (f.req && !v[f.k]) err.push(f.l + ' wajib diisi.');
  });
  if (!err.length && FORM.semak) { var x = FORM.semak(v); if (x) err.push(x); }
  if (err.length) { tunjukRalat(err.join(' ')); return; }
  var payload = FORM.pre ? FORM.pre(v) : v, cfg = FORM;
  var btn = $('#fsub'); btn.disabled = true; btn.textContent = 'Menyimpan...';
  hantar(cfg.fn, payload, function (res) {
    $('#overlay').innerHTML = ''; FORM = {}; toast(res.mesej);
    if (cfg.lepas) cfg.lepas(res);
  }, function (m) { btn.disabled = false; btn.textContent = cfg.butang || 'Simpan'; tunjukRalat(m); });
});

/* Seret dan lepas (kanban) */
document.addEventListener('dragstart', function (e) {
  var c = e.target.closest && e.target.closest('[data-card],[data-card-guru]');
  if (!c || c.getAttribute('draggable') !== 'true') return;
  e.dataTransfer.setData('text/plain', c.hasAttribute('data-card-guru') ? 'guru:' + c.getAttribute('data-card-guru') : 'tempat:' + c.getAttribute('data-card'));
  e.dataTransfer.effectAllowed = 'move';
  c.classList.add('drag');
  var kb = document.querySelector('.kanban'); if (kb) setTimeout(function () { kb.classList.add('seret'); }, 0);
});
document.addEventListener('dragend', function () {
  document.querySelectorAll('.kcard.drag,.kcol.over').forEach(function (x) { x.classList.remove('drag'); x.classList.remove('over'); });
  var kb = document.querySelector('.kanban'); if (kb) kb.classList.remove('seret');
});
document.addEventListener('dragover', function (e) {
  var col = e.target.closest && e.target.closest('[data-drop],[data-drop-guru]');
  if (!col) return;
  e.preventDefault();
  document.querySelectorAll('.kcol.over').forEach(function (x) { if (x !== col) x.classList.remove('over'); });
  col.classList.add('over');
});
document.addEventListener('drop', function (e) {
  var col = e.target.closest && e.target.closest('[data-drop],[data-drop-guru]');
  if (!col) return;
  e.preventDefault();
  col.classList.remove('over');
  var d = e.dataTransfer.getData('text/plain'), jenis = d.split(':')[0], id = d.slice(jenis.length + 1);
  if (jenis === 'guru' && col.hasAttribute('data-drop-guru')) tukarStatusGuruUI(id, col.getAttribute('data-drop-guru'));
  else if (jenis === 'tempat' && col.hasAttribute('data-drop')) tukarStatus(id, col.getAttribute('data-drop'));
});

/* ================================================================
   MODUL GURU: senarai guru + pengambilan guru baharu
   Tempat mengajar diambil dari lajur Guru dalam tab Tempat.
   ================================================================ */
function normNama(n) {
  return String(n || '').toLowerCase().replace(/^\s*(ust\.?|ustaz|ustazah|ustzh\.?|cikgu|cg\.?)\s+/, '').replace(/\s+/g, ' ').trim();
}
function senaraiGuru() {
  var D = S.D, list = (D.guru || []).map(function (g) { return Object.assign({ daftar: true }, g); });
  var ada = {}; list.forEach(function (g) { ada[normNama(g.nama)] = g; });
  // guru yang ada dalam tab Tempat tapi belum didaftar dalam tab Guru
  D.tempat.forEach(function (t) {
    var k = normNama(t.guru);
    if (!k || ada[k]) return;
    ada[k] = { id: '', nama: t.guru, tel: t.telGuru, status: 'Aktif', daftar: false };
    list.push(ada[k]);
  });
  var aktifT = {}; D.pelajar.forEach(function (p) { if (p.status === 'Aktif') aktifT[p.tempatId] = (aktifT[p.tempatId] || 0) + 1; });
  list.forEach(function (g) {
    var k = normNama(g.nama);
    g.tempat = D.tempat.filter(function (t) { return t.status !== 'Tutup' && normNama(t.guru) === k; });
    g.pelajar = g.tempat.reduce(function (a, t) { return a + (aktifT[t.id] || 0); }, 0);
    var lap = (D.laporan || []).filter(function (l) { return normNama(l.guru) === k || g.tempat.some(function (t) { return t.id === l.tempatId; }); })
      .sort(function (a, b) { return a.tarikh < b.tarikh ? 1 : -1; });
    g.laporanAkhir = lap[0] ? lap[0].tarikh : '';
  });
  return list;
}
function tempatPerluGuru() {
  var perlu = ['Setuju collab', 'Cari guru', 'Recruitment', 'Kelas berjalan', 'Berisiko'];
  return S.D.tempat.filter(function (t) { return perlu.indexOf(t.status) > -1 && !t.guru; });
}
var CHIP_GURU = { 'Calon': 'c-p', 'Temuduga': 'c-b', 'Latihan': 'c-y', 'Aktif': 'c-g', 'Simpanan': 'c-k', 'Tidak diteruskan': 'c-k' };

/* ---- Rekod mengajar: berapa kali setiap guru mengajar dalam sebulan (dari Laporan Kelas) ---- */
// Guru yang dikira ialah guru yang DITULIS dalam laporan (lajur Guru), jadi guru ganti dikira atas nama dia sendiri.
function rekodMengajar(b) {
  var tb = tarikhBulan(b); if (!tb) return { rows: [], tiada: [], sesi: 0 };
  var D = S.D, per = {}, ada = {}, namaRasmi = {};
  senaraiGuru().forEach(function (g) { namaRasmi[normNama(g.nama)] = (g.gelaran ? g.gelaran + ' ' : '') + g.nama; });
  D.tempat.forEach(function (t) { var k = normNama(t.guru); if (k && !namaRasmi[k]) namaRasmi[k] = t.guru; });
  (D.laporan || []).forEach(function (l) {
    var d = tarikh(l.tarikh); if (!d || d.getFullYear() !== tb.y || d.getMonth() !== tb.m) return;
    ada[l.tempatId + '|' + isoHari(d)] = 1;
    var k = normNama(l.guru) || '(guru tidak diisi)', t = TMAP[l.tempatId] || {};
    var r = per[k] = per[k] || { k: k, nama: namaRasmi[k] || l.guru || '(guru tidak diisi)', sesi: [] };
    var tetap = normNama(t.guru);
    r.sesi.push({ d: d, tempatId: l.tempatId, tempat: t.nama || l.tempatNama || l.tempatId, ganti: !!tetap && tetap !== k, guruTetap: t.guru || '', hadir: l.hadir });
  });
  var rows = Object.keys(per).map(function (k) {
    var r = per[k]; r.sesi.sort(function (a, c) { return a.d - c.d; });
    r.n = r.sesi.length; r.ganti = r.sesi.filter(function (x) { return x.ganti; }).length;
    return r;
  }).sort(function (a, c) { return c.n - a.n || (a.nama < c.nama ? -1 : 1); });
  // sesi dijadual tapi tiada laporan (rekod belum lengkap)
  var tiada = [], now = today(), akhir = new Date(tb.y, tb.m + 1, 0), mulaCrm = tarikh(MULA_CRM);
  D.tempat.forEach(function (t) {
    for (var d = new Date(tb.y, tb.m, 1); d <= akhir && d < now; d.setDate(d.getDate() + 1)) {
      if (d < mulaCrm || !adaKelas(t, d) || ada[t.id + '|' + isoHari(d)]) continue;
      tiada.push({ d: new Date(d), t: t });
    }
  });
  return { rows: rows, tiada: tiada, sesi: rows.reduce(function (a, r) { return a + r.n; }, 0) };
}
function kadarSesi() { return num(S.D.tetapan.guru) / 4; }
function hbPendek(d) { return d.getDate() + '/' + (d.getMonth() + 1); }
function kadRekodMengajar() {
  var b = S.bulan, R = rekodMengajar(b), kadar = kadarSesi();
  var jumGanti = R.rows.reduce(function (a, r) { return a + r.ganti; }, 0);
  var h = '<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Rekod mengajar ' + esc(label(b)) + '</h3><span class="sub">dari Laporan Kelas · ' + R.sesi + ' sesi · ' + jumGanti + ' sesi ganti</span>' +
    '<div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">' + monthSelect() + '<button class="btn" data-act="rm-salin">' + ICON.copy + 'Salin untuk finance</button><button class="btn" data-act="cetak">Cetak / PDF</button></div></div>';
  if (!R.rows.length) h += '<div class="card-b"><div class="empty">Belum ada laporan kelas untuk ' + esc(label(b)) + '.</div></div></div>';
  else {
    h += '<div class="tw"><table><thead><tr><th>Guru</th><th class="n">Kali mengajar</th><th>Tarikh mengajar</th><th class="n">Ganti</th><th class="n">Anggaran elaun</th></tr></thead><tbody>' +
      R.rows.map(function (r) {
        var tempatU = uniq(r.sesi.filter(function (x) { return !x.ganti; }).map(function (x) { return x.tempat; }));
        return '<tr><td><span class="nm">' + esc(r.nama) + '</span><div class="m">' + esc(tempatU.join(', ') || 'guru ganti sahaja') + '</div></td>' +
          '<td class="n"><b style="font-size:16px">' + r.n + '</b></td>' +
          '<td>' + r.sesi.map(function (x) {
            return '<span class="chip ' + (x.ganti ? 'c-y' : 'c-b') + '" style="margin:1px 3px 1px 0" title="' + esc(fmt(x.d) + ' · ' + x.tempat + (x.ganti ? ' · ganti ' + x.guruTetap : '') + ' · ' + x.hadir + ' hadir') + '">' +
              hbPendek(x.d) + (x.ganti ? ' ganti ' + esc(x.guruTetap) : '') + (tempatU.length > 1 && !x.ganti ? ' ' + esc(x.tempatId.replace('HYB-', '')) : '') + '</span>';
          }).join('') + '</td>' +
          '<td class="n">' + (r.ganti || '–') + '</td><td class="n">' + rm(r.n * kadar) + '<div class="m">' + r.n + ' × ' + rm(kadar) + '</div></td></tr>';
      }).join('') +
      '<tr class="tot"><td>Jumlah</td><td class="n">' + R.sesi + '</td><td></td><td class="n">' + (jumGanti || '–') + '</td><td class="n"><b>' + rm(R.sesi * kadar) + '</b></td></tr></tbody></table></div>' +
      '<div class="card-b"><div class="m" style="font-size:12px">Kiraan ikut nama guru yang ditulis dalam laporan kelas, jadi guru ganti dikira atas nama dia sendiri dan guru asal tak dikira untuk tarikh itu. Petak kuning ialah sesi ganti. ' +
      'Anggaran elaun = bilangan sesi × ' + rm(kadar) + ' (' + rm(num(S.D.tetapan.guru)) + ' dibahagi 4 sesi, dari Tetapan). Sahkan dengan finance sebelum bayar.</div></div></div>';
  }
  if (R.tiada.length) {
    var kump = {}; R.tiada.forEach(function (x) { (kump[x.t.id] = kump[x.t.id] || { t: x.t, d: [] }).d.push(x.d); });
    h += '<div class="card"><div class="card-h"><h3>Sesi dijadual tanpa laporan</h3><span class="sub">' + R.tiada.length + ' sesi · belum dikira untuk mana-mana guru</span></div><div class="tw"><table><thead><tr><th>Tempat</th><th>Guru tetap</th><th>Tarikh tiada laporan</th></tr></thead><tbody>' +
      Object.keys(kump).map(function (id) { var x = kump[id];
        return '<tr class="click" data-profil="' + esc(id) + '"><td><span class="nm">' + esc(x.t.nama) + '</span><div class="m">' + esc(id + ' · ' + (x.t.hariMasa || '')) + '</div></td><td>' + esc(x.t.guru || '–') + '</td><td>' +
          x.d.map(function (d) { return '<span class="chip c-r" style="margin:1px 3px 1px 0">' + hbPendek(d) + '</span>'; }).join('') + '</td></tr>'; }).join('') +
      '</tbody></table></div><div class="card-b"><div class="m" style="font-size:12px">Sama ada kelas tak berjalan (cuti) atau guru belum hantar laporan. Minta guru hantar laporan supaya sesi itu dikira.</div></div></div>';
  }
  return h;
}
function teksRekodMengajar() {
  var b = S.bulan, R = rekodMengajar(b), kadar = kadarSesi(), L = ['*Rekod mengajar guru HYB: ' + label(b) + '*', ''];
  R.rows.forEach(function (r) {
    L.push('*' + r.nama + '*: ' + r.n + ' kali' + (r.ganti ? ' (termasuk ' + r.ganti + ' ganti)' : '') + ' · anggaran ' + rm(r.n * kadar));
    r.sesi.forEach(function (x) { L.push('  ' + fmt(x.d) + ' · ' + x.tempat + (x.ganti ? ' (ganti ' + x.guruTetap + ')' : '')); });
  });
  L.push(''); L.push('Jumlah: ' + R.sesi + ' sesi · anggaran ' + rm(R.sesi * kadar) + ' (' + rm(kadar) + ' setiap sesi)');
  if (R.tiada.length) { L.push(''); L.push('Belum ada laporan (' + R.tiada.length + ' sesi): ' + R.tiada.map(function (x) { return hbPendek(x.d) + ' ' + x.t.id.replace('HYB-', ''); }).join(', ')); }
  return L.join('\n');
}

function renderGuru() {
  var D = S.D, tab = S.guruTab || 'senarai', tulis = bolehTulis();
  var gs = senaraiGuru(), perlu = tempatPerluGuru();
  var aktif = gs.filter(function (g) { return g.status === 'Aktif'; });
  var proses = gs.filter(function (g) { return ['Calon', 'Temuduga', 'Latihan'].indexOf(g.status) > -1; });
  var belum = gs.filter(function (g) { return !g.daftar; });

  var h = '<div class="top"><div><div class="eyebrow">' + eyebrow() + '</div><h1>Guru <em>HYB</em></h1></div><div class="top-r">' +
    (tulis ? '<button class="btn pri" data-act="guru-baru">' + ICON.plus + 'Guru / calon baharu</button>' : '') +
    '<button class="btn" data-act="muat">' + ICON.refresh + 'Muat semula</button></div></div>';
  h += '<div class="grid kpis k4">' +
    '<div class="card kpi"><div class="l">Guru aktif</div><div class="v">' + aktif.length + '</div><div class="s">mengajar di ' + aktif.reduce(function (a, g) { return a + g.tempat.length; }, 0) + ' tempat</div></div>' +
    '<div class="card kpi"><div class="l">Tempat perlu guru</div><div class="v' + (perlu.length ? ' neg' : '') + '">' + perlu.length + '</div><div class="s">' + esc(perlu.map(function (t) { return t.id.replace('HYB-', ''); }).join(', ') || 'semua ada guru') + '</div></div>' +
    '<div class="card kpi"><div class="l">Calon dalam proses</div><div class="v">' + proses.length + '</div><div class="s">calon, temuduga, latihan</div></div>' +
    '<div class="card kpi"><div class="l">Simpanan</div><div class="v">' + gs.filter(function (g) { return g.status === 'Simpanan'; }).length + '</div><div class="s">guru ganti bila perlu</div></div></div>';

  h += '<div class="tabs" style="margin:0 0 12px"><button data-guru-tab="senarai"' + (tab === 'senarai' ? ' class="on"' : '') + '>Senarai guru<span class="c">' + gs.length + '</span></button>' +
    '<button data-guru-tab="pengambilan"' + (tab === 'pengambilan' ? ' class="on"' : '') + '>Pengambilan guru baharu<span class="c">' + proses.length + '</span></button>' +
    '<button data-guru-tab="rekod"' + (tab === 'rekod' ? ' class="on"' : '') + '>Rekod mengajar</button></div>';
  if (tab === 'rekod') { $('#view').innerHTML = h + kadRekodMengajar(); return; }

  if (tab === 'senarai') {
    if (belum.length && tulis) h += '<div class="alert y">' + belum.length + ' guru dalam tab Tempat belum didaftar dalam senarai guru (' + esc(belum.map(function (g) { return g.nama; }).join(', ')) +
      '). Klik <b>Daftar</b> untuk simpan nombor, kelayakan dan status mereka.</div>';
    h += '<div class="card"><div class="tw"><table><thead><tr><th>Guru</th><th>Status</th><th>Tempat mengajar</th><th class="n">Pelajar</th><th>Laporan terakhir</th><th>No. tel</th><th></th></tr></thead><tbody>';
    var urut = ['Aktif', 'Latihan', 'Temuduga', 'Calon', 'Simpanan', 'Tidak diteruskan'];
    gs.slice().sort(function (a, b) { return urut.indexOf(a.status) - urut.indexOf(b.status) || (a.nama < b.nama ? -1 : 1); }).forEach(function (g) {
      var w = waLink(g.tel, 'Assalamualaikum ' + (g.gelaran ? g.gelaran + ' ' : '') + g.nama + ', saya dari HYB.');
      var la = tarikh(g.laporanAkhir), lama = la ? hariBeza(today(), la) : null;
      var ak = g.id && (D.aksesGuru || {})[g.id];
      h += '<tr><td><span class="nm">' + esc((g.gelaran ? g.gelaran + ' ' : '') + g.nama) + '</span><div class="m">' + esc(g.id || 'belum didaftar') + (g.kawasan ? ' · ' + esc(g.kawasan) : '') + '</div>' +
        (ak ? '<span class="chip c-g" title="Link laporan dijana ' + esc(fmtV(String(ak.dicipta).slice(0, 10))) + '" style="margin-top:3px">Link laporan aktif</span>' : '') + '</td>' +
        '<td>' + chip(g.status, CHIP_GURU[g.status]) + '</td>' +
        '<td>' + (g.tempat.length ? g.tempat.map(function (t) { return '<button class="chip c-b chip-btn" data-profil="' + esc(t.id) + '">' + esc(t.id.replace('HYB-', '') + ' · ' + t.nama) + (t.hariMasa ? ' · ' + esc(t.hariMasa) : '') + '</button>'; }).join(' ') : '<span class="m">–</span>') + '</td>' +
        '<td class="n">' + (g.pelajar || '–') + '</td>' +
        '<td>' + (la ? esc(fmt(la)) + (lama > 10 ? ' ' + chip(lama + ' hari lepas', 'c-y') : '') : (g.tempat.length ? '<span class="m">belum ada</span>' : '<span class="m">–</span>')) + '</td>' +
        '<td>' + (g.tel ? esc(g.tel) + (w ? ' <a class="btn sm wa" href="' + esc(w) + '" target="_blank" rel="noopener">' + ICON.wa + '</a>' : '') : '<span class="m">–</span>') + '</td>' +
        '<td style="white-space:nowrap">' + (bolehLink() && g.daftar && ['Aktif', 'Latihan', 'Simpanan'].indexOf(g.status) > -1 ? '<button class="btn sm" data-act="link-guru" data-id="' + esc(g.id) + '">Link laporan</button> ' : '') +
          (tulis ? (g.daftar ? '<button class="btn sm" data-act="edit-guru" data-id="' + esc(g.id) + '">' + ICON.edit + 'Edit</button>'
          : '<button class="btn sm pri" data-act="daftar-guru" data-nama="' + esc(g.nama) + '">Daftar</button>') : '') + '</td></tr>';
    });
    if (!gs.length) h += '<tr><td colspan="7" class="empty" style="text-align:center;padding:28px">Belum ada guru.</td></tr>';
    h += '</tbody></table></div></div>';
  } else {
    // Pengambilan
    h += '<div class="grid two" style="grid-template-columns:minmax(0,1fr) 300px">';
    h += '<div><div class="hint" style="margin:0 0 10px">' + (tulis ? 'Seret kad calon ke lajur seterusnya bila status berubah. Bila calon jadi Aktif, edit dan pilih tempat untuk tugaskan dia.' : 'Paparan sahaja.') + '</div><div class="kanban">' +
      D.statusGuru.map(function (s) {
        var l = gs.filter(function (g) { return g.daftar && g.status === s; });
        return '<section class="kcol' + (l.length ? '' : ' kosong') + '" data-drop-guru="' + esc(s) + '"><header>' + chip(s, CHIP_GURU[s]) + '<b>' + l.length + '</b></header><div class="kbody">' +
          (l.length ? l.map(function (g) {
            var tt = tarikh(g.tarikhTemuduga), beza = tt ? hariBeza(tt, today()) : null;
            return '<article class="kcard" draggable="' + (tulis ? 'true' : 'false') + '" data-card-guru="' + esc(g.id) + '" data-act="edit-guru" data-id="' + esc(g.id) + '">' +
              '<div class="kt">' + esc((g.gelaran ? g.gelaran + ' ' : '') + g.nama) + '</div><div class="km">' + esc(g.id) + (g.kawasan ? ' · ' + esc(g.kawasan) : '') + '</div>' +
              (g.tempat.length ? '<div class="km">Mengajar: ' + esc(g.tempat.map(function (t) { return t.id.replace('HYB-', ''); }).join(', ')) + '</div>' : '') +
              (g.tarikhMohon ? '<div class="km">Mohon ' + esc(fmtV(g.tarikhMohon)) + (g.sumber ? ' · ' + esc(g.sumber) : '') + '</div>' : '') +
              (tt && g.status === 'Temuduga' ? '<div class="kchips">' + chip('Temuduga ' + fmt(tt) + (beza < 0 ? ' (lepas)' : beza === 0 ? ' (hari ini)' : ''), beza < 0 ? 'c-y' : 'c-b') + '</div>' : '') +
              (g.kelayakan ? '<div class="kn">' + esc(g.kelayakan.slice(0, 90)) + (g.kelayakan.length > 90 ? '…' : '') + '</div>' : '') + '</article>';
          }).join('') : '<div class="kempty">' + (tulis ? 'Seret ke sini' : 'Tiada') + '</div>') + '</div></section>';
      }).join('') + '</div></div>';
    h += '<div class="stack"><div class="card"><div class="card-h"><h3>Tempat perlu guru</h3><span class="sub r">' + perlu.length + '</span></div><div class="card-b">' +
      (perlu.length ? '<ul class="plist">' + perlu.map(function (t) {
        var akt = D.pelajar.filter(function (p) { return p.tempatId === t.id && p.status === 'Aktif'; }).length;
        return '<li class="click" data-profil="' + esc(t.id) + '"><div style="min-width:0"><div class="nm">' + esc(t.nama) + '</div><div class="m">' + esc(t.id + ' · ' + (t.hariMasa || 'hari belum ditetapkan') + ' · ' + akt + ' pelajar') + '</div></div><div style="margin-left:auto">' + chip(t.status) + '</div></li>';
      }).join('') + '</ul>' : '<div class="empty">Semua tempat dah ada guru.</div>') +
      '<div class="hint">Kelas yang dah berjalan tanpa guru direkod patut diisi dahulu, sebab laporan kelas dan amaran bergantung pada nama guru.</div></div></div>';
    if (!(D.guru || []).length) h += '<div class="card"><div class="card-b" style="padding-top:16px"><b>Mula di sini</b><p style="margin:6px 0 0;color:var(--ink-2);font-size:13px">Tambah calon pertama dengan butang "Guru / calon baharu". Tab <b>Guru</b> dalam Sheet akan dicipta automatik semasa simpan pertama.</p></div></div>';
    h += '</div></div>';
  }
  $('#view').innerHTML = h;
}

function borangGuru(g, prefill) {
  var D = S.D, baru = !g || !g.id;
  g = g || {};
  var nilai = baru ? Object.assign(prefill && prefill.nama ? { status: 'Aktif' } : { status: 'Calon', tarikhMohon: isoHari() }, prefill || {}) : g;
  var tempatSemasa = D.tempat.filter(function (t) { return normNama(t.guru) === normNama(g.nama || (prefill || {}).nama); }).map(function (t) { return t.id; });
  bukaBorang({
    tajuk: baru ? (prefill && prefill.nama ? 'Daftar guru' : 'Guru / calon baharu') : 'Edit guru',
    sub: baru ? 'ID guru dijana automatik. Tab Guru dalam Sheet dicipta semasa simpan pertama.' : g.id + (tempatSemasa.length ? ' · mengajar di ' + tempatSemasa.join(', ') : ''),
    fn: 'simpanGuru', butang: 'Simpan', nilai: nilai,
    fields: [
      { k: 'gelaran', l: 'Gelaran', type: 'select', opts: ['Ustaz', 'Ustazah', 'Cikgu'], kosong: '(tiada)' },
      { k: 'nama', l: 'Nama', req: 1, ph: 'Contoh: Muadz bin Ahmad' },
      { k: 'tel', l: 'No. tel', type: 'tel', ph: '012-345 6789' },
      { k: 'emel', l: 'Emel', type: 'email', help: 'Untuk akses guru ke app dalam Fasa 5.' },
      { k: 'kawasan', l: 'Kawasan tinggal', list: uniq(D.tempat.map(function (t) { return t.kawasan; })), help: 'Untuk padankan dengan tempat yang dekat.' },
      { k: 'status', l: 'Status', type: 'select', req: 1, kosong: false, opts: D.statusGuru },
      { k: 'sumber', l: 'Sumber', list: ['Rujukan guru sedia ada', 'AJK masjid', 'Iklan Facebook', 'Group WhatsApp', 'Alumni GNG', 'Lain-lain'] },
      { k: 'tarikhMohon', l: 'Tarikh mohon', type: 'date' },
      { k: 'tarikhTemuduga', l: 'Tarikh temuduga', type: 'date', show: function (v) { return ['Temuduga', 'Latihan', 'Aktif', 'Simpanan'].indexOf(v.status) > -1; } },
      { k: 'tarikhMula', l: 'Tarikh mula mengajar', type: 'date', show: function (v) { return v.status === 'Aktif'; } },
      { k: 'tempatId', l: 'Tugaskan ke tempat (pilihan)', type: 'select', kosong: '(tiada perubahan)', full: 1,
        opts: D.tempat.filter(function (t) { return t.status !== 'Tutup'; }).map(function (t) { return { v: t.id, l: t.id + ' · ' + t.nama + (t.guru ? ' (guru sekarang: ' + t.guru + ')' : ' (tiada guru)') }; }),
        help: 'Nama dan nombor guru akan ditulis ke tab Tempat. Guru lama tempat itu akan diganti.', show: function (v) { return v.status === 'Aktif' || v.status === 'Latihan'; } },
      { k: 'kelayakan', l: 'Kelayakan / pengalaman', type: 'textarea', full: 1, ph: 'Contoh: Tauliah mengajar JAIS, 3 tahun mengajar KAFA, bacaan bertajwid baik' },
      { k: 'catatan', l: 'Catatan', type: 'textarea', full: 1, ph: 'Contoh: Hanya boleh Sabtu pagi' }
    ],
    semak: function (v) {
      if (v.emel && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.emel)) return 'Format emel tidak sah.';
      if (v.tempatId) { var t = TMAP[v.tempatId]; if (t && t.guru && normNama(t.guru) !== normNama(v.nama) && !SAH_GANTI[v.tempatId]) { SAH_GANTI[v.tempatId] = 1; return t.id + ' sekarang diajar oleh ' + t.guru + '. Tekan Simpan sekali lagi untuk ganti.'; } }
      return '';
    },
    pre: function (v) { v.id = g.id || ''; SAH_GANTI = {}; return v; },
    lepas: function () { S.view = 'guru'; render(true); }
  });
}
var SAH_GANTI = {};

function tukarStatusGuruUI(id, status) {
  var g = (S.D.guru || []).filter(function (x) { return x.id === id; })[0];
  if (!g || g.status === status || !bolehTulis()) { render(true); return; }
  var lama = g.status; g.status = status; render(true);
  hantar('tukarStatusGuru', { id: id, status: status, statusLama: lama }, function (res) {
    toast(res.mesej + (status === 'Aktif' ? '. Edit guru untuk tugaskan ke tempat.' : ''));
  }, function (m) { var x = (S.D.guru || []).filter(function (y) { return y.id === id; })[0]; if (x) x.status = lama; render(true); toast('Tak berjaya: ' + m); });
}
/* ================================================================
   FASA 3: KUTIPAN YURAN
   ================================================================ */
var KS = { tempat: '', status: 'Aktif', q: '', yuran: '', pilih: {}, tarikh: '' };
var SINGKAT = { 'Dibayar': '✓', 'Belum bayar': 'B', 'Tertunggak': 'T', 'Ditaja': 'J', 'Dikecualikan': 'K' };
var KELAS_Y = { 'Dibayar': 'g', 'Belum bayar': 'y', 'Tertunggak': 'r', 'Ditaja': 'b', 'Dikecualikan': 'k' };

/* Tarikh bayar: dari lejar S.D.bayaran (tab Rekod Bayaran) */
var TB_CACHE = null, TB_SRC = null;
function petaTarikhBayar() {
  if (TB_SRC === S.D.bayaran && TB_CACHE) return TB_CACHE;
  var net = {}, masa = {}, amt = {};
  (S.D.bayaran || []).forEach(function (x) { var k = x.pelajarId + '|' + x.bulan; net[k] = (net[k] || 0) + (x.amaun > 0 ? 1 : -1); if (x.amaun > 0) { masa[k] = x.masa; amt[k] = +x.amaun; } });
  var o = {}, a = {}; Object.keys(masa).forEach(function (k) { if (net[k] > 0) { o[k] = masa[k]; a[k] = amt[k]; } });
  TB_SRC = S.D.bayaran; TB_CACHE = o; TB_AMAUN = a; return o;
}
var TB_AMAUN = {};
// Amaun sebenar dibayar (dari lejar). 0 = tiada rekod, guna yuran tempat.
function amaunBayar(id, bulan) { petaTarikhBayar(); return TB_AMAUN[id + '|' + bulan] || 0; }
function yuranPelajar(p) { return num((TMAP[p.tempatId] || {}).yuran) || num(S.D.tetapan.yuranStandard); }
// Teks tambahan bila amaun dibayar lain dari yuran tempat, contoh " · RM25"
function amaunLain(p, bulan) { var a = amaunBayar(p.id, bulan); return a && a !== yuranPelajar(p) ? ' · RM' + a : ''; }
function tarikhBayar(id, bulan) { var m = petaTarikhBayar()[id + '|' + bulan]; return m ? String(m).slice(0, 10) : ''; }
function fmtPendek(iso) { var d = tarikh(iso); return d ? pad(d.getDate()) + '/' + pad(d.getMonth() + 1) : ''; }
function tarikhPilih() { return KS.tarikh || isoHari(today()); }
// Tarikh & amaun bayaran. Jika belum Dibayar: tanda Dibayar dengan amaun lain (contoh daftar pertengahan bulan).
function modalTarikhBayar(id, bulan) {
  var p = cariPelajar(id); if (!p) return;
  var sudah = p.yuran[bulan] === 'Dibayar', ada = sudah ? tarikhBayar(id, bulan) : '', y = yuranPelajar(p), a = (sudah && amaunBayar(id, bulan)) || y;
  $('#overlay').innerHTML = '<div class="scrim" data-close></div><div class="modal"><h3>' + (sudah ? 'Tarikh & amaun bayar: ' : 'Tanda Dibayar (amaun lain): ') + esc(cap(p.nama)) + '</h3>' +
    '<p style="margin:0 0 10px;color:var(--ink-2)">' + esc(label(bulan)) + ' · yuran tempat RM' + y + (sudah ? ' · ' + (ada ? 'direkod ' + fmt(tarikh(ada)) + ', RM' + a : 'belum ada tarikh direkod') : '') +
    '. Status kekal <b>Dibayar</b>, jadi tiada tunggakan atau peringatan untuk bulan ini. Kutipan dikira ikut amaun sebenar.</p>' +
    '<div class="fld"><label for="tb_d">Tarikh bayar</label><input class="inp" type="date" id="tb_d" max="' + isoHari(today()) + '" value="' + esc(ada || tarikhPilih()) + '"></div>' +
    '<div class="fld"><label for="tb_a">Amaun dibayar (RM)</label><input class="inp" type="number" inputmode="decimal" min="1" max="5000" step="0.01" id="tb_a" value="' + esc(a) + '" data-asal="' + esc(a) + '" data-yuran="' + esc(y) + '"></div>' +
    '<div class="fld"><label for="tb_s">Sebab (wajib jika amaun lain dari RM' + y + ')</label><input class="inp" id="tb_s" maxlength="200" placeholder="cth: daftar 14/11, bayar separuh bulan"></div>' +
    '<div class="row"><button class="btn" data-close>Batal</button><button class="btn pri" data-act="tb-simpan" data-id="' + esc(id) + '" data-bln="' + esc(bulan) + '">' + (sudah ? 'Simpan' : 'Tanda Dibayar') + '</button></div></div>';
}

function ubahYuran(bulan, ubah, sebab, ok, tbx) {
  if (!ubah.length) { toast('Tiada pelajar yang perlu diubah'); return; }
  var tb = tbx || tarikhPilih(), adaBayar = ubah.some(function (x) { return x.ke === 'Dibayar'; });
  // optimistik: kemas kini paparan dahulu, pulih jika gagal
  var lama = ubah.map(function (x) { var p = cariPelajar(x.id); return { p: p, v: p ? p.yuran[bulan] : '' }; });
  ubah.forEach(function (x) { var p = cariPelajar(x.id); if (p) p.yuran[bulan] = x.ke; });
  render(true);
  hantar('kemaskiniYuran', { bulan: bulan, ubah: ubah, sebab: sebab || '', tarikhBayar: adaBayar ? tb : '' }, function (res) { toast(res.mesej + (adaBayar ? ' · tarikh bayar ' + fmt(tarikh(tb)) : '')); if (ok) ok(res); },
    function (m) { lama.forEach(function (x) { if (x.p) x.p.yuran[bulan] = x.v; }); render(true); toast('Tak berjaya: ' + m); });
}
function cariPelajar(id) { return S.D.pelajar.filter(function (p) { return p.id === id; })[0]; }

/* ---------- Bayaran Masjid (sewa ruang kelas, duit keluar) ---------- */
// Tetapan: S.D.sewa.tetapan (tab "Sewa Masjid"). Rekod: S.D.sewa.rekod (tab "Rekod Bayaran Masjid"), baris terakhir = status.
var SEWA_DARI = 1, SEWA_HINGGA = 10;
function sewaCfg(tid) { return ((S.D.sewa || {}).tetapan || []).filter(function (x) { return x.tempatId === tid; })[0]; }
function sewaRekod(tid, b) { var L = ((S.D.sewa || {}).rekod || []).filter(function (r) { return r.tempatId === tid && r.bulan === b; }); return L[L.length - 1] || null; }
function sewaStatus(tid, b) { var r = sewaRekod(tid, b); return r && r.status !== 'Dibatalkan' ? r : null; }
function sewaWaive(tid, b) { var r = sewaStatus(tid, b), c = sewaCfg(tid); return r && r.status === 'Waive' && c ? num(c.amaun) : 0; }
function sewaJalan(t, b) {
  var tb = tarikhBulan(b); if (!tb || !t) return false;
  var mula = tarikh(t.tarikhMula), akhir = new Date(tb.y, tb.m + 1, 0);
  return JALAN.indexOf(t.status) > -1 && (!mula || mula <= akhir);
}
function senaraiSewa(b) {
  return ((S.D.sewa || {}).tetapan || []).map(function (c) {
    var t = TMAP[c.tempatId] || {}, st = sewaStatus(c.tempatId, b), perlu = c.aktif && num(c.amaun) > 0 && sewaJalan(t, b);
    return { c: c, t: t, st: st, perlu: perlu || !!st };
  });
}
function nSewaBelum() {
  if (!S.D || !S.D.sewa || !isBulanIni()) return 0;
  return senaraiSewa(S.bulan).filter(function (x) { return x.perlu && !x.st; }).length;
}
function itemSewa() {
  if (!isBulanIni()) return [];
  var d = today().getDate(), L = senaraiSewa(S.bulan).filter(function (x) { return x.perlu && !x.st; });
  if (!L.length) return [];
  var lewat = d > SEWA_HINGGA;
  return [{ s: lewat ? 0 : 2, dot: lewat ? 'r' : 'y', t: L.length + ' masjid belum dibayar sewa ' + label(S.bulan),
    d: L.map(function (x) { return x.t.nama || x.c.tempatId; }).join(', ') + (lewat ? ' · lepas ' + SEWA_HINGGA + 'hb' : ' · bayar sebelum ' + SEWA_HINGGA + 'hb'),
    x: lewat ? chip('LEWAT', 'c-r') : '<button class="link" data-nav="masjid">Buka</button>' }];
}
function renderMasjid() {
  var b = S.bulan, L = senaraiSewa(b), tulis = bolehTulis(), urus = bolehUrusPenaja(), now = today(), cur = isBulanIni(), d = now.getDate();
  var perlu = L.filter(function (x) { return x.perlu; });
  var bayar = perlu.filter(function (x) { return x.st && x.st.status === 'Dibayar'; }), waive = perlu.filter(function (x) { return x.st && x.st.status === 'Waive'; });
  var belum = perlu.filter(function (x) { return !x.st; });
  var rmP = perlu.reduce(function (a, x) { return a + num(x.c.amaun); }, 0), rmB = bayar.reduce(function (a, x) { return a + num(x.st.amaun); }, 0);
  var rmW = waive.reduce(function (a, x) { return a + num(x.c.amaun); }, 0), rmBl = belum.reduce(function (a, x) { return a + num(x.c.amaun); }, 0);
  var h = '<div class="top"><div><div class="eyebrow">' + eyebrow() + '</div><h1>Bayaran <em>Masjid</em></h1></div><div class="top-r">' + monthSelect() +
    (urus ? '<button class="btn" data-act="sw-tetapan">' + ICON.plus + 'Tambah tempat</button>' : '') +
    '<button class="btn" data-act="muat">' + ICON.refresh + 'Muat semula</button></div></div>';
  if (cur && belum.length) h += '<div class="alert ' + (d > SEWA_HINGGA ? 'r' : 'y') + ' sw-alert">' + (d > SEWA_HINGGA ?
      '<b>Lewat.</b> Tempoh bayar ' + SEWA_DARI + '-' + SEWA_HINGGA + 'hb dah lepas. ' + belum.length + ' masjid belum dibayar (' + rm(rmBl) + ').' :
      '<b>Tempoh bayar ' + SEWA_DARI + '-' + SEWA_HINGGA + 'hb.</b> ' + belum.length + ' masjid belum dibayar (' + rm(rmBl) + '), ' + (SEWA_HINGGA - d) + ' hari lagi.') + '</div>';
  else if (cur && perlu.length) h += '<div class="alert k sw-alert">Semua bayaran masjid ' + esc(label(b)) + ' dah selesai.</div>';
  h += '<div class="grid kpis k4">' +
    '<div class="card kpi sw-kpi"><div class="l">Perlu bayar ' + esc(label(b)) + '</div><div class="v">' + rm(rmP) + '</div><div class="s">' + perlu.length + ' tempat · bayar ' + SEWA_DARI + '-' + SEWA_HINGGA + 'hb</div></div>' +
    '<div class="card kpi sw-kpi"><div class="l">Dah dibayar</div><div class="v pos">' + rm(rmB) + '</div><div class="s">' + bayar.length + ' tempat</div></div>' +
    '<div class="card kpi sw-kpi"><div class="l">Waive</div><div class="v">' + rm(rmW) + '</div><div class="s">' + waive.length + ' tempat · kos bulan ini turun</div></div>' +
    '<div class="card kpi sw-kpi"><div class="l">Belum dibayar</div><div class="v' + (belum.length ? ' neg' : '') + '">' + rm(rmBl) + '</div><div class="s">' + belum.length + ' tempat</div></div></div>';
  h += '<div class="card sw-card" style="margin-bottom:14px"><div class="card-h"><h3>Sewa masjid ' + esc(label(b)) + '</h3><span class="sub">duit keluar · simpan resit untuk setiap bayaran</span></div>';
  if (!L.length) h += '<div class="card-b"><div class="empty">Belum ada tempat dalam tetapan bayaran masjid.' + (urus ? ' Tekan Tambah tempat.' : '') + '</div></div>';
  else h += '<div class="tw"><table><thead><tr><th>Tempat</th><th>Penerima</th><th class="n">Amaun</th><th>Status</th><th></th></tr></thead><tbody>' +
    L.map(function (x) {
      var c = x.c, t = x.t, st = x.st, id = esc(c.tempatId);
      var stH = !x.perlu ? chip(c.aktif ? 'Belum berjalan' : 'Tidak aktif', 'c-k') + '<div class="m">' + esc(c.aktif ? 'kelas belum berjalan bulan ini' : 'tiada bayaran') + '</div>' :
        !st ? chip(cur && d > SEWA_HINGGA ? 'Lewat' : 'Belum bayar', cur && d > SEWA_HINGGA ? 'c-r' : 'c-y') :
        st.status === 'Waive' ? chip('Waive', 'c-b') + '<div class="m">' + esc(st.catatan || '') + '</div>' :
        chip('Dibayar', 'c-g') + '<div class="m">' + rm(st.amaun) + ' · ' + fmt(tarikh(st.masa.slice(0, 10))) + ' · ' + esc(st.resit) + '</div>';
      var btn = '';
      if (tulis && x.perlu && !st) btn += '<button class="btn sm pri" data-act="sw-bayar" data-id="' + id + '">Bayar</button> <button class="btn sm" data-act="sw-waive" data-id="' + id + '">Waive</button> ';
      if (st && st.status === 'Dibayar') btn += '<button class="btn sm" data-act="sw-resit" data-id="' + id + '">Resit</button> ';
      if (tulis && st) btn += '<button class="btn sm" data-act="sw-batal" data-id="' + id + '">Batal</button> ';
      if (urus) btn += '<button class="btn sm" data-act="sw-tetapan" data-id="' + id + '">' + ICON.edit + 'Tetapan</button>';
      return '<tr><td><span class="nm">' + esc(t.nama || c.tempatId) + '</span><div class="m">' + id + ' · ' + esc(t.status || '') + '</div></td>' +
        '<td>' + esc(c.penerima || '–') + (c.cara ? '<div class="m">' + esc(c.cara) + '</div>' : '') + '</td><td class="n">' + rm(c.amaun) + '</td><td>' + stH + '</td>' +
        '<td style="white-space:nowrap;text-align:right">' + btn + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  h += '<div class="card-b"><div class="m" style="font-size:12px">Bayar setiap ' + SEWA_DARI + '-' + SEWA_HINGGA + 'hb. Masjid mungkin tak keluarkan invois, jadi setiap bayaran dapat resit HYB sendiri (butang Resit) untuk dicetak atau disimpan sebagai PDF dan ditandatangan penerima. ' +
    'Waive bermaksud masjid kecualikan sewa bulan itu; kos tetap tempat itu turun ikut amaun sewa, jadi untung sebenar ikut kos sebenar. Tempat yang belum berjalan tak perlu dibayar sehingga kelas bermula.</div></div></div>';
  var rk = ((S.D.sewa || {}).rekod || []).filter(function (r) { return r.bulan === b; }).slice().reverse();
  if (rk.length) h += '<div class="card"><div class="card-h"><h3>Sejarah rekod ' + esc(label(b)) + '</h3></div><div class="tw"><table><thead><tr><th>Masa</th><th>Tempat</th><th>Status</th><th class="n">RM</th><th>Resit / rujukan</th><th>Oleh</th></tr></thead><tbody>' +
    rk.map(function (r) { return '<tr><td>' + fmt(tarikh(r.masa.slice(0, 10))) + '</td><td>' + esc((TMAP[r.tempatId] || {}).nama || r.tempatId) + '</td><td>' + chip(r.status, r.status === 'Dibayar' ? 'c-g' : r.status === 'Waive' ? 'c-b' : 'c-k') + '</td>' +
      '<td class="n">' + (r.amaun ? rm(r.amaun) : '–') + '</td><td>' + esc([r.resit, r.cara, r.rujukan].filter(Boolean).join(' · ') || r.catatan || '–') + '</td><td><span class="m">' + esc(r.oleh) + '</span></td></tr>'; }).join('') + '</tbody></table></div></div>';
  $('#view').innerHTML = h;
}
function modalSewa(tid, jenis) {
  var c = sewaCfg(tid), t = TMAP[tid] || {}; if (!c) return;
  var w = jenis === 'waive';
  $('#overlay').innerHTML = '<div class="scrim" data-close></div><div class="modal"><h3>' + (w ? 'Waive sewa: ' : 'Bayar sewa: ') + esc(t.nama || tid) + '</h3>' +
    '<p style="margin:0 0 10px;color:var(--ink-2)">' + esc(label(S.bulan)) + ' · ' + esc(c.penerima || '') + ' · ' + rm(c.amaun) + ' sebulan.' + (w ? ' Kos tetap tempat ini untuk bulan ini akan turun ' + rm(c.amaun) + '.' : '') + '</p>' +
    (w ? '<div class="fld"><label for="sw_c">Sebab waive</label><input class="inp" id="sw_c" maxlength="500" placeholder="Contoh: AJK masjid kecualikan sewa Disember"></div>' :
      '<div class="fld"><label for="sw_d">Tarikh bayar</label><input class="inp" type="date" id="sw_d" max="' + isoHari(today()) + '" value="' + isoHari(today()) + '"></div>' +
      '<div class="fld"><label for="sw_rm">Amaun (RM)</label><input class="inp" type="number" min="1" step="0.01" id="sw_rm" value="' + esc(String(c.amaun || '')) + '"></div>' +
      '<div class="fld"><label for="sw_cara">Cara bayar</label><select class="sel" id="sw_cara">' + ['Pindahan bank', 'Tunai', 'DuitNow / QR', 'Cek'].map(function (x) { return '<option>' + x + '</option>'; }).join('') + '</select></div>' +
      '<div class="fld"><label for="sw_ruj">No. rujukan / transaksi (pilihan)</label><input class="inp" id="sw_ruj" maxlength="120"></div>' +
      '<div class="fld"><label for="sw_c">Catatan (pilihan)</label><input class="inp" id="sw_c" maxlength="500" placeholder="Contoh: invois masjid no. 12"></div>') +
    '<div class="row"><button class="btn" data-close>Batal</button><button class="btn pri" data-act="' + (w ? 'sw-waive-simpan' : 'sw-bayar-simpan') + '" data-id="' + esc(tid) + '">' + (w ? 'Tanda waive' : 'Simpan & jana resit') + '</button></div></div>';
}
function modalSewaTetapan(tid) {
  var c = tid ? sewaCfg(tid) : null, ada = ((S.D.sewa || {}).tetapan || []).map(function (x) { return x.tempatId; });
  c = c || { tempatId: '', penerima: '', amaun: 250, aktif: true, cara: '', catatan: '' };
  var opt = function (v, l, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(l) + '</option>'; };
  $('#overlay').innerHTML = '<div class="scrim" data-close></div><div class="modal"><h3>' + (tid ? 'Tetapan bayaran ' + esc(tid) : 'Tambah tempat perlu bayar') + '</h3>' +
    '<div class="fld"><label for="swt_t">Tempat</label><select class="sel" id="swt_t"' + (tid ? ' disabled' : '') + '>' + opt('', '(pilih tempat)', c.tempatId) +
      S.D.tempat.filter(function (t) { return t.id === tid || ada.indexOf(t.id) < 0; }).map(function (t) { return opt(t.id, t.id + ' · ' + t.nama, c.tempatId); }).join('') + '</select></div>' +
    '<div class="fld"><label for="swt_p">Penerima (nama masjid / bendahari)</label><input class="inp" id="swt_p" maxlength="120" value="' + esc(c.penerima) + '"></div>' +
    '<div class="fld"><label for="swt_rm">Amaun sebulan (RM)</label><input class="inp" type="number" min="0" step="0.01" id="swt_rm" value="' + esc(String(c.amaun)) + '"></div>' +
    '<div class="fld"><label for="swt_cara">Cara bayar / no. akaun (pilihan)</label><input class="inp" id="swt_cara" maxlength="200" value="' + esc(c.cara) + '"></div>' +
    '<div class="fld"><label for="swt_a">Status</label><select class="sel" id="swt_a">' + opt('Ya', 'Aktif: perlu bayar setiap bulan', c.aktif ? 'Ya' : 'Tidak') + opt('Tidak', 'Tidak aktif: tak perlu bayar', c.aktif ? 'Ya' : 'Tidak') + '</select></div>' +
    '<div class="fld"><label for="swt_c">Catatan</label><input class="inp" id="swt_c" maxlength="500" value="' + esc(c.catatan) + '"></div>' +
    '<div class="row"><button class="btn" data-close>Batal</button><button class="btn pri" data-act="sw-tetapan-simpan" data-id="' + esc(tid || '') + '">Simpan</button></div></div>';
}
function bukaResit(tid) {
  var st = sewaStatus(tid, S.bulan), c = sewaCfg(tid) || {}, t = TMAP[tid] || {};
  if (!st || st.status !== 'Dibayar') { toast('Tiada bayaran untuk dicetak'); return; }
  var r = '<div class="resit" id="resitBox"><div class="resit-h"><div><b>HALAQAH YA BUNAYYA</b><span>Geng Ngaji Global</span></div><div class="resit-no"><span>RESIT BAYARAN</span><b>' + esc(st.resit) + '</b></div></div>' +
    '<table class="resit-t"><tr><th>Tarikh bayar</th><td>' + fmt(tarikh(st.masa.slice(0, 10))) + '</td></tr>' +
    '<tr><th>Dibayar kepada</th><td>' + esc(c.penerima || t.nama || tid) + '</td></tr>' +
    '<tr><th>Untuk</th><td>Sewa ruang kelas Halaqah Ya Bunayya bulan ' + esc(label(S.bulan)) + '<br><span>' + esc((t.nama || '') + ' (' + tid + ')') + '</span></td></tr>' +
    '<tr><th>Amaun</th><td><b class="resit-rm">' + rm(st.amaun) + '</b></td></tr>' +
    '<tr><th>Cara bayar</th><td>' + esc(st.cara || '–') + (st.rujukan ? ' · rujukan ' + esc(st.rujukan) : '') + '</td></tr>' +
    (st.catatan ? '<tr><th>Catatan</th><td>' + esc(st.catatan) + '</td></tr>' : '') +
    '<tr><th>Direkod oleh</th><td>' + esc(st.oleh || '–') + '</td></tr></table>' +
    '<div class="resit-sign"><div><i></i>Tandatangan & cop penerima</div><div><i></i>Tandatangan pembayar (HYB)</div></div>' +
    '<div class="resit-f">Resit ini dijana oleh CRM HYB. Simpan bersama invois masjid (jika ada).</div></div>';
  $('#overlay').innerHTML = '<div class="scrim" data-close></div><div class="modal resit-modal">' + r +
    '<div class="row"><button class="btn" data-close>Tutup</button><button class="btn pri" data-act="sw-cetak">Cetak / simpan PDF</button></div></div>';
}
function cetakResit() {
  var box = $('#resitBox'); if (!box) return;
  var w = document.createElement('div'); w.id = 'resitCetak'; w.innerHTML = box.outerHTML; document.body.appendChild(w);
  document.body.classList.add('cetak-resit');
  var habis = function () { document.body.classList.remove('cetak-resit'); if (w.parentNode) w.parentNode.removeChild(w); window.removeEventListener('afterprint', habis); };
  window.addEventListener('afterprint', habis);
  window.print(); setTimeout(habis, 1500);
}
function aksiSewa(a, el) {
  var id = el.getAttribute('data-id') || '';
  var hantarSewa = function (p, lepas) {
    el.disabled = true;
    hantar('rekodSewa', p, function (res) { $('#overlay').innerHTML = ''; toast(res.mesej); if (lepas) lepas(res); }, function (m) { el.disabled = false; toast('Tak berjaya: ' + m); });
  };
  switch (a) {
    case 'sw-bayar': modalSewa(id, 'bayar'); return true;
    case 'sw-waive': modalSewa(id, 'waive'); return true;
    case 'sw-tetapan': modalSewaTetapan(id); return true;
    case 'sw-resit': bukaResit(id); return true;
    case 'sw-cetak': cetakResit(); return true;
    case 'sw-bayar-simpan':
      var d = $('#sw_d').value, v = num($('#sw_rm').value);
      if (!d) { toast('Isi tarikh bayar'); return true; }
      if (d > isoHari(today())) { toast('Tarikh bayar tidak boleh pada masa depan'); return true; }
      if (!(v > 0)) { toast('Isi amaun'); return true; }
      hantarSewa({ tempatId: id, bulan: S.bulan, status: 'Dibayar', tarikh: d, amaun: v, cara: $('#sw_cara').value, rujukan: $('#sw_ruj').value.trim(), catatan: $('#sw_c').value.trim() }, function () { bukaResit(id); });
      return true;
    case 'sw-waive-simpan':
      var c = $('#sw_c').value.trim();
      if (!c) { toast('Isi sebab waive'); return true; }
      hantarSewa({ tempatId: id, bulan: S.bulan, status: 'Waive', catatan: c });
      return true;
    case 'sw-batal':
      var st = sewaStatus(id, S.bulan);
      $('#overlay').innerHTML = '<div class="scrim" data-close></div><div class="modal"><h3>Batal rekod?</h3><p style="margin:0 0 10px;color:var(--ink-2)">Rekod ' + esc(st ? st.status : '') + (st && st.resit ? ' (' + esc(st.resit) + ')' : '') + ' untuk ' + esc((TMAP[id] || {}).nama || id) + ', ' + esc(label(S.bulan)) + ' akan dibatalkan dan status kembali Belum bayar.</p>' +
        '<div class="row"><button class="btn" data-close>Tidak</button><button class="btn pri" data-act="sw-batal-ya" data-id="' + esc(id) + '">Ya, batalkan</button></div></div>';
      return true;
    case 'sw-batal-ya': hantarSewa({ tempatId: id, bulan: S.bulan, status: 'Dibatalkan' }); return true;
    case 'sw-tetapan-simpan':
      var p = { tempatId: id || $('#swt_t').value, penerima: $('#swt_p').value.trim(), amaun: num($('#swt_rm').value), aktif: $('#swt_a').value, cara: $('#swt_cara').value.trim(), catatan: $('#swt_c').value.trim() };
      if (!p.tempatId) { toast('Pilih tempat'); return true; }
      if (!p.penerima) { toast('Isi nama penerima'); return true; }
      el.disabled = true;
      hantar('simpanSewaTetapan', p, function (res) { $('#overlay').innerHTML = ''; toast(res.mesej); }, function (m) { el.disabled = false; toast('Tak berjaya: ' + m); });
      return true;
  }
  return false;
}

/* ---------- Yuran pendaftaran (one-off, pelajar baru) ---------- */
var YURAN_DAFTAR = 90;
var BULAN_DAFTAR = 'Yuran pendaftaran';
function daftarBayar(pid) {
  var o = { rm: 0, masa: '', oleh: '' };
  (S.D.bayaran || []).forEach(function (x) { if (x.pelajarId === pid && x.bulan === BULAN_DAFTAR) { o.rm += x.amaun; if (x.amaun > 0) { o.masa = x.masa; o.oleh = x.oleh; } } });
  if (o.rm <= 0) { o.rm = 0; o.masa = ''; }
  return o;
}
// Yuran pendaftaran dikira dalam kutipan bulan ia diterima
function daftarTempat(b) {
  var tb = tarikhBulan(b), o = {}; if (!tb) return o;
  var k = tb.y + '-' + pad(tb.m + 1);
  (S.D.bayaran || []).forEach(function (x) { if (x.bulan === BULAN_DAFTAR && String(x.masa).slice(0, 7) === k) o[x.tempatId] = (o[x.tempatId] || 0) + x.amaun; });
  return o;
}
function ditajaPelajar(p) {
  var d = tarikh(p.tarikhDaftar), b = d ? 'Yuran ' + BLN[d.getMonth()] + ' ' + d.getFullYear() : '';
  return [p.yuran[b], p.yuran[S.bulan]].some(function (y) { return y === 'Ditaja' || y === 'Dikecualikan'; });
}
// Pelajar ditaja / dikecualikan tak perlu bayar pendaftaran sendiri
function perluDaftar(p) { return (p.status === 'Aktif' || p.status === 'Daftar') && p.tarikhDaftar && p.tarikhDaftar >= MULA_CRM && !daftarBayar(p.id).rm && !ditajaPelajar(p); }
function blokDaftar(p) {
  var d = daftarBayar(p.id), tulis = bolehTulis();
  return '<div class="sec-h">Yuran pendaftaran</div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px">' +
    (d.rm ? chip('Dibayar', 'c-g') + '<span>' + rm(d.rm) + ' pada ' + fmt(tarikh(d.masa.slice(0, 10))) + '</span>' : chip(perluDaftar(p) ? 'Belum bayar' : 'Tiada rekod', perluDaftar(p) ? 'c-y' : 'c-k')) +
    (tulis ? '<button class="btn sm' + (d.rm ? '' : ' pri') + '" data-act="dy-bayar" data-id="' + esc(p.id) + '">' + (d.rm ? 'Ubah' : 'Bayar yuran pendaftaran') + '</button>' : '') +
    (tulis && d.rm ? '<button class="btn sm" data-act="dy-batal" data-id="' + esc(p.id) + '">Batal</button>' : '') + '</div>';
}
function modalDaftar(id, baru) {
  var p = cariPelajar(id); if (!p) return;
  var d = daftarBayar(id);
  $('#overlay').innerHTML = '<div class="scrim" data-close></div><div class="modal"><h3>Yuran pendaftaran: ' + esc(cap(p.nama)) + '</h3>' +
    '<p style="margin:0 0 10px;color:var(--ink-2)">' + (baru ? 'Pelajar ' + esc(id) + ' dah didaftar. Dah bayar yuran pendaftaran? Kalau belum, tekan Nanti; pelajar ini akan keluar dalam senarai belum bayar di Kutipan Yuran.' :
      esc(id) + ' · ' + esc((TMAP[p.tempatId] || {}).nama || p.tempatId) + (d.rm ? ' · rekod sedia ada ' + rm(d.rm) + ' akan diganti.' : '')) + '</p>' +
    '<div class="fld"><label for="dy_d">Tarikh bayar</label><input class="inp" type="date" id="dy_d" max="' + isoHari(today()) + '" value="' + esc(d.masa ? d.masa.slice(0, 10) : isoHari(today())) + '"></div>' +
    '<div class="fld"><label for="dy_rm">Amaun (RM)</label><input class="inp" type="number" min="1" step="0.01" id="dy_rm" value="' + esc(String(d.rm || YURAN_DAFTAR)) + '"></div>' +
    '<div class="row"><button class="btn" data-close>' + (baru ? 'Nanti' : 'Batal') + '</button><button class="btn pri" data-act="dy-simpan" data-id="' + esc(id) + '">Simpan bayaran</button></div></div>';
}
function kadPendaftaran(b) {
  var D = S.D, tulis = bolehTulis(), tb = tarikhBulan(b), kb = tb ? tb.y + '-' + pad(tb.m + 1) : '';
  var belum = D.pelajar.filter(perluDaftar).sort(function (a, c) { return a.tarikhDaftar < c.tarikhDaftar ? 1 : -1; });
  var terima = (D.bayaran || []).filter(function (x) { return x.bulan === BULAN_DAFTAR && String(x.masa).slice(0, 7) === kb; });
  var jum = terima.reduce(function (a, x) { return a + x.amaun; }, 0), n = terima.filter(function (x) { return x.amaun > 0; }).length - terima.filter(function (x) { return x.amaun < 0; }).length;
  var h = '<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Yuran pendaftaran</h3><span class="sub">one-off ' + rm(YURAN_DAFTAR) + ' · diterima ' + esc(label(b)) + ': ' + rm(jum) + ' (' + Math.max(n, 0) + ' pelajar)</span></div>';
  if (!belum.length) return h + '<div class="card-b"><div class="empty">Semua pelajar baru (daftar mulai ' + fmt(tarikh(MULA_CRM)) + ') dah bayar yuran pendaftaran.</div></div></div>';
  h += '<div class="tw" style="max-height:320px;overflow:auto"><table><thead><tr><th>Pelajar belum bayar (' + belum.length + ')</th><th>Tempat</th><th>Tarikh daftar</th><th></th></tr></thead><tbody>' +
    belum.map(function (p) {
      return '<tr><td class="click" data-p="' + esc(p.id) + '"><span class="nm">' + esc(cap(p.nama)) + '</span><div class="m">' + esc(p.id) + ' · ' + esc(p.status) + '</div></td>' +
        '<td>' + esc((TMAP[p.tempatId] || {}).nama || p.tempatId) + '</td><td>' + esc(fmtV(p.tarikhDaftar)) + '</td>' +
        '<td style="text-align:right">' + (tulis ? '<button class="btn sm pri" data-act="dy-bayar" data-id="' + esc(p.id) + '">Bayar</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>' +
    '<div class="card-b"><div class="m" style="font-size:12px">Senarai ini pelajar Aktif atau Daftar yang didaftar mulai ' + fmt(tarikh(MULA_CRM)) + ' tapi belum ada rekod yuran pendaftaran. Pelajar Ditaja atau Dikecualikan tidak disenaraikan. Pelajar lama boleh direkod melalui profil pelajar (butang Bayar yuran pendaftaran). Bayaran masuk kutipan bulan ia diterima.</div></div></div>';
  return h;
}
function aksiDaftarYuran(a, el) {
  var id = el.getAttribute('data-id') || '';
  switch (a) {
    case 'dy-bayar': modalDaftar(id); return true;
    case 'dy-simpan':
      var d = $('#dy_d').value, v = num($('#dy_rm').value);
      if (!d) { toast('Isi tarikh bayar'); return true; }
      if (d > isoHari(today())) { toast('Tarikh bayar tidak boleh pada masa depan'); return true; }
      if (!(v > 0)) { toast('Isi amaun'); return true; }
      el.disabled = true;
      hantar('bayarPendaftaran', { id: id, tarikh: d, amaun: v }, function (res) { $('#overlay').innerHTML = ''; toast(res.mesej); }, function (m) { el.disabled = false; toast('Tak berjaya: ' + m); });
      return true;
    case 'dy-batal':
      var p = cariPelajar(id);
      $('#overlay').innerHTML = '<div class="scrim" data-close></div><div class="modal"><h3>Batal yuran pendaftaran?</h3><p style="margin:0 0 10px;color:var(--ink-2)">Rekod ' + rm(daftarBayar(id).rm) + ' untuk ' + esc(p ? cap(p.nama) : id) + ' akan dibatalkan dan ditolak dari kutipan.</p>' +
        '<div class="row"><button class="btn" data-close>Tidak</button><button class="btn pri" data-act="dy-batal-ya" data-id="' + esc(id) + '">Ya, batalkan</button></div></div>';
      return true;
    case 'dy-batal-ya':
      el.disabled = true;
      hantar('batalPendaftaran', { id: id }, function (res) { $('#overlay').innerHTML = ''; toast(res.mesej); }, function (m) { el.disabled = false; toast('Tak berjaya: ' + m); });
      return true;
  }
  return false;
}

/* ---------- Tajaan (penaja bayar untuk satu tempat) ---------- */
// Tetapan dari tab "Penaja". Bayaran diterima = baris dalam S.D.bayaran dengan pelajarId = ID penaja.
function cariPenaja(id) { return (S.D.penaja || []).filter(function (x) { return x.id === id; })[0]; }
function bilDitaja(tid, b) { return S.D.pelajar.filter(function (p) { return p.status === 'Aktif' && p.tempatId === tid && p.yuran[b] === 'Ditaja'; }).length; }
function tajaanDijangka(pj, b) { return pj.jenis === 'Ikut pelajar' ? num(pj.amaun) * bilDitaja(pj.tempatId, b) : num(pj.amaun); }
function tajaanDiterima(pid, b) {
  var o = { rm: 0, masa: '', oleh: '' };
  (S.D.bayaran || []).forEach(function (x) { if (x.pelajarId === pid && x.bulan === b) { o.rm += x.amaun; if (x.amaun > 0) { o.masa = x.masa; o.oleh = x.oleh; } } });
  if (o.rm <= 0) { o.rm = 0; o.masa = ''; }
  return o;
}
function tajaanTempat(b) {
  var o = {};
  (S.D.penaja || []).forEach(function (pj) { var t = tajaanDiterima(pj.id, b).rm; if (t) o[pj.tempatId] = (o[pj.tempatId] || 0) + t; });
  return o;
}
function bolehUrusPenaja() { return !!(S.D && ['Manager', 'Ketua'].indexOf(S.D.user.peranan) > -1); }
function kadTajaan(b) {
  var L = (S.D.penaja || []).filter(function (pj) { return pj.aktif || tajaanDiterima(pj.id, b).rm; });
  var tulis = bolehTulis(), urus = bolehUrusPenaja();
  if (!L.length && !urus) return '';
  var jJ = 0, jT = 0;
  var h = '<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Tajaan ' + esc(label(b)) + '</h3><span class="sub">penaja bayar untuk satu tempat · masuk kutipan bila diterima</span>' +
    (urus ? '<button class="btn sm" style="margin-left:auto" data-act="tj-penaja">' + ICON.plus + 'Tambah penaja</button>' : '') + '</div>';
  if (!L.length) return h + '<div class="card-b"><div class="empty">Belum ada penaja. Tekan Tambah penaja.</div></div></div>';
  h += '<div class="tw"><table><thead><tr><th>Penaja</th><th>Tempat</th><th>Kiraan</th><th class="n">Dijangka</th><th class="n">Diterima</th><th></th></tr></thead><tbody>' +
    L.map(function (pj) {
      var dj = tajaanDijangka(pj, b), dt = tajaanDiterima(pj.id, b), n = bilDitaja(pj.tempatId, b), t = TMAP[pj.tempatId] || {};
      jJ += dj; jT += dt.rm;
      var kira = pj.jenis === 'Ikut pelajar' ? rm(pj.amaun) + ' × ' + n + ' pelajar ditaja' : 'Tetap ' + rm(pj.amaun) + ' sebulan' + (n ? ' · ' + n + ' pelajar ditaja' : '');
      var beza = dt.rm && Math.abs(dt.rm - dj) >= 0.5;
      return '<tr><td><span class="nm">' + esc(pj.nama) + '</span><div class="m">' + esc(pj.id) + (pj.aktif ? '' : ' · tidak aktif') + '</div></td>' +
        '<td><span class="nm">' + esc(t.nama || pj.tempatId) + '</span><div class="m">' + esc(pj.tempatId) + '</div></td>' +
        '<td>' + esc(kira) + '</td><td class="n">' + rm(dj) + '</td>' +
        '<td class="n">' + (dt.rm ? '<b>' + rm(dt.rm) + '</b><div class="m">' + fmt(tarikh(dt.masa.slice(0, 10))) + (beza ? ' · ' + (dt.rm > dj ? 'lebih ' : 'kurang ') + rm(Math.abs(dt.rm - dj)) : '') + '</div>' : chip('Belum diterima', 'c-y')) + '</td>' +
        '<td style="white-space:nowrap;text-align:right">' +
          (tulis ? '<button class="btn sm' + (dt.rm ? '' : ' pri') + '" data-act="tj-terima" data-id="' + esc(pj.id) + '">' + (dt.rm ? 'Ubah' : 'Terima') + '</button> ' : '') +
          (tulis && dt.rm ? '<button class="btn sm" data-act="tj-batal" data-id="' + esc(pj.id) + '">Batal</button> ' : '') +
          (urus ? '<button class="btn sm" data-act="tj-penaja" data-id="' + esc(pj.id) + '">' + ICON.edit + 'Tetapan</button>' : '') + '</td></tr>';
    }).join('') +
    '<tr class="tot"><td>Jumlah</td><td></td><td></td><td class="n">' + rm(jJ) + '</td><td class="n"><b>' + rm(jT) + '</b></td><td></td></tr></tbody></table></div>' +
    '<div class="card-b"><div class="m" style="font-size:12px">Jenis Ikut pelajar kira pelajar Aktif di tempat itu yang berstatus <b>Ditaja</b> untuk ' + esc(label(b)) + ', jadi jumlah dijangka naik atau turun ikut bilangan pelajar. Tajaan yang diterima masuk kutipan, untung sebenar dan laporan harian/mingguan/bulanan.</div></div></div>';
  return h;
}
function modalTerimaTajaan(id) {
  var pj = cariPenaja(id); if (!pj) return;
  var b = S.bulan, dj = tajaanDijangka(pj, b), dt = tajaanDiterima(id, b);
  $('#overlay').innerHTML = '<div class="scrim" data-close></div><div class="modal"><h3>Terima tajaan: ' + esc(pj.nama) + '</h3>' +
    '<p style="margin:0 0 10px;color:var(--ink-2)">' + esc(label(b)) + ' · ' + esc((TMAP[pj.tempatId] || {}).nama || pj.tempatId) + ' · dijangka ' + rm(dj) +
      (pj.jenis === 'Ikut pelajar' ? ' (' + rm(pj.amaun) + ' × ' + bilDitaja(pj.tempatId, b) + ' pelajar)' : '') + '.' + (dt.rm ? ' Rekod sedia ada ' + rm(dt.rm) + ' akan diganti.' : '') + '</p>' +
    '<div class="fld"><label for="tj_d">Tarikh terima</label><input class="inp" type="date" id="tj_d" max="' + isoHari(today()) + '" value="' + esc(dt.masa ? dt.masa.slice(0, 10) : isoHari(today())) + '"></div>' +
    '<div class="fld"><label for="tj_rm">Amaun diterima (RM)</label><input class="inp" type="number" min="1" step="0.01" id="tj_rm" value="' + esc(String(dt.rm || dj || '')) + '"></div>' +
    '<div class="row"><button class="btn" data-close>Batal</button><button class="btn pri" data-act="tj-simpan" data-id="' + esc(id) + '">Simpan</button></div></div>';
}
function modalPenaja(id) {
  var pj = id ? cariPenaja(id) : { nama: '', tempatId: '', jenis: 'Tetap', amaun: '', aktif: true, catatan: '' };
  if (!pj) return;
  var opt = function (v, l, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(l) + '</option>'; };
  $('#overlay').innerHTML = '<div class="scrim" data-close></div><div class="modal"><h3>' + (id ? 'Tetapan penaja ' + esc(id) : 'Tambah penaja') + '</h3>' +
    '<div class="fld"><label for="pj_nama">Nama penaja</label><input class="inp" id="pj_nama" maxlength="100" value="' + esc(pj.nama) + '" placeholder="Contoh: Masjid / syarikat / individu"></div>' +
    '<div class="fld"><label for="pj_t">Tempat ditaja</label><select class="sel" id="pj_t">' + opt('', '(pilih tempat)', pj.tempatId) + S.D.tempat.map(function (t) { return opt(t.id, t.id + ' · ' + t.nama, pj.tempatId); }).join('') + '</select></div>' +
    '<div class="fld"><label for="pj_j">Jenis</label><select class="sel" id="pj_j">' + opt('Tetap', 'Tetap: jumlah sama setiap bulan', pj.jenis) + opt('Ikut pelajar', 'Ikut pelajar: RM × pelajar Ditaja', pj.jenis) + '</select></div>' +
    '<div class="fld"><label for="pj_rm">Amaun (RM): sebulan untuk Tetap, setiap pelajar untuk Ikut pelajar</label><input class="inp" type="number" min="1" step="0.01" id="pj_rm" value="' + esc(String(pj.amaun || '')) + '"></div>' +
    '<div class="fld"><label for="pj_a">Status</label><select class="sel" id="pj_a">' + opt('Ya', 'Aktif', pj.aktif ? 'Ya' : 'Tidak') + opt('Tidak', 'Tidak aktif (tajaan tamat)', pj.aktif ? 'Ya' : 'Tidak') + '</select></div>' +
    '<div class="fld"><label for="pj_c">Catatan</label><input class="inp" id="pj_c" maxlength="500" value="' + esc(pj.catatan || '') + '"></div>' +
    '<div class="row"><button class="btn" data-close>Batal</button><button class="btn pri" data-act="tj-penaja-simpan" data-id="' + esc(id || '') + '">Simpan</button></div></div>';
}
function aksiTajaan(a, el) {
  var id = el.getAttribute('data-id') || '';
  switch (a) {
    case 'tj-terima': modalTerimaTajaan(id); return true;
    case 'tj-penaja': modalPenaja(id); return true;
    case 'tj-simpan':
      var d = $('#tj_d').value, v = num($('#tj_rm').value);
      if (!d) { toast('Isi tarikh terima'); return true; }
      if (d > isoHari(today())) { toast('Tarikh terima tidak boleh pada masa depan'); return true; }
      if (!(v > 0)) { toast('Isi amaun diterima'); return true; }
      el.disabled = true;
      hantar('terimaTajaan', { penajaId: id, bulan: S.bulan, tarikh: d, amaun: v }, function (res) { $('#overlay').innerHTML = ''; toast(res.mesej); },
        function (m) { el.disabled = false; toast('Tak berjaya: ' + m); });
      return true;
    case 'tj-batal':
      var pj = cariPenaja(id);
      $('#overlay').innerHTML = '<div class="scrim" data-close></div><div class="modal"><h3>Batal tajaan?</h3><p style="margin:0 0 10px;color:var(--ink-2)">Rekod tajaan ' + esc(pj ? pj.nama : id) + ' untuk ' + esc(label(S.bulan)) + ' (' + rm(tajaanDiterima(id, S.bulan).rm) + ') akan dibatalkan dan ditolak dari kutipan.</p>' +
        '<div class="row"><button class="btn" data-close>Tidak</button><button class="btn pri" data-act="tj-batal-ya" data-id="' + esc(id) + '">Ya, batalkan</button></div></div>';
      return true;
    case 'tj-batal-ya':
      el.disabled = true;
      hantar('batalTajaan', { penajaId: id, bulan: S.bulan }, function (res) { $('#overlay').innerHTML = ''; toast(res.mesej); }, function (m) { el.disabled = false; toast('Tak berjaya: ' + m); });
      return true;
    case 'tj-penaja-simpan':
      var p = { id: id, nama: $('#pj_nama').value.trim(), tempatId: $('#pj_t').value, jenis: $('#pj_j').value, amaun: num($('#pj_rm').value), aktif: $('#pj_a').value, catatan: $('#pj_c').value.trim() };
      if (!p.nama) { toast('Isi nama penaja'); return true; }
      if (!p.tempatId) { toast('Pilih tempat'); return true; }
      if (!(p.amaun > 0)) { toast('Isi amaun'); return true; }
      el.disabled = true;
      hantar('simpanPenaja', p, function (res) { $('#overlay').innerHTML = ''; toast(res.mesej); }, function (m) { el.disabled = false; toast('Tak berjaya: ' + m); });
      return true;
  }
  return false;
}

function tapisKutipan() {
  var q = KS.q.trim().toLowerCase(), b = S.bulan;
  return S.D.pelajar.filter(function (p) {
    if (KS.status && p.status !== KS.status) return false;
    if (KS.tempat && p.tempatId !== KS.tempat) return false;
    if (KS.yuran) {
      var y = p.yuran[b] || '';
      if (KS.yuran === 'belum' ? (y !== 'Belum bayar' && y !== 'Tertunggak') : KS.yuran === '(kosong)' ? !!y : y !== KS.yuran) return false;
    }
    if (q && [p.id, p.nama, p.ibuBapa, p.tempatNama].join(' ').toLowerCase().indexOf(q) < 0) return false;
    return true;
  }).sort(function (a, c) { return a.tempatId < c.tempatId ? -1 : a.tempatId > c.tempatId ? 1 : (a.id < c.id ? -1 : 1); });
}

function rancangBukaBulan(langkau) {
  var D = S.D, b = S.bulan, i = D.bulanList.indexOf(b), prev = i > 0 ? D.bulanList[i - 1] : null;
  var ubah = [], bawa = 0, dilangkau = 0;
  D.pelajar.forEach(function (p) {
    if (p.status !== 'Aktif' || p.yuran[b]) return;
    var t = TMAP[p.tempatId];
    if (langkau && t && JALAN.indexOf(t.status) < 0) { dilangkau++; return; }
    var pv = prev ? p.yuran[prev] : '';
    var ke = (pv === 'Ditaja' || pv === 'Dikecualikan') ? pv : 'Belum bayar';
    if (ke !== 'Belum bayar') bawa++;
    ubah.push({ id: p.id, ke: ke, dari: '' });
  });
  return { ubah: ubah, bawa: bawa, dilangkau: dilangkau };
}
function rancangTertunggak() {
  var b = S.bulan;
  return S.D.pelajar.filter(function (p) { return p.status === 'Aktif' && p.yuran[b] === 'Belum bayar'; })
    .map(function (p) { return { id: p.id, ke: 'Tertunggak', dari: 'Belum bayar' }; });
}

function modalBukaBulan() {
  var r1 = rancangBukaBulan(true), r0 = rancangBukaBulan(false);
  $('#overlay').innerHTML = '<div class="scrim" data-close></div><div class="modal"><h3>Buka bulan ' + esc(label(S.bulan)) + ' (rutin 1hb, invois keluar)</h3>' +
    '<p style="margin:0 0 10px;color:var(--ink-2)">Pelajar aktif yang status yurannya masih kosong akan ditanda <b>Belum bayar</b>. Yang bulan lepas Ditaja atau Dikecualikan akan kekal sama.</p>' +
    '<label class="fchk"><input type="checkbox" id="bb_langkau" checked> <span>Langkau pelajar di tempat yang kelasnya belum berjalan (' + (r0.ubah.length - r1.ubah.length) + ' pelajar)</span></label>' +
    '<div class="hint" id="bb_info">' + infoBuka(r1) + '</div>' +
    '<div class="row"><button class="btn" data-close>Batal</button><button class="btn pri" data-act="bb-ya"' + (r0.ubah.length ? '' : ' disabled') + '>Teruskan</button></div></div>';
}
function infoBuka(r) {
  return r.ubah.length ? '<b>' + r.ubah.length + '</b> pelajar akan dikemas kini' + (r.bawa ? ' (' + r.bawa + ' bawa status Ditaja/Dikecualikan)' : '') + '.' : 'Semua pelajar aktif dah ada status untuk bulan ini.';
}

function renderKutipan() {
  var D = S.D, b = S.bulan, bi = D.bulanList.indexOf(b), tulis = bolehTulis(), k = kira(), now = today();
  var list = tapisKutipan();
  var TG = senaraiTunggakan(), tg = { n: TG.length, rm: TG.reduce(function (a, x) { return a + x.rm; }, 0) };
  Object.keys(KS.pilih).forEach(function (id) { if (!list.some(function (p) { return p.id === id; })) delete KS.pilih[id]; });
  var nPilih = Object.keys(KS.pilih).length;

  var h = '<div class="top"><div><div class="eyebrow">' + eyebrow() + '</div><h1>Kutipan <em>Yuran</em></h1></div><div class="top-r">' + monthSelect() +
    '<button class="btn" data-act="salin-belum-k">' + ICON.copy + 'Salin senarai belum bayar</button>' +
    '<button class="btn" data-act="muat">' + ICON.refresh + 'Muat semula</button></div></div>';

  // KPI bulan
  h += '<div class="grid kpis k4">' +
    '<div class="card kpi"><div class="l">Kutipan ' + esc(label(b)) + '</div><div class="v">' + rm(k.kutipan) + '</div><div class="s">daripada potensi ' + rm(k.hasil) + (k.tajaan ? ' · termasuk tajaan ' + rm(k.tajaan) : '') + (k.daftar ? ' · pendaftaran ' + rm(k.daftar) : '') + '</div></div>' +
    '<div class="card kpi"><div class="l">% kutipan</div><div class="v ' + (k.pk >= k.pm ? 'pos' : 'neg') + '">' + pct(k.pk) + '</div><div class="s">' + k.tot.dibayar + '/' + k.perluBayar + ' pelajar · pulang modal ' + pct(k.pm) + '</div></div>' +
    '<div class="card kpi"><div class="l">Belum bayar</div><div class="v">' + k.tot.belum + '</div><div class="s">' + rm(k.rows.reduce(function (a, r) { return a + r.belum * r.yuran; }, 0)) + ' belum dikutip</div></div>' +
    '<div class="card kpi"><div class="l">Tunggakan bulan lepas</div><div class="v' + (tg.rm ? ' neg' : '') + '">' + rm(tg.rm) + '</div><div class="s">' + tg.n + ' pelajar' + (k.tot.tertunggak ? ' · ' + k.tot.tertunggak + ' tertunggak ' + esc(label(b)) : '') + (k.tot.kosong ? ' · ' + k.tot.kosong + ' status kosong' : '') + '</div></div></div>';

  h += kadTajaan(b) + kadPendaftaran(b);

  // Rutin bulanan
  var cur = isBulanIni(), d = now.getDate();
  var rb = rancangBukaBulan(true), rt = rancangTertunggak();
  var belumN = k.tot.belum + k.tot.tertunggak;
  var langkah = function (lbl, dari, hingga, tajuk, desc, butang) {
    var st = !cur ? '' : d > hingga ? 'done' : d >= dari ? 'now' : '';
    return '<div class="rt ' + st + '"><div class="rt-n">' + lbl + '</div><div class="rt-b"><b>' + tajuk + '</b><div class="m">' + desc + '</div></div>' + (butang || '') + '</div>';
  };
  h += '<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Rutin kutipan ' + esc(label(b)) + '</h3>' + (cur ? '' : '<span class="sub">bukan bulan semasa</span>') + '</div><div class="card-b"><div class="rutin2">' +
    langkah('1hb', 1, 2, 'Invois dikeluarkan', 'Invois keluar dari sistem invois. ' + (rb.ubah.length ? rb.ubah.length + ' pelajar aktif belum ditanda Belum bayar.' : 'Semua pelajar aktif dah ada status.'),
      tulis ? '<button class="btn sm' + (rb.ubah.length ? ' pri' : '') + '" data-act="buka-bulan">Tanda Belum bayar</button>' : '') +
    langkah('3-10hb', 3, 10, 'Peringatan WhatsApp', belumN + ' ibu bapa belum bayar',
      '<button class="btn sm" data-act="ke-belum">Buka senarai WhatsApp</button>') +
    langkah('11-20hb', 11, 20, 'Telefon', 'Telefon yang masih belum bayar, rekod dalam log', '<button class="btn sm" data-act="ke-belum">Senarai belum bayar</button>') +
    langkah('22hb', 22, 28, 'Peringatan invois', belumN + ' masih belum bayar', '<button class="btn sm" data-act="salin-belum-k">Salin senarai</button>') +
    langkah('29hb', 29, 31, 'Tanda tertunggak', rt.length ? rt.length + ' masih Belum bayar' : 'Tiada Belum bayar',
      tulis ? '<button class="btn sm' + (rt.length && cur && d >= 29 ? ' pri' : '') + '" data-act="tertunggak"' + (rt.length ? '' : ' disabled') + '>Tukar ke Tertunggak</button>' : '') +
    '</div></div></div>';

  h += kadTindakan(TG);

  // Ikut tempat
  h += '<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Ikut tempat</h3><span class="sub">' + esc(label(b)) + '</span></div><div class="tw"><table><thead><tr>' +
    '<th>Tempat</th><th class="n">Dibayar</th><th style="min-width:160px">Progress</th><th class="n">Belum</th><th class="n">Tertunggak</th><th class="n">Ditaja / kecuali</th><th class="n">Kutipan</th><th class="n">Kos</th></tr></thead><tbody>' +
    k.rows.filter(function (r) { return r.aktif; }).map(function (r) {
      var p = r.perlu > 0 ? r.dibayar / r.perlu : 0;
      return '<tr class="click" data-k-tempat="' + esc(r.id) + '"><td><span class="nm">' + esc(r.t.nama) + '</span><div class="m">' + esc(r.id) + ' · ' + rm(r.yuran) + '</div></td>' +
        '<td class="n">' + (r.perlu > 0 ? r.dibayar + '/' + r.perlu : '–') + '</td>' +
        '<td>' + (r.perlu > 0 ? '<div class="cap"><div class="bar"><i class="' + (r.kos && r.kutipan >= r.kos ? 'g' : p >= .25 ? 'y' : 'r') + '" style="width:' + Math.min(100, p * 100) + '%"></i></div><span>' + pct(p) + '</span></div>' : chip('Ditaja')) + '</td>' +
        '<td class="n">' + (r.belum || '–') + '</td><td class="n' + (r.tertunggak ? ' neg' : '') + '">' + (r.tertunggak || '–') + '</td>' +
        '<td class="n">' + ((r.ditaja + r.kecuali) || '–') + '</td><td class="n">' + (r.kutipan ? rm(r.kutipan) : '–') + '</td>' +
        '<td class="n">' + (r.kos ? rm(r.kos) + (r.kutipan >= r.kos ? ' ' + chip('Tutup kos', 'c-g') : '') : '–') + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';

  // Matriks
  h += '<div class="card"><div class="filters">' +
    '<select class="sel" data-kf="tempat"><option value="">Semua tempat</option>' + D.tempat.map(function (t) { return '<option value="' + esc(t.id) + '"' + (KS.tempat === t.id ? ' selected' : '') + '>' + esc(t.id + ' · ' + t.nama) + '</option>'; }).join('') + '</select>' +
    '<select class="sel" data-kf="status">' + [['Aktif', 'Pelajar aktif'], ['', 'Semua pelajar'], ['Berhenti', 'Berhenti'], ['Daftar', 'Daftar']].map(function (o) { return '<option value="' + o[0] + '"' + (KS.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
    '<select class="sel" data-kf="yuran"><option value="">' + esc(label(b)) + ': semua</option><option value="belum"' + (KS.yuran === 'belum' ? ' selected' : '') + '>Belum bayar + Tertunggak</option>' +
    (D.senarai.statusYuran || []).map(function (y) { return '<option' + (KS.yuran === y ? ' selected' : '') + '>' + esc(y) + '</option>'; }).join('') + '<option value="(kosong)"' + (KS.yuran === '(kosong)' ? ' selected' : '') + '>(kosong)</option></select>' +
    (tulis ? '<label class="tb-pilih" title="Tarikh ini direkod bila anda tanda Dibayar">Tarikh bayar <input class="inp" type="date" id="k_tarikh" max="' + isoHari(now) + '" value="' + esc(tarikhPilih()) + '">' +
      (KS.tarikh && KS.tarikh !== isoHari(now) ? '<button class="link" data-act="tb-hari-ini">hari ini</button>' : '') + '</label>' : '') +
    '<div class="grow"></div><input class="inp" id="kq" placeholder="Cari nama atau ID..." value="' + esc(KS.q) + '"></div>';
  if (tulis && nPilih) {
    h += '<div class="bulk"><b>' + nPilih + ' dipilih</b><span>Tanda ' + esc(label(b)) + ' sebagai</span><select class="sel" id="bulk_ke">' +
      (D.senarai.statusYuran || []).map(function (y) { return '<option>' + esc(y) + '</option>'; }).join('') + '<option value="">(kosongkan)</option></select>' +
      '<button class="btn pri sm" data-act="bulk-simpan">Simpan</button><button class="btn sm" data-act="bulk-batal">Batal pilihan</button></div>';
  }
  h += '<div class="legendy">' + Object.keys(SINGKAT).map(function (y) { return '<span><i class="yc ' + KELAS_Y[y] + '">' + SINGKAT[y] + '</i>' + esc(y) + '</span>'; }).join('') +
    '<span><i class="yc">·</i>Kosong</span>' + (tulis ? '<span class="m">Klik sel untuk tukar status.</span>' : '') + '</div>';
  h += '<div class="tw"><table class="mtx"><thead><tr>' + (tulis ? '<th class="ck"><input type="checkbox" data-act="pilih-semua"' + (nPilih && nPilih === list.length ? ' checked' : '') + ' aria-label="Pilih semua"></th>' : '') +
    '<th class="st-col">Pelajar</th><th class="tb-col">Tarikh bayar<div>' + esc(label(b).replace(' 20', ' ')) + '</div></th>' + D.bulanList.map(function (m, i) { return '<th class="mc' + (i === bi ? ' cur' : '') + '">' + esc(label(m).replace(' 20', ' ')) + '</th>'; }).join('') + '<th class="n">Dibayar</th></tr></thead><tbody>';
  var tPrev = null;
  list.forEach(function (p) {
    if (p.tempatId !== tPrev && !KS.tempat) { tPrev = p.tempatId; h += '<tr class="grp"><td colspan="' + (D.bulanList.length + (tulis ? 4 : 3)) + '">' + esc(p.tempatId + ' · ' + (p.tempatNama || '')) + '</td></tr>'; }
    var dib = D.bulanList.filter(function (m) { return p.yuran[m] === 'Dibayar'; }).length;
    h += '<tr>' + (tulis ? '<td class="ck"><input type="checkbox" data-pilih="' + esc(p.id) + '"' + (KS.pilih[p.id] ? ' checked' : '') + ' aria-label="Pilih ' + esc(p.id) + '"></td>' : '') +
      '<td class="st-col"><button class="nm-btn" data-p="' + esc(p.id) + '">' + esc(cap(p.nama)) + '</button><div class="m">' + esc(p.id) + (p.status !== 'Aktif' ? ' · ' + esc(p.status) : '') + '</div></td>' +
      '<td class="tb-col">' + (p.yuran[b] === 'Dibayar' ? (function () { var tb = tarikhBayar(p.id, b);
        return tulis ? '<button class="tb-btn' + (tb ? '' : ' tiada') + '" data-act="tb-edit" data-id="' + esc(p.id) + '" data-bln="' + esc(b) + '" title="Klik untuk ' + (tb ? 'betulkan' : 'isi') + ' tarikh bayar">' + (tb ? fmt(tarikh(tb)) : 'isi tarikh') + esc(amaunLain(p, b)) + '</button>'
          : (tb ? fmt(tarikh(tb)) : '<span class="m">tiada tarikh</span>') + esc(amaunLain(p, b)); })() : '<span class="m">–</span>') + '</td>' +
      D.bulanList.map(function (m, i) {
        var y = p.yuran[m] || '', tbm = y === 'Dibayar' ? tarikhBayar(p.id, m) : '', al = y === 'Dibayar' ? amaunLain(p, m) : '';
        return '<td class="mc' + (i === bi ? ' cur' : '') + '">' + (tulis ? '<button class="yc ' + (KELAS_Y[y] || '') + (al ? ' amt' : '') + '" data-yc="' + esc(p.id) + '" data-bln="' + esc(m) + '" title="' + esc(label(m) + ': ' + (y || 'kosong') + (tbm ? ', dibayar ' + fmt(tarikh(tbm)) : '') + al) + '">' + (SINGKAT[y] || '·') + '</button>'
          : '<i class="yc ' + (KELAS_Y[y] || '') + (al ? ' amt' : '') + '" title="' + esc(label(m) + ': ' + (y || 'kosong') + (tbm ? ', dibayar ' + fmt(tarikh(tbm)) : '') + al) + '">' + (SINGKAT[y] || '·') + '</i>') + '</td>';
      }).join('') + '<td class="n">' + dib + '</td></tr>';
  });
  if (!list.length) h += '<tr><td colspan="16" class="empty" style="text-align:center;padding:28px">Tiada pelajar ikut tapisan ini.</td></tr>';
  h += '</tbody></table></div></div>';
  $('#view').innerHTML = h;
}


/* Tunggakan bulan-bulan lepas: siapa perlu dihubungi dan bagaimana */
function senaraiTunggakan() {
  var D = S.D, bi = D.bulanList.indexOf(S.bulan), lepas = D.bulanList.slice(0, Math.max(0, bi));
  var logAkhir = {};
  (D.log || []).forEach(function (l) { if (l.ref && (!logAkhir[l.ref] || l.tarikh > logAkhir[l.ref].tarikh)) logAkhir[l.ref] = l; });
  return D.pelajar.filter(function (p) { return p.status === 'Aktif'; }).map(function (p) {
    var bln = lepas.filter(function (m) { var y = p.yuran[m]; return y === 'Tertunggak' || y === 'Belum bayar'; });
    var t = tempatById(p.tempatId), yr = t ? (num(t.yuran) || num(D.tetapan.yuranStandard)) : num(D.tetapan.yuranStandard);
    return { p: p, bln: bln, n: bln.length, rm: bln.length * yr, kini: p.yuran[S.bulan] || '', log: logAkhir[p.id] };
  }).filter(function (x) { return x.n > 0; }).sort(function (a, b) { return b.n - a.n || b.rm - a.rm || (a.p.id < b.p.id ? -1 : 1); });
}
var TAHAP = [
  null,
  { t: 'WhatsApp', c: 'c-y', d: 'Hantar peringatan mesra' },
  { t: 'Telefon', c: 'c-o2', d: 'Telefon ibu bapa, tanya ada masalah' },
  { t: 'Eskalasi', c: 'c-r', d: 'Bawa ke Ketua: pelan bayaran, taja atau kecualikan' }
];
function tahap(n) { return TAHAP[Math.min(3, n)]; }
function msgTunggakan(x) {
  var p = x.p;
  return 'Assalamualaikum ' + (p.ibuBapa || 'tuan/puan') + '. Ini daripada HYB ' + (p.tempatNama || '') + '. Untuk makluman, yuran ' + cap(p.nama) +
    ' bagi ' + x.bln.map(label).join(', ') + ' masih belum diterima (jumlah RM' + x.rm + '). Kalau ada sebarang kesulitan, boleh maklumkan kepada kami, insya-Allah kita bincang. Terima kasih.';
}
function kadTindakan(L) {
  var D = S.D, tulis = bolehTulis(), HAD = 8;
  if (!L.length) return '';
  var jum = L.reduce(function (a, x) { return a + x.rm; }, 0);
  var kira = [0, 0, 0, 0]; L.forEach(function (x) { kira[Math.min(3, x.n)]++; });
  var h = '<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Perlu tindakan: tunggakan bulan lepas</h3><span class="sub">' + L.length + ' pelajar · ' + rm(jum) + ' tertunggak</span></div>' +
    '<div class="card-b" style="padding-bottom:4px"><div class="tahap">' + [1, 2, 3].map(function (i) {
      var t = TAHAP[i];
      return '<div class="th ' + t.c + '"><b>' + kira[i] + '</b><span>' + (i === 3 ? '3 bulan ke atas' : i + ' bulan') + '</span><em>' + t.t + ': ' + t.d + '</em></div>';
    }).join('') + '</div></div>' +
    '<div class="tw"><table><thead><tr><th>Pelajar</th><th>Bulan tertunggak</th><th class="n">Jumlah</th><th>' + esc(label(S.bulan)) + '</th><th>Tindakan</th><th>Hubungan terakhir</th><th></th></tr></thead><tbody>' +
    (KS.semuaT ? L : L.slice(0, HAD)).map(function (x) {
      var p = x.p, t = tahap(x.n), wl = waLink(p.tel, msgTunggakan(x));
      return '<tr><td><button class="nm-btn" data-p="' + esc(p.id) + '">' + esc(cap(p.nama)) + '</button><div class="m">' + esc(p.id + ' · ' + (p.tempatNama || p.tempatId)) + '</div></td>' +
        '<td>' + x.bln.map(function (m) { return '<span class="chip c-r" style="margin:1px 2px 1px 0">' + esc(label(m).replace(' 20', ' ')) + '</span>'; }).join('') + '</td>' +
        '<td class="n neg">' + rm(x.rm) + '</td><td>' + chip(x.kini || '–') + '</td>' +
        '<td>' + chip(t.t, t.c) + '</td>' +
        '<td class="m" style="font-size:12px">' + (x.log ? esc(fmtV(String(x.log.tarikh).slice(0, 10))) + '<div>' + esc(String(x.log.interaksi).slice(0, 60)) + '</div>' : 'Belum dihubungi') + '</td>' +
        '<td style="white-space:nowrap">' + (wl ? '<a class="btn sm wa" href="' + esc(wl) + '" target="_blank" rel="noopener">' + ICON.wa + '</a> '
          : '<span class="btn sm wa" style="opacity:.45" title="' + (D.preview ? 'Nombor disembunyi dalam preview' : 'Tiada nombor') + '">' + ICON.wa + '</span> ') +
        (tulis ? '<button class="btn sm" data-act="log-pelajar" data-id="' + esc(p.id) + '">' + ICON.plus + 'Log</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>' +
    (L.length > HAD ? '<div style="padding:10px 16px;border-top:1px solid var(--line-2)"><button class="link" data-act="tunggak-semua">' + (KS.semuaT ? 'Tunjuk ' + HAD + ' teratas sahaja' : 'Tunjuk semua ' + L.length + ' pelajar') + '</button></div>' : '') + '</div>';
  return h;
}


/* ---------- Link laporan guru (app guru berasingan) ---------- */
function bolehLink() { return ['Manager', 'Ketua', 'Staf'].indexOf(S.D.user.peranan) > -1; }
function cariGuru(id) { return (S.D.guru || []).filter(function (g) { return g.id === id; })[0]; }
function modalLinkGuru(id) {
  var g = cariGuru(id); if (!g) return;
  var ak = (S.D.aksesGuru || {})[id], nm = (g.gelaran ? g.gelaran + ' ' : '') + g.nama;
  $('#overlay').innerHTML = '<div class="scrim" data-close></div><div class="modal"><h3>Link laporan: ' + esc(nm) + '</h3>' +
    '<p style="margin:0 0 10px;color:var(--ink-2)">Guru guna link peribadi ini untuk hantar laporan kelas dari telefon. Guru tak nampak CRM, yuran atau data ibu bapa. Laporan terus masuk tab Laporan Kelas.</p>' +
    (ak ? '<div class="alert k" style="margin-bottom:10px">Link aktif sejak ' + esc(fmtV(String(ak.dicipta).slice(0, 10))) + ' (oleh ' + esc(ak.oleh || '–') + '). Jana semula akan batalkan link lama.</div>' : '') +
    '<div class="row"><button class="btn" data-close>Tutup</button>' + (ak ? '<button class="btn" data-act="link-batal" data-id="' + esc(id) + '">Batalkan link</button>' : '') +
    '<button class="btn pri" data-act="link-jana" data-id="' + esc(id) + '">' + (ak ? 'Jana link baru' : 'Jana link') + '</button></div></div>';
}
function paparLinkBaru(g, res) {
  var nm = (g.gelaran ? g.gelaran + ' ' : '') + g.nama;
  var msg = 'Assalamualaikum ' + nm + '. Ini link untuk hantar laporan kelas HYB selepas setiap kelas. Simpan (bookmark) link ini dan jangan kongsi dengan orang lain:\n' + (res.link || '');
  var w = res.link ? waLink(g.tel, msg) : '';
  $('#overlay').innerHTML = '<div class="scrim" data-close></div><div class="modal"><h3>Link untuk ' + esc(nm) + '</h3>' +
    (res.link ? '<p style="margin:0 0 8px;color:var(--ink-2)">Link ini dipapar <b>sekali sahaja</b>. Hantar terus kepada guru. Kalau hilang, jana semula.</p><textarea id="mtxt" readonly style="min-height:90px">' + esc(msg) + '</textarea>'
      : '<div class="alert y">URL app guru belum diisi. Dalam Apps Script: Project Settings > Script Properties, tambah URL_APP_GURU = link /exec app guru. Kemudian jana link sekali lagi. Kod yang dijana: <b>' + esc(res.kod) + '</b></div>') +
    '<div class="row"><button class="btn" data-close>Tutup</button>' + (res.link ? '<button class="btn" data-act="copy-modal">' + ICON.copy + 'Salin mesej</button>' : '') +
    (w ? '<a class="btn pri wa" href="' + esc(w) + '" target="_blank" rel="noopener">' + ICON.wa + 'Hantar WhatsApp</a>' : '') + '</div></div>';
}
function aksiLinkGuru(a, el) {
  var id = el.getAttribute('data-id');
  if (a === 'link-guru') { modalLinkGuru(id); return true; }
  if (a === 'link-jana') {
    el.disabled = true;
    hantar('janaLinkGuru', { id: id }, function (res) { toast(res.mesej); paparLinkBaru(cariGuru(id), res); }, function (m) { el.disabled = false; toast(m); });
    return true;
  }
  if (a === 'link-batal') {
    hantar('batalLinkGuru', { id: id }, function (res) { $('#overlay').innerHTML = ''; toast(res.mesej); });
    return true;
  }
  return false;
}


/* ---------- Kehadiran (dari app Laporan Guru, tab Kehadiran) ---------- */
function kehadiranPelajar(id) {
  return (S.D.kehadiran || []).filter(function (k) { return k.pelajarId === id; })
    .sort(function (a, b) { return a.tarikh < b.tarikh ? 1 : -1; });
}
function blokKehadiran(p) {
  var L = kehadiranPelajar(p.id);
  var h = '<div class="sec-h">Kehadiran kelas</div>';
  if (!L.length) return h + '<div class="empty">Belum ada rekod kehadiran. Guru tanda kehadiran melalui app Laporan Guru.</div>';
  var hadir = L.filter(function (k) { return k.status === 'Hadir'; });
  var akhir = hadir[0];
  return h + '<div class="khd"><b>' + hadir.length + '/' + L.length + '</b> kelas hadir (' + pct(hadir.length / L.length) + ')' +
    (akhir ? ' · terakhir hadir ' + esc(fmtV(akhir.tarikh)) : '') + '</div><div class="kstrip">' +
    L.slice(0, 12).reverse().map(function (k) { return '<i class="' + (k.status === 'Hadir' ? 'g' : 'r') + '" title="' + esc(fmtV(k.tarikh) + ': ' + k.status) + '"></i>'; }).join('') + '</div>';
}
function senaraiPonteng(tid) {
  var by = {};
  (S.D.kehadiran || []).forEach(function (k) { if (tid && k.tempatId !== tid) return; (by[k.pelajarId] = by[k.pelajarId] || []).push(k); });
  var out = [];
  S.D.pelajar.forEach(function (p) {
    if (p.status !== 'Aktif' || !by[p.id]) return;
    var L = by[p.id].sort(function (a, b) { return a.tarikh < b.tarikh ? 1 : -1; });
    var n = 0; while (n < L.length && L[n].status !== 'Hadir') n++;
    if (n >= 2) {
      var akhir = L[n] ? L[n].tarikh : '';
      out.push({ p: p, n: n, akhir: akhir, sejak: L[n - 1].tarikh });
    }
  });
  return out.sort(function (a, b) { return b.n - a.n; });
}
function kadPonteng(tid) {
  var L = senaraiPonteng(tid), tulis = bolehTulis(), D = S.D;
  if (!(D.kehadiran || []).length) return '';
  var h = '<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Pelajar tak hadir 2 kelas berturut atau lebih</h3><span class="sub">' + L.length + ' pelajar · dari tanda kehadiran guru</span></div>';
  if (!L.length) return h + '<div class="card-b"><div class="empty">Tiada. Semua pelajar aktif hadir sekurang-kurangnya sekali dalam 2 kelas terakhir.</div></div></div>';
  return h + '<div class="tw"><table><thead><tr><th>Pelajar</th><th>Tempat</th><th class="n">Berturut</th><th>Terakhir hadir</th><th>Hubungan terakhir</th><th></th></tr></thead><tbody>' +
    L.map(function (x) {
      var p = x.p, lg = (D.log || []).filter(function (l) { return l.ref === p.id; }).sort(function (a, b) { return a.tarikh < b.tarikh ? 1 : -1; })[0];
      var msg = 'Assalamualaikum ' + (p.ibuBapa || 'tuan/puan') + '. Ini daripada HYB ' + (p.tempatNama || '') + '. Kami perasan ' + cap(p.nama) +
        ' tak hadir kelas sejak ' + fmtV(x.sejak) + '. Semoga semuanya baik. Ada apa-apa yang kami boleh bantu?';
      var w = waLink(p.tel, msg);
      return '<tr><td><button class="nm-btn" data-p="' + esc(p.id) + '">' + esc(cap(p.nama)) + '</button><div class="m">' + esc(p.id) + '</div></td>' +
        '<td>' + esc(p.tempatNama || p.tempatId) + '</td><td class="n neg">' + x.n + ' kelas</td><td>' + (x.akhir ? esc(fmtV(x.akhir)) : '<span class="m">belum pernah</span>') + '</td>' +
        '<td class="m" style="font-size:12px">' + (lg ? esc(fmtV(String(lg.tarikh).slice(0, 10))) + '<div>' + esc(String(lg.interaksi).slice(0, 50)) + '</div>' : 'Belum dihubungi') + '</td>' +
        '<td style="white-space:nowrap">' + (w ? '<a class="btn sm wa" href="' + esc(w) + '" target="_blank" rel="noopener">' + ICON.wa + '</a> ' : '<span class="btn sm wa" style="opacity:.45" title="' + (D.preview ? 'Nombor disembunyi dalam preview' : 'Tiada nombor') + '">' + ICON.wa + '</span> ') +
        (tulis ? '<button class="btn sm" data-act="log-pelajar" data-id="' + esc(p.id) + '">' + ICON.plus + 'Log</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';
}

/* Popover pilih status untuk satu sel */
var popMasa = 0;
function bukaPop(btn) {
  tutupPop(); popMasa = Date.now();
  var id = btn.getAttribute('data-yc'), m = btn.getAttribute('data-bln'), p = cariPelajar(id);
  if (!p) return;
  var cur = p.yuran[m] || '';
  var opts = (S.D.senarai.statusYuran || []).concat(['']);
  var div = document.createElement('div');
  div.className = 'pop'; div.id = 'pop';
  div.innerHTML = '<div class="pop-h">' + esc(cap(p.nama)) + '<span>' + esc(label(m)) + (cur === 'Dibayar' && tarikhBayar(id, m) ? ' · dibayar ' + fmt(tarikh(tarikhBayar(id, m))) : '') + '</span></div>' +
    '<div class="pop-tb">Tarikh bayar: <b>' + fmt(tarikh(tarikhPilih())) + '</b></div>' + opts.map(function (y) {
    return '<button data-pop-ke="' + esc(y) + '" data-pop-id="' + esc(id) + '" data-pop-bln="' + esc(m) + '"' + (y === cur ? ' class="on"' : '') + '><i class="yc ' + (KELAS_Y[y] || '') + '">' + (SINGKAT[y] || '·') + '</i>' + esc(y || '(kosongkan)') + (y === 'Dibayar' && cur === 'Dibayar' ? esc(amaunLain(p, m)) : '') + '</button>';
  }).join('') + (opts.indexOf('Dibayar') > -1 ? '<button class="pop-amt" data-pop-amaun="' + esc(id) + '" data-pop-bln="' + esc(m) + '"><i class="yc">RM</i>' + (cur === 'Dibayar' ? 'Tukar tarikh / amaun…' : 'Dibayar, amaun lain…') + '</button>' : '');
  document.body.appendChild(div);
  var r = btn.getBoundingClientRect(), w = 200;
  var left = Math.min(window.innerWidth - w - 12, Math.max(12, r.left + r.width / 2 - w / 2));
  var top = r.bottom + 6 + window.scrollY;
  if (r.bottom + 260 > window.innerHeight) top = r.top + window.scrollY - div.offsetHeight - 6;
  div.style.left = left + 'px'; div.style.top = top + 'px';
}
function tutupPop() { var p = document.getElementById('pop'); if (p) p.remove(); }

function aksiKutipan(a, el) {
  switch (a) {
    case 'buka-bulan': modalBukaBulan(); return true;
    case 'tunggak-semua': KS.semuaT = !KS.semuaT; renderKutipan(); return true;
    case 'bb-ya':
      var r = rancangBukaBulan($('#bb_langkau') && $('#bb_langkau').checked);
      $('#overlay').innerHTML = '';
      ubahYuran(S.bulan, r.ubah, 'Rutin 1hb: buka bulan');
      return true;
    case 'tertunggak':
      var rt = rancangTertunggak();
      sahkan('Tukar ' + rt.length + ' pelajar kepada Tertunggak?', 'Semua pelajar aktif yang masih Belum bayar untuk ' + label(S.bulan) + ' akan ditanda Tertunggak (rutin 29hb).',
        function () { ubahYuran(S.bulan, rt, 'Rutin 29hb: tanda tertunggak'); });
      return true;
    case 'ke-belum':
      S.view = 'pelajar'; S.f = { q: '', tab: 'Aktif', tempat: KS.tempat, yuran: 'belum', sumber: '', umur: '' }; render(); return true;
    case 'salin-belum-k':
      var simpan = S.f; S.f = { q: '', tab: 'Aktif', tempat: KS.tempat, yuran: '', sumber: '', umur: '' };
      var tx = teksBelum(); S.f = simpan; modalTeks('Senarai belum bayar', tx); return true;
    case 'pilih-semua':
      var semua = el.checked; KS.pilih = {};
      if (semua) tapisKutipan().forEach(function (p) { KS.pilih[p.id] = 1; });
      renderKutipan(); return true;
    case 'bulk-batal': KS.pilih = {}; renderKutipan(); return true;
    case 'tb-hari-ini': KS.tarikh = ''; renderKutipan(); return true;
    case 'tb-edit': modalTarikhBayar(el.getAttribute('data-id'), el.getAttribute('data-bln')); return true;
    case 'tb-simpan':
      var tbv = $('#tb_d').value, tbid = el.getAttribute('data-id'), tbb = el.getAttribute('data-bln'), tbp = cariPelajar(tbid);
      var ia = $('#tb_a'), tba = Math.round(num(ia.value) * 100) / 100, tbs = $('#tb_s').value.trim();
      if (!tbv) { toast('Isi tarikh bayar'); return true; }
      if (tbv > isoHari(today())) { toast('Tarikh bayar tidak boleh pada masa depan'); return true; }
      if (!(tba > 0) || tba > 5000) { toast('Isi amaun yang sah (RM1 hingga RM5000)'); return true; }
      // sebab wajib bila amaun baru lain dari yuran tempat (tak perlu jika cuma betulkan tarikh)
      if (!tbs && tba !== num(ia.getAttribute('data-yuran')) && (tba !== num(ia.getAttribute('data-asal')) || (tbp && tbp.yuran[tbb] !== 'Dibayar'))) { toast('Isi sebab kenapa amaun lain dari yuran'); $('#tb_s').focus(); return true; }
      el.disabled = true;
      if (tbp && tbp.yuran[tbb] !== 'Dibayar') {
        $('#overlay').innerHTML = '';
        ubahYuran(tbb, [{ id: tbid, ke: 'Dibayar', dari: tbp.yuran[tbb] || '', amaun: tba === num(ia.getAttribute('data-yuran')) ? '' : tba }], tbs, function () { if ($('.drawer')) bukaPelajar(tbid); }, tbv);
        return true;
      }
      hantar('tukarTarikhBayar', { id: tbid, bulan: tbb, tarikh: tbv, amaun: tba, sebab: tbs }, function (res) { $('#overlay').innerHTML = ''; toast(res.mesej); },
        function (m) { el.disabled = false; toast('Tak berjaya: ' + m); });
      return true;
    case 'bulk-simpan':
      var ke = $('#bulk_ke').value, b = S.bulan;
      var ubah = Object.keys(KS.pilih).map(function (id) { var p = cariPelajar(id); return { id: id, ke: ke, dari: p ? (p.yuran[b] || '') : null }; })
        .filter(function (x) { return x.dari !== x.ke; });
      KS.pilih = {};
      ubahYuran(b, ubah, 'Kemas kini pukal');
      return true;
    case 'bayar-pantas':
      var pp = cariPelajar(el.getAttribute('data-id'));
      if (pp) ubahYuran(S.bulan, [{ id: pp.id, ke: 'Dibayar', dari: pp.yuran[S.bulan] || '' }], '', function () { if ($('#overlay').innerHTML) bukaPelajar(pp.id); });
      return true;
    case 'drawer-yuran':
      var px = cariPelajar(el.getAttribute('data-id')), kx = el.getAttribute('data-ke');
      if (px) ubahYuran(S.bulan, [{ id: px.id, ke: kx, dari: px.yuran[S.bulan] || '' }], '', function () { bukaPelajar(px.id); });
      return true;
  }
  return false;
}

document.addEventListener('click', function (e) {
  var yc = e.target.closest && e.target.closest('[data-yc]');
  if (yc) { e.stopPropagation(); bukaPop(yc); return; }
  var pa = e.target.closest && e.target.closest('[data-pop-amaun]');
  if (pa) { tutupPop(); modalTarikhBayar(pa.getAttribute('data-pop-amaun'), pa.getAttribute('data-pop-bln')); return; }
  var po = e.target.closest && e.target.closest('[data-pop-ke]');
  if (po) {
    var id = po.getAttribute('data-pop-id'), m = po.getAttribute('data-pop-bln'), ke = po.getAttribute('data-pop-ke'), p = cariPelajar(id);
    tutupPop();
    if (p && (p.yuran[m] || '') !== ke) ubahYuran(m, [{ id: id, ke: ke, dari: p.yuran[m] || '' }], '', function () { if ($('.drawer')) bukaPelajar(id); });
    return;
  }
  if (!(e.target.closest && e.target.closest('#pop'))) tutupPop();
  var kt = e.target.closest && e.target.closest('[data-k-tempat]');
  if (kt) { KS.tempat = kt.getAttribute('data-k-tempat'); KS.pilih = {}; renderKutipan(); }
}, true);
document.addEventListener('change', function (e) {
  var el = e.target;
  if (el.hasAttribute && el.hasAttribute('data-kf')) { KS[el.getAttribute('data-kf')] = el.value; KS.pilih = {}; renderKutipan(); }
  else if (el.hasAttribute && el.hasAttribute('data-pilih')) { if (el.checked) KS.pilih[el.getAttribute('data-pilih')] = 1; else delete KS.pilih[el.getAttribute('data-pilih')]; renderKutipan(); }
  else if (el.id === 'k_tarikh') { KS.tarikh = el.value && el.value <= isoHari(today()) ? el.value : ''; renderKutipan(); }
  else if (el.id === 'bb_langkau') { var i = $('#bb_info'); if (i) i.innerHTML = infoBuka(rancangBukaBulan(el.checked)); }
});
document.addEventListener('input', function (e) {
  if (e.target.id !== 'kq') return;
  KS.q = e.target.value;
  clearTimeout(deb); deb = setTimeout(function () { var pos = e.target.selectionStart; renderKutipan(); var q = $('#kq'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }, 200);
});
document.addEventListener('scroll', function () { if (Date.now() - popMasa > 400) tutupPop(); }, { passive: true, capture: true });


/* ================================================================
   FASA 4: KALENDAR + LAPORAN
   ================================================================ */
var MULA_CRM = '2026-11-01'; // laporan kelas hanya dikejar mulai tarikh CRM digunakan
var HARI_ISNIN = [1, 2, 3, 4, 5, 6, 0];
var RUTIN_K = [
  { hb: 1, t: 'Invois dikeluarkan' }, { hb: 1, t: 'Mula bayar sewa masjid (1-10hb)' }, { hb: 3, t: 'Mula peringatan WhatsApp' }, { hb: 10, t: 'Akhir bayar sewa masjid' },
  { hb: 11, t: 'Mula telefon ibu bapa' }, { hb: 22, t: 'Peringatan invois' }, { hb: 29, t: 'Tanda tertunggak' }
];
function kunciBulan(y, m) { return 'Yuran ' + BLN[m] + ' ' + y; }
function masaKelas(t, hn) { return String(t.hariMasa || '').replace(new RegExp(hn, 'i'), '').trim(); }
function adaKelas(t, d) {
  if (JALAN.indexOf(t.status) < 0) return false;
  var hm = String(t.hariMasa || ''), hn = HARI[d.getDay()];
  if (!new RegExp('\\b' + hn + '\\b', 'i').test(hm)) return false;
  var m = tarikh(t.tarikhMula);
  return !m || d >= m;
}
function petaLaporan() {
  var o = {};
  (S.D.laporan || []).forEach(function (l) { var d = tarikh(l.tarikh); if (d) o[l.tempatId + '|' + isoHari(d)] = l; });
  return o;
}

/* Semua acara untuk satu hari */
function acaraHari(d, lap) {
  var key = isoHari(d), now = today(), A = [];
  S.D.tempat.forEach(function (t) {
    if (adaKelas(t, d)) {
      A.push({ j: 'kelas', t: t, teks: t.nama, sub: (cap(masaKelas(t, HARI[d.getDay()])) || 'masa belum diisi') + (t.guru ? ' · ' + t.guru : '') });
    }
    if (t.tarikhTindakan && isoHari(tarikh(t.tarikhTindakan) || new Date(0)) === key && t.status !== 'Tutup') {
      A.push({ j: 'tindakan', t: t, teks: t.tindakan || 'Tindakan', sub: t.nama + (t.owner ? ' · ' + t.owner : ''), lewat: d < now });
    }
  });
  var kumpul = {};
  (S.D.log || []).forEach(function (l) {
    if (l.tindakan && l.tarikhTindakan && l.tarikhTindakan.slice(0, 10) === key && !TMAP[l.ref]) {
      var k = l.tindakan + '|' + (l.oleh || '');
      if (!kumpul[k]) { kumpul[k] = { j: 'tindakan', refs: [], teks: l.tindakan, oleh: l.oleh, lewat: d < now }; A.push(kumpul[k]); }
      if (l.ref && kumpul[k].refs.indexOf(l.ref) < 0) kumpul[k].refs.push(l.ref);
    }
  });
  Object.keys(kumpul).forEach(function (k) {
    var x = kumpul[k];
    if (x.refs.length === 1) x.ref = x.refs[0];
    if (x.refs.length > 1) x.teks += ' (' + x.refs.length + ' pelajar)';
    x.sub = (x.refs.length > 3 ? x.refs.slice(0, 3).join(', ') + '…' : x.refs.join(', ')) + (x.oleh ? ' · ' + x.oleh : '');
  });
  (S.D.guru || []).forEach(function (g) {
    var tt = tarikh(g.tarikhTemuduga);
    if (tt && isoHari(tt) === key && (g.status === 'Temuduga' || g.status === 'Calon')) A.push({ j: 'temuduga', g: g, teks: 'Temuduga ' + (g.gelaran ? g.gelaran + ' ' : '') + g.nama, sub: g.kawasan || '' });
  });
  var akhir = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  RUTIN_K.forEach(function (r) { if (Math.min(r.hb, akhir) === d.getDate()) A.push({ j: 'rutin', teks: r.t, sub: 'Rutin kutipan' }); });
  var w = function (a) { return a.lewat || a.tiada ? 0 : a.j === 'temuduga' ? 1 : a.j === 'tindakan' ? 2 : a.j === 'rutin' ? 3 : 4; };
  return A.map(function (a, i) { a._i = i; return a; }).sort(function (a, b) { return w(a) - w(b) || a._i - b._i; });
}

var KAL_KELAS = { kelas: 'k-kelas', tindakan: 'k-tind', rutin: 'k-rutin', temuduga: 'k-temu' };
function pilKal(a) {
  var c = KAL_KELAS[a.j] + (a.lewat ? ' lewat' : '') + (a.tiada ? ' tiada' : '') + (a.lap ? ' ada' : '');
  return '<span class="kp ' + c + '" title="' + esc(a.teks + (a.sub ? ' · ' + a.sub : '')) + '">' + (a.lap ? '✓ ' : a.tiada ? '! ' : '') + esc(a.j === 'kelas' ? a.t.id.replace('HYB-', '') + ' ' + a.t.nama : a.teks) + '</span>';
}

function renderKalendar() {
  var now = today();
  if (!S.kal) S.kal = { mod: 'bulan', y: now.getFullYear(), m: now.getMonth(), pilih: isoHari(now) };
  var K = S.kal, lap = petaLaporan(), tulis = bolehTulis();
  var h = '<div class="top"><div><div class="eyebrow">' + eyebrow() + '</div><h1>Kalendar <em>HYB</em></h1></div><div class="top-r">' +
    '<div class="seg"><button data-kal-mod="bulan"' + (K.mod === 'bulan' ? ' class="on"' : '') + '>Bulanan</button><button data-kal-mod="minggu"' + (K.mod === 'minggu' ? ' class="on"' : '') + '>Jadual mingguan</button></div>' +
    '</div></div>';

  h += '<div class="kal-wrap"><div>';
  if (K.mod === 'minggu') h += kalMinggu();
  else h += kalBulan(K, lap);
  h += '</div><div class="kal-side">' + kalAgenda(lap) + '</div></div>';
  $('#view').innerHTML = h;
}

function kalBulan(K, lap) {
  var now = today(), first = new Date(K.y, K.m, 1), akhir = new Date(K.y, K.m + 1, 0).getDate();
  var off = (first.getDay() + 6) % 7, sel = K.pilih;
  var h = '<div class="card"><div class="card-h"><div class="kal-nav"><button class="btn sm" data-kal-gerak="-1" aria-label="Bulan sebelum">‹</button>' +
    '<h3>' + BLN[K.m] + ' ' + K.y + '</h3><button class="btn sm" data-kal-gerak="1" aria-label="Bulan seterusnya">›</button>' +
    '<button class="btn sm" data-kal-gerak="0">Hari ini</button></div>' +
    '<div class="kal-leg"><span class="kp k-kelas">Kelas</span><span class="kp k-tind">Tindakan</span><span class="kp k-rutin">Rutin kutipan</span><span class="kp k-temu">Temuduga</span></div></div>' +
    '<div class="kal-g kal-h">' + HARI_ISNIN.map(function (i) { return '<div>' + HARI[i].slice(0, 3) + '</div>'; }).join('') + '</div><div class="kal-g">';
  for (var i = 0; i < off; i++) h += '<div class="kc kosong"></div>';
  for (var n = 1; n <= akhir; n++) {
    var d = new Date(K.y, K.m, n), key = isoHari(d), A = acaraHari(d, lap);
    var cls = 'kc' + (+d === +now ? ' today' : '') + (key === sel ? ' sel' : '') + (d.getDay() === 0 || d.getDay() === 6 ? ' hujung' : '');
    h += '<button class="' + cls + '" data-kal-hari="' + key + '"><b>' + n + '</b>' + A.slice(0, 3).map(pilKal).join('') +
      (A.length > 3 ? '<span class="kp lagi">+' + (A.length - 3) + ' lagi</span>' : '') + '</button>';
  }
  var tail = (7 - (off + akhir) % 7) % 7;
  for (var j = 0; j < tail; j++) h += '<div class="kc kosong"></div>';
  h += '</div>';
  // butiran hari dipilih
  var ds = tarikh(sel);
  if (ds && ds.getMonth() === K.m && ds.getFullYear() === K.y) h += kalButiran(ds, lap);
  return h + '</div>';
}

function itemAcara(a, d, tulis) {
  var aksi = '';
  var klik = a.t ? ' class="click" data-profil="' + esc(a.t.id) + '"' : (a.ref ? ' class="click" data-p="' + esc(a.ref) + '"' : '');
  return '<li' + klik + '><span class="kdot ' + KAL_KELAS[a.j] + (a.lewat ? ' lewat' : '') + (a.tiada ? ' tiada' : '') + '"></span><div style="min-width:0;flex:1"><div class="nm">' + esc(a.teks) +
    (a.lewat ? ' ' + chip('Lewat', 'c-r') : '') + (a.tiada ? ' ' + chip('Tiada laporan', 'c-r') : '') + '</div><div class="m">' + esc(a.sub || '') + (a.lap && a.lap.topik ? ' · ' + esc(String(a.lap.topik).slice(0, 60)) : '') + '</div></div>' + aksi + '</li>';
}
function kalButiran(d, lap) {
  var A = acaraHari(d, lap), tulis = bolehTulis();
  return '<div class="kal-det"><div class="sec-h" style="margin-top:0">' + HARI[d.getDay()] + ', ' + fmt(d) + '</div>' +
    (A.length ? '<ul class="agl">' + A.map(function (a) { return itemAcara(a, d, tulis); }).join('') + '</ul>' : '<div class="empty">Tiada acara pada hari ini.</div>') + '</div>';
}

function kalAgenda(lap) {
  var now = today(), tulis = bolehTulis(), h = '';
  for (var i = 0; i < 7; i++) {
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i), A = acaraHari(d, lap);
    if (!A.length) continue;
    h += '<div class="ag-d"><div class="dbox' + (i === 0 ? ' today' : '') + '"><b>' + d.getDate() + '</b><span>' + HARI[d.getDay()].slice(0, 3) + '</span></div><ul class="agl">' +
      A.map(function (a) { return itemAcara(a, d, tulis); }).join('') + '</ul></div>';
  }
  // tindakan lewat (sebelum hari ini)
  var lewat = S.D.tempat.filter(function (t) { var tt = tarikh(t.tarikhTindakan); return tt && tt < now && t.status !== 'Tutup'; });
  return '<div class="card"><div class="card-h"><h3>7 hari akan datang</h3></div><div class="card-b">' +
    (lewat.length ? '<div class="hint" style="margin:0 0 10px">' + lewat.length + ' tindakan tempat dah lepas tarikh: ' + lewat.map(function (t) { return esc(t.id.replace('HYB-', '')); }).join(', ') + '</div>' : '') +
    (h || '<div class="empty">Tiada acara minggu ini.</div>') + '</div></div>';
}

function kalMinggu() {
  var aktif = {};
  S.D.pelajar.forEach(function (p) { if (p.status === 'Aktif') aktif[p.tempatId] = (aktif[p.tempatId] || 0) + 1; });
  var tanpa = S.D.tempat.filter(function (t) { return t.status !== 'Tutup' && (JALAN.indexOf(t.status) > -1 || t.status === 'Recruitment') && !HARI.some(function (hn) { return new RegExp('\\b' + hn + '\\b', 'i').test(t.hariMasa || ''); }); });
  var h = '<div class="card"><div class="card-h"><h3>Jadual kelas mingguan</h3><span class="sub">ikut lajur Hari & masa dalam tab Tempat</span></div><div class="wkg">';
  HARI_ISNIN.forEach(function (i) {
    var hn = HARI[i];
    var L = S.D.tempat.filter(function (t) { return t.status !== 'Tutup' && new RegExp('\\b' + hn + '\\b', 'i').test(t.hariMasa || ''); })
      .sort(function (a, b) { return masaKelas(a, hn) < masaKelas(b, hn) ? -1 : 1; });
    h += '<div class="wkc' + (L.length ? '' : ' kosong') + '"><div class="wkh">' + hn + '<span>' + L.length + '</span></div>' + L.map(function (t) {
      var jalan = JALAN.indexOf(t.status) > -1;
      return '<button class="wkk' + (jalan ? '' : ' belum') + '" data-profil="' + esc(t.id) + '"><b>' + esc(t.nama) + '</b><span>' + esc(cap(masaKelas(t, hn)) || 'masa belum diisi') + '</span>' +
        '<span>' + esc(t.guru || 'Guru belum ada') + '</span><span>' + (jalan ? (aktif[t.id] || 0) + ' pelajar' : esc(t.status)) + '</span></button>';
    }).join('') + '</div>';
  });
  h += '</div>';
  if (tanpa.length) h += '<div class="hint" style="margin:0 16px 14px">' + tanpa.length + ' tempat belum ada hari kelas: ' + tanpa.map(function (t) { return esc(t.id + ' ' + t.nama); }).join(', ') + '. Isi lajur Hari & masa (contoh "Sabtu pagi") supaya muncul dalam jadual.</div>';
  return h + '</div>';
}

/* ---------------- LAPORAN ---------------- */
function bulanSehingga() {
  // bulan dalam bulanList sehingga bulan dipilih
  var bi = S.D.bulanList.indexOf(S.bulan);
  return S.D.bulanList.slice(0, bi + 1);
}
function tarikhBulan(b) {
  var m = /(\w{3})\s+(\d{4})$/.exec(b || '');
  return m ? { y: +m[2], m: BLN.indexOf(m[1]) } : null;
}
function statBulan(b) {
  var tb = tarikhBulan(b), akhir = tb ? new Date(tb.y, tb.m + 1, 0) : today();
  var kos = num(S.D.tetapan.guru) + num(S.D.tetapan.masjid);
  var per = {};
  S.D.tempat.forEach(function (t) {
    var mula = tarikh(t.tarikhMula), jalan = JALAN.indexOf(t.status) > -1 && (!mula || mula <= akhir);
    per[t.id] = { t: t, yuran: num(t.yuran) || num(S.D.tetapan.yuranStandard), dibayar: 0, perlu: 0, taja: 0, kutipan: 0, kos: jalan ? Math.max(0, kosTempat(t, kos) - sewaWaive(t.id, b)) : 0, jalan: jalan };
  });
  S.D.pelajar.forEach(function (p) {
    var y = p.yuran[b], r = per[p.tempatId];
    if (!y || !r) return;
    if (y === 'Ditaja' || y === 'Dikecualikan') { r.taja++; return; }
    r.perlu++;
    if (y === 'Dibayar') { r.dibayar++; r.kutipan += r.yuran; }
  });
  var TJ = tajaanTempat(b), TD = daftarTempat(b);
  var rows = S.D.tempat.map(function (t) { var r = per[t.id]; r.tajaan = TJ[t.id] || 0; r.daftar = TD[t.id] || 0; r.kutipan += r.tajaan + r.daftar; r.pk = r.perlu ? r.dibayar / r.perlu : null; r.untung = r.kutipan - r.kos; return r; });
  var s = function (k) { return rows.reduce(function (a, r) { return a + r[k]; }, 0); };
  var perlu = s('perlu');
  return { b: b, rows: rows, kutipan: s('kutipan'), kos: s('kos'), dibayar: s('dibayar'), perlu: perlu, pk: perlu ? s('dibayar') / perlu : null };
}
function aliranPelajar() {
  var o = {}, keyOf = function (v) { var d = tarikh(v); return d ? d.getFullYear() + '-' + pad(d.getMonth() + 1) : null; };
  S.D.pelajar.forEach(function (p) {
    var a = keyOf(p.tarikhDaftar); if (a) { o[a] = o[a] || { baru: 0, henti: 0 }; o[a].baru++; }
    if (p.status === 'Berhenti') { var b = keyOf(p.tarikhBerhenti); if (b) { o[b] = o[b] || { baru: 0, henti: 0 }; o[b].henti++; } }
  });
  var now = today(), list = [];
  for (var i = 11; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1), k = d.getFullYear() + '-' + pad(d.getMonth() + 1);
    list.push({ k: k, l: BLN[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2), baru: (o[k] || {}).baru || 0, henti: (o[k] || {}).henti || 0 });
  }
  while (list.length > 3 && !list[0].baru && !list[0].henti) list.shift();
  return list;
}
function kiraanLabel(arr, key) {
  var o = {}; arr.forEach(function (x) { var v = String(x[key] || '').trim() || '(tidak diisi)'; o[v] = (o[v] || 0) + 1; });
  return Object.keys(o).map(function (k) { return { k: k, n: o[k] }; }).sort(function (a, b) { return b.n - a.n; });
}

function barMendatar(L, warna) {
  var max = Math.max.apply(null, L.map(function (x) { return x.n; }).concat([1]));
  return '<div class="hbars">' + L.map(function (x) {
    return '<div class="hb" title="' + esc(x.k + ': ' + x.n) + '"><span class="hb-l">' + esc(x.k) + '</span><span class="hb-t"><i style="width:' + (x.n / max * 100) + '%;background:' + (warna || 'var(--brand)') + '"></i></span><b>' + x.n + '</b></div>';
  }).join('') + '</div>';
}

function renderLaporan() {
  var D = S.D, bl = bulanSehingga(), cur = statBulan(S.bulan), stats = bl.map(statBulan);
  var aliran = aliranPelajar(), now = today();
  var kb = now.getFullYear() + '-' + pad(now.getMonth() + 1), ini = aliran.filter(function (x) { return x.k === kb; })[0] || { baru: 0, henti: 0 };
  var h = '<div class="top"><div><div class="eyebrow">' + eyebrow() + '</div><h1>Laporan <em>HYB</em></h1></div><div class="top-r">' + monthSelect() +
    '<button class="btn" data-act="lap-salin">' + ICON.copy + 'Salin laporan bulan</button><button class="btn" data-act="cetak">Cetak / PDF</button></div></div>';

  h += '<div class="grid kpis k4">' +
    '<div class="card kpi"><div class="l">Kutipan ' + esc(label(S.bulan)) + '</div><div class="v">' + rm(cur.kutipan) + '</div><div class="s">' + cur.dibayar + '/' + cur.perlu + ' pelajar · ' + pct(cur.pk) + '</div></div>' +
    '<div class="card kpi"><div class="l">Untung sebenar</div><div class="v ' + (cur.kutipan - cur.kos >= 0 ? 'pos' : 'neg') + '">' + rm(cur.kutipan - cur.kos) + '</div><div class="s">kos tetap ' + rm(cur.kos) + '</div></div>' +
    '<div class="card kpi"><div class="l">Pelajar baru bulan ini</div><div class="v">' + ini.baru + '</div><div class="s">ikut tarikh daftar</div></div>' +
    '<div class="card kpi"><div class="l">Berhenti bulan ini</div><div class="v' + (ini.henti ? ' neg' : '') + '">' + ini.henti + '</div><div class="s">' + D.pelajar.filter(function (p) { return p.status === 'Berhenti'; }).length + ' berhenti setakat ini</div></div></div>';

  h += kadKutipanTarikh();

  // Trend kutipan vs kos
  var maxT = Math.max.apply(null, stats.map(function (s) { return Math.max(s.kutipan, s.kos); }).concat([1]));
  h += '<div class="lap-g"><div class="card"><div class="card-h"><h3>Kutipan berbanding kos tetap</h3><span class="sub">RM sebulan</span></div><div class="card-b">' +
    '<div class="leg2"><span><i class="sw" style="background:var(--brand)"></i>Kutipan</span><span><i class="sw ln"></i>Kos tetap</span></div>' +
    '<div class="vbars">' + stats.map(function (s) {
      var u = s.kutipan - s.kos;
      return '<div class="vb" title="' + esc(label(s.b) + ': kutipan ' + rm(s.kutipan) + ', kos ' + rm(s.kos) + ', untung ' + rm(u)) + '" tabindex="0">' +
        '<div class="vb-a"><span class="vb-v" style="bottom:calc(' + (s.kutipan / maxT * 100) + '% + 3px)">' + (s.kutipan ? rm(s.kutipan).replace('RM', '') : '') + '</span><i style="height:' + (s.kutipan / maxT * 100) + '%"></i>' +
        (s.kos ? '<em style="bottom:' + (s.kos / maxT * 100) + '%"></em>' : '') + '</div>' +
        '<span class="vb-l' + (s.b === S.bulan ? ' cur' : '') + '">' + esc(label(s.b).replace(' 20', ' ')) + '</span><span class="vb-u ' + (u >= 0 ? 'pos' : 'neg') + '">' + (s.kos || s.kutipan ? rm(u) : '') + '</span></div>';
    }).join('') + '</div><div class="m" style="font-size:12px;margin-top:8px">Kos dianggarkan dari tempat yang kelasnya dah bermula pada bulan itu. Angka bawah bar ialah untung sebenar.</div></div></div>';

  // Untung setiap tempat
  var rowsJ = cur.rows.filter(function (r) { return r.jalan || r.kutipan; });
  var maxU = Math.max.apply(null, rowsJ.map(function (r) { return Math.abs(r.untung); }).concat([1]));
  h += '<div class="card"><div class="card-h"><h3>Untung setiap tempat</h3><span class="sub">' + esc(label(S.bulan)) + ' · kutipan tolak kos</span></div><div class="card-b"><div class="div-bars">' +
    rowsJ.sort(function (a, b) { return b.untung - a.untung; }).map(function (r) {
      var w = Math.abs(r.untung) / maxU * 50;
      return '<div class="db" title="' + esc(r.t.nama + ': kutipan ' + rm(r.kutipan) + ', kos ' + rm(r.kos)) + '"><span class="db-l">' + esc(r.t.nama) + '<em>' + (r.taja && !r.perlu ? 'ditaja (lumpsum)' : r.dibayar + '/' + r.perlu + ' bayar') + '</em></span>' +
        '<span class="db-t"><i class="' + (r.untung >= 0 ? 'p' : 'n') + '" style="width:' + w + '%;' + (r.untung >= 0 ? 'left:50%' : 'right:50%') + '"></i></span><b class="' + (r.untung >= 0 ? 'pos' : 'neg') + '">' + rm(r.untung) + '</b></div>';
    }).join('') + '</div>' + (cur.rows.some(function (r) { return r.taja && !r.perlu && r.jalan; }) ? '<div class="m" style="font-size:12px;margin-top:8px">Tempat ditaja nampak rugi kerana bayaran penaja secara lumpsum tidak direkod sebagai yuran bulanan.</div>' : '') + '</div></div></div>';

  // Heatmap % kutipan
  var tempatH = D.tempat.filter(function (t) { return stats.some(function (s) { var r = s.rows.filter(function (x) { return x.t.id === t.id; })[0]; return r && (r.perlu || r.taja); }); });
  h += '<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>% kutipan setiap tempat</h3><span class="sub">Dibayar ÷ (pelajar perlu bayar)</span></div><div class="tw"><table class="heat"><thead><tr><th>Tempat</th>' +
    bl.map(function (b) { return '<th class="n">' + esc(label(b).replace(' 20', ' ')) + '</th>'; }).join('') + '</tr></thead><tbody>' +
    tempatH.map(function (t) {
      return '<tr><td><span class="nm">' + esc(t.nama) + '</span><div class="m">' + esc(t.id) + '</div></td>' + stats.map(function (s) {
        var r = s.rows.filter(function (x) { return x.t.id === t.id; })[0];
        if (!r || (!r.perlu && !r.taja)) return '<td class="hc"><span class="hx">–</span></td>';
        if (!r.perlu) return '<td class="hc"><span class="hx taja">Taja</span></td>';
        var p = r.pk, lvl = p >= .9 ? 5 : p >= .75 ? 4 : p >= .5 ? 3 : p >= .25 ? 2 : 1;
        return '<td class="hc"><span class="hx h' + lvl + '" title="' + esc(t.nama + ' ' + label(s.b) + ': ' + r.dibayar + '/' + r.perlu) + '">' + pct(p) + '</span></td>';
      }).join('') + '</tr>';
    }).join('') + '<tr class="tot"><td>Semua tempat</td>' + stats.map(function (s) { return '<td class="hc"><b>' + pct(s.pk) + '</b></td>'; }).join('') + '</tr></tbody></table></div>' +
    '<div class="heat-leg"><span>0%</span>' + [1, 2, 3, 4, 5].map(function (i) { return '<i class="hx h' + i + '"></i>'; }).join('') + '<span>100%</span><span class="m">Kurang 25% · 25-49% · 50-74% · 75-89% · 90% ke atas</span></div></div>';

  // Aliran pelajar + sebab + sumber
  var maxA = Math.max.apply(null, aliran.map(function (a) { return Math.max(a.baru, a.henti); }).concat([1]));
  var henti = D.pelajar.filter(function (p) { return p.status === 'Berhenti'; });
  var sumber = kiraanLabel(D.pelajar.filter(function (p) { return p.status === 'Aktif' || p.status === 'Berhenti'; }), 'sumber');
  var sumberKosong = sumber.length === 1 && sumber[0].k === '(tidak diisi)';
  h += '<div class="lap-g3"><div class="card"><div class="card-h"><h3>Pelajar baru berbanding berhenti</h3></div><div class="card-b">' +
    '<div class="leg2"><span><i class="sw" style="background:var(--brand)"></i>Baru</span><span><i class="sw" style="background:var(--accent)"></i>Berhenti</span></div>' +
    '<div class="vbars g2">' + aliran.map(function (a) {
      return '<div class="vb" title="' + esc(a.l + ': ' + a.baru + ' baru, ' + a.henti + ' berhenti') + '" tabindex="0"><div class="vb-a pair">' +
        '<div><span class="vb-v">' + (a.baru || '') + '</span><i style="height:' + (a.baru / maxA * 100) + '%"></i></div>' +
        '<div><span class="vb-v">' + (a.henti || '') + '</span><i class="pk" style="height:' + (a.henti / maxA * 100) + '%"></i></div></div><span class="vb-l">' + esc(a.l) + '</span></div>';
    }).join('') + '</div>' + (D.pelajar.some(function (p) { return p.status !== 'Lead' && !p.tarikhDaftar; }) ? '<div class="m" style="font-size:12px;margin-top:8px">' + D.pelajar.filter(function (p) { return p.status !== 'Lead' && !p.tarikhDaftar; }).length + ' pelajar tiada tarikh daftar, jadi tak dikira.</div>' : '') + '</div></div>' +
    '<div class="card"><div class="card-h"><h3>Sebab berhenti</h3><span class="sub">' + henti.length + ' pelajar</span></div><div class="card-b">' +
    (henti.length ? barMendatar(kiraanLabel(henti, 'sebabBerhenti'), 'var(--accent)') : '<div class="empty">Belum ada pelajar berhenti.</div>') + '</div></div>' +
    '<div class="card"><div class="card-h"><h3>Sumber pelajar</h3></div><div class="card-b">' +
    (sumberKosong ? '<div class="empty">Lajur Sumber masih kosong untuk semua pelajar. Isi Sumber semasa daftar (contoh: Masjid, Rakan, Facebook) supaya kita tahu saluran mana paling berkesan.</div>' : barMendatar(sumber)) + '</div></div></div>';

  // Kehadiran 4 minggu
  var lap = petaLaporan(), dari = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 28), mula = tarikh(MULA_CRM);
  if (dari < mula) dari = mula;
  var aktifT = {};
  D.pelajar.forEach(function (p) { if (p.status === 'Aktif') aktifT[p.tempatId] = (aktifT[p.tempatId] || 0) + 1; });
  var hadirRows = D.tempat.filter(function (t) { return JALAN.indexOf(t.status) > -1; }).map(function (t) {
    var sesi = 0, ada = 0, hadir = 0;
    for (var d = new Date(dari); d < now; d.setDate(d.getDate() + 1)) {
      if (!adaKelas(t, d)) continue; sesi++;
      var l = lap[t.id + '|' + isoHari(d)]; if (l) { ada++; hadir += num(l.hadir); }
    }
    return { t: t, sesi: sesi, ada: ada, purata: ada ? hadir / ada : null, aktif: aktifT[t.id] || 0 };
  });
  h += kadPonteng();
  h += '<div class="card"><div class="card-h"><h3>Kehadiran kelas</h3><span class="sub">' + fmt(dari) + ' hingga semalam, dari Laporan Kelas</span></div><div class="tw"><table><thead><tr><th>Tempat</th><th>Guru</th><th class="n">Sesi dijadual</th><th class="n">Laporan diisi</th><th class="n">Purata hadir</th><th style="min-width:150px">% hadir (purata ÷ aktif)</th></tr></thead><tbody>' +
    hadirRows.map(function (r) {
      var ph = r.purata != null && r.aktif ? r.purata / r.aktif : null;
      return '<tr class="click" data-profil="' + esc(r.t.id) + '"><td><span class="nm">' + esc(r.t.nama) + '</span><div class="m">' + esc(r.t.id + ' · ' + (r.t.hariMasa || 'hari belum diisi')) + '</div></td><td>' + esc(r.t.guru || '–') + '</td>' +
        '<td class="n">' + r.sesi + '</td><td class="n' + (r.sesi && r.ada < r.sesi ? ' neg' : '') + '">' + r.ada + '</td><td class="n">' + (r.purata != null ? r.purata.toFixed(1) + ' / ' + r.aktif : '–') + '</td>' +
        '<td>' + (ph != null ? '<div class="cap"><div class="bar"><i class="' + (ph >= .8 ? 'g' : ph >= .6 ? 'y' : 'r') + '" style="width:' + Math.min(100, ph * 100) + '%"></i></div><span>' + pct(ph) + '</span></div>' : '<span class="m">tiada laporan</span>') + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';

  $('#view').innerHTML = h;
}

/* ---- Kutipan ikut tarikh terima (harian / mingguan / bulanan) ---- */
// Sumber: S.D.bayaran (tab "Rekod Bayaran"). Satu baris = status yuran bertukar ke/dari Dibayar.
var KT = { mod: 'minggu', pilih: '' };
var KT_NAMA = { hari: 'Harian', minggu: 'Mingguan', bulan: 'Bulanan' };
function isnin(d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function kunciTempoh(iso, mod) {
  var d = tarikh(String(iso).slice(0, 10)); if (!d) return '';
  if (mod === 'hari') return isoHari(d);
  if (mod === 'minggu') return isoHari(isnin(d));
  return d.getFullYear() + '-' + pad(d.getMonth() + 1);
}
function senaraiTempoh(mod) {
  var t = today(), L = [], i, d;
  if (mod === 'hari') for (i = 13; i >= 0; i--) { d = new Date(t.getFullYear(), t.getMonth(), t.getDate() - i); L.push({ k: isoHari(d), l: HARI[d.getDay()].slice(0, 3) + ' ' + d.getDate() + '/' + (d.getMonth() + 1) }); }
  else if (mod === 'minggu') { var m = isnin(t); for (i = 7; i >= 0; i--) { d = new Date(m.getFullYear(), m.getMonth(), m.getDate() - 7 * i); L.push({ k: isoHari(d), l: d.getDate() + '/' + (d.getMonth() + 1) }); } }
  else for (i = 5; i >= 0; i--) { d = new Date(t.getFullYear(), t.getMonth() - i, 1); L.push({ k: d.getFullYear() + '-' + pad(d.getMonth() + 1), l: BLN[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2) }); }
  return L;
}
function labelTempoh(k, mod) {
  var d = tarikh(k.length === 7 ? k + '-01' : k); if (!d) return k;
  if (mod === 'hari') return HARI[d.getDay()] + ', ' + fmt(d);
  if (mod === 'minggu') { var e = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6); return fmt(d) + ' hingga ' + fmt(e); }
  return BLN[d.getMonth()] + ' ' + d.getFullYear();
}
function ringkasTempoh(mod, k) {
  var B = (S.D.bayaran || []).filter(function (x) { return kunciTempoh(x.masa, mod) === k; });
  var PM = {}; S.D.pelajar.forEach(function (p) { PM[p.id] = p; });
  var per = {}, bulan = {}, subt = {}, jumlah = 0, bil = 0, batal = 0;
  B.forEach(function (x) {
    jumlah += x.amaun; if (x.amaun > 0) bil++; else batal++;
    var r = per[x.tempatId] = per[x.tempatId] || { id: x.tempatId, nama: (TMAP[x.tempatId] || {}).nama || x.tempatId, rm: 0, n: 0 };
    r.rm += x.amaun; r.n += x.amaun > 0 ? 1 : -1;
    bulan[x.bulan] = (bulan[x.bulan] || 0) + x.amaun;
    var sk = mod === 'bulan' ? kunciTempoh(x.masa, 'minggu') : mod === 'minggu' ? kunciTempoh(x.masa, 'hari') : '';
    if (sk) subt[sk] = (subt[sk] || 0) + x.amaun;
  });
  return { mod: mod, k: k, label: labelTempoh(k, mod), jumlah: jumlah, bil: bil, batal: batal,
    tempat: Object.keys(per).map(function (i) { return per[i]; }).sort(function (a, b) { return b.rm - a.rm; }),
    bulan: Object.keys(bulan).map(function (b) { return { b: b, rm: bulan[b] }; }).sort(function (a, b) { return S.D.bulanList.indexOf(a.b) - S.D.bulanList.indexOf(b.b); }),
    subt: Object.keys(subt).sort().map(function (k2) { return { k: k2, rm: subt[k2] }; }),
    baris: B.slice().sort(function (a, b) { return a.masa < b.masa ? 1 : -1; }).map(function (x) { var p = PM[x.pelajarId], pj = !p && cariPenaja(x.pelajarId); return { x: x, taja: !!pj, nama: p ? p.nama : pj ? 'Tajaan: ' + pj.nama : x.pelajarId }; }) };
}
function kadKutipanTarikh() {
  var mod = KT.mod, L = senaraiTempoh(mod), kini = kunciTempoh(isoHari(today()), mod);
  var pilih = KT.pilih || kini;
  var jum = {}; (S.D.bayaran || []).forEach(function (x) { var k = kunciTempoh(x.masa, mod); jum[k] = (jum[k] || 0) + x.amaun; });
  var max = Math.max.apply(null, L.map(function (x) { return Math.abs(jum[x.k] || 0); }).concat([1]));
  var r = ringkasTempoh(mod, pilih), idx = L.map(function (x) { return x.k; }).indexOf(pilih);
  var sebelum = idx > 0 ? (jum[L[idx - 1].k] || 0) : null, beza = sebelum == null ? null : r.jumlah - sebelum;
  var nmSeb = { hari: 'semalam', minggu: 'minggu sebelumnya', bulan: 'bulan sebelumnya' }[mod];
  var mula = tarikh(String(S.D.bayaranMula || '').slice(0, 10));

  var h = '<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Kutipan ikut tarikh terima</h3><span class="sub">bila yuran ditanda Dibayar atau tajaan diterima</span>' +
    '<div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">' + ['hari', 'minggu', 'bulan'].map(function (m) {
      return '<button class="btn' + (m === mod ? ' pri' : '') + '" data-act="kt-mod" data-m="' + m + '">' + KT_NAMA[m] + '</button>';
    }).join('') + '<button class="btn" data-act="kt-salin">' + ICON.copy + 'Salin laporan ' + KT_NAMA[mod].toLowerCase() + '</button></div></div><div class="card-b">';
  if (!(S.D.bayaran || []).length) {
    h += '<div class="empty">Belum ada bayaran bertarikh. Mulai ' + (mula ? fmt(mula) : 'sekarang') + ', setiap kali yuran ditanda Dibayar (dalam CRM atau terus dalam Sheet), tarikhnya direkod dalam tab "Rekod Bayaran". Bayaran sebelum itu hanya nampak dalam paparan bulan yuran di bawah.</div></div></div>';
    return h;
  }
  h += '<div class="vbars">' + L.map(function (x) {
    var v = jum[x.k] || 0;
    return '<div class="vb" data-act="kt-pilih" data-k="' + esc(x.k) + '" style="cursor:pointer" title="' + esc(labelTempoh(x.k, mod) + ': ' + rm(v)) + '" tabindex="0">' +
      '<div class="vb-a"><span class="vb-v" style="bottom:calc(' + (Math.max(v, 0) / max * 100) + '% + 3px)">' + (v ? rm(v).replace('RM', '') : '') + '</span><i style="height:' + (Math.max(v, 0) / max * 100) + '%' + (x.k === pilih ? '' : ';opacity:.45') + '"></i></div>' +
      '<span class="vb-l' + (x.k === pilih ? ' cur' : '') + '">' + esc(x.l) + '</span></div>';
  }).join('') + '</div>';

  h += '<div class="grid kpis k4" style="margin-top:12px">' +
    '<div class="card kpi"><div class="l">' + esc(r.label) + '</div><div class="v">' + rm(r.jumlah) + '</div><div class="s">' + r.bil + ' bayaran' + (r.batal ? ' · ' + r.batal + ' dibatalkan' : '') + '</div></div>' +
    '<div class="card kpi"><div class="l">Berbanding ' + nmSeb + '</div><div class="v ' + (beza == null ? '' : beza >= 0 ? 'pos' : 'neg') + '">' + (beza == null ? '–' : (beza >= 0 ? '+' : '') + rm(beza)) + '</div><div class="s">' + (sebelum == null ? '' : rm(sebelum) + ' sebelumnya') + '</div></div>' +
    '<div class="card kpi"><div class="l">Ikut bulan yuran</div><div class="s" style="margin-top:6px;line-height:1.6">' + (r.bulan.length ? r.bulan.map(function (b) { return esc(label(b.b)) + ': <b>' + rm(b.rm) + '</b>'; }).join('<br>') : '–') + '</div></div>' +
    '<div class="card kpi"><div class="l">' + (mod === 'bulan' ? 'Ikut minggu' : mod === 'minggu' ? 'Ikut hari' : 'Tempat') + '</div><div class="s" style="margin-top:6px;line-height:1.6">' +
      (mod === 'hari' ? r.tempat.length + ' tempat terima bayaran' : r.subt.length ? r.subt.map(function (x) { var d = tarikh(x.k); return (mod === 'minggu' ? HARI[d.getDay()].slice(0, 3) + ' ' + d.getDate() + '/' + (d.getMonth() + 1) : 'Mg ' + d.getDate() + '/' + (d.getMonth() + 1)) + ': <b>' + rm(x.rm) + '</b>'; }).join('<br>') : '–') + '</div></div></div>';

  if (r.baris.length) {
    h += '<div class="lap-g" style="margin-top:12px"><div><div class="tw"><table><thead><tr><th>Tempat</th><th class="n">Bayaran</th><th class="n">RM</th></tr></thead><tbody>' +
      r.tempat.map(function (t) { return '<tr class="click" data-profil="' + esc(t.id) + '"><td><span class="nm">' + esc(t.nama) + '</span><div class="m">' + esc(t.id) + '</div></td><td class="n">' + t.n + '</td><td class="n">' + rm(t.rm) + '</td></tr>'; }).join('') +
      '<tr class="tot"><td>Jumlah</td><td class="n">' + (r.bil - r.batal) + '</td><td class="n"><b>' + rm(r.jumlah) + '</b></td></tr></tbody></table></div></div>' +
      '<div><div class="tw" style="max-height:340px;overflow:auto"><table><thead><tr><th>Masa</th><th>Pelajar</th><th>Bulan</th><th class="n">RM</th><th>Oleh</th></tr></thead><tbody>' +
      r.baris.slice(0, 150).map(function (b) {
        var d = tarikh(b.x.masa.slice(0, 10));
        return '<tr' + (b.taja ? '' : ' class="click" data-p="' + esc(b.x.pelajarId) + '"') + '><td>' + fmt(d) + '<div class="m">' + esc(b.x.masa.slice(11, 16)) + '</div></td><td><span class="nm">' + esc(b.taja ? b.nama : cap(b.nama)) + '</span><div class="m">' + esc((TMAP[b.x.tempatId] || {}).nama || b.x.tempatId) + '</div></td>' +
          '<td>' + esc(label(b.x.bulan)) + '</td><td class="n ' + (b.x.amaun < 0 ? 'neg' : '') + '">' + rm(b.x.amaun) + '</td><td><span class="m">' + esc(b.x.oleh) + (b.x.sumber && b.x.sumber !== 'CRM' ? ' · ' + esc(b.x.sumber) : '') + '</span></td></tr>';
      }).join('') + '</tbody></table></div>' + (r.baris.length > 150 ? '<div class="m" style="font-size:12px;margin-top:6px">Papar 150 terkini daripada ' + r.baris.length + '.</div>' : '') + '</div></div>';
  } else h += '<div class="empty" style="margin-top:12px">Tiada bayaran direkod untuk ' + esc(r.label) + '.</div>';
  h += '<div class="m" style="font-size:12px;margin-top:10px">Ini wang yang diterima dalam tempoh itu, termasuk yuran bulan lain (contoh tunggakan Okt yang dibayar pada Nov). Paparan bulan yuran di bawah pula kira ikut bulan yuran. Nilai negatif bermaksud status Dibayar dibatalkan.' +
    (mula ? ' Rekod tarikh bermula ' + fmt(mula) + '.' : '') + '</div></div></div>';
  return h;
}
function teksKutipanTarikh(r) {
  var L = ['*Kutipan HYB (' + KT_NAMA[r.mod].toLowerCase() + '): ' + r.label + '*', 'Jumlah diterima: ' + rm(r.jumlah) + ' (' + r.bil + ' bayaran' + (r.batal ? ', ' + r.batal + ' dibatalkan' : '') + ')'];
  if (r.tempat.length) { L.push(''); L.push('Ikut tempat:'); r.tempat.forEach(function (t) { L.push('- ' + t.nama + ': ' + rm(t.rm) + ' (' + t.n + ')'); }); }
  if (r.bulan.length) { L.push(''); L.push('Ikut bulan yuran: ' + r.bulan.map(function (b) { return label(b.b) + ' ' + rm(b.rm); }).join(', ')); }
  if (r.subt.length) {
    L.push(''); L.push(r.mod === 'minggu' ? 'Ikut hari:' : 'Ikut minggu:');
    r.subt.forEach(function (x) { var d = tarikh(x.k); L.push('- ' + (r.mod === 'minggu' ? HARI[d.getDay()] + ' ' + fmt(d) : 'Minggu ' + fmt(d)) + ': ' + rm(x.rm)); });
  }
  return L.join('\n');
}

function teksLaporan() {
  var c = statBulan(S.bulan), L = [];
  L.push('*Laporan HYB ' + label(S.bulan) + '*');
  L.push('Kutipan: ' + rm(c.kutipan) + ' (' + c.dibayar + '/' + c.perlu + ' pelajar, ' + pct(c.pk) + ')');
  L.push('Kos tetap: ' + rm(c.kos) + ' · Untung sebenar: ' + rm(c.kutipan - c.kos));
  L.push('');
  L.push('Ikut tempat:');
  c.rows.filter(function (r) { return r.jalan || r.kutipan; }).forEach(function (r) {
    L.push('- ' + r.t.nama + ': ' + (r.perlu ? r.dibayar + '/' + r.perlu + ' (' + pct(r.pk) + ')' : 'ditaja') + ', untung ' + rm(r.untung));
  });
  var a = aliranPelajar().slice(-1)[0];
  if (a) { L.push(''); L.push('Pelajar baru ' + a.l + ': ' + a.baru + ' · Berhenti: ' + a.henti); }
  return L.join('\n');
}

function aksiFasa4(a, el) {
  switch (a) {
    case 'lap-isi': borangLaporan(el.getAttribute('data-t') || '', el.getAttribute('data-d') || ''); return true;
    case 'lap-salin': modalTeks('Laporan ' + label(S.bulan), teksLaporan()); return true;
    case 'kt-mod': KT.mod = el.getAttribute('data-m'); KT.pilih = ''; renderLaporan(); return true;
    case 'kt-pilih': KT.pilih = el.getAttribute('data-k'); renderLaporan(); return true;
    case 'kt-salin': var ktr = ringkasTempoh(KT.mod, KT.pilih || kunciTempoh(isoHari(today()), KT.mod)); modalTeks('Kutipan ' + ktr.label, teksKutipanTarikh(ktr)); return true;
    case 'cetak': window.print(); return true;
    case 'rm-salin': modalTeks('Rekod mengajar ' + label(S.bulan), teksRekodMengajar()); return true;
  }
  return false;
}
document.addEventListener('click', function (e) {
  var b = e.target.closest && e.target.closest('[data-kal-mod],[data-kal-gerak],[data-kal-hari]');
  if (!b) return;
  var K = S.kal, now = today();
  if (b.hasAttribute('data-kal-mod')) K.mod = b.getAttribute('data-kal-mod');
  else if (b.hasAttribute('data-kal-hari')) K.pilih = b.getAttribute('data-kal-hari');
  else {
    var g = +b.getAttribute('data-kal-gerak');
    if (!g) { K.y = now.getFullYear(); K.m = now.getMonth(); K.pilih = isoHari(now); }
    else { var d = new Date(K.y, K.m + g, 1); K.y = d.getFullYear(); K.m = d.getMonth(); }
  }
  renderKalendar();
});

/* ================================================================
   PENDAFTARAN ONLINE (borang ibu bapa > tab Pendaftaran > Sahkan)
   ================================================================ */
var DF = { tab: 'Baru' };
function senaraiDaftar() { return (S.D && S.D.daftar) || []; }
function nDaftarBaru() { return senaraiDaftar().filter(function (d) { return d.status === 'Baru'; }).length; }
function normNamaP(s) { return String(s || '').toLowerCase().replace(/\b(bin|binti|bt|b|bte)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim(); }
function cariDaftar(id) { return senaraiDaftar().filter(function (d) { return d.id === id; })[0]; }
function padanPelajar(d) {
  var n = normNamaP(d.nama);
  return S.D.pelajar.filter(function (p) { return p.status !== 'Berhenti' && normNamaP(p.nama) === n; })[0];
}
function hariTunggu(d) { var t = tarikh(d.dihantar); return t ? hariBeza(today(), t) : 0; }
function masaV(v) { return v ? fmtV(String(v).slice(0, 10)) + (String(v).length > 11 ? ' ' + String(v).slice(11, 16) : '') : ''; }
function msgDaftar(g) {
  var nama = g.anak.map(function (d) { return cap(d.nama); }).join(', ');
  return 'Assalamualaikum ' + (g.ibuBapa || 'tuan/puan') + '. Terima kasih kerana mendaftar ' + nama + ' untuk kelas Halaqah Ya Bunayya di ' +
    (g.anak[0].tempatNama || '') + '. Saya ' + (S.D.user.nama || '') + ' dari HYB, ingin sahkan pendaftaran dan maklumkan tarikh mula serta cara bayaran.';
}
var CHIP_DF = { 'Baru': 'c-y', 'Disahkan': 'c-g', 'Ditolak': 'c-k', 'Pendua': 'c-k' };

function renderDaftar() {
  var L = senaraiDaftar().slice().sort(function (a, b) { return a.dihantar < b.dihantar ? 1 : -1; }), tulis = bolehTulis();
  var kira = { Baru: 0, Disahkan: 0, Ditolak: 0, Semua: L.length };
  L.forEach(function (d) { if (d.status === 'Baru') kira.Baru++; else if (d.status === 'Disahkan') kira.Disahkan++; else kira.Ditolak++; });
  var tapis = L.filter(function (d) {
    if (DF.tab === 'Semua') return true;
    if (DF.tab === 'Ditolak') return d.status === 'Ditolak' || d.status === 'Pendua';
    return d.status === DF.tab;
  });

  var h = '<div class="top"><div><div class="eyebrow">' + eyebrow() + '</div><h1>Pendaftaran <em>Baru</em></h1></div><div class="top-r">' +
    '<button class="btn" data-act="df-link">' + ICON.copy + 'Link borang</button>' +
    '<button class="btn" data-act="muat">' + ICON.refresh + 'Muat semula</button></div></div>';
  h += '<div class="tabs" style="margin-bottom:14px">' + ['Baru', 'Disahkan', 'Ditolak', 'Semua'].map(function (t) {
    return '<button data-act="df-tab" data-t="' + t + '"' + (DF.tab === t ? ' class="on"' : '') + '>' + (t === 'Ditolak' ? 'Ditolak / pendua' : t) + '<span class="c">' + kira[t] + '</span></button>';
  }).join('') + '</div>';

  if (!L.length) {
    h += '<div class="card"><div class="card-b"><div class="empty">Belum ada pendaftaran online. Ibu bapa daftar melalui borang awam (butang <b>Link borang</b> di atas), kemudian pendaftaran muncul di sini untuk disemak dan disahkan.</div></div></div>';
    $('#view').innerHTML = h; return;
  }
  if (!tapis.length) {
    h += '<div class="card"><div class="card-b"><div class="empty">' + (DF.tab === 'Baru' ? 'Semua pendaftaran dah diproses.' : 'Tiada rekod.') + '</div></div></div>';
    $('#view').innerHTML = h; return;
  }

  // Kumpul ikut borang (adik-beradik dalam satu hantaran)
  var grup = [], idx = {};
  tapis.forEach(function (d) {
    var k = d.kumpulan || d.id;
    if (!idx[k]) { idx[k] = { k: k, ibuBapa: d.ibuBapa, tel: d.tel, emel: d.emel, kawasan: d.kawasan, sumber: d.sumber, mesej: d.mesej, gambar: d.gambar, dihantar: d.dihantar, pdpa: d.pdpa, anak: [] }; grup.push(idx[k]); }
    idx[k].anak.push(d);
  });

  h += '<div class="grid" style="gap:12px">' + grup.map(function (g) {
    var baru = g.anak.filter(function (d) { return d.status === 'Baru'; }), lama = baru.length ? hariTunggu(baru[0]) : 0;
    var wa = g.tel ? waLink(g.tel, msgDaftar(g)) : '';
    var x = '<div class="card"><div class="card-h" style="flex-wrap:wrap"><h3>' + esc(g.ibuBapa || '(nama ibu bapa disembunyi)') + '</h3>' +
      '<span class="sub">' + esc([g.tel, g.kawasan].filter(String).join(' · ')) + '</span>' +
      (baru.length && lama >= 2 ? chip('Menunggu ' + lama + ' hari', 'c-r') : '') +
      '<span class="r" style="display:flex;gap:6px;align-items:center">' + (wa ? '<a class="btn sm wa" href="' + esc(wa) + '" target="_blank" rel="noopener">' + ICON.wa + 'WhatsApp</a>' : '') + '</span></div>' +
      '<div class="card-b" style="padding-top:0">' +
      '<div class="m" style="font-size:12px;color:var(--mute);margin-bottom:8px">Dihantar ' + esc(masaV(g.dihantar)) + (g.sumber ? ' · Sumber: ' + esc(g.sumber) : '') +
      (g.gambar ? ' · Gambar: ' + esc(g.gambar) : '') + (g.emel ? ' · ' + esc(g.emel) : '') + (g.pdpa ? ' · PDPA: ' + esc(g.pdpa) : '') + '</div>' +
      (g.mesej ? '<div class="alert k" style="margin:0 0 10px">Mesej ibu bapa: ' + esc(g.mesej) + '</div>' : '') +
      '<table><tbody>' + g.anak.map(function (d) {
        var ada = d.status === 'Baru' ? padanPelajar(d) : null, t = TMAP[d.tempatId], u = +d.umur;
        return '<tr><td><span class="nm">' + esc(cap(d.nama)) + '</span>' +
          '<div class="m">' + esc([d.umur !== '' ? d.umur + ' tahun' : '', d.jantina, d.lahir ? 'lahir ' + fmtV(d.lahir) : ''].filter(String).join(' · ')) +
          (u && (u < 7 || u > 12) ? ' ' + chip('luar 7-12', 'c-y') : '') + '</div>' +
          (d.kesihatan ? '<div class="m" style="color:var(--r-tx)">Kesihatan: ' + esc(d.kesihatan) + '</div>' : '') +
          (ada ? '<div class="m" style="color:var(--y-tx);font-weight:600">Nama sama dengan pelajar ' + esc(ada.id) + ' (' + esc(ada.tempatNama || ada.tempatId) + ', ' + esc(ada.status) + '). Mungkin pendua.</div>' : '') + '</td>' +
          '<td><span class="nm">' + esc(d.tempatNama || d.tempatId) + '</span><div class="m">' + esc(d.tempatId + (t && t.hariMasa ? ' · ' + t.hariMasa : '')) + (t ? '' : ' · tempat tiada') + '</div></td>' +
          '<td>' + chip(d.status, CHIP_DF[d.status]) + (d.oleh ? '<div class="m">' + esc(d.oleh) + (d.diproses ? ', ' + esc(masaV(d.diproses)) : '') + '</div>' : '') +
          (d.catatan && d.status !== 'Baru' ? '<div class="m">' + esc(d.catatan) + '</div>' : '') + '</td>' +
          '<td style="white-space:nowrap;text-align:right">' +
          (d.status === 'Baru' && tulis ? '<button class="btn sm pri" data-act="df-sahkan" data-id="' + esc(d.id) + '">Sahkan</button> <button class="btn sm" data-act="df-tolak" data-id="' + esc(d.id) + '">Tolak</button>' : '') +
          (d.status === 'Disahkan' && d.pelajarId ? '<button class="link" data-p="' + esc(d.pelajarId) + '">' + esc(d.pelajarId) + '</button>' : '') +
          '<div class="m">' + esc(d.id) + '</div></td></tr>';
      }).join('') + '</tbody></table></div></div>';
    return x;
  }).join('') + '</div>';
  $('#view').innerHTML = h;
}

function borangSahkanDaftar(d) {
  var ada = padanPelajar(d);
  var opts = S.D.tempat.filter(function (t) { return t.status !== 'Tutup' || t.id === d.tempatId; })
    .map(function (t) { return { v: t.id, l: t.nama + ' (' + t.id + ')' }; });
  bukaBorang({
    tajuk: 'Sahkan pendaftaran', sub: cap(d.nama) + ' · ' + (d.umur !== '' ? d.umur + ' tahun · ' : '') + d.id + (ada ? ' · AMARAN: nama sama dengan ' + ada.id : ''),
    fn: 'sahkanDaftar', butang: 'Sahkan & jadikan pelajar',
    nilai: { tempatId: d.tempatId, status: 'Daftar' },
    fields: [
      { k: 'tempatId', l: 'Tempat kelas', type: 'select', opts: opts, req: 1, kosong: false, full: 1, help: 'Boleh tukar jika ibu bapa setuju kelas lain.' },
      { k: 'status', l: 'Status pelajar', type: 'select', opts: ['Daftar', 'Aktif'], kosong: false, req: 1, full: 1,
        help: 'Daftar = dah sahkan, belum mula kelas / belum bayar. Tukar ke Aktif bila anak dah mula hadir.' },
      { k: 'catatan', l: 'Catatan staf (pilihan)', type: 'textarea', full: 1, rows: 2, ph: 'Contoh: dah WhatsApp ibu, mula 15/11' }
    ],
    pre: function (v) { return { id: d.id, tempatId: v.tempatId, status: v.status, catatan: v.catatan }; },
    lepas: function () { renderDaftar(); }
  });
}
function borangTolakDaftar(d) {
  var ada = padanPelajar(d);
  bukaBorang({
    tajuk: 'Tolak pendaftaran', sub: cap(d.nama) + ' · ' + d.id, fn: 'tolakDaftar', butang: 'Simpan',
    nilai: { status: ada ? 'Pendua' : 'Ditolak' },
    fields: [
      { k: 'status', l: 'Tanda sebagai', type: 'select', opts: ['Ditolak', 'Pendua'], kosong: false, req: 1, full: 1,
        help: 'Pendua = anak ini dah ada dalam senarai pelajar atau borang dihantar dua kali.' },
      { k: 'catatan', l: 'Sebab', type: 'textarea', full: 1, rows: 2, ph: 'Contoh: umur 5 tahun, ibu setuju tunggu tahun depan' }
    ],
    semak: function (v) { return v.status === 'Ditolak' && !v.catatan ? 'Sebab tolak wajib diisi.' : ''; },
    pre: function (v) { return { id: d.id, status: v.status, catatan: v.catatan }; },
    lepas: function () { renderDaftar(); }
  });
}
function modalLinkDaftar() {
  var url = S.D.urlAppDaftar;
  if (!url) {
    $('#overlay').innerHTML = '<div class="scrim" data-close></div><div class="modal"><h3>Link borang pendaftaran</h3>' +
      '<div class="alert y">URL app Pendaftaran belum diisi. Deploy app Pendaftaran HYB, kemudian tampal URL /exec dalam <code>URL_APP_DAFTAR</code> (Code.gs CRM) dan deploy semula.</div>' +
      '<div class="row"><button class="btn" data-close>Tutup</button></div></div>';
    return;
  }
  var tempat = S.D.tempat.filter(function (t) { return ['Kelas berjalan', 'Berisiko', 'Recruitment'].indexOf(t.status) > -1; });
  var teks = 'Link utama (ibu bapa pilih kelas sendiri):\n' + url + '\n\nLink khas setiap kelas (kelas dah dipilih):\n' +
    tempat.map(function (t) { return '- ' + t.nama + ': ' + url + '?t=' + t.id; }).join('\n') +
    '\n\nJejak sumber (contoh untuk iklan Facebook / landing page):\n' + url + '?s=' + encodeURIComponent((S.D.senarai.sumber || ['Facebook'])[0] || 'Facebook') +
    '\nBoleh gabung: ' + url + '?t=' + ((tempat[0] || {}).id || 'HYB-T01') + '&s=Facebook';
  $('#overlay').innerHTML = '<div class="scrim" data-close></div><div class="modal"><h3>Link borang pendaftaran</h3>' +
    '<p style="margin:0 0 8px;color:var(--ink-2)">Kongsi di landing page, WhatsApp group, poster (QR) atau bio media sosial. Nilai <code>?s=</code> mesti sama dengan senarai Sumber pelajar dalam Tetapan supaya laporan sumber tepat.</p>' +
    '<textarea id="mtxt" readonly>' + esc(teks) + '</textarea>' +
    '<div class="row"><button class="btn" data-close>Tutup</button><a class="btn" href="' + esc(url) + '" target="_blank" rel="noopener">Buka borang</a><button class="btn pri" data-act="copy-modal">' + ICON.copy + 'Salin</button></div></div>';
}
function aksiDaftar(a, el) {
  if (!a || a.indexOf('df-') !== 0) return false;
  var id = el.getAttribute('data-id');
  if (a === 'df-tab') { DF.tab = el.getAttribute('data-t'); renderDaftar(); }
  else if (a === 'df-link') modalLinkDaftar();
  else if (a === 'df-sahkan') { var d = cariDaftar(id); if (d) borangSahkanDaftar(d); }
  else if (a === 'df-tolak') { var d2 = cariDaftar(id); if (d2) borangTolakDaftar(d2); }
  return true;
}
function itemDaftarBaru() {
  var b = senaraiDaftar().filter(function (d) { return d.status === 'Baru'; });
  if (!b.length) return [];
  var lama = Math.max.apply(null, b.map(hariTunggu));
  return [{ s: lama >= 2 ? 0 : 1, dot: lama >= 2 ? 'r' : 'y', t: b.length + ' pendaftaran online belum diproses',
    d: (lama ? 'Paling lama ' + lama + ' hari' : 'Masuk hari ini') + ' · semak dan WhatsApp ibu bapa', x: '<button class="link" data-nav="daftar">Semak</button>' }];
}

/* ---------- events ---------- */
var deb;
document.addEventListener('click', function (e) {
  var el = e.target.closest('[data-nav],[data-act],[data-tab],[data-sort],[data-goto-pelajar],[data-close],[data-p],[data-stop],[data-profil],[data-guru-tab]');
  if (!el) return;
  if (el.hasAttribute('data-stop')) return;
  if (el.hasAttribute('data-nav')) { if (el.disabled) return; if (el.getAttribute('data-nav') === '__lagi') { bukaLagi(); return; } S.view = el.getAttribute('data-nav'); if ($('#overlay .mnav-sheet')) $('#overlay').innerHTML = ''; render(); window.scrollTo(0, 0); return; }
  if (el.hasAttribute('data-close')) { $('#overlay').innerHTML = ''; FORM = {}; if (SAHKAN_BATAL) { var b = SAHKAN_BATAL; SAHKAN_BATAL = null; SAHKAN = null; b(); } return; }
  if (el.hasAttribute('data-goto-pelajar')) {
    S.view = 'pelajar';
    S.f = { q: '', tab: 'Aktif', tempat: el.getAttribute('data-goto-pelajar'), yuran: el.getAttribute('data-yuran') || '', sumber: '', umur: '' };
    render(); return;
  }
  if (el.hasAttribute('data-tab')) { S.f.tab = el.getAttribute('data-tab'); renderPelajar(); return; }
  if (el.hasAttribute('data-guru-tab')) { S.guruTab = el.getAttribute('data-guru-tab'); renderGuru(); return; }
  if (el.hasAttribute('data-sort')) {
    var k = el.getAttribute('data-sort');
    S.sort = { k: k, d: S.sort.k === k ? -S.sort.d : 1 }; renderPList(); return;
  }
  if (el.hasAttribute('data-p')) { bukaPelajar(el.getAttribute('data-p')); return; }
  if (el.hasAttribute('data-profil') && !el.hasAttribute('data-act')) { S.tempatAktif = el.getAttribute('data-profil'); S.view = 'profil'; $('#overlay').innerHTML = ''; render(); return; }
  var a = el.getAttribute('data-act');
  if (aksiFasa2(a, el)) return;
  if (aksiKutipan(a, el)) return;
  if (aksiFasa4(a, el)) return;
  if (aksiLinkGuru(a, el)) return;
  if (aksiTajaan(a, el)) return;
  if (aksiDaftarYuran(a, el)) return;
  if (aksiSewa(a, el)) return;
  if (aksiKehadiran(a, el)) return;
  if (aksiPeta(a, el)) return;
  if (aksiDaftar(a, el)) return;
  if (a === 'muat') muat();
  else if (a === 'salin') modalTeks('Ringkasan untuk WhatsApp', teksRingkasan());
  else if (a === 'salin-belum') modalTeks('Senarai belum bayar', teksBelum());
  else if (a === 'copy-modal') salin();
  else if (a === 'csv') exportCsv();
  else if (a === 'reset') { S.f = { q: '', tab: S.f.tab, tempat: '', yuran: '', sumber: '', umur: '' }; renderPelajar(); }
});
document.addEventListener('change', function (e) {
  var el = e.target;
  if (el.closest && el.closest('#frm')) { kemasKiniPapar(); return; }
  if (el.hasAttribute('data-pilih-tempat')) { S.tempatAktif = el.value; render(); return; }
  if (el.hasAttribute('data-status-tempat')) { tukarStatus(el.getAttribute('data-status-tempat'), el.value); return; }
  if (el.hasAttribute('data-bulan')) { S.bulan = el.value; render(true); return; }
  if (el.hasAttribute('data-f')) { S.f[el.getAttribute('data-f')] = el.value; renderPelajar(); }
});
document.addEventListener('input', function (e) {
  if (e.target.id !== 'q') return;
  S.f.q = e.target.value;
  clearTimeout(deb); deb = setTimeout(renderPList, 150);
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') tutupPop();
  if (e.key !== 'Escape' || !$('#overlay').innerHTML) return;
  $('#overlay').innerHTML = ''; FORM = {}; SAHKAN = null;
  if (SAHKAN_BATAL) { var b = SAHKAN_BATAL; SAHKAN_BATAL = null; b(); }
});

/* ================================================================
   KEHADIRAN KELAS (data dari app Laporan Guru: tab Laporan Kelas + Kehadiran)
   ================================================================ */
var KH = { tempat: '', n: 8 };
function hariIniPagi() { var n = today(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }

/* Kelas yang dah lepas (sebelum hari ini) tapi laporan belum diterima.
   Guru diberi sehingga hujung hari kelas; esoknya dikira lewat. */
function laporanLewat() {
  var hi = hariIniPagi(), lap = petaLaporan(), mula = tarikh(MULA_CRM), out = [];
  S.D.tempat.forEach(function (t) {
    var L = [];
    for (var d = new Date(mula); d < hi; d.setDate(d.getDate() + 1)) {
      if (adaKelas(t, d) && !lap[t.id + '|' + isoHari(d)]) L.push(new Date(d));
    }
    if (L.length) out.push({ t: t, tarikh: L, akhir: L[L.length - 1], awal: L[0] });
  });
  return out.sort(function (a, b) { return b.tarikh.length - a.tarikh.length; });
}
function msgGuruLewat(x) {
  var tt = x.tarikh.slice(-3).map(fmt).join(', ') + (x.tarikh.length > 3 ? ' dan ' + (x.tarikh.length - 3) + ' kelas lagi' : '');
  return 'Assalamualaikum ' + (x.t.guru || 'ustaz/ustazah') + '. Laporan kelas HYB ' + x.t.nama + ' untuk ' + tt +
    ' belum kami terima. Mohon isi melalui link laporan guru yang diberi. Terima kasih.';
}
function butangWaGuru(x) {
  var w = waLink(x.t.telGuru, msgGuruLewat(x));
  return w ? '<a class="btn sm wa" href="' + esc(w) + '" target="_blank" rel="noopener" title="WhatsApp guru">' + ICON.wa + '</a>'
    : '<span class="btn sm wa" style="opacity:.45" title="' + (S.D.preview ? 'Nombor disembunyi dalam preview' : 'No. tel guru belum diisi') + '">' + ICON.wa + '</span>';
}
function itemLaporanLewat() {
  var hi = hariIniPagi();
  return laporanLewat().map(function (x) {
    var n = x.tarikh.length, lw = hariBeza(hi, x.awal);
    return { s: 0, dot: 'r', t: 'Laporan kelas belum dihantar' + (n > 1 ? ' (' + n + ' kelas)' : ''),
      d: x.t.nama + ' · ' + (x.t.guru || 'guru belum direkod') + ' · kelas ' + fmt(x.akhir) + (n > 1 ? ', paling lama ' + fmt(x.awal) : ''),
      x: '<span style="white-space:nowrap">' + butangWaGuru(x) + ' <button class="link" data-act="kh-tempat" data-t="' + esc(x.t.id) + '">Lihat</button></span>', lw: lw };
  });
}

function kehadiranTempat(tid) { return (S.D.kehadiran || []).filter(function (k) { return k.tempatId === tid; }); }
function peratusHadir(L) { if (!L.length) return null; return L.filter(function (k) { return k.status === 'Hadir'; }).length / L.length; }
function dalamHari(L, hari) {
  var dari = isoHari(new Date(hariIniPagi().getTime() - hari * 86400000));
  return L.filter(function (k) { return String(k.tarikh).slice(0, 10) >= dari; });
}

function renderKehadiran() {
  var D = S.D, jalan = D.tempat.filter(function (t) { return JALAN.indexOf(t.status) > -1; });
  if (KH.tempat && !TMAP[KH.tempat]) KH.tempat = '';
  var tid = KH.tempat, semua = D.kehadiran || [];
  var KHf = tid ? kehadiranTempat(tid) : semua;
  var lewat = laporanLewat().filter(function (x) { return !tid || x.t.id === tid; });
  var ponteng = senaraiPonteng(tid);
  var lap = (D.laporan || []).filter(function (l) { return !tid || l.tempatId === tid; })
    .sort(function (a, b) { return String(a.tarikh) < String(b.tarikh) ? 1 : -1; });
  var dari7 = isoHari(new Date(hariIniPagi().getTime() - 7 * 86400000));
  var lap7 = lap.filter(function (l) { return String(l.tarikh).slice(0, 10) >= dari7; }).length;
  var p28 = peratusHadir(dalamHari(KHf, 28));

  var h = '<div class="top"><div><div class="eyebrow">' + eyebrow() + '</div><h1>Kehadiran <em>Kelas</em></h1></div><div class="top-r">' +
    '<select class="sel" data-kh-pilih aria-label="Tempat"><option value="">Semua tempat</option>' +
    jalan.map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === tid ? ' selected' : '') + '>' + esc(t.nama) + '</option>'; }).join('') + '</select>' +
    (tid ? '<div class="seg"><button data-act="kh-n" data-n="8"' + (KH.n === 8 ? ' class="on"' : '') + '>8 kelas</button><button data-act="kh-n" data-n="16"' + (KH.n === 16 ? ' class="on"' : '') + '>16 kelas</button></div>' : '') +
    '</div></div>';

  var kpi = function (l, v, s, cls) { return '<div class="card kpi"><div class="l">' + l + '</div><div class="v ' + (cls || '') + '">' + v + '</div><div class="s">' + s + '</div></div>'; };
  var nLewat = lewat.reduce(function (s, x) { return s + x.tarikh.length; }, 0);
  h += '<div class="grid kpis k4">' +
    kpi('Laporan diterima', lap7, '7 hari lepas' + (tid ? '' : ' · semua tempat')) +
    kpi('Purata kehadiran', p28 == null ? '–' : pct(p28), '4 minggu lepas, dari tanda guru', p28 == null ? '' : p28 >= .8 ? 'pos' : p28 < .6 ? 'neg' : '') +
    kpi('Tak hadir 2+ kelas', ponteng.length, 'pelajar berturut-turut', ponteng.length ? 'neg' : '') +
    kpi('Laporan belum diterima', nLewat, nLewat ? 'kelas dah lepas, guru belum hantar' : 'semua kelas dah dilaporkan', nLewat ? 'neg' : 'pos') +
    '</div>';

  if (lewat.length) {
    h += '<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Laporan belum diterima</h3><span class="sub">dikira lewat bermula hari selepas kelas</span></div><div class="card-b"><ul class="todo">' +
      lewat.map(function (x) {
        return '<li><span class="dot r"></span><div><div class="t">' + esc(x.t.nama) + ' · ' + x.tarikh.length + ' kelas</div><div class="d">' + esc((x.t.guru || 'guru belum direkod') + ' · ' +
          x.tarikh.slice(-4).map(fmt).join(', ') + (x.tarikh.length > 4 ? ' …' : '')) + '</div></div><div class="x">' + butangWaGuru(x) + '</div></li>';
      }).join('') + '</ul></div></div>';
  }

  if (!semua.length) {
    h += '<div class="card"><div class="card-b"><div class="empty">Belum ada rekod kehadiran. Rekod masuk automatik setiap kali guru hantar laporan melalui app Laporan Guru (menu Guru &gt; Link laporan).</div></div></div>';
    $('#view').innerHTML = h; return;
  }

  h += tid ? kadMatriksHadir(tid) : kadRingkasanHadir(jalan);
  h += kadPonteng(tid);
  h += kadLaporanTerkini(lap.slice(0, tid ? 10 : 12), !tid);
  $('#view').innerHTML = h;
}

function kadRingkasanHadir(jalan) {
  var lap = petaLaporan(), lw = {};
  laporanLewat().forEach(function (x) { lw[x.t.id] = x.tarikh.length; });
  var pg = {}; senaraiPonteng().forEach(function (x) { pg[x.p.tempatId] = (pg[x.p.tempatId] || 0) + 1; });
  var akhirLap = {};
  (S.D.laporan || []).forEach(function (l) { if (!akhirLap[l.tempatId] || String(l.tarikh) > String(akhirLap[l.tempatId].tarikh)) akhirLap[l.tempatId] = l; });
  return '<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Setiap tempat</h3><span class="sub">klik tempat untuk lihat kehadiran setiap pelajar</span></div><div class="tw"><table><thead><tr>' +
    '<th>Tempat</th><th>Guru</th><th>Laporan terakhir</th><th style="min-width:150px">% hadir 4 minggu</th><th>Trend 6 kelas</th><th class="n">Tak hadir 2+</th><th class="n">Belum lapor</th></tr></thead><tbody>' +
    jalan.map(function (t) {
      var K = kehadiranTempat(t.id), p = peratusHadir(dalamHari(K, 28)), a = akhirLap[t.id];
      var sesi = {}; K.forEach(function (k) { var d = String(k.tarikh).slice(0, 10); sesi[d] = sesi[d] || [0, 0]; sesi[d][1]++; if (k.status === 'Hadir') sesi[d][0]++; });
      var ds = Object.keys(sesi).sort().slice(-6);
      var trend = ds.length ? '<div class="khtr">' + ds.map(function (d) { var r = sesi[d][0] / sesi[d][1]; return '<i style="height:' + Math.max(8, r * 100) + '%" class="' + (r >= .8 ? 'g' : r >= .6 ? 'y' : 'r') + '" title="' + esc(fmtV(d) + ': ' + sesi[d][0] + '/' + sesi[d][1] + ' hadir') + '"></i>'; }).join('') + '</div>' : '<span class="m">–</span>';
      return '<tr class="click" data-act="kh-tempat" data-t="' + esc(t.id) + '"><td><span class="nm">' + esc(t.nama) + '</span><div class="m">' + esc(t.id + ' · ' + (t.hariMasa || 'hari belum diisi')) + '</div></td>' +
        '<td>' + esc(t.guru || '–') + '</td><td>' + (a ? esc(fmtV(a.tarikh)) + '<div class="m">' + esc(num(a.hadir) + ' hadir') + '</div>' : '<span class="m">belum ada</span>') + '</td>' +
        '<td>' + (p != null ? '<div class="cap"><div class="bar"><i class="' + (p >= .8 ? 'g' : p >= .6 ? 'y' : 'r') + '" style="width:' + Math.min(100, p * 100) + '%"></i></div><span>' + pct(p) + '</span></div>' : '<span class="m">tiada rekod</span>') + '</td>' +
        '<td>' + trend + '</td><td class="n' + (pg[t.id] ? ' neg' : '') + '">' + (pg[t.id] || 0) + '</td><td class="n' + (lw[t.id] ? ' neg' : '') + '">' + (lw[t.id] || 0) + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';
}

function kadMatriksHadir(tid) {
  var t = TMAP[tid], K = kehadiranTempat(tid), by = {}, tarikhSet = {};
  K.forEach(function (k) { var d = String(k.tarikh).slice(0, 10); tarikhSet[d] = 1; (by[k.pelajarId] = by[k.pelajarId] || {})[d] = k.status; });
  var ds = Object.keys(tarikhSet).sort().slice(-KH.n);
  var P = S.D.pelajar.filter(function (p) { return p.tempatId === tid && (p.status === 'Aktif' || by[p.id]); })
    .sort(function (a, b) { return (a.status === 'Aktif' ? 0 : 1) - (b.status === 'Aktif' ? 0 : 1) || String(a.nama).localeCompare(String(b.nama)); });
  var lapT = {}; (S.D.laporan || []).forEach(function (l) { if (l.tempatId === tid) lapT[String(l.tarikh).slice(0, 10)] = l; });
  var h = '<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>' + esc(t.nama) + '</h3><span class="sub">' + esc((t.guru || 'guru belum direkod') + ' · ' + (t.hariMasa || '')) + ' · ' + ds.length + ' kelas terakhir</span>' +
    '<button class="btn sm" data-profil="' + esc(tid) + '" style="margin-left:auto">Profil tempat</button></div>';
  if (!ds.length) return h + '<div class="card-b"><div class="empty">Belum ada tanda kehadiran untuk tempat ini.</div></div></div>';
  h += '<div class="tw"><table class="khm"><thead><tr><th class="khst">Pelajar</th>' +
    ds.map(function (d) { var x = tarikh(d); return '<th class="c" title="' + esc(lapT[d] ? 'Topik: ' + (lapT[d].topik || '-') + (lapT[d].guru ? ' · ' + lapT[d].guru : '') : '') + '">' + pad(x.getDate()) + '/' + pad(x.getMonth() + 1) + '<span>' + HARI[x.getDay()].slice(0, 3) + '</span></th>'; }).join('') +
    '<th class="n">Hadir</th><th class="n">Berturut tak hadir</th></tr></thead><tbody>' +
    P.map(function (p) {
      var r = by[p.id] || {}, ada = 0, hd = 0;
      var sel = ds.map(function (d) {
        var s = r[d]; if (s) { ada++; if (s === 'Hadir') hd++; }
        return '<td class="c"><i class="' + (s === 'Hadir' ? 'g' : s ? 'r' : 'k') + '" title="' + esc(fmtV(d) + ': ' + (s || 'belum didaftar / tiada rekod')) + '"></i></td>';
      }).join('');
      var semuaP = Object.keys(r).sort().reverse(), bt = 0; while (bt < semuaP.length && r[semuaP[bt]] !== 'Hadir') bt++;
      var pr = ada ? hd / ada : null;
      return '<tr><td class="khst"><button class="nm-btn" data-p="' + esc(p.id) + '">' + esc(cap(p.nama)) + '</button>' + (p.status !== 'Aktif' ? ' ' + chip(p.status) : '') + '</td>' + sel +
        '<td class="n' + (pr != null && pr < .6 ? ' neg' : '') + '">' + (ada ? hd + '/' + ada : '–') + '</td><td class="n' + (bt >= 2 ? ' neg' : '') + '">' + (bt ? bt + ' kelas' : '–') + '</td></tr>';
    }).join('') +
    '<tr class="tot"><td class="khst">Jumlah hadir</td>' + ds.map(function (d) {
      var n = 0, a = 0; K.forEach(function (k) { if (String(k.tarikh).slice(0, 10) === d) { a++; if (k.status === 'Hadir') n++; } });
      return '<td class="c">' + n + '<span>/' + a + '</span></td>';
    }).join('') + '<td></td><td></td></tr>' +
    '</tbody></table></div><div class="khleg"><span><i class="g"></i>Hadir</span><span><i class="r"></i>Tidak hadir</span><span><i class="k"></i>Tiada rekod</span><span class="m">Hover tarikh untuk lihat topik kelas.</span></div></div>';
  return h;
}

function kadLaporanTerkini(L, tunjukTempat) {
  var aktif = {}; S.D.pelajar.forEach(function (p) { if (p.status === 'Aktif') aktif[p.tempatId] = (aktif[p.tempatId] || 0) + 1; });
  var h = '<div class="card"><div class="card-h"><h3>Laporan terkini dari guru</h3><span class="sub">' + L.length + ' terkini</span></div>';
  if (!L.length) return h + '<div class="card-b"><div class="empty">Belum ada laporan.</div></div></div>';
  return h + '<div class="tw"><table><thead><tr><th>Tarikh</th>' + (tunjukTempat ? '<th>Tempat</th>' : '') + '<th>Guru</th><th class="n">Hadir</th><th>Aktiviti / topik</th><th>Isu perhatian</th></tr></thead><tbody>' +
    L.map(function (l) {
      var ganti = /ganti/i.test(String(l.oleh || '')) || (TMAP[l.tempatId] && TMAP[l.tempatId].guru && l.guru && normNamaC(TMAP[l.tempatId].guru) !== normNamaC(l.guru));
      return '<tr><td style="white-space:nowrap">' + esc(fmtV(l.tarikh)) + '</td>' + (tunjukTempat ? '<td>' + esc((TMAP[l.tempatId] || {}).nama || l.tempatNama || l.tempatId) + '</td>' : '') +
        '<td>' + esc(l.guru || '–') + (ganti ? ' <span class="chip c-y">ganti</span>' : '') + '</td><td class="n">' + esc(num(l.hadir)) + (aktif[l.tempatId] ? '<span class="m">/' + aktif[l.tempatId] + '</span>' : '') + '</td>' +
        '<td>' + esc(l.topik || '–') + '</td><td>' + (l.isu ? '<span class="neg">' + esc(l.isu) + '</span>' : '<span class="m">–</span>') + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';
}
function normNamaC(s) { return String(s || '').toLowerCase().replace(/^(ust(az|azah)?|ustz|cikgu|en|pn)\.?\s+/, '').replace(/\s+/g, ' ').trim(); }

function aksiKehadiran(a, el) {
  if (a === 'kh-tempat') { KH.tempat = el.getAttribute('data-t') || ''; S.view = 'kehadiran'; $('#overlay').innerHTML = ''; render(); return true; }
  if (a === 'kh-n') { KH.n = +el.getAttribute('data-n') || 8; render(true); return true; }
  return false;
}
document.addEventListener('change', function (e) {
  if (e.target.hasAttribute && e.target.hasAttribute('data-kh-pilih')) { KH.tempat = e.target.value; render(true); }
});

/* ================================================================
   FASA 5b: PETA TEMPAT (Leaflet + OpenStreetMap, percuma)
   - Pin tempat sedia ada (tab Lokasi Tempat)
   - Cari kawasan (Nominatim) dan cari masjid/surau dalam kawasan (Overpass)
   - Bulatan liputan sekitar kelas, supaya kawasan kosong nampak
   ================================================================ */
var LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
var LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
var OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
var NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
var PETA = { gm: null, gmMsg: '', map: null, pusat: [2.99, 101.74], zoom: 11, radius: 3, liputan: true, pin: '', hasil: [], calon: [], calonUntuk: '', cariMsg: '', lapis: null };
var PETA_WARNA = {
  'Kelas berjalan': '#3E8E5E', 'Recruitment': '#2F6FC4', 'Cari guru': '#2F6FC4', 'Setuju collab': '#2F6FC4',
  'Dikenal pasti': '#D9A23A', 'Approach': '#D9A23A', 'Berisiko': '#C9503C', 'Tutup': '#9AA3B5'
};
var leafletMuat = null;
function muatLeaflet(cb, gagal) {
  if (window.L && L.map) return cb();
  if (!leafletMuat) {
    leafletMuat = { cb: [], gagal: [] };
    var c = document.createElement('link'); c.rel = 'stylesheet'; c.href = LEAFLET_CSS; document.head.appendChild(c);
    var s = document.createElement('script'); s.src = LEAFLET_JS;
    s.onload = function () { var q = leafletMuat.cb; leafletMuat = null; q.forEach(function (f) { f(); }); };
    s.onerror = function () { var q = leafletMuat.gagal; leafletMuat = null; q.forEach(function (f) { f(); }); };
    document.head.appendChild(s);
  }
  leafletMuat.cb.push(cb); leafletMuat.gagal.push(gagal);
}

/* Panggil server untuk baca sahaja (tiada siap/render). Dalam preview guna SIM_BACA. */
function bacaServer(fn, payload, ok, gagal) {
  if (window.google && google.script && google.script.run) {
    google.script.run.withSuccessHandler(function (s) { ok(JSON.parse(s)); })
      .withFailureHandler(function (e) { (gagal || toast)((e && e.message) || String(e)); })[fn](JSON.stringify(payload));
  } else {
    setTimeout(function () { try { ok(SIM_BACA[fn](payload)); } catch (e) { (gagal || toast)(e.message); } }, 200);
  }
}
var SIM_BACA = {
  cariGoogle: function () { return { ok: true, hasil: [] }; },
  bukaPautanGoogle: function () { throw new Error('Link pendek Google Maps hanya boleh dibaca dalam app sebenar. Dalam preview, tampal URL penuh atau koordinat.'); }
};
/* Baca lokasi dari link Google Maps penuh atau koordinat. Pulangkan {lat,lng,nama} atau {nama} sahaja atau null. */
function bacaLinkGoogle(teks) {
  var t = String(teks || '').trim(); if (!t) return null;
  var m = /^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{2,3}\.\d+)\s*$/.exec(t);
  if (m) return { lat: +m[1], lng: +m[2], nama: '' };
  var u = t; try { u = decodeURIComponent(t.replace(/\+/g, ' ')); } catch (e) {}
  var nama = '', pm = /\/place\/([^\/@?]+)/.exec(u); if (pm) nama = pm[1].trim();
  var pats = [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /[?&](?:q|query|ll|destination|center)=(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/, /@(-?\d+\.\d+),(-?\d+\.\d+)/];
  for (var i = 0; i < pats.length; i++) { var x = pats[i].exec(u); if (x) return { lat: +x[1], lng: +x[2], nama: nama }; }
  if (!nama) { var qm = /[?&](?:q|query)=([^&]+)/.exec(u); if (qm) nama = qm[1].trim(); }
  return nama ? { nama: nama } : null;
}
function lokasiDalamMy(lat, lng) { return lat > 0.5 && lat < 7.6 && lng > 99.5 && lng < 119.5; }

function semakLinkGoogle(teks) {
  teks = String(teks || '').trim(); if (!teks) return;
  PETA.gmMsg = 'Membaca...'; PETA.gm = null; render(true);
  var siapkan = function (r) {
    if (!r || r.lat == null) { PETA.gmMsg = 'Lokasi tak dapat dibaca dari link ini. Dalam Google Maps, tekan lama pada pin untuk dapat koordinat, kemudian tampal di sini.'; render(true); return; }
    if (!lokasiDalamMy(r.lat, r.lng)) { PETA.gmMsg = 'Koordinat di luar Malaysia. Semak semula.'; render(true); return; }
    PETA.gm = { nama: r.nama || '', lat: r.lat, lng: r.lng, kawasan: r.kawasan || '', osm: 'Google link' }; PETA.gmMsg = '';
    if (PETA.map) PETA.map.setView([r.lat, r.lng], Math.max(PETA.map.getZoom(), 15), { animate: false });
    render(true);
  };
  var kenal = function (url) {
    var r = bacaLinkGoogle(url);
    if (r && r.lat != null) return siapkan(r);
    if (r && r.nama) {
      return bacaServer('cariGoogle', { q: r.nama }, function (res) {
        var h = (res.hasil || [])[0];
        siapkan(h ? { nama: r.nama, lat: h.lat, lng: h.lng, kawasan: h.kawasan } : null);
      }, function () { siapkan(null); });
    }
    siapkan(null);
  };
  if (/^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//.test(teks)) {
    bacaServer('bukaPautanGoogle', { url: teks }, function (res) { kenal(res.url); }, function (m) { PETA.gmMsg = m; render(true); });
  } else kenal(teks);
}

function kadGoogle() {
  var tulis = bolehTulis(), g = PETA.gm;
  var h = '<div class="card"><div class="card-h"><h3>Tambah dari Google Maps</h3></div><div class="card-b">' +
    '<form id="pgform" class="pgform"><input class="sel" id="pglink" placeholder="Tampal link Google Maps atau koordinat" aria-label="Link Google Maps"><button class="btn sm" type="submit">Semak</button></form>' +
    '<div class="m" style="margin-top:6px">Dalam Google Maps: buka surau/masjid > Share > Copy link. Atau tekan lama pada peta untuk salin koordinat.</div>';
  if (PETA.gmMsg) h += '<div class="hint" style="margin-top:8px">' + esc(PETA.gmMsg) + '</div>';
  if (g) {
    var d = kelasTerdekat([g.lat, g.lng]);
    h += '<div class="gmres"><label class="fld"><span>Nama</span><input id="pgnama" value="' + esc(g.nama) + '" placeholder="Nama masjid / surau"></label>' +
      '<div class="m">' + g.lat.toFixed(5) + ', ' + g.lng.toFixed(5) + ' · ' + (d ? fmtKm(d.d) + ' dari ' + esc(d.t.nama) : 'belum ada kelas dipin') + ' ' + (d && d.d <= PETA.radius ? chip('Dalam liputan', 'c-y') : chip('Kawasan baru', 'c-g')) + '</div>' +
      (tulis ? '<div class="pbtn"><button class="btn pri sm" data-act="peta-gm-tambah">' + ICON.plus + 'Tambah ke Pipeline</button>' +
        (tempatBelumPin().length ? '<select class="sel sm" data-peta-gm-paut><option value="">Pin ke tempat sedia ada...</option>' + tempatBelumPin().map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.nama) + '</option>'; }).join('') + '</select>' : '') +
        '<button class="link" data-act="peta-gm-buang">Kosongkan</button></div>' : '') + '</div>';
  }
  return h + '</div></div>';
}

function jarakKm(a, b) {
  var R = 6371, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(x));
}
function lokasiT(id) { return (S.D.lokasi || {})[id]; }
function tempatDipin() { return S.D.tempat.filter(function (t) { return lokasiT(t.id); }); }
function tempatBelumPin() { return S.D.tempat.filter(function (t) { return !lokasiT(t.id) && t.status !== 'Tutup'; }); }
function kelasTerdekat(ll) {
  var best = null;
  tempatDipin().forEach(function (t) {
    if (t.status === 'Tutup') return;
    var l = lokasiT(t.id), d = jarakKm(ll, [l.lat, l.lng]);
    if (!best || d < best.d) best = { t: t, d: d };
  });
  return best;
}
function aktifDi(id) { return S.D.pelajar.filter(function (p) { return p.tempatId === id && p.status === 'Aktif'; }).length; }
function normNamaT(s) { return String(s || '').toLowerCase().replace(/\b(masjid|surau|musolla|musalla|madrasah)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
function fmtKm(d) { return d < 1 ? Math.round(d * 1000) + ' m' : d.toFixed(1) + ' km'; }

function renderPeta() {
  kemasHasil();
  var tulis = bolehTulis(), belum = tempatBelumPin(), dipin = tempatDipin();
  var h = '<div class="top"><div><div class="eyebrow">' + eyebrow() + '</div><h1>Peta <em>Tempat</em></h1></div>' +
    '<div class="top-r"><form class="pcari" id="pcari"><input class="sel" id="pq" placeholder="Cari kawasan, contoh: Seksyen 7 Shah Alam" aria-label="Cari kawasan"><button class="btn" type="submit">' + ICON.search + 'Cari</button></form></div></div>';
  h += '<div class="peta-g"><div class="card peta-box">' +
    '<div class="peta-bar"><button class="btn pri sm" data-act="peta-osm">Cari masjid &amp; surau di kawasan ini</button>' +
    '<button class="btn sm" data-act="peta-gmaps">Cari di Google Maps ↗</button>' +
    '<label class="pchk"><input type="checkbox" id="pLiputan"' + (PETA.liputan ? ' checked' : '') + '> Liputan</label>' +
    '<select class="sel sm" id="pRadius" aria-label="Jejari liputan">' + [2, 3, 5].map(function (r) { return '<option value="' + r + '"' + (PETA.radius === r ? ' selected' : '') + '>' + r + ' km</option>'; }).join('') + '</select>' +
    '<span class="m pleg"><i style="background:#3E8E5E"></i>Kelas berjalan <i style="background:#2F6FC4"></i>Recruitment / collab <i style="background:#D9A23A"></i>Prospek <i class="osm"></i>Masjid/surau OSM <i style="background:#E9508A"></i>Dari Google</span></div>' +
    (PETA.pin ? '<div class="peta-pin">Klik pada peta untuk letak lokasi <b>' + esc((TMAP[PETA.pin] || {}).nama || PETA.pin) + '</b>. <button class="link" data-act="peta-pin-batal">Batal</button></div>' : '') +
    '<div id="petaMap" class="peta-map"><div class="empty" style="padding:20px">Memuatkan peta...</div></div></div>';

  // Panel kanan
  h += '<div class="stack">' + kadGoogle();
  if (PETA.hasil.length || PETA.cariMsg) {
    var baru = PETA.hasil.filter(function (x) { return !x.dalamCrm; });
    h += '<div class="card"><div class="card-h"><h3>Masjid &amp; surau ditemui</h3><span class="sub">' + baru.length + ' belum dalam CRM' + (PETA.hasil.length - baru.length ? ' · ' + (PETA.hasil.length - baru.length) + ' dah ada' : '') + '</span><button class="link r" data-act="peta-osm-buang">Kosongkan</button></div><div class="card-b">' +
      (PETA.cariMsg ? '<div class="hint" style="margin:0 0 8px">' + esc(PETA.cariMsg) + '</div>' : '') +
      '<ul class="plist">' + PETA.hasil.slice().sort(function (a, b) { return (a.dalamCrm ? 1 : 0) - (b.dalamCrm ? 1 : 0) || (b.dekat ? b.dekat.d : 99) - (a.dekat ? a.dekat.d : 99); }).slice(0, 60).map(function (x) {
        var jauh = x.dekat ? x.dekat.d : null;
        return '<li class="click" data-act="peta-fokus" data-lat="' + x.lat + '" data-lng="' + x.lng + '"><div style="min-width:0;flex:1"><div class="nm">' + esc(x.nama) + '</div><div class="m">' +
          (x.dalamCrm ? 'Dah dalam CRM: ' + esc(x.dalamCrm.nama) : (jauh != null ? fmtKm(jauh) + ' dari ' + esc(x.dekat.t.nama) : 'Tiada kelas HYB dipin lagi') + (x.kawasan ? ' · ' + esc(x.kawasan) : '')) + '</div></div>' +
          (x.dalamCrm ? chip('Dalam CRM', 'c-k') : (jauh == null || jauh > PETA.radius ? chip('Kawasan baru', 'c-g') : chip('Dalam liputan', 'c-y'))) + '</li>';
      }).join('') + '</ul>' + (PETA.hasil.length > 60 ? '<div class="m">+' + (PETA.hasil.length - 60) + ' lagi. Zoom masuk untuk tapis.</div>' : '') + '</div></div>';
  }
  h += '<div class="card"><div class="card-h"><h3>Belum dipin</h3><span class="sub">' + belum.length + ' tempat</span></div><div class="card-b">' +
    (belum.length ? '<ul class="plist">' + belum.map(function (t) {
      return '<li><div style="min-width:0;flex:1"><div class="nm">' + esc(t.nama) + '</div><div class="m">' + esc(t.id + ' · ' + t.status + (t.kawasan ? ' · ' + t.kawasan : '')) + '</div>' +
        (PETA.calonUntuk === t.id ? kadCalon(t) : '') + '</div>' +
        (tulis ? '<div class="x" style="display:flex;flex-direction:column;gap:4px;align-items:flex-end"><button class="btn sm" data-act="peta-auto" data-id="' + esc(t.id) + '">' + ICON.search + 'Cari</button><button class="btn sm" data-act="peta-pin" data-id="' + esc(t.id) + '">Pin manual</button></div>' : '') + '</li>';
    }).join('') + '</ul>' : '<div class="empty">Semua tempat dah dipin.</div>') + '</div></div>';
  h += '<div class="card"><div class="card-h"><h3>Cara guna</h3></div><div class="card-b petaguna"><ol>' +
    '<li>Pin dulu tempat sedia ada: <b>Cari</b> (cadangan lokasi ikut nama) atau <b>Pin manual</b> (klik pada peta).</li>' +
    '<li>Gerak ke kawasan sasaran, kemudian <b>Cari masjid &amp; surau di kawasan ini</b>.</li>' +
    '<li>Titik ungu di luar bulatan liputan ialah calon kawasan baru. Klik titik, kemudian <b>Tambah ke Pipeline</b>.</li></ol>' +
    '<div class="m">Data peta © penyumbang OpenStreetMap. Tidak semua surau ada dalam OSM, jadi semak di lapangan.</div></div></div>';
  h += '</div></div>';
  $('#view').innerHTML = h;
  bukaPeta();
}

function kadCalon(t) {
  if (!PETA.calon.length) return '<div class="m" style="margin-top:6px">' + esc(PETA.cariMsg2 || 'Mencari...') + '</div>';
  return '<div class="calon">' + PETA.calon.map(function (c, i) {
    return '<button class="calon-b" data-act="peta-calon" data-i="' + i + '"><b>' + esc(c.nama) + '</b><span>' + esc(c.alamat) + '</span></button>';
  }).join('') + '<div class="m">Pilih yang betul, atau guna Pin manual.</div></div>';
}

function bukaPeta() {
  var el = $('#petaMap'); if (!el) return;
  muatLeaflet(function () {
    if (!$('#petaMap') || S.view !== 'peta') return;
    if (PETA.map) { try { PETA.map.stop(); PETA.map.off(); PETA.map.remove(); } catch (e) {} PETA.map = null; }
    el.innerHTML = '';
    var m = L.map(el, { zoomControl: true, fadeAnimation: false }).setView(PETA.pusat, PETA.zoom);
    PETA.map = m;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(m);
    m.on('moveend', function () { var c = m.getCenter(); PETA.pusat = [c.lat, c.lng]; PETA.zoom = m.getZoom(); });
    // Leaflet halang klik dalam popup daripada sampai ke document, jadi tangkap di sini.
    m.on('popupopen', function (e) {
      var pe = e.popup.getElement(); if (!pe || pe._hyb) return; pe._hyb = 1;
      pe.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-act],[data-profil]'); if (!b) return;
        if (b.hasAttribute('data-profil')) { S.tempatAktif = b.getAttribute('data-profil'); S.view = 'profil'; render(); return; }
        aksiPeta(b.getAttribute('data-act'), b);
      });
    });
    m.on('click', function (e) {
      if (!PETA.pin) return;
      var id = PETA.pin; PETA.pin = '';
      simpanPin(id, e.latlng.lat, e.latlng.lng, 'Manual');
    });
    lukisPeta();
    if (PETA.pin) el.classList.add('pinmode');
    setTimeout(function () { if (PETA.map === m) m.invalidateSize({ animate: false }); }, 50);
    // Kali pertama: muatkan semua pin dalam paparan
    if (!PETA.dahFit) {
      var pts = tempatDipin().map(function (t) { var l = lokasiT(t.id); return [l.lat, l.lng]; });
      if (pts.length) m.fitBounds(pts, { padding: [40, 40], maxZoom: 13, animate: false });
      PETA.dahFit = true;
    }
  }, function () {
    el.innerHTML = '<div class="empty" style="padding:20px">Peta tak dapat dimuatkan (tiada sambungan ke cdnjs.cloudflare.com). Semak internet dan cuba Muat semula.</div>';
  });
}

function lukisPeta() {
  var m = PETA.map; if (!m) return;
  if (PETA.lapis) m.removeLayer(PETA.lapis);
  var g = L.layerGroup().addTo(m); PETA.lapis = g;
  var tulis = bolehTulis();
  tempatDipin().forEach(function (t) {
    var l = lokasiT(t.id), w = PETA_WARNA[t.status] || '#68738F';
    if (PETA.liputan && JALAN.concat(['Recruitment']).indexOf(t.status) > -1)
      L.circle([l.lat, l.lng], { radius: PETA.radius * 1000, color: w, weight: 1, opacity: .5, fillColor: w, fillOpacity: .08, interactive: false }).addTo(g);
  });
  PETA.hasil.forEach(function (x) {
    var mk = L.circleMarker([x.lat, x.lng], { radius: 6, color: '#fff', weight: 1.5, fillColor: x.dalamCrm ? '#9AA3B5' : '#7B5CC4', fillOpacity: .95 }).addTo(g);
    mk.bindPopup(function () {
      var d = x.dekat;
      return '<div class="ppop"><b>' + esc(x.nama) + '</b><div class="m">' + esc(x.kawasan || '') + '</div>' +
        (x.dalamCrm ? '<div class="m">Dah dalam CRM: ' + esc(x.dalamCrm.nama) + '</div>' :
          '<div class="m">' + (d ? fmtKm(d.d) + ' dari kelas terdekat (' + esc(d.t.nama) + ')' : 'Belum ada kelas dipin') + '</div>' +
          (tulis ? '<div class="pbtn"><button class="btn pri sm" data-act="peta-tambah" data-osm="' + esc(x.osm) + '">' + ICON.plus + 'Tambah ke Pipeline</button>' +
            (tempatBelumPin().length ? '<select class="sel sm" data-peta-paut="' + esc(x.osm) + '"><option value="">Pautkan ke tempat sedia ada...</option>' + tempatBelumPin().map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.nama) + '</option>'; }).join('') + '</select>' : '') + '</div>' : '')) + '</div>';
    });
  });
  if (PETA.gm) L.circleMarker([PETA.gm.lat, PETA.gm.lng], { radius: 10, color: '#fff', weight: 2.5, fillColor: '#E9508A', fillOpacity: 1 }).addTo(g).bindTooltip(PETA.gm.nama || 'Lokasi dari Google Maps', { permanent: true, direction: 'top', offset: [0, -10] });
  tempatDipin().forEach(function (t) {
    var l = lokasiT(t.id), w = PETA_WARNA[t.status] || '#68738F';
    var mk = L.circleMarker([l.lat, l.lng], { radius: 9, color: '#fff', weight: 2.5, fillColor: w, fillOpacity: 1 }).addTo(g);
    mk.bindTooltip(t.nama, { direction: 'top', offset: [0, -8] });
    mk.bindPopup(function () {
      return '<div class="ppop"><b>' + esc(t.nama) + '</b><div class="m">' + esc(t.id + ' · ' + t.status) + '</div><div class="m">' + aktifDi(t.id) + ' pelajar aktif' + (t.guru ? ' · ' + esc(t.guru) : '') + '</div>' +
        '<div class="pbtn"><button class="btn sm" data-profil="' + esc(t.id) + '">Profil</button>' +
        (tulis ? '<button class="btn sm" data-act="peta-pin" data-id="' + esc(t.id) + '">Alih pin</button><button class="btn sm" data-act="peta-buang" data-id="' + esc(t.id) + '">Buang pin</button>' : '') + '</div></div>';
    });
  });
}

function simpanPin(id, lat, lng, sumber) {
  hantar('simpanLokasi', { id: id, lat: lat, lng: lng, sumber: sumber }, function (res) { toast(res.mesej || 'Lokasi disimpan'); }, function (m) { toast(m); render(true); });
}

/* Carian kawasan (Nominatim) */
function cariKawasan(q) {
  if (!q) return;
  bacaServer('cariGoogle', { q: q }, function (res) {
    var h = (res.hasil || [])[0];
    if (h && PETA.map) { if (h.bbox) PETA.map.fitBounds([[h.bbox[0], h.bbox[1]], [h.bbox[2], h.bbox[3]]], { maxZoom: 15, animate: false }); else PETA.map.setView([h.lat, h.lng], 14, { animate: false }); }
    else cariKawasanOsm(q);
  }, function () { cariKawasanOsm(q); });
}
function cariKawasanOsm(q) {
  fetch(NOMINATIM_URL + '?format=json&countrycodes=my&limit=1&q=' + encodeURIComponent(q), { headers: { 'Accept-Language': 'ms,en' } })
    .then(function (r) { return r.json(); })
    .then(function (a) {
      if (!a.length) return toast('Kawasan tak dijumpai. Cuba nama lain.');
      var b = a[0].boundingbox;
      if (PETA.map) PETA.map.fitBounds([[+b[0], +b[2]], [+b[1], +b[3]]], { maxZoom: 15, animate: false });
    })
    .catch(function () { toast('Carian kawasan gagal. Semak internet.'); });
}

/* Cadangan lokasi untuk tempat sedia ada (ikut nama + kawasan) */
function cariAuto(id) {
  var t = TMAP[id]; if (!t) return;
  PETA.calonUntuk = id; PETA.calon = []; PETA.cariMsg2 = 'Mencari "' + t.nama + '"...'; render(true);
  var q = t.nama + (t.kawasan && t.nama.toLowerCase().indexOf(String(t.kawasan).toLowerCase()) < 0 ? ', ' + t.kawasan : '');
  var tunjuk = function () {
    render(true);
    if (PETA.calon.length && PETA.map) PETA.map.fitBounds(PETA.calon.map(function (c) { return [c.lat, c.lng]; }), { padding: [40, 40], maxZoom: 15, animate: false });
  };
  bacaServer('cariGoogle', { q: q }, function (res) {
    if ((res.hasil || []).length) { PETA.calon = res.hasil.map(function (x) { return { nama: x.nama, alamat: x.alamat + ' (Google)', lat: x.lat, lng: x.lng, osm: x.osm }; }); return tunjuk(); }
    cariAutoOsm(q);
  }, function () { cariAutoOsm(q); });
}
function cariAutoOsm(q) {
  fetch(NOMINATIM_URL + '?format=json&countrycodes=my&limit=5&q=' + encodeURIComponent(q))
    .then(function (r) { return r.json(); })
    .then(function (a) {
      PETA.calon = a.map(function (x) { return { nama: String(x.display_name).split(',')[0], alamat: String(x.display_name).split(',').slice(1, 4).join(',').trim(), lat: +x.lat, lng: +x.lon, osm: x.osm_type + '/' + x.osm_id }; });
      if (!PETA.calon.length) PETA.cariMsg2 = 'Tiada padanan dalam OpenStreetMap. Guna Pin manual.';
      render(true);
      if (PETA.calon.length && PETA.map) PETA.map.fitBounds(PETA.calon.map(function (c) { return [c.lat, c.lng]; }), { padding: [40, 40], maxZoom: 15, animate: false });
    })
    .catch(function () { PETA.cariMsg2 = 'Carian gagal. Guna Pin manual.'; render(true); });
}

/* Masjid & surau dalam paparan peta (Overpass API) */
function cariOsm() {
  var m = PETA.map; if (!m) return;
  if (m.getZoom() < 11) return toast('Zoom masuk dulu (sekurang-kurangnya satu daerah) sebelum cari.');
  var b = m.getBounds(), bb = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map(function (v) { return v.toFixed(5); }).join(',');
  var q = '[out:json][timeout:25];(node["amenity"="place_of_worship"]["religion"="muslim"](' + bb + ');way["amenity"="place_of_worship"]["religion"="muslim"](' + bb + '););out center 300;';
  PETA.cariMsg = 'Mencari masjid & surau dalam paparan...'; render(true);
  fetch(OVERPASS_URL, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (j) { prosesOsm(j.elements || []); })
    .catch(function () { PETA.cariMsg = 'Carian gagal (pelayan OpenStreetMap sibuk atau tiada internet). Cuba lagi sebentar.'; render(true); });
}
function prosesOsm(els) {
  var lama = {}; PETA.hasil.forEach(function (x) { lama[x.osm] = 1; });
  var pin = tempatDipin();
  els.forEach(function (e) {
    var lat = e.lat || (e.center && e.center.lat), lng = e.lon || (e.center && e.center.lon), tg = e.tags || {};
    if (!lat || !lng) return;
    var osm = e.type + '/' + e.id; if (lama[osm]) return;
    var nama = tg.name || tg['name:ms'] || tg['name:en'] || 'Masjid / surau (tiada nama dalam OSM)';
    var dalam = null;
    pin.forEach(function (t) {
      var l = lokasiT(t.id);
      if (l.sumber === 'OSM ' + osm || jarakKm([lat, lng], [l.lat, l.lng]) < 0.12 || (normNamaT(t.nama) && normNamaT(t.nama) === normNamaT(nama))) dalam = t;
    });
    PETA.hasil.push({ osm: osm, nama: nama, lat: lat, lng: lng, kawasan: tg['addr:suburb'] || tg['addr:city'] || tg['addr:district'] || '', dalamCrm: dalam, dekat: kelasTerdekat([lat, lng]) });
  });
  var baru = PETA.hasil.filter(function (x) { return !x.dalamCrm; }).length;
  PETA.cariMsg = els.length ? '' : 'Tiada masjid/surau direkod OSM dalam paparan ini. Cuba kawasan lain atau zoom keluar sedikit.';
  render(true);
  toast(els.length ? els.length + ' ditemui, ' + baru + ' belum dalam CRM' : 'Tiada hasil');
}
function kemasHasil() {
  var pin = tempatDipin();
  PETA.hasil.forEach(function (x) {
    x.dalamCrm = null;
    pin.forEach(function (t) {
      var l = lokasiT(t.id);
      if (l.sumber === 'OSM ' + x.osm || jarakKm([x.lat, x.lng], [l.lat, l.lng]) < 0.12 || (normNamaT(t.nama) && normNamaT(t.nama) === normNamaT(x.nama))) x.dalamCrm = t;
    });
    x.dekat = kelasTerdekat([x.lat, x.lng]);
  });
}

function aksiPeta(a, el) {
  switch (a) {
    case 'peta-osm': cariOsm(); return true;
    case 'peta-osm-buang': PETA.hasil = []; PETA.cariMsg = ''; render(true); return true;
    case 'peta-pin': PETA.pin = el.getAttribute('data-id'); PETA.calonUntuk = ''; if (PETA.map) PETA.map.closePopup(); render(true); return true;
    case 'peta-pin-batal': PETA.pin = ''; render(true); return true;
    case 'peta-auto': cariAuto(el.getAttribute('data-id')); return true;
    case 'peta-calon': var c = PETA.calon[+el.getAttribute('data-i')], id = PETA.calonUntuk; PETA.calon = []; PETA.calonUntuk = ''; if (c) simpanPin(id, c.lat, c.lng, /^Google/.test(c.osm) ? c.osm : 'OSM ' + c.osm); return true;
    case 'peta-gmaps': var cc = PETA.map ? PETA.map.getCenter() : { lat: PETA.pusat[0], lng: PETA.pusat[1] }; window.open('https://www.google.com/maps/search/masjid+surau/@' + cc.lat.toFixed(5) + ',' + cc.lng.toFixed(5) + ',' + Math.max(13, PETA.zoom) + 'z', '_blank', 'noopener'); return true;
    case 'peta-gm-buang': PETA.gm = null; PETA.gmMsg = ''; render(true); return true;
    case 'peta-gm-tambah': if (!PETA.gm) return true; var gn = ($('#pgnama') || {}).value || PETA.gm.nama; borangTempat(null, { nama: gn, kawasan: PETA.gm.kawasan, catatan: 'Lokasi dari Google Maps.', lokasi: { lat: PETA.gm.lat, lng: PETA.gm.lng, sumber: 'Google link' } }); return true;
    case 'peta-buang':
      var t = TMAP[el.getAttribute('data-id')];
      sahkan('Buang pin?', 'Buang pin ' + (t ? t.nama : '') + ' dari peta? Tempat itu sendiri tidak dipadam.', function () { hantar('buangLokasi', { id: t.id }, function (r) { toast(r.mesej); }); });
      return true;
    case 'peta-fokus': if (PETA.map) { PETA.map.setView([+el.getAttribute('data-lat'), +el.getAttribute('data-lng')], Math.max(PETA.map.getZoom(), 15), { animate: false }); } return true;
    case 'peta-tambah':
      var x = PETA.hasil.filter(function (h) { return h.osm === el.getAttribute('data-osm'); })[0]; if (!x) return true;
      borangTempat(null, { nama: /tiada nama/.test(x.nama) ? '' : x.nama, kawasan: x.kawasan, catatan: 'Ditemui melalui peta (OpenStreetMap ' + x.osm + ').', lokasi: { lat: x.lat, lng: x.lng, sumber: 'OSM ' + x.osm } });
      return true;
  }
  return false;
}
document.addEventListener('submit', function (e) {
  if (e.target.id === 'pcari') { e.preventDefault(); cariKawasan(($('#pq').value || '').trim()); }
  else if (e.target.id === 'pgform') { e.preventDefault(); semakLinkGoogle(($('#pglink').value || '').trim()); }
});
document.addEventListener('change', function (e) {
  var el = e.target;
  if (el.id === 'pLiputan') { PETA.liputan = el.checked; lukisPeta(); }
  else if (el.id === 'pRadius') { PETA.radius = +el.value; render(true); }
  else if (el.hasAttribute && el.hasAttribute('data-peta-gm-paut') && el.value && PETA.gm) {
    var tg = TMAP[el.value], gm = PETA.gm;
    if (tg) sahkan('Pin lokasi?', 'Pin ' + tg.nama + ' pada lokasi dari Google Maps?', function () { PETA.gm = null; simpanPin(tg.id, gm.lat, gm.lng, 'Google link'); });
  }
  else if (el.hasAttribute && el.hasAttribute('data-peta-paut') && el.value) {
    var x = PETA.hasil.filter(function (h) { return h.osm === el.getAttribute('data-peta-paut'); })[0], t = TMAP[el.value];
    if (x && t) sahkan('Pautkan lokasi?', 'Pin ' + t.nama + ' pada lokasi "' + x.nama + '"?', function () { simpanPin(t.id, x.lat, x.lng, 'OSM ' + x.osm); });
  }
});

// Hanya untuk preview / simulasi (tiada kesan dalam Apps Script sebenar)
if (window.PREVIEW_DATA) window.HYB_PREVIEW_HOOK = {
  data: function () { return S.D; },
  segar: function () { siap(S.D, true); },
  pergi: function (v, t, p) { if (t) { S.tempatAktif = t; KH.tempat = t; } S.view = v; $('#overlay').innerHTML = ''; render(); if (p) bukaPelajar(p); },
  toast: function (m) { toast(m); }
};
muat();
})();
