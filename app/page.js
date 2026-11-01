'use client';

import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export default function ScannerPage() {
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [recentScans, setRecentScans] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const qrScannerRef = useRef(null);
  const isCooldownRef = useRef(false);

  // Audio Beep Feedback
  const playSound = (type) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'success') {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
      } else if (type === 'warning') {
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(330, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      } else {
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);
      }
    } catch (e) {}
  };

  const startScanner = async () => {
    try {
      setIsScanning(true);
      const scanner = new Html5Qrcode('qr-reader');
      qrScannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 15,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        async (decodedText) => {
          if (isCooldownRef.current) return;
          isCooldownRef.current = true;
          handleScan(decodedText);
        },
        () => {}
      );
    } catch (err) {
      alert('Gagal mengakses kamera. Pastikan izin kamera telah disetujui di browser!');
      setIsScanning(false);
    }
  };

  const stopScanner = async () => {
    if (qrScannerRef.current) {
      try {
        await qrScannerRef.current.stop();
        qrScannerRef.current = null;
      } catch (err) {}
    }
    setIsScanning(false);
  };

  const handleScan = async (rawCode) => {
    setIsProcessing(true);
    let ticketId = rawCode.trim();

    // Jika QR menyimpan URL lengkap, ambil ID di query data=...
    if (ticketId.includes('data=')) {
      ticketId = ticketId.split('data=')[1].split('&')[0];
    }

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId }),
      });

      const data = await res.json();

      if (data.status === 'SUCCESS') {
        playSound('success');
        setScanResult({ type: 'success', data });
        setRecentScans((prev) => [
          { id: data.ticketId, name: data.name, time: data.checkInTime },
          ...prev,
        ]);
      } else if (data.status === 'ALREADY_CHECKED_IN') {
        playSound('warning');
        setScanResult({ type: 'warning', data });
      } else {
        playSound('danger');
        setScanResult({ type: 'danger', data: { message: data.message || 'Tiket Tidak Dikenal' } });
      }
    } catch (error) {
      playSound('danger');
      setScanResult({ type: 'danger', data: { message: 'Koneksi error ke server' } });
    } finally {
      setIsProcessing(false);
      // Jeda 2 detik sebelum kamera siap membaca QR berikutnya
      setTimeout(() => {
        isCooldownRef.current = false;
      }, 2000);
    }
  };

  useEffect(() => {
    return () => {
      if (qrScannerRef.current) {
        qrScannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 flex flex-col items-center">
      <div className="w-full max-w-md flex flex-col gap-4">
        
        {/* Header */}
        <div className="text-center py-2">
          <h1 className="text-xl font-bold tracking-tight text-white">SCANNER REGISTRASI</h1>
          <p className="text-xs font-semibold text-emerald-400 mt-0.5 uppercase tracking-wider">
            Absensi Hadir & Voucher Konsumsi
          </p>
        </div>

        {/* Action Button & Camera Viewport */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
          {!isScanning ? (
            <button
              onClick={startScanner}
              className="w-full py-4 bg-sky-600 hover:bg-sky-500 font-bold rounded-xl text-white flex items-center justify-center gap-2 shadow-lg shadow-sky-900/30 active:scale-95 transition-all text-base"
            >
              📷 Buka Kamera Scan QR
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <div id="qr-reader" className="w-full overflow-hidden rounded-xl bg-black border border-slate-700 min-h-[260px]" />
              <button
                onClick={stopScanner}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 font-semibold rounded-xl text-slate-300 text-sm active:scale-95 transition-all"
              >
                Tutup Kamera
              </button>
            </div>
          )}

          {/* Status Loading */}
          {isProcessing && (
            <div className="mt-3 text-center text-xs font-semibold text-sky-400 animate-pulse">
              Memverifikasi data ke spreadsheet...
            </div>
          )}

          {/* Banner Notifikasi Hasil Scan */}
          {scanResult && (
            <div
              className={`mt-4 p-4 rounded-xl border transition-all ${
                scanResult.type === 'success'
                  ? 'bg-emerald-950/70 border-emerald-500 text-emerald-200'
                  : scanResult.type === 'warning'
                  ? 'bg-amber-950/70 border-amber-500 text-amber-200'
                  : 'bg-rose-950/70 border-rose-500 text-rose-200'
              }`}
            >
              <div className="font-bold text-base flex items-center justify-between">
                <span>
                  {scanResult.type === 'success' && '✅ BERHASIL CHECK-IN'}
                  {scanResult.type === 'warning' && '⚠️ SUDAH CHECK-IN'}
                  {scanResult.type === 'danger' && '❌ GAGAL / INVALID'}
                </span>
                {scanResult.data.ticketId && (
                  <span className="text-xs px-2 py-0.5 rounded bg-black/40 font-mono">
                    {scanResult.data.ticketId}
                  </span>
                )}
              </div>

              {scanResult.type === 'success' && (
                <div className="text-xs mt-2 space-y-1">
                  <p className="font-semibold text-white text-sm">{scanResult.data.name}</p>
                  <p>Status: <span className="font-bold text-emerald-400">Hadir</span> | Voucher: <span className="font-bold text-emerald-400">Diambil</span></p>
                  <p className="text-[11px] text-slate-400">Waktu: {scanResult.data.checkInTime}</p>
                </div>
              )}

              {scanResult.type === 'warning' && (
                <div className="text-xs mt-2 space-y-1">
                  <p className="font-semibold text-white text-sm">{scanResult.data.name}</p>
                  <p>{scanResult.data.message}</p>
                </div>
              )}

              {scanResult.type === 'danger' && (
                <div className="text-xs mt-1.5">{scanResult.data.message}</div>
              )}
            </div>
          )}
        </div>

        {/* Riwayat Scan Sesi Panitia */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Riwayat Scan Sesi Ini
            </h2>
            <span className="text-xs bg-sky-950 text-sky-400 px-2.5 py-0.5 rounded-full font-bold border border-sky-800">
              {recentScans.length} Peserta
            </span>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
            {recentScans.length === 0 ? (
              <p className="text-center py-6 text-xs text-slate-500">
                Belum ada tiket yang di-scan pada sesi ini.
              </p>
            ) : (
              recentScans.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex justify-between items-center text-xs"
                >
                  <div>
                    <p className="font-semibold text-slate-200">{item.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{item.time}</p>
                  </div>
                  <span className="font-mono text-emerald-400 font-bold bg-emerald-950/50 px-2 py-1 rounded border border-emerald-900 text-[11px]">
                    {item.id}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </main>
  );
}