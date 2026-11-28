-- CUTOVER 28/11/2026: Supabase jadi sumber data utama.
-- Import dari Sheet ditutup supaya data sebenar tidak boleh ditimpa lagi.
create or replace function import_penuh(d jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  raise exception 'Import ditutup: Supabase kini sumber data utama CRM HYB (cutover 28/11/2026). Guna backupMalam untuk salinan ke Sheet.';
end $$;
revoke all on function import_penuh(jsonb) from public, anon, authenticated;

-- Pendaftaran yang dibawa oleh import terakhir sudah diemel oleh borang lama.
update pendaftaran set dimaklum = now() where dimaklum is null;
