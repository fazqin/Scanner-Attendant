import { google } from 'googleapis';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { ticketId } = await request.json();

    if (!ticketId || typeof ticketId !== 'string') {
      return NextResponse.json({ success: false, message: 'ID Tiket tidak valid' }, { status: 400 });
    }

    const cleanTicketId = ticketId.trim().toUpperCase();

    // Inisialisasi Auth Google Sheets API
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SPREADSHEET_ID;

    // Ambil data tab Ticket dari kolom A sampai G
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Ticket!A:G',
    });

    const rows = response.data.values;
    if (!rows || rows.length <= 1) {
      return NextResponse.json({ success: false, message: 'Data peserta kosong di sheet' }, { status: 404 });
    }

    // Cari baris berdasarkan ID Tiket (Kolom A / index 0)
    let targetRowIndex = -1;
    let participantName = '';
    let currentAttendance = '';
    let currentCheckIn = '';

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row[0] && row[0].toString().trim().toUpperCase() === cleanTicketId) {
        targetRowIndex = i + 1; // 1-based index untuk Sheets API
        participantName = row[1] || 'Peserta';
        currentAttendance = row[4] || '';
        currentCheckIn = row[6] || '';
        break;
      }
    }

    // 1. Jika tiket tidak ditemukan
    if (targetRowIndex === -1) {
      return NextResponse.json({
        success: false,
        status: 'NOT_FOUND',
        message: `ID Tiket "${cleanTicketId}" tidak terdaftar di database!`,
      }, { status: 404 });
    }

    // 2. Jika tiket sudah pernah di-scan
    if (currentAttendance.toLowerCase() === 'hadir' || currentCheckIn) {
      return NextResponse.json({
        success: false,
        status: 'ALREADY_CHECKED_IN',
        name: participantName,
        ticketId: cleanTicketId,
        checkInTime: currentCheckIn,
        message: `Peserta SUDAH SCAN sebelumnya pada: ${currentCheckIn || 'Waktu tercatat'}`,
      });
    }

    // 3. Format waktu WIB (Asia/Jakarta)
    const nowWIB = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date()).replace(/\./g, ':');

    // Update Kolom E (Status Kehadiran), F (Status Voucher), G (Waktu Check-in)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Ticket!E${targetRowIndex}:G${targetRowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['Hadir', 'Diambil', nowWIB]],
      },
    });

    return NextResponse.json({
      success: true,
      status: 'SUCCESS',
      name: participantName,
      ticketId: cleanTicketId,
      checkInTime: nowWIB,
      message: 'Check-in berhasil & Voucher konsumsi siap diserahkan!',
    });

  } catch (error) {
    console.error('Error saat proses scan:', error);
    return NextResponse.json({
      success: false,
      status: 'ERROR',
      message: 'Terjadi kegagalan server: ' + (error.message || 'Unknown error'),
    }, { status: 500 });
  }
}