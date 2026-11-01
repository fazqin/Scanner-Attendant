'use client';

import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export default function ScannerPage() {
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [recentScans, setRecentScans] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [manualId, setManualId] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [currentTime, setCurrentTime] = useState('');

  const qrScannerRef = useRef(null);
  const isCooldownRef = useRef(false);

  // Live WIB clock
  useEffect(() => {
    const updateTime = () => {
      try {
        const now = new Date();
        const formatted = new Intl.DateTimeFormat('id-ID', {
          timeZone: 'Asia/Jakarta',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(now);
        setCurrentTime(`${formatted} WIB`);
      } catch (e) {
        setCurrentTime('');
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Audio Beep Feedback (Web Audio API)
  const playSound = (type) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      if (type === 'success') {
        // High-tone ascending dual confirmation chime (880Hz -> 1320Hz)
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(880, ctx.currentTime);
        osc2.frequency.setValueAtTime(1320, ctx.currentTime + 0.08);

        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.28);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.08);
        osc2.start(ctx.currentTime + 0.08);
        osc2.stop(ctx.currentTime + 0.28);
      } else if (type === 'warning') {
        // Warning double chime (587Hz -> 440Hz)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.setValueAtTime(440, ctx.currentTime + 0.12);

        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);
      } else {
        // Rejection / Error low buzz (200Hz sawtooth)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(196, ctx.currentTime);
        gain.gain.setValueAtTime(0.35, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.32);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.32);
      }
    } catch (e) {
      // Audio context error or user gesture restriction
    }
  };

  const startScanner = async () => {
    try {
      setIsScanning(true);
      await new Promise((resolve) => setTimeout(resolve, 140));

      const readerElem = document.getElementById('qr-reader');
      if (!readerElem) throw new Error('Container pemindai belum siap.');

      if (qrScannerRef.current) {
        try {
          await qrScannerRef.current.stop();
          qrScannerRef.current.clear();
        } catch (e) { }
      }

      const scanner = new Html5Qrcode('qr-reader');
      qrScannerRef.current = scanner;

      const config = {
        fps: 20,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const edge = Math.min(viewfinderWidth, viewfinderHeight);
          return {
            width: Math.floor(edge * 0.72),
            height: Math.floor(edge * 0.72),
          };
        },
        aspectRatio: 1.0,
      };

      const qrSuccessCallback = async (decodedText) => {
        if (isCooldownRef.current) return;
        isCooldownRef.current = true;
        handleScan(decodedText);
      };

      try {
        await scanner.start({ facingMode: 'environment' }, config, qrSuccessCallback, () => { });
      } catch (e) {
        await scanner.start({ facingMode: 'user' }, config, qrSuccessCallback, () => { });
      }
    } catch (err) {
      alert(`Gagal membuka kamera: ${err.message || 'Pastikan izin kamera aktif pada browser ini.'}`);
      setIsScanning(false);
    }
  };

  const stopScanner = async () => {
    if (qrScannerRef.current) {
      try {
        await qrScannerRef.current.stop();
        qrScannerRef.current.clear();
      } catch (err) {
        console.warn('Gagal menghentikan scanner:', err);
      } finally {
        qrScannerRef.current = null;
      }
    }
    setIsScanning(false);
  };

  const handleScan = async (rawCode) => {
    if (!rawCode || isProcessing) return;
    setIsProcessing(true);

    let ticketId = rawCode.trim();

    // Normalisasi parameter query jika QR berupa link
    if (ticketId.includes('data=')) {
      ticketId = ticketId.split('data=')[1].split('&')[0];
    } else if (ticketId.includes('ticketId=')) {
      ticketId = ticketId.split('ticketId=')[1].split('&')[0];
    } else if (ticketId.includes('id=')) {
      ticketId = ticketId.split('id=')[1].split('&')[0];
    }

    const cleanTicketId = decodeURIComponent(ticketId).trim().toUpperCase();

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: cleanTicketId }),
      });

      const data = await res.json();

      if (data.status === 'SUCCESS') {
        playSound('success');
        setScanResult({ type: 'success', data });
        setRecentScans((prev) => [
          {
            id: data.ticketId || cleanTicketId,
            name: data.name || 'Peserta',
            time: data.checkInTime || currentTime || 'Baru saja',
            status: 'SUCCESS',
          },
          ...prev.filter((item) => item.id !== (data.ticketId || cleanTicketId)),
        ]);
      } else if (data.status === 'ALREADY_CHECKED_IN') {
        playSound('warning');
        setScanResult({ type: 'warning', data });
      } else if (data.status === 'NOT_FOUND') {
        playSound('danger');
        setScanResult({
          type: 'danger',
          data: {
            ticketId: cleanTicketId,
            message: data.message || `ID Tiket "${cleanTicketId}" tidak terdaftar di spreadsheet.`,
          },
        });
      } else {
        playSound('danger');
        setScanResult({
          type: 'danger',
          data: {
            ticketId: cleanTicketId,
            message: data.message || 'Gagal memproses tiket.',
          },
        });
      }
    } catch (error) {
      playSound('danger');
      setScanResult({
        type: 'danger',
        data: {
          ticketId: cleanTicketId,
          message: 'Koneksi ke backend gagal. Pastikan jaringan internet stabil.',
        },
      });
    } finally {
      setIsProcessing(false);
      setTimeout(() => {
        isCooldownRef.current = false;
      }, 2000);
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualId.trim()) return;
    handleScan(manualId.trim());
    setManualId('');
  };

  const dismissResult = () => {
    setScanResult(null);
  };

  useEffect(() => {
    return () => {
      if (qrScannerRef.current) {
        qrScannerRef.current.stop().catch(() => { });
        qrScannerRef.current.clear();
      }
    };
  }, []);

  return (
    <main className="cisp-app">
      {/* Container Mobile-First Console */}
      <div className="cisp-console">

        {/* 1. Header Event & Status System */}
        <header className="cisp-header">
          <div className="header-status-row">
            <div className="status-badge-online">
              <span className="status-pulse-dot"></span>
              <span className="status-badge-text">ARA-KAN NDAR!</span>
            </div>
            {currentTime && (
              <div className="live-clock-pill">
                <span className="clock-icon">🕒</span>
                <span>{currentTime}</span>
              </div>
            )}
          </div>

          <div className="title-block">
            <div className="brand-pass-tag">INVESTOR SAHAM PEMULA</div>
            <h1 className="main-title">ISP SCANNER PASS</h1>
            <p className="subtitle">Verifikasi Kehadiran & Penukaran Voucher Konsumsi</p>
          </div>

          {/* Quick Metrics Strip */}
          <div className="metrics-strip">
            <div className="metric-cell">
              <span className="metric-label">TOTAL TERSCAN</span>
              <span className="metric-value">{recentScans.length}</span>
            </div>
            <div className="metric-divider"></div>
            <div className="metric-cell">
              <span className="metric-label">STATUS KAMERA</span>
              <span className={`metric-status ${isScanning ? 'active' : 'idle'}`}>
                {isScanning ? 'PEMINDAI AKTIF' : 'STANDBY'}
              </span>
            </div>
          </div>
        </header>

        {/* 2. Kartu Kamera / Scanner */}
        <section className="cisp-card camera-card">
          {!isScanning ? (
            <div className="camera-idle-view">
              <div className="idle-reticle">
                <div className="idle-icon-ring">
                  <svg className="camera-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                    <circle cx="12" cy="13" r="4"></circle>
                  </svg>
                </div>
              </div>
              <p className="idle-prompt">Arahkan kamera ke QR Pass Peserta untuk absensi kehadiran dan penyerahan konsumsi.</p>

              <button className="btn-activate-camera" onClick={startScanner}>
                <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                  <circle cx="12" cy="13" r="4"></circle>
                </svg>
                <span>AKTIFKAN KAMERA SCANNER</span>
              </button>

              <div className="manual-entry-toggle">
                <button
                  type="button"
                  className="btn-toggle-manual"
                  onClick={() => setShowManualInput(!showManualInput)}
                >
                  {showManualInput ? '▲ Tutup Input Manual' : '▼ Input Manual ID Tiket (Jika QR Rusak)'}
                </button>
              </div>

              {showManualInput && (
                <form onSubmit={handleManualSubmit} className="manual-form">
                  <div className="manual-input-wrapper">
                    <input
                      type="text"
                      className="manual-input"
                      placeholder="Contoh: ISP-0012"
                      value={manualId}
                      onChange={(e) => setManualId(e.target.value)}
                    />
                    <button
                      type="submit"
                      disabled={isProcessing || !manualId.trim()}
                      className="btn-manual-submit"
                    >
                      Verifikasi
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            <div className="camera-active-view">
              <div className="scanner-viewport-wrapper">
                <div id="qr-reader" className="qr-reader-container"></div>

                {/* HUD Viewfinder & Laser Scan Overlay */}
                <div className="hud-overlay" aria-hidden="true">
                  <div className="hud-corner hud-corner-tl"></div>
                  <div className="hud-corner hud-corner-tr"></div>
                  <div className="hud-corner hud-corner-bl"></div>
                  <div className="hud-corner hud-corner-br"></div>
                  <div className="hud-laser-line"></div>
                  <div className="hud-aim-crosshair"></div>
                  <div className="hud-instruction-badge">
                    <span className="hud-beacon"></span>
                    <span>Posisikan QR di dalam kotak</span>
                  </div>
                </div>
              </div>

              <button className="btn-close-camera" onClick={stopScanner}>
                <svg className="btn-close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                </svg>
                <span>Tutup Kamera Scanner</span>
              </button>
            </div>
          )}

          {/* Status Processing Indicator */}
          {isProcessing && (
            <div className="processing-banner">
              <span className="processing-spinner"></span>
              <span>Memverifikasi tiket ke lembar database...</span>
            </div>
          )}
        </section>

        {/* 3. Kartu Hasil Scan (Popup / Floating Banner) */}
        {scanResult && (
          <section className={`cisp-card result-card result-${scanResult.type}`}>
            <div className="result-card-inner">
              <button
                className="btn-dismiss-result"
                onClick={dismissResult}
                aria-label="Tutup notifikasi hasil"
              >
                ✕
              </button>

              {/* Status 1: SUKSES */}
              {scanResult.type === 'success' && (
                <div className="result-content-wrap">
                  <div className="result-status-header">
                    <div className="result-icon-badge badge-success">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </div>
                    <div className="result-header-text">
                      <span className="result-tagline tag-success">VERIFIKASI BERHASIL</span>
                      <span className="result-ticket-code">{scanResult.data?.ticketId || 'ISP-PASS'}</span>
                    </div>
                  </div>

                  <div className="participant-display">
                    <span className="participant-label">NAMA PESERTA</span>
                    <h2 className="participant-name">{scanResult.data?.name}</h2>
                  </div>

                  {/* Dual Action Badges: Kehadiran + Voucher */}
                  <div className="dual-benefit-grid">
                    <div className="benefit-pill pill-present">
                      <span className="benefit-check">✓</span>
                      <div>
                        <div className="benefit-sub">PRESENSI</div>
                        <div className="benefit-main">Hadir di Lokasi</div>
                      </div>
                    </div>
                    <div className="benefit-pill pill-voucher">
                      <span className="benefit-check">✓</span>
                      <div>
                        <div className="benefit-sub">KONSUMSI</div>
                        <div className="benefit-main">Voucher Diambil</div>
                      </div>
                    </div>
                  </div>

                  <div className="result-meta-row">
                    <div className="meta-timestamp">
                      <span className="meta-icon">⏱</span>
                      <span>Waktu Check-in: <b>{scanResult.data?.checkInTime}</b></span>
                    </div>
                    <div className="meta-instruction">
                      Paket konsumsi & seminar kit siap diserahkan kepada peserta.
                    </div>
                  </div>
                </div>
              )}

              {/* Status 2: SUDAH SCAN (Duplikat) */}
              {scanResult.type === 'warning' && (
                <div className="result-content-wrap">
                  <div className="result-status-header">
                    <div className="result-icon-badge badge-warning">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                      </svg>
                    </div>
                    <div className="result-header-text">
                      <span className="result-tagline tag-warning">DUPLIKAT: SUDAH CHECK-IN</span>
                      <span className="result-ticket-code">{scanResult.data?.ticketId || 'ISP-PASS'}</span>
                    </div>
                  </div>

                  <div className="participant-display">
                    <span className="participant-label">NAMA PESERTA</span>
                    <h2 className="participant-name">{scanResult.data?.name || 'Peserta Terdaftar'}</h2>
                  </div>

                  <div className="warning-notice-box">
                    <div className="warning-title">TIKET INI SUDAH DIGUNAKAN SEBELUMNYA</div>
                    <div className="warning-detail">
                      Jam Check-in Pertama: <b>{scanResult.data?.checkInTime || 'Waktu tercatat'}</b>
                    </div>
                    <div className="warning-rule">
                      Peringatan panitia: Peserta telah mengambil voucher konsumsi. Jangan berikan konsumsi ganda.
                    </div>
                  </div>
                </div>
              )}

              {/* Status 3: TIKET TIDAK DITEMUKAN / ERROR */}
              {scanResult.type === 'danger' && (
                <div className="result-content-wrap">
                  <div className="result-status-header">
                    <div className="result-icon-badge badge-danger">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                      </svg>
                    </div>
                    <div className="result-header-text">
                      <span className="result-tagline tag-danger">GAGAL / TIKET TIDAK VALID</span>
                      {scanResult.data?.ticketId && (
                        <span className="result-ticket-code">{scanResult.data.ticketId}</span>
                      )}
                    </div>
                  </div>

                  <div className="danger-notice-box">
                    <div className="danger-message-main">
                      {scanResult.data?.message || 'Tiket Tidak Dikenal di Database'}
                    </div>
                    <div className="danger-hint">
                      Silakan periksa kembali barcode peserta, pastikan tiket berasal dari event resmi CISP, atau coba masukkan ID secara manual.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* 4. Panel Riwayat Scan (Live Feed) */}
        <section className="cisp-card history-card">
          <div className="history-head-bar">
            <div className="history-title-group">
              <span className="history-icon">📋</span>
              <h3 className="history-heading">RIWAYAT SCAN TERAKHIR</h3>
            </div>
            <div className="history-counter-pill">
              <span className="counter-dot"></span>
              <span>{recentScans.length} TIKET</span>
            </div>
          </div>

          <div className="history-scroll-box">
            {recentScans.length === 0 ? (
              <div className="history-empty-view">
                <div className="empty-symbol">🎫</div>
                <div className="empty-title">Belum ada tiket terscan</div>
                <div className="empty-desc">
                  Data peserta yang berhasil diverifikasi akan tercatat secara langsung di sini.
                </div>
              </div>
            ) : (
              <div className="history-items-list">
                {recentScans.map((item, idx) => (
                  <div key={`${item.id}-${idx}`} className="history-row-item">
                    <div className="history-item-left">
                      <div className="history-item-index">#{recentScans.length - idx}</div>
                      <div className="history-attendee-info">
                        <div className="history-attendee-name">{item.name}</div>
                        <div className="history-attendee-time">
                          <span>{item.time}</span>
                          <span className="history-check-chip">Hadir & Voucher Diambil</span>
                        </div>
                      </div>
                    </div>
                    <div className="history-item-right">
                      <span className="history-ticket-chip">{item.id}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Footer Panitia */}
        <footer className="cisp-footer">
          <span>Sistem Registrasi CISP • Terhubung ke Spreadsheet Event</span>
        </footer>

      </div>

      {/* Styled JSX & Scoped Styles (Zero Dependency, Immediate Modern Render) */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@600;700;800&display=swap');

        * {
          box-sizing: border-box;
          -webkit-tap-highlight-color: transparent;
        }

        body {
          margin: 0;
          padding: 0;
          background-color: #070B12;
          color: #F8FAFC;
          font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
          min-height: 100vh;
        }

        /* App Wrapper */
        .cisp-app {
          min-height: 100vh;
          background: radial-gradient(circle at 50% 0%, #0F1A2C 0%, #070B12 60%);
          display: flex;
          justify-content: center;
          padding: 16px 12px 32px;
        }

        .cisp-console {
          width: 100%;
          max-width: 440px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        /* 1. Header */
        .cisp-header {
          padding: 8px 4px 4px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .header-status-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .status-badge-online {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #04241B;
          color: #34D399;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.5px;
          padding: 4px 10px;
          border-radius: 9999px;
          border: 1px solid #059669;
        }

        .status-pulse-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background-color: #10B981;
          box-shadow: 0 0 8px #10B981;
          animation: pulseOnline 2s infinite ease-in-out;
        }

        @keyframes pulseOnline {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.35); opacity: 0.6; }
        }

        .live-clock-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: #0F1726;
          color: #94A3B8;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          font-weight: 600;
          padding: 4px 9px;
          border-radius: 8px;
          border: 1px solid #1E293B;
        }

        .title-block {
          text-align: left;
        }

        .brand-pass-tag {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1.2px;
          color: #10B981;
          margin-bottom: 2px;
        }

        .main-title {
          margin: 0;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.6px;
          color: #FFFFFF;
          line-height: 1.15;
        }

        .subtitle {
          margin: 4px 0 0;
          font-size: 12.5px;
          color: #94A3B8;
          font-weight: 500;
          line-height: 1.4;
        }

        /* Metrics Strip */
        .metrics-strip {
          display: flex;
          align-items: center;
          background: #0B1220;
          border: 1px solid #1E293B;
          border-radius: 12px;
          padding: 8px 14px;
        }

        .metric-cell {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .metric-divider {
          width: 1px;
          height: 26px;
          background: #1E293B;
          margin: 0 12px;
        }

        .metric-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 9.5px;
          font-weight: 600;
          color: #64748B;
          letter-spacing: 0.5px;
        }

        .metric-value {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 18px;
          font-weight: 800;
          color: #F8FAFC;
        }

        .metric-status {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11.5px;
          font-weight: 700;
        }

        .metric-status.active {
          color: #10B981;
        }

        .metric-status.idle {
          color: #94A3B8;
        }

        /* Cards Base */
        .cisp-card {
          background: #0E1626;
          border: 1px solid #1E2B40;
          border-radius: 18px;
          padding: 16px;
          box-shadow: 0 12px 30px -4px rgba(0, 0, 0, 0.6);
        }

        /* 2. Camera Card */
        .camera-card {
          position: relative;
        }

        .camera-idle-view {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 8px 4px 4px;
        }

        .idle-reticle {
          margin-bottom: 12px;
        }

        .idle-icon-ring {
          width: 64px;
          height: 64px;
          border-radius: 20px;
          background: #142036;
          border: 1px solid #283A58;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #10B981;
        }

        .camera-icon-svg {
          width: 30px;
          height: 30px;
        }

        .idle-prompt {
          margin: 0 0 18px;
          font-size: 13px;
          line-height: 1.45;
          color: #94A3B8;
          max-width: 320px;
        }

        .btn-activate-camera {
          width: 100%;
          padding: 15px 16px;
          background: linear-gradient(135deg, #059669 0%, #047857 100%);
          color: #FFFFFF;
          border: 1px solid #10B981;
          border-radius: 14px;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 14.5px;
          font-weight: 700;
          letter-spacing: 0.3px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          box-shadow: 0 8px 20px -2px rgba(5, 150, 105, 0.45);
          transition: transform 0.15s ease, filter 0.15s ease;
        }

        .btn-activate-camera:active {
          transform: scale(0.985);
          filter: brightness(0.92);
        }

        .btn-icon {
          width: 20px;
          height: 20px;
        }

        .manual-entry-toggle {
          margin-top: 14px;
          width: 100%;
        }

        .btn-toggle-manual {
          background: transparent;
          border: none;
          color: #64748B;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          padding: 6px 10px;
          border-radius: 6px;
          transition: color 0.15s;
        }

        .btn-toggle-manual:hover {
          color: #94A3B8;
        }

        .manual-form {
          margin-top: 10px;
          width: 100%;
        }

        .manual-input-wrapper {
          display: flex;
          gap: 8px;
        }

        .manual-input {
          flex: 1;
          background: #090F1C;
          border: 1px solid #23344E;
          border-radius: 10px;
          padding: 10px 12px;
          color: #FFFFFF;
          font-family: 'JetBrains Mono', monospace;
          font-size: 13.5px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .manual-input:focus {
          outline: none;
          border-color: #10B981;
          box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
        }

        .btn-manual-submit {
          background: #16243C;
          border: 1px solid #2B4063;
          color: #38BDF8;
          border-radius: 10px;
          padding: 0 16px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
        }

        .btn-manual-submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Camera Active View */
        .camera-active-view {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .scanner-viewport-wrapper {
          position: relative;
          width: 100%;
          aspect-ratio: 1 / 1;
          background: #000000;
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid #1E2D44;
        }

        .qr-reader-container {
          width: 100% !important;
          height: 100% !important;
          background: #000000 !important;
          border: none !important;
        }

        /* html5-qrcode overrides to guarantee clean modern display */
        #qr-reader {
          width: 100% !important;
          border: none !important;
        }
        #qr-reader video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          border-radius: 18px !important;
        }
        #qr-reader__scan_region {
          background: transparent !important;
        }
        #qr-reader__dashboard_section_csr {
          display: none !important;
        }
        #qr-reader img {
          display: none !important;
        }

        /* Tactical HUD Overlay */
        .hud-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .hud-corner {
          position: absolute;
          width: 30px;
          height: 30px;
          border-color: #10B981;
          border-style: solid;
        }

        .hud-corner-tl {
          top: 20px;
          left: 20px;
          border-width: 3.5px 0 0 3.5px;
          border-top-left-radius: 8px;
        }

        .hud-corner-tr {
          top: 20px;
          right: 20px;
          border-width: 3.5px 3.5px 0 0;
          border-top-right-radius: 8px;
        }

        .hud-corner-bl {
          bottom: 20px;
          left: 20px;
          border-width: 0 0 3.5px 3.5px;
          border-bottom-left-radius: 8px;
        }

        .hud-corner-br {
          bottom: 20px;
          right: 20px;
          border-width: 0 3.5px 3.5px 0;
          border-bottom-right-radius: 8px;
        }

        .hud-laser-line {
          position: absolute;
          left: 12%;
          right: 12%;
          height: 2px;
          background: linear-gradient(90deg, rgba(16, 185, 129, 0) 0%, #10B981 50%, rgba(16, 185, 129, 0) 100%);
          box-shadow: 0 0 10px 1.5px #10B981;
          animation: laserSweep 2s ease-in-out infinite alternate;
        }

        @keyframes laserSweep {
          0% {
            top: 22%;
            opacity: 0.7;
          }
          50% {
            opacity: 1;
          }
          100% {
            top: 78%;
            opacity: 0.7;
          }
        }

        .hud-aim-crosshair {
          width: 14px;
          height: 14px;
          position: relative;
        }

        .hud-aim-crosshair::before,
        .hud-aim-crosshair::after {
          content: '';
          position: absolute;
          background: rgba(16, 185, 129, 0.6);
        }

        .hud-aim-crosshair::before {
          top: 6px;
          left: 0;
          width: 14px;
          height: 2px;
        }

        .hud-aim-crosshair::after {
          left: 6px;
          top: 0;
          width: 2px;
          height: 14px;
        }

        .hud-instruction-badge {
          position: absolute;
          bottom: 12px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(4, 18, 14, 0.88);
          border: 1px solid rgba(16, 185, 129, 0.6);
          padding: 5px 12px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 600;
          color: #A7F3D0;
          backdrop-filter: blur(4px);
        }

        .hud-beacon {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #10B981;
        }

        .btn-close-camera {
          width: 100%;
          padding: 12px;
          background: #162032;
          color: #CBD5E1;
          border: 1px solid #243550;
          border-radius: 12px;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: background 0.15s;
        }

        .btn-close-camera:active {
          background: #1E2D44;
        }

        .btn-close-icon {
          width: 16px;
          height: 16px;
        }

        .processing-banner {
          margin-top: 12px;
          padding: 10px 14px;
          background: #0B1B2B;
          border: 1px solid #1D4ED8;
          border-radius: 10px;
          color: #93C5FD;
          font-size: 12.5px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .processing-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(147, 197, 253, 0.3);
          border-top-color: #93C5FD;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* 3. Result Banner / Card */
        .result-card {
          position: relative;
          animation: slideInPop 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes slideInPop {
          0% {
            opacity: 0;
            transform: translateY(-8px) scale(0.98);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .btn-dismiss-result {
          position: absolute;
          top: 14px;
          right: 14px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #E2E8F0;
          width: 26px;
          height: 26px;
          border-radius: 50%;
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        /* Success Scheme */
        .result-success {
          background: radial-gradient(circle at top left, #0A2E22 0%, #061913 100%);
          border: 1px solid #10B981;
          box-shadow: 0 10px 28px -4px rgba(16, 185, 129, 0.25);
        }

        .result-warning {
          background: radial-gradient(circle at top left, #341D08 0%, #1A0D03 100%);
          border: 1px solid #F59E0B;
          box-shadow: 0 10px 28px -4px rgba(245, 158, 11, 0.25);
        }

        .result-danger {
          background: radial-gradient(circle at top left, #380E13 0%, #1D0609 100%);
          border: 1px solid #EF4444;
          box-shadow: 0 10px 28px -4px rgba(239, 68, 68, 0.25);
        }

        .result-content-wrap {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .result-status-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .result-icon-badge {
          width: 38px;
          height: 38px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .result-icon-badge svg {
          width: 20px;
          height: 20px;
        }

        .badge-success {
          background: #059669;
          color: #FFFFFF;
        }

        .badge-warning {
          background: #D97706;
          color: #FFFFFF;
        }

        .badge-danger {
          background: #DC2626;
          color: #FFFFFF;
        }

        .result-header-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .result-tagline {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.5px;
        }

        .tag-success { color: #34D399; }
        .tag-warning { color: #FBBF24; }
        .tag-danger { color: #F87171; }

        .result-ticket-code {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11.5px;
          font-weight: 700;
          color: #CBD5E1;
          background: rgba(0, 0, 0, 0.4);
          padding: 1px 7px;
          border-radius: 4px;
          display: inline-block;
          width: fit-content;
        }

        .participant-display {
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          padding-top: 10px;
        }

        .participant-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 9.5px;
          font-weight: 600;
          color: #94A3B8;
          letter-spacing: 0.8px;
        }

        .participant-name {
          margin: 3px 0 0;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 20px;
          font-weight: 800;
          color: #FFFFFF;
          letter-spacing: -0.3px;
          line-height: 1.25;
        }

        .dual-benefit-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .benefit-pill {
          background: rgba(0, 0, 0, 0.35);
          border: 1px solid rgba(16, 185, 129, 0.3);
          border-radius: 10px;
          padding: 8px 10px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .pill-present {
          border-color: rgba(52, 211, 153, 0.4);
        }

        .pill-voucher {
          border-color: rgba(16, 185, 129, 0.6);
          background: rgba(16, 185, 129, 0.12);
        }

        .benefit-check {
          color: #34D399;
          font-weight: 800;
          font-size: 14px;
        }

        .benefit-sub {
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px;
          font-weight: 600;
          color: #6EE7B7;
          letter-spacing: 0.5px;
        }

        .benefit-main {
          font-size: 12px;
          font-weight: 700;
          color: #FFFFFF;
        }

        .result-meta-row {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 8px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .meta-timestamp {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          color: #94A3B8;
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .meta-instruction {
          font-size: 11.5px;
          color: #A7F3D0;
          font-weight: 500;
        }

        /* Warning Content */
        .warning-notice-box {
          background: rgba(0, 0, 0, 0.35);
          border-left: 3px solid #F59E0B;
          border-radius: 6px;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .warning-title {
          font-size: 12px;
          font-weight: 700;
          color: #FBBF24;
        }

        .warning-detail {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11.5px;
          color: #E2E8F0;
        }

        .warning-rule {
          font-size: 11.5px;
          color: #FCD34D;
          line-height: 1.4;
        }

        /* Danger Content */
        .danger-notice-box {
          background: rgba(0, 0, 0, 0.35);
          border-left: 3px solid #EF4444;
          border-radius: 6px;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .danger-message-main {
          font-size: 13.5px;
          font-weight: 700;
          color: #FCA5A5;
        }

        .danger-hint {
          font-size: 11.5px;
          color: #E2E8F0;
          line-height: 1.4;
        }

        /* 4. History Card */
        .history-card {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .history-head-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .history-title-group {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .history-icon {
          font-size: 14px;
        }

        .history-heading {
          margin: 0;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 12.5px;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: #94A3B8;
        }

        .history-counter-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: #090E17;
          border: 1px solid #1E293B;
          color: #38BDF8;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10.5px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 9999px;
        }

        .counter-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #38BDF8;
        }

        .history-scroll-box {
          max-height: 250px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: #1F2E45 #090E17;
        }

        .history-scroll-box::-webkit-scrollbar {
          width: 5px;
        }
        .history-scroll-box::-webkit-scrollbar-track {
          background: #090E17;
          border-radius: 4px;
        }
        .history-scroll-box::-webkit-scrollbar-thumb {
          background: #1F2E45;
          border-radius: 4px;
        }

        .history-empty-view {
          padding: 24px 12px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .empty-symbol {
          font-size: 28px;
          opacity: 0.6;
          margin-bottom: 4px;
        }

        .empty-title {
          font-size: 13px;
          font-weight: 700;
          color: #64748B;
        }

        .empty-desc {
          font-size: 11.5px;
          color: #475569;
          max-width: 260px;
          line-height: 1.4;
        }

        .history-items-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .history-row-item {
          background: #090F1B;
          border: 1px solid #1A263A;
          border-radius: 12px;
          padding: 9px 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          transition: background 0.15s;
        }

        .history-row-item:hover {
          background: #0D1626;
        }

        .history-item-left {
          display: flex;
          align-items: center;
          gap: 10px;
          overflow: hidden;
        }

        .history-item-index {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          font-weight: 700;
          color: #475569;
          background: #131E30;
          padding: 2px 5px;
          border-radius: 4px;
        }

        .history-attendee-info {
          overflow: hidden;
        }

        .history-attendee-name {
          font-weight: 700;
          font-size: 13.5px;
          color: #F1F5F9;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .history-attendee-time {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10.5px;
          color: #64748B;
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 2px;
        }

        .history-check-chip {
          background: #05261D;
          color: #34D399;
          padding: 1px 5px;
          border-radius: 3px;
          font-size: 9px;
          font-weight: 700;
        }

        .history-ticket-chip {
          background: #052E20;
          color: #34D399;
          border: 1px solid #059669;
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-family: 'JetBrains Mono', monospace;
          font-weight: 700;
          white-space: nowrap;
        }

        /* Footer */
        .cisp-footer {
          text-align: center;
          padding: 8px 0;
          font-size: 11px;
          color: #475569;
        }
      `}</style>
    </main>
  );
}
