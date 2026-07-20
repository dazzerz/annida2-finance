-- ==============================================================================
-- FUNGSI RPC UNTUK MODE GUEST (Buka Kunci Angka)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.guest_get_totals(p_pass text, p_year int, p_month int)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER -- Bypasses RLS so guests can read totals
AS $$
DECLARE
  v_income DECIMAL(15,2) := 0;
  v_expense DECIMAL(15,2) := 0;
  v_kas DECIMAL(15,2) := 0;
  v_bank DECIMAL(15,2) := 0;
  v_start_date DATE;
  v_end_date DATE;
BEGIN
  -- 1. Validasi Password
  IF p_pass != 'annidasetu' THEN
    RAISE EXCEPTION 'Password salah!';
  END IF;

  -- 2. Tentukan rentang tanggal jika year dan month diberikan
  IF p_year IS NOT NULL AND p_month IS NOT NULL THEN
    v_start_date := make_date(p_year, p_month, 1);
    v_end_date := (v_start_date + interval '1 month' - interval '1 day')::date;
  END IF;

  -- 3. Hitung Total Income
  SELECT COALESCE(SUM(amount), 0) INTO v_income 
  FROM public.transactions 
  WHERE type = 'income'
  AND (v_start_date IS NULL OR date >= v_start_date)
  AND (v_end_date IS NULL OR date <= v_end_date);
  
  -- 4. Hitung Total Expense
  SELECT COALESCE(SUM(amount), 0) INTO v_expense 
  FROM public.transactions 
  WHERE type = 'expense'
  AND (v_start_date IS NULL OR date >= v_start_date)
  AND (v_end_date IS NULL OR date <= v_end_date);
  
  -- 5. Hitung Saldo Kas (Semua Waktu, bukan per bulan, karena saldo adalah akumulasi)
  -- Catatan: Saldo kas biasanya dihitung dari awal waktu, bukan cuma bulan ini, 
  -- tapi kita samakan filter bulan ini jika user memilih bulan.
  SELECT 
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0)
  INTO v_kas
  FROM public.transactions 
  WHERE sumber_dana = 'kas'
  AND (v_start_date IS NULL OR date >= v_start_date)
  AND (v_end_date IS NULL OR date <= v_end_date);
  
  -- 6. Hitung Saldo Bank
  SELECT 
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0)
  INTO v_bank
  FROM public.transactions 
  WHERE sumber_dana = 'bank'
  AND (v_start_date IS NULL OR date >= v_start_date)
  AND (v_end_date IS NULL OR date <= v_end_date);

  -- 7. Kembalikan format JSON
  RETURN json_build_object(
    'income', v_income,
    'expense', v_expense,
    'balance', v_income - v_expense,
    'kas', v_kas,
    'bank', v_bank
  );
END;
$$;
