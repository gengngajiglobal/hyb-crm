/*
 * Sambungan CRM HYB ke Supabase.
 * App asal (app.js) memanggil google.script.run.<fungsi>(). Fail ini menyediakan objek yang sama,
 * tetapi menghantar panggilan ke Supabase. Dengan cara ini paparan CRM tak perlu ditulis semula.
 *
 *  - Login: Supabase Auth dengan Google. Peranan disemak di database (akses_crm), bukan di sini.
 *  - getData       -> rpc crm_data
 *  - fungsi tulis  -> rpc dengan nama snake_case yang sama (disambung modul demi modul, Fasa 2)
 */
(function () {
  'use strict';
  var C = window.HYB_CONFIG || {};
  var sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
  });
  window.HYB_SB = sb;

  // Fungsi tulis yang dah disambung ke Supabase. Nama app -> nama RPC. (Fasa 2 akan isi senarai ini.)
  var TULIS = {
    // Fasa 2a: Kutipan yuran
    kemaskiniYuran: 'kemaskini_yuran',
    tukarTarikhBayar: 'tukar_tarikh_bayar',
    terimaTajaan: 'terima_tajaan',
    batalTajaan: 'batal_tajaan',
    bayarPendaftaran: 'bayar_pendaftaran',
    batalPendaftaran: 'batal_pendaftaran',
    // Fasa 2b: Pelajar, Tempat/Pipeline, Laporan kelas, Log
    simpanTempat: 'simpan_tempat',
    tukarStatusTempat: 'tukar_status_tempat',
    simpanPelajar: 'simpan_pelajar',
    simpanLaporan: 'simpan_laporan',
    tambahLog: 'tambah_log',
    // Fasa 2c: Guru, Penaja, Bayaran Masjid (link laporan guru tunggu Fasa 3)
    simpanGuru: 'simpan_guru',
    tukarStatusGuru: 'tukar_status_guru',
    simpanPenaja: 'simpan_penaja',
    simpanSewaTetapan: 'simpan_sewa_tetapan',
    rekodSewa: 'rekod_sewa',
    // Fasa 2d: Pendaftaran, Lokasi peta (carian Google menyusul)
    sahkanDaftar: 'sahkan_daftar',
    tolakDaftar: 'tolak_daftar',
    simpanLokasi: 'simpan_lokasi',
    buangLokasi: 'buang_lokasi',
    // Fasa 3: link laporan guru (app guru.html)
    janaLinkGuru: 'jana_link_guru',
    batalLinkGuru: 'batal_link_guru'
  };
  // Fungsi yang ambil argumen berasingan (bukan satu JSON)
  var ARG = {
    tukarStatusTempat: ['id', 'status', 'statusLama'],
    tukarStatusGuru: ['id', 'status', 'statusLama'],
    janaLinkGuru: ['id'],
    batalLinkGuru: ['id']
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function paparLogin(mesej) {
    var v = document.getElementById('view');
    v.innerHTML = '<div class="login-kad"><img src="logo.webp" alt="Halaqah Ya Bunayya">' +
      '<h2>CRM HYB</h2><p>Log masuk dengan akaun Google yang didaftarkan oleh manager.</p>' +
      '<button class="btn-google" id="btnGoogle" type="button">' +
      '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>' +
      'Log masuk dengan Google</button>' +
      (mesej ? '<div class="salah">' + esc(mesej) + '</div>' : '') +
      '<div class="kecil">Data pelajar dilindungi. Akses direkod.</div></div>';
    document.getElementById('btnGoogle').onclick = function () {
      sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } } });
    };
  }

  function barBeta(d) {
    var bar = document.getElementById('betaBar');
    var teks = C.mod === 'BETA' ? 'BETA · data salinan dari Sheet' + (d && d.importTerakhir ? ' (import ' + esc(d.importTerakhir.replace('T', ' ')) + ')' : '') + ' · ujian: perubahan boleh disimpan tapi diganti semula bila import dijalankan. Carian Google di peta belum ada' : '';
    bar.innerHTML = (teks ? '<span>' + teks + '</span>' : '') + '<span>' + esc(d && d.user ? d.user.emel : '') + '</span><button type="button" id="btnKeluar">Log keluar</button>';
    bar.hidden = false;
    document.getElementById('btnKeluar').onclick = function () { sb.auth.signOut().then(function () { location.reload(); }); };
  }

  function mesejRalat(e) {
    var m = (e && (e.message || e.error_description)) || String(e);
    if (/Failed to fetch|NetworkError/i.test(m)) m = 'Tiada sambungan internet atau server tidak dapat dihubungi. Cuba lagi.';
    if (/JWT expired|invalid JWT/i.test(m)) m = 'Sesi login tamat. Muat semula halaman dan log masuk semula.';
    return new Error(m);
  }

  // Carian Google peta: melalui web app Apps Script (servis Maps percuma), token login disemak di sana.
  function petaGoogle(nama, args, token) {
    if (!C.petaGoogleUrl) return Promise.reject(new Error('Carian Google belum disediakan. Pin lokasi terus di peta buat masa ini.'));
    var a = JSON.parse(args[0] || '{}');
    var badan = { token: token, jenis: nama === 'cariGoogle' ? 'cari' : 'pautan', q: a.q, url: a.url };
    return fetch(C.petaGoogleUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(badan) })
      .then(function (res) { if (!res.ok) throw new Error('Carian Google gagal (' + res.status + ').'); return res.json(); })
      .then(function (o) { if (!o.ok) throw new Error(o.ralat || 'Carian Google gagal.'); return JSON.stringify(o); });
  }

  function panggil(nama, args) {
    return sb.auth.getSession().then(function (r) {
      if (!r.data.session) { paparLogin(); return new Promise(function () {}); } // tunggu login
      if (nama === 'getData') {
        return sb.rpc('crm_data').then(function (res) {
          if (res.error) {
            if (res.error.code === '42501') { paparLogin(res.error.message + ' (' + r.data.session.user.email + ')'); return new Promise(function () {}); }
            throw mesejRalat(res.error);
          }
          barBeta(res.data);
          return JSON.stringify(res.data);
        });
      }
      var rpc = TULIS[nama];
      if (nama === 'cariGoogle' || nama === 'bukaPautanGoogle') return petaGoogle(nama, args, r.data.session.access_token);
      if (!rpc) throw new Error('Fungsi ini belum ada dalam versi baru. Maklumkan kepada Manager.');
      var p;
      if (ARG[nama]) { p = {}; ARG[nama].forEach(function (k, i) { p[k] = args[i]; }); }
      else p = JSON.parse(args[0] || '{}');
      return sb.rpc(rpc, { p: p }).then(function (res) {
        if (res.error) throw mesejRalat(res.error);
        return sb.rpc('crm_data').then(function (d) {
          if (d.error) throw mesejRalat(d.error);
          var o = res.data || {}; o.data = d.data; return JSON.stringify(o);
        });
      });
    });
  }

  // Tiru API google.script.run: run.withSuccessHandler(f).withFailureHandler(g).namaFungsi(args)
  function runner(ok, gagal) {
    return new Proxy({}, {
      get: function (_, nama) {
        if (nama === 'withSuccessHandler') return function (f) { return runner(f, gagal); };
        if (nama === 'withFailureHandler') return function (f) { return runner(ok, f); };
        if (nama === 'withUserObject') return function () { return runner(ok, gagal); };
        return function () {
          var args = Array.prototype.slice.call(arguments);
          panggil(String(nama), args).then(function (r) { if (ok) ok(r); }, function (e) { if (gagal) gagal(e); else console.error(e); });
        };
      }
    });
  }
  window.google = window.google || {};
  window.google.script = { get run() { return runner(); } };

  sb.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_OUT') paparLogin(); });
})();
