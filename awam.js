/* Sambungan laman awam (App Laporan Guru, Borang Pendaftaran) ke Supabase.
   Hanya publishable key. Setiap function semak kod guru / had kekerapan dalam database. */
(function () {
  'use strict';
  var C = window.HYB_CONFIG || {};
  var sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  var PETA = {
    muatGuru: function (a) { return ['guru_muat', { k: a[0] }]; },
    muatPelajar: function (a) { return ['guru_pelajar', { k: a[0], tempat: a[1] }]; },
    hantarLaporan: function (a) { return ['guru_hantar', { k: a[0], p: JSON.parse(a[1]) }]; },
    muatBorang: function () { return ['daftar_borang', {}]; },
    hantarPendaftaran: function (a) { return ['daftar_hantar', { p: JSON.parse(a[0]) }]; }
  };
  window.HYB_RPC = function (fn, args, ok, gagal) {
    var m = PETA[fn];
    if (!m) { gagal('Fungsi tidak dikenali.'); return; }
    m = m(args);
    sb.rpc(m[0], m[1]).then(function (r) {
      if (r.error) gagal(r.error.message || 'Ralat sistem. Cuba lagi.');
      else if (r.data && r.data.ralat) gagal(r.data.ralat);
      else ok(r.data);
    }, function () { gagal('Tiada sambungan internet. Cuba lagi.'); });
  };
})();
