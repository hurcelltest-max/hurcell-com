'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/urunler", label: "Ürünler" },
  { href: "/stok-sayim", label: "Stok Sayımı" },
  { href: "/satis", label: "Satış" },
  { href: "/iade", label: "İade" },
  { href: "/hareketler", label: "Hareketler" },
  { href: "/ayarlar/bayiler", label: "B2B Bayiler" },
  { href: "/ayarlar", label: "Ayarlar" },
];

export default function LayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'dealer_approved' | 'dealer_pending' | 'dealer_rejected' | 'dealer_passive' | 'unknown' | null>(null);
  const [loading, setLoading] = useState(true);

  const isLoginPage = pathname === '/login';
  const isB2bPath = pathname.startsWith('/b2b');

  const fetchUserRole = async (userId: string) => {
    if (!supabase) return 'unknown';

    try {
      // 1. Check if admin
      const { data: adminData } = await (supabase as any)
        .from('admin_users')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (adminData) {
        return 'admin';
      }

      // 2. Check if dealer
      const { data: dealerData } = await (supabase as any)
        .from('b2b_dealers')
        .select('status')
        .eq('user_id', userId)
        .maybeSingle();

      if (dealerData) {
        return `dealer_${dealerData.status}` as any;
      }

      return 'unknown';
    } catch (err) {
      console.error('Error fetching user role:', err);
      return 'unknown';
    }
  };

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;

    const checkAuthAndRole = async (currSession: Session | null) => {
      if (!currSession) {
        if (active) {
          setSession(null);
          setUserRole(null);
          setLoading(false);
        }
        return;
      }

      if (active) {
        setSession(currSession);
      }

      try {
        const role = await fetchUserRole(currSession.user.id);
        if (active) {
          setUserRole(role);
          setLoading(false);
        }
      } catch (err) {
        console.error("Auth role check error:", err);
        if (active) {
          setUserRole('unknown');
          setLoading(false);
        }
      }
    };

    // Initial check
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      checkAuthAndRole(initialSession);
    });

    // Listen to changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      checkAuthAndRole(newSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Re-fetch role on pathname changes for dynamic transitions (e.g. after register)
  useEffect(() => {
    if (session && (userRole === 'unknown' || userRole === 'dealer_pending')) {
      fetchUserRole(session.user.id).then((role) => {
        setUserRole(role);
      });
    }
  }, [pathname, session]);

  // Protected Route Redirections
  useEffect(() => {
    if (loading) return;

    // Guest Routing
    if (!session) {
      if (isB2bPath) {
        if (pathname !== '/b2b/login' && pathname !== '/b2b/register') {
          router.push('/b2b/login');
        }
      } else {
        if (pathname !== '/login') {
          router.push('/login');
        }
      }
      return;
    }

    // Authenticated Routing based on Role
    if (userRole === 'admin') {
      if (pathname === '/login' || pathname === '/b2b/login' || pathname === '/b2b/register') {
        router.push('/');
      }
    } else if (userRole === 'dealer_approved') {
      if (!pathname.startsWith('/b2b/products') && pathname !== '/b2b/products') {
        router.push('/b2b/products');
      }
    } else if (userRole === 'dealer_pending') {
      if (pathname !== '/b2b/pending') {
        router.push('/b2b/pending');
      }
    } else if (userRole === 'dealer_rejected' || userRole === 'dealer_passive') {
      if (pathname !== '/b2b/rejected') {
        router.push('/b2b/rejected');
      }
    } else if (userRole === 'unknown') {
      if (pathname !== '/b2b/register') {
        router.push('/b2b/register');
      }
    }
  }, [pathname, session, userRole, loading, router, isB2bPath]);

  // Handle Logout
  const handleLogout = async () => {
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
      if (isB2bPath) {
        router.push('/b2b/login');
      } else {
        router.push('/login');
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // 1. Supabase not configured warning
  if (!supabase) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-lg shadow-rose-900/5">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            ⚠️
          </div>
          <h2 className="mt-4 text-xl font-semibold text-slate-900">Supabase Yapılandırması Eksik</h2>
          <p className="mt-2 text-sm text-slate-600">
            Lütfen <code>.env.local</code> dosyasında <code>NEXT_PUBLIC_SUPABASE_URL</code> ve <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> değerlerinin tanımlı olduğundan emin olun.
          </p>
        </div>
      </div>
    );
  }

  // 2. Loading state to prevent protected content flashes
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-600 border-t-transparent"></div>
          <p className="text-sm font-medium text-slate-600">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  // 3. Prevent rendering protected page if user is not logged in and not on login page
  if (!session && !isLoginPage && pathname !== '/b2b/login' && pathname !== '/b2b/register') {
    return null;
  }

  // 4. Clean layout for Login/Register pages
  if (isLoginPage || pathname === '/b2b/login' || pathname === '/b2b/register') {
    return <>{children}</>;
  }

  // 5. Clean layout for B2B Portal pages (pending, rejected, products)
  if (isB2bPath) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-600">
                HurCELL B2B
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Toptan Satış Portalı
              </h1>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-2xl bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-100 active:scale-95 cursor-pointer"
            >
              Çıkış Yap
            </button>
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </div>
    );
  }

  // 6. Standard Dashboard layout with Header & Sidebar
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-600">
              HurCELL
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Stok Takip
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <p className="hidden text-sm text-slate-600 md:block">
              Basit ve mobil uyumlu stok yönetim paneli.
            </p>
            <button
              onClick={handleLogout}
              className="rounded-2xl bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-100 active:scale-95 cursor-pointer"
            >
              Çıkış Yap
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
          <aside className="rounded-3xl border border-slate-200 bg-white/95 p-5 shadow-sm shadow-slate-900/5 h-fit">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Menü
            </p>
            <nav className="mt-6 space-y-2">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block rounded-2xl px-4 py-3 text-sm font-medium transition cursor-pointer ${
                      isActive
                        ? "bg-sky-50 text-sky-700 font-semibold"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>

          <main className="space-y-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
