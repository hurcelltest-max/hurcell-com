import { NextResponse } from 'next/server';
import { createKasaUser, listKasaUsers, updateKasaUser } from '@/lib/kasa/service';

export async function GET() {
  try {
    const users = await listKasaUsers();
    return NextResponse.json({ users });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Kullanıcılar listelenemedi.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, full_name, password, role } = body;

    if (!username || !full_name || !password || !role) {
      return NextResponse.json({ error: 'Tüm alanlar zorunludur.' }, { status: 400 });
    }

    if (role !== 'yonetici' && role !== 'personel') {
      return NextResponse.json({ error: 'Geçersiz rol seçimi.' }, { status: 400 });
    }

    const newUser = await createKasaUser({
      username: String(username),
      full_name: String(full_name),
      password_raw: String(password),
      role: role as 'yonetici' | 'personel',
    });

    return NextResponse.json({ success: true, user: newUser });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Kullanıcı oluşturulamadı.' }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, full_name, is_active, role, password } = body;

    if (!id) {
      return NextResponse.json({ error: 'Kullanıcı ID zorunludur.' }, { status: 400 });
    }

    const updatedUser = await updateKasaUser(String(id), {
      full_name: full_name ? String(full_name) : undefined,
      is_active: is_active !== undefined ? Boolean(is_active) : undefined,
      role: role ? (role as 'yonetici' | 'personel') : undefined,
      password_raw: password ? String(password) : undefined,
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Kullanıcı güncellenemedi.' }, { status: 400 });
  }
}
