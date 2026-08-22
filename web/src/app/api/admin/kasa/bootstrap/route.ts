import { NextResponse } from 'next/server';
import { createKasaUser, hasAnyManagerUser } from '@/lib/kasa/service';

export async function GET() {
  try {
    const hasManager = await hasAnyManagerUser();
    return NextResponse.json({ hasManager });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const hasManager = await hasAnyManagerUser();
    if (hasManager) {
      return NextResponse.json(
        { error: 'Sistemde zaten tanımlı bir yönetici hesabı mevcuttur. İlk kurulum yapılamaz.' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { username, full_name, password } = body;

    if (!username || !full_name || !password) {
      return NextResponse.json({ error: 'Kullanıcı adı, ad soyad ve şifre zorunludur.' }, { status: 400 });
    }

    const initialManager = await createKasaUser({
      username: String(username),
      full_name: String(full_name),
      password_raw: String(password),
      role: 'yonetici',
    });

    return NextResponse.json({ success: true, user: initialManager });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'İlk yönetici oluşturulamadı.' }, { status: 400 });
  }
}
