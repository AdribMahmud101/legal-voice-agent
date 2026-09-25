"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ROLE_LABELS, type SessionUser } from "@/lib/auth/roles";

interface PortalViewProps {
  onOpenSoftphone: () => void;
  isCallActive: boolean;
  currentUser: SessionUser | null;
}

const LAWYERS = [
  { n: "অ্যাড. নাসরিন আক্তার", d: "ঢাকা", c: "পারিবারিক", y: 12, l: "বাংলা, ইংরেজি", a: 1, col: "#0B5A3C" },
  { n: "অ্যাড. রফিকুল ইসলাম", d: "রাজশাহী", c: "ভূমি", y: 18, l: "বাংলা", a: 1, col: "#8B5E3C" },
  { n: "অ্যাড. তানজিলা রহমান", d: "চট্টগ্রাম", c: "নারী ও শিশু", y: 9, l: "বাংলা, চাটগাঁইয়া", a: 1, col: "#B0445A" },
  { n: "অ্যাড. কামরুল হাসান", d: "ঢাকা", c: "ফৌজদারি", y: 15, l: "বাংলা, ইংরেজি", a: 0, col: "#1D2433" },
  { n: "অ্যাড. শাহানা পারভীন", d: "খুলনা", c: "শ্রম", y: 11, l: "বাংলা", a: 1, col: "#3E6FB0" },
  { n: "অ্যাড. আরিফুর রহমান", d: "সিলেট", c: "দেওয়ানি", y: 7, l: "বাংলা, সিলেটি", a: 1, col: "#6B4FA0" },
  { n: "অ্যাড. মাহমুদা খানম", d: "বরিশাল", c: "পারিবারিক", y: 10, l: "বাংলা", a: 0, col: "#C62834" },
  { n: "অ্যাড. জাহিদুল করিম", d: "চট্টগ্রাম", c: "ভূমি", y: 14, l: "বাংলা, ইংরেজি", a: 1, col: "#2F7D6D" },
  { n: "অ্যাড. সুমাইয়া ইসলাম", d: "ঢাকা", c: "নারী ও শিশু", y: 8, l: "বাংলা, ইংরেজি", a: 1, col: "#A0527A" },
];

const bnNum = (n: number | string) => String(n).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[+d]);

export function PortalView({ onOpenSoftphone, isCallActive, currentUser }: PortalViewProps) {
  const [currentView, setCurrentView] = useState<"home" | "apply">("home");
  const [bengaliDate, setBengaliDate] = useState("");
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isSosOpen, setIsSosOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoginDropdownOpen, setIsLoginDropdownOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Panel Lawyers Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");

  // Mediation Form State
  const [medName, setMedName] = useState("");
  const [medPhone, setMedPhone] = useState("");
  const [medDist, setMedDist] = useState("ঢাকা");
  const [medType, setMedType] = useState("পারিবারিক / দেনমোহর / ভরণপোষণ");

  // Format today's date in Bengali
  useEffect(() => {
    try {
      const now = new Date();
      setBengaliDate(
        now.toLocaleDateString("bn-BD", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      );
    } catch {
      setBengaliDate("বুধবার, ২৪ সেপ্টেম্বর, ২০২৬");
    }
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const filteredLawyers = LAWYERS.filter((p) => {
    const matchQ = !searchQuery || p.n.includes(searchQuery);
    const matchDist = !selectedDistrict || p.d === selectedDistrict;
    const matchCat = !selectedCategory || p.c === selectedCategory;
    return matchQ && matchDist && matchCat;
  });

  return (
    <div className="portal-root min-h-screen flex flex-col bg-white text-slate-900">
      {/* 1. Government Top Strip */}
      <div className="portal-gov py-2 bg-slate-100 border-b border-slate-200">
        <div className="portal-wrap flex items-center justify-between">
          <div className="left flex items-center gap-2 text-xs text-slate-600">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M3 10 12 4l9 6M5 10v9m14-9v9M9 10v9m6-9v9M3 20h18" />
            </svg>
            <span className="font-semibold text-slate-800">গণপ্রজাতন্ত্রী বাংলাদেশ সরকার</span>
            <span className="hidden sm:inline text-slate-500">/ Government of the People's Republic of Bangladesh</span>
          </div>

          <div className="right flex items-center gap-3">
            <span className="text-xs text-slate-500 hidden md:inline">{bengaliDate}</span>
            <button
              onClick={() => setIsSosOpen(true)}
              className="sos-chip bg-rose-700 hover:bg-rose-800 text-white font-semibold text-xs px-3 py-1 rounded-full flex items-center gap-1.5 transition"
            >
              <span className="dot" />
              <span>জরুরি সাহায্য</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Main Navigation Header */}
      <header className="portal-header sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="portal-wrap flex items-center justify-between py-3">
          {/* Logo & Brand */}
          <div
            onClick={() => setCurrentView("home")}
            className="brand flex items-center gap-3 cursor-pointer"
          >
            <img src="/assets/logo/logo-mark.png" alt="Bangladesh Govt Seal" className="h-11 w-auto" />
            <div className="wm leading-tight">
              <b className="text-emerald-800 font-bold text-lg">Bangladesh</b>
              <span className="text-slate-800 font-semibold text-sm">Legal Portal</span>
            </div>
          </div>

          {/* Nav links */}
          <nav className="portal-links hidden lg:flex items-center gap-1">
            <button
              onClick={() => setCurrentView("apply")}
              className={`px-3 py-2 rounded-xl text-sm font-semibold transition ${
                currentView === "apply"
                  ? "bg-emerald-50 text-emerald-800"
                  : "text-slate-700 hover:text-emerald-800 hover:bg-slate-50"
              }`}
            >
              আবেদন করুন
            </button>
            <a href="#emergency" className="px-3 py-2 rounded-xl text-sm font-semibold text-slate-700 hover:text-emerald-800 hover:bg-slate-50">
              জরুরি হটলাইন
            </a>
            <a href="#mediation" className="px-3 py-2 rounded-xl text-sm font-semibold text-slate-700 hover:text-emerald-800 hover:bg-slate-50">
              মধ্যস্থতা (ADR)
            </a>
            <a href="#lawyers" className="px-3 py-2 rounded-xl text-sm font-semibold text-slate-700 hover:text-emerald-800 hover:bg-slate-50">
              প্যানেল আইনজীবী
            </a>
          </nav>

          {/* Action CTAs */}
           <div className="header-actions flex items-center gap-2.5 relative">
             {currentUser?.role === "citizen" ? (
               <Link
                 href="/profile"
                 className="hidden min-h-10 items-center rounded border border-emerald-800 bg-white px-4 text-sm font-bold text-emerald-800 transition hover:bg-emerald-50 sm:inline-flex"
               >
                 প্রোফাইল
               </Link>
             ) : (
               <div
                 className="hidden sm:block relative"
                 onMouseEnter={() => setIsLoginDropdownOpen(true)}
                 onMouseLeave={() => setIsLoginDropdownOpen(false)}
               >
                 <button
                   className="min-h-10 items-center rounded border border-emerald-800 bg-white px-4 text-sm font-bold text-emerald-800 transition hover:bg-emerald-50 flex gap-1"
                 >
                   লগইন
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                 </button>

                 {isLoginDropdownOpen && (
                   <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-slate-200 shadow-md rounded overflow-hidden z-50">
                     <Link href="/login?tab=citizen" className="block px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 hover:text-emerald-800 border-b border-slate-100">
                       নাগরিক লগইন
                     </Link>
                     <Link href="/login?tab=staff" className="block px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 hover:text-emerald-800 border-b border-slate-100">
                       ডিএলএও (DLAO) লগইন
                     </Link>
                     <Link href="/login?tab=staff" className="block px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 hover:text-emerald-800">
                       প্যানেল আইনজীবী লগইন
                     </Link>
                   </div>
                 )}
               </div>
             )}


             {/* Direct Softphone Trigger Button */}
            <button
              onClick={onOpenSoftphone}
              className="header-hot bg-red-600 hover:bg-red-700 text-white font-bold text-xs sm:text-sm px-4 py-2 rounded flex items-center gap-2 shadow-sm transition active:scale-95 cursor-pointer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              <span>১৬৬৯৯ - হেল্পলাইন</span>
            </button>

            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                className="w-10 h-10 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-700 transition relative"
                aria-label="নোটিফিকেশন"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" />
                </svg>
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-600 text-white rounded-full text-[10px] font-bold flex items-center justify-center">
                  ৩
                </span>
              </button>

              {isNotifOpen && (
                 <div className="notification-panel absolute right-0 top-12 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 z-50">

                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                    <span className="font-bold text-xs text-slate-800">নোটিফিকেশন</span>
                    <button onClick={() => setIsNotifOpen(false)} className="text-[11px] text-emerald-700 font-semibold">
                      সব পড়া হয়েছে
                    </button>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="p-2 rounded-xl bg-emerald-50 text-emerald-900">
                      ✓ আপনার ডকেট আবেদন <strong>#DLAS-2025-0992</strong> গৃহীত হয়েছে। একজন কর্মকর্তা নির্ধারিত হয়েছেন।
                    </div>
                    <div className="p-2 rounded-xl bg-amber-50 text-amber-900">
                      ⏱ মধ্যস্থতা সেশন: <strong>২৮ সেপ্টেম্বর, সকাল ১১টা</strong> — জেলা লিগ্যাল এইড অফিস, ঢাকা।
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Menu Toggle */}
             <button
               onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
               className="lg:hidden w-10 h-10 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-700"
             >
               ☰
             </button>
             {currentUser && (
               <span className="hidden max-w-40 truncate rounded-full bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-800 sm:inline-flex">
                 {currentUser.displayName} · {ROLE_LABELS[currentUser.role]}
               </span>
             )}

          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden bg-white border-t border-slate-200 px-4 py-3 space-y-2 text-sm font-semibold">
            <button
              onClick={() => {
                setCurrentView("home");
                setIsMobileMenuOpen(false);
              }}
              className="block w-full text-left py-2 text-slate-700"
            >
              হোম পেজ
             </button>
              {currentUser?.role === "citizen" ? (
                <Link
                  href="/profile"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block w-full rounded-xl bg-emerald-50 py-2.5 text-left text-emerald-800"
                >
                  প্রোফাইল
                </Link>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block w-full rounded-xl bg-emerald-50 py-2.5 text-left text-emerald-800"
                >
                  লগইন / রেজিস্টার
                </Link>
              )}

             <button
               onClick={() => {
                 setCurrentView("apply");

                setIsMobileMenuOpen(false);
              }}
              className="block w-full text-left py-2 text-emerald-800"
            >
              আবেদন ফর্ম (৫ ধাপ)
            </button>
            <a
              href="#emergency"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block py-2 text-slate-700"
            >
              জরুরি হটলাইন
            </a>
            <a
              href="#mediation"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block py-2 text-slate-700"
            >
              মধ্যস্থতা (ADR)
            </a>
            <a
              href="#lawyers"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block py-2 text-slate-700"
            >
              প্যানেল আইনজীবী
            </a>
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                onOpenSoftphone();
              }}
              className="w-full py-2.5 bg-emerald-700 text-white rounded-xl font-bold text-center block mt-2"
            >
              📞 ১৬৬৯৯ ভয়েস হেল্পলাইনে কথা বলুন
            </button>
          </div>
        )}
      </header>

      {/* 3. Notice Ticker */}
      <div className="portal-ticker py-2 bg-emerald-900 text-white">
        <div className="portal-wrap flex items-center gap-3">
          <span className="tag bg-white text-emerald-950 font-bold px-2 py-0.5 rounded text-xs">
            নোটিশ
          </span>
          <div className="track flex-1 overflow-hidden">
            <div className="run flex gap-8 whitespace-nowrap text-xs sm:text-sm font-semibold">
              <span> পড়তে বা লিখতে সমস্যা হলে সরাসরি ১৬৬৯৯-এ কল করে বাংলায় মুখে আপনার সমস্যা বলুন।</span>
              <span> ৬৪ জেলার প্যানেল আইনজীবীর তালিকা হালনাগাদ করা হয়েছে — সরকার ফি বহন করবে।</span>
              <span> নারী ও শিশু নির্যাতনের শিকার হলে ১০৯ ও ১৬৬৯৯ নম্বরে তাৎক্ষণিক বিনামূল্যে সহায়তা পান।</span>
            </div>
          </div>
        </div>
      </div>

      {currentView === "home" ? (
        <main className="flex-1">
          {/* 4. Special Accessibility Banner for Illiterate & Non-Technical Callers */}
          <div className="portal-wrap pt-5">
            <div className="voice-hero-callout p-6 rounded bg-emerald-900 text-white border border-emerald-800 shadow-md flex flex-col md:flex-row items-center justify-between gap-6">
               <div className="flex items-start gap-4 min-w-0">

                <div className="w-16 h-16 rounded bg-white text-emerald-900 flex items-center justify-center shrink-0 border-2 border-emerald-700">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>
                </div>
                <div>
                  <div className="inline-flex items-center gap-2 bg-emerald-800 px-3 py-1 rounded text-xs font-bold mb-2 uppercase tracking-wider text-emerald-100">
                    <span>ভয়েস-অ্যাসিস্টেড আইনি সহায়তা</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight">
                    পড়তে বা লিখতে সমস্যা? বিনামূল্যে আইনি সহায়তার জন্য মুখে বলুন
                  </h2>
                  <p className="text-sm text-emerald-100 mt-2 max-w-xl leading-relaxed">
                    কোনো ফর্ম পূরণ বা টাইপ করার প্রয়োজন নেই। নিচের বাটনে ক্লিক করে সরাসরি <strong>বাংলায় কথা বলুন</strong>। কৃত্রিম বুদ্ধিমত্তা সম্পন্ন ভয়েস সিস্টেম আপনার অভিযোগ গ্রহণ করে যথাযথ আইনি সহায়তা প্রদান করবে।
                  </p>
                  <div className="flex flex-wrap items-center gap-3 mt-4 text-xs text-emerald-100 font-semibold">
                    <span className="flex items-center gap-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg> সরাসরি মুখে বলুন</span>
                    <span>|</span>
                    <span className="flex items-center gap-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg> সম্পূর্ণ সরকারি খরচে</span>
                    <span>|</span>
                    <span className="flex items-center gap-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg> সহজে ব্যবহারযোগ্য</span>
                  </div>
                </div>
              </div>

              <div className="shrink-0 flex flex-col items-center gap-2 w-full md:w-auto">
                <button
                  onClick={onOpenSoftphone}
                  className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 font-bold rounded shadow flex items-center justify-center gap-2 w-full md:w-auto transition"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  <span>১৬৬৯৯-এ কল করুন</span>
                </button>
                <span className="text-[11px] text-emerald-300 font-mono">
                  কোনো মোবাইল ব্যালেন্স বা ইন্টারনেট ডেটা খরচ হবে না
                </span>
              </div>
            </div>
          </div>

          {/* 5. Hero Section */}
          <section className="portal-hero mt-3">
            <div className="portal-wrap">
              <div>
                <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight">
                  ন্যায়বিচারের পথে,<br />আমরা আছি আপনার<br />পাশে, এক ঠিকানায়
                </h1>
                <p className="text-sm sm:text-base text-slate-200 mt-3 max-w-lg leading-relaxed">
                  আইনি পরামর্শ, আইনি সহায়তার জন্য আবেদন, মধ্যস্থতা এবং মামলার অগ্রগতি—সবকিছু সহজেই পান এক প্ল্যাটফর্মে।
                </p>
                <div className="ctas flex flex-wrap items-center gap-3 mt-5">
                  <button
                    onClick={onOpenSoftphone}
                    className="px-6 py-3 bg-white text-emerald-900 font-bold text-base rounded shadow flex items-center gap-2 transition cursor-pointer hover:bg-slate-100"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    <span>১৬৬৯৯-এ কল করুন</span>
                  </button>
                  <button
                    onClick={() => setCurrentView("apply")}
                    className="px-6 py-3 bg-transparent hover:bg-white/10 text-white font-semibold text-base rounded border-2 border-white transition cursor-pointer"
                  >
                    অনলাইনে আবেদন ফর্ম →
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* 6. Quick Services Grid */}
          <section className="portal-quick portal-wrap">
             <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5">

              {/* Voice Card */}
              <div
                onClick={onOpenSoftphone}
                className="qcard voice-card cursor-pointer group bg-white border border-emerald-200 rounded p-4 text-center hover:shadow-md transition"
              >
                <div className="ic mb-2 flex justify-center text-emerald-700">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                </div>
                <b className="text-emerald-900 block font-bold mb-1">ভয়েস কল ১৬৬৯৯</b>
                <span className="text-slate-600 text-xs">মুখে বলে আইনি পরামর্শ ও তাৎক্ষণিক অভিযোগ</span>
              </div>

              {/* Service 1 */}
              <div
                onClick={() => setCurrentView("apply")}
                className="qcard cursor-pointer group bg-white border border-slate-200 rounded p-4 text-center hover:shadow-md transition"
              >
                <div className="ic mb-2 flex justify-center text-slate-500">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                </div>
                <b className="text-slate-800 block font-bold mb-1">সহায়তার আবেদন</b>
                <span className="text-slate-600 text-xs">ফোন নম্বর ও NID দিয়ে অনলাইনে আবেদন</span>
              </div>

              {/* Service 2 */}
              <a href="#mediation" className="qcard group bg-white border border-slate-200 rounded p-4 text-center hover:shadow-md transition">
                <div className="ic mb-2 flex justify-center text-slate-500">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
                <b className="text-slate-800 block font-bold mb-1">মধ্যস্থতা (ADR)</b>
                <span className="text-slate-600 text-xs">আদালতের বাইরে বিরোধের দ্রুত সমাধান</span>
              </a>

              {/* Service 3 */}
              <a href="#lawyers" className="qcard group bg-white border border-slate-200 rounded p-4 text-center hover:shadow-md transition">
                <div className="ic mb-2 flex justify-center text-slate-500">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
                </div>
                <b className="text-slate-800 block font-bold mb-1">প্যানেল আইনজীবী</b>
                <span className="text-slate-600 text-xs">সরকারি খরচে ৬৪ জেলার আইনজীবী খুঁজুন</span>
              </a>

              {/* Service 4: Emergency */}
              <div
                onClick={() => setIsSosOpen(true)}
                 className="qcard em cursor-pointer group col-span-2 xl:col-span-1 bg-rose-50 border border-rose-200 rounded p-4 text-center hover:shadow-md transition"

              >
                <div className="ic mb-2 flex justify-center text-rose-600">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <b className="text-rose-800 block font-bold mb-1">জরুরি সহায়তা</b>
                <span className="text-rose-600 text-xs">বিপদে থাকলে এখনই এক ট্যাপে কল করুন</span>
              </div>
            </div>
          </section>

          {/* 7. Emergency Section (999, 109, 1098, 16699) */}
          <section className="portal-block emg mt-16" id="emergency">
            <div className="portal-wrap">
              <div className="max-w-xl">
                <span className="text-rose-700 font-bold text-xs uppercase tracking-wider block mb-1">
                  জরুরি সহায়তা (24/7 Helpline)
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight">
                  বিপদে আছেন? অপেক্ষা করবেন না।
                </h2>
                <p className="text-slate-600 text-sm mt-2">
                  নিচের যেকোনো নম্বরে একবার ট্যাপ করলেই সরাসরি সংযোগ হবে। কোনো টাকা কাটবে না।
                </p>

                <div className="calls mt-5">
                  <div
                    onClick={onOpenSoftphone}
                    className="call-btn hot-16699 cursor-pointer"
                  >
                    <span className="num">১৬৬৯৯</span>
                    <div>
                      <b className="text-emerald-900 block text-sm">আইনি সহায়তা হেল্পলাইন</b>
                      <small className="text-slate-500 text-xs">ভয়েস এজেন্ট • বিনামূল্যে আইনজীবী</small>
                    </div>
                  </div>

                  <a href="tel:999" className="call-btn">
                    <span className="num">৯৯৯</span>
                    <div>
                      <b className="text-rose-900 block text-sm">জাতীয় জরুরি সেবা</b>
                      <small className="text-slate-500 text-xs">পুলিশ, ফায়ার সার্ভিস, অ্যাম্বুলেন্স</small>
                    </div>
                  </a>

                  <a href="tel:109" className="call-btn">
                    <span className="num">১০৯</span>
                    <div>
                      <b className="text-rose-900 block text-sm">নারী ও শিশু নির্যাতন</b>
                      <small className="text-slate-500 text-xs">নির্যাতন প্রতিরোধ হেল্পলাইন</small>
                    </div>
                  </a>

                  <a href="tel:1098" className="call-btn">
                    <span className="num">১০৯৮</span>
                    <div>
                      <b className="text-rose-900 block text-sm">চাইল্ড হেল্পলাইন</b>
                      <small className="text-slate-500 text-xs">শিশুর জরুরি নিরাপত্তা</small>
                    </div>
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* 8. Mediation (ADR) Section */}
          <section className="portal-block bg-white" id="mediation">
            <div className="portal-wrap grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-6">
                <span className="text-emerald-800 font-bold text-xs uppercase tracking-wider block mb-1">
                  মধ্যস্থতা (ADR)
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                  মামলা না করেই বিরোধ মেটান
                </h2>
                <p className="text-slate-600 text-sm mt-2 leading-relaxed">
                  পারিবারিক, জমিজমা, দেনা-পাওনা বা শ্রম বিরোধ একজন নিরপেক্ষ সরকারি মধ্যস্থতাকারীর সাহায্যে বন্ধুত্বপূর্ণ আলোচনার মাধ্যমে সমাধান করুন।
                </p>

                 <div className="grid grid-cols-1 min-[480px]:grid-cols-3 gap-3 my-6">

                  <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-center">
                    <b className="text-emerald-900 block text-sm">১০০% বিনামূল্যে</b>
                    <span className="text-[11px] text-slate-500">কোনো ফি লাগে না</span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-center">
                    <b className="text-emerald-900 block text-sm">দ্রুত নিষ্পত্তি</b>
                    <span className="text-[11px] text-slate-500">কয়েক সপ্তাহে সমাধান</span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-center">
                    <b className="text-emerald-900 block text-sm">সম্পূর্ণ গোপনীয়</b>
                    <span className="text-[11px] text-slate-500">তথ্য বাইরে যায় না</span>
                  </div>
                </div>

                <div className="space-y-2 text-xs text-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-200 text-emerald-900 font-bold flex items-center justify-center text-[10px]">১</span>
                    <span>অনুরোধ পাঠান বা ১৬৬৯৯-এ কল করুন</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-200 text-emerald-900 font-bold flex items-center justify-center text-[10px]">২</span>
                    <span>লিগ্যাল এইড অফিস দুই পক্ষকে নোটিশ পাঠাবে</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-200 text-emerald-900 font-bold flex items-center justify-center text-[10px]">৩</span>
                    <span>সশরীরে বা ভিডিও কলে আলোচনার মাধ্যমে সমাধান হবে</span>
                  </div>
                </div>
              </div>

              {/* Mediation Booking Form */}
              <div className="lg:col-span-6 bg-slate-50 p-6 rounded-3xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-base text-slate-900 mb-1">
                  মধ্যস্থতা সেশন বুক করুন
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  ২৪ ঘণ্টার মধ্যে SMS-এর মাধ্যমে সময় নিশ্চিত করা হবে।
                </p>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!medName || !medPhone) {
                      showToast("অনুগ্রহ করে আপনার নাম ও মোবাইল নম্বর দিন।");
                      return;
                    }
                    showToast("অনুরোধ সফলভাবে জমা হয়েছে! ২৪ ঘণ্টার মধ্যে নিশ্চিতকরণ SMS পাবেন।");
                    setMedName("");
                    setMedPhone("");
                  }}
                  className="space-y-3 text-xs"
                >
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">আপনার নাম *</label>
                    <input
                      value={medName}
                      onChange={(e) => setMedName(e.target.value)}
                      placeholder="যেমন: রহিমা বেগম"
                      className="w-full p-2.5 rounded-xl border border-slate-300 bg-white text-slate-900"
                      required
                    />
                  </div>

                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">মোবাইল নম্বর *</label>
                      <input
                        value={medPhone}
                        onChange={(e) => setMedPhone(e.target.value)}
                        placeholder="০১XXXXXXXXX"
                        className="w-full p-2.5 rounded-xl border border-slate-300 bg-white text-slate-900"
                        required
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">জেলা</label>
                      <select
                        value={medDist}
                        onChange={(e) => setMedDist(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-slate-300 bg-white text-slate-900"
                      >
                        <option>ঢাকা</option>
                        <option>চট্টগ্রাম</option>
                        <option>রাজশাহী</option>
                        <option>খুলনা</option>
                        <option>সিলেট</option>
                        <option>বরিশাল</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">বিরোধের ধরন</label>
                    <select
                      value={medType}
                      onChange={(e) => setMedType(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 bg-white text-slate-900"
                    >
                      <option>পারিবারিক / দেনমোহর / ভরণপোষণ</option>
                      <option>জমিজমা ও সীমানা সংক্রান্ত</option>
                      <option>দেনা-পাওনা ও ব্যবসায়িক বিরোধ</option>
                      <option>শ্রম ও মজুরি বিরোধ</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs sm:text-sm transition cursor-pointer mt-2"
                  >
                    সেশনের অনুরোধ পাঠান
                  </button>
                </form>
              </div>
            </div>
          </section>

          {/* 9. 64-District Panel Lawyers Section */}
          <section className="portal-block bg-slate-50" id="lawyers">
            <div className="portal-wrap">
              <span className="text-emerald-800 font-bold text-xs uppercase tracking-wider block mb-1">
                প্যানেল আইনজীবী
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                আপনার জেলায় সরকারি প্যানেল আইনজীবী খুঁজুন
              </h2>
              <p className="text-slate-600 text-sm mt-1">
                যোগ্য আবেদনকারীর জন্য আইনজীবীর ফি ও যাবতীয় খরচ সরকার বহন করে।
              </p>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3 mt-6">
                <input
                  type="text"
                  placeholder="নাম দিয়ে খুঁজুন..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                   className="p-2.5 rounded-xl border border-slate-300 bg-white text-xs w-full sm:w-60"

                />

                <select
                  value={selectedDistrict}
                  onChange={(e) => setSelectedDistrict(e.target.value)}
                   className="p-2.5 rounded-xl border border-slate-300 bg-white text-xs w-full sm:w-auto"

                >
                  <option value="">সব জেলা</option>
                  <option value="ঢাকা">ঢাকা</option>
                  <option value="চট্টগ্রাম">চট্টগ্রাম</option>
                  <option value="রাজশাহী">রাজশাহী</option>
                  <option value="খুলনা">খুলনা</option>
                  <option value="সিলেট">সিলেট</option>
                  <option value="বরিশাল">বরিশাল</option>
                </select>

                <div className="flex flex-wrap gap-1.5">
                  {["", "পারিবারিক", "ভূমি", "নারী ও শিশু", "ফৌজদারি", "শ্রম", "দেওয়ানি"].map((c) => (
                    <button
                      key={c}
                      onClick={() => setSelectedCategory(c)}
                      className={`chip text-xs ${selectedCategory === c ? "on" : ""}`}
                    >
                      {c || "সব বিষয়"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lawyers Grid */}
              <div className="lgrid mt-6">
                {filteredLawyers.map((lawyer, idx) => (
                  <div key={idx} className="lcard">
                    <div className="lhead flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-sm"
                        style={{ backgroundColor: lawyer.col }}
                      >
                        {lawyer.n[5] || "আই"}
                      </div>
                       <div className="min-w-0">
                         <b className="text-slate-900 block text-sm">{lawyer.n}</b>

                        <small className="text-slate-500 text-xs">
                          প্যানেল আইনজীবী • {lawyer.d}
                        </small>
                      </div>
                    </div>

                    <div className="text-xs space-y-1 text-slate-600">
                      <div>বিষয়: <span className="font-semibold text-emerald-800">{lawyer.c}</span></div>
                      <div>অভিজ্ঞতা: <strong>{bnNum(lawyer.y)} বছর</strong></div>
                      <div>ভাষা: {lawyer.l}</div>
                    </div>

                     <div className="flex flex-col items-start gap-2 pt-2 border-t border-slate-100 sm:flex-row sm:items-center sm:justify-between">

                      <span className="text-[11px] text-emerald-700 font-semibold">
                        {lawyer.a ? "✓ এই সপ্তাহে পরামর্শ দিতে পারবেন" : "পরবর্তী সপ্তাহে সময় আছে"}
                      </span>
                      <button
                        onClick={() => showToast(`${lawyer.n}-এর সাথে যোগাযোগের জন্য ১৬৬৯৯-এ কল করুন।`)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-800 text-xs font-semibold rounded-lg border border-slate-200 transition cursor-pointer"
                      >
                        পরামর্শের অনুরোধ
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
      ) : (
        /* 10. Application Wizard View (5-Step Form) */
         <main className="apply-view portal-wrap py-6 sm:py-10 flex-1">

           <div className="flex flex-col items-start gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">

            <div>
              <button
                onClick={() => setCurrentView("home")}
                className="text-xs font-semibold text-emerald-700 mb-2 inline-flex items-center gap-1 hover:underline"
              >
                ← হোম পেজে ফিরে যান
              </button>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                আইনি সহায়তার অনলাইন আবেদন
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                পাঁচটি ধাপে আবেদন সম্পন্ন করুন অথবা ১৬৬৯৯-এ কল করে মুখে বলুন।
              </p>
            </div>

            <button
              onClick={onOpenSoftphone}
               className="w-full px-4 py-3 bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm sm:w-auto"

            >
              <span>📞</span>
              <span>টাইপ না করে মুখে বলুন</span>
            </button>
          </div>

           <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-8 shadow-sm max-w-3xl mx-auto space-y-6">

            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
              💡 <strong>পরামর্শ:</strong> আপনি যদি নিজে লিখতে বা পড়তে না পারেন, তাহলে সরাসরি আমাদের হেল্পলাইনে কল করুন। কোনো ফর্ম পূরণের প্রয়োজন নেই।
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-800 block mb-1">১. আপনার পূর্ণ নাম *</label>
                <input placeholder="যেমন: ফাতেমা বেগম" className="w-full p-3 rounded-xl border border-slate-300" />
              </div>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                <div>
                  <label className="font-semibold text-slate-800 block mb-1">২. মোবাইল নম্বর *</label>
                  <input placeholder="০১XXXXXXXXX" className="w-full p-3 rounded-xl border border-slate-300" />
                </div>
                <div>
                  <label className="font-semibold text-slate-800 block mb-1">৩. জেলা *</label>
                  <select className="w-full p-3 rounded-xl border border-slate-300">
                    <option>ঢাকা</option>
                    <option>চট্টগ্রাম</option>
                    <option>রাজশাহী</option>
                    <option>খুলনা</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-800 block mb-1">৪. আইনি সমস্যার বিবরণ *</label>
                <textarea rows={4} placeholder="কী ঘটেছে এবং আপনি কী সহায়তা চান..." className="w-full p-3 rounded-xl border border-slate-300" />
              </div>

               <div className="pt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">

                <button
                  type="button"
                  onClick={() => setCurrentView("home")}
                   className="w-full px-4 py-2 border border-slate-300 rounded-xl font-semibold sm:w-auto"

                >
                  বাতিল করুন
                </button>
                <button
                  type="button"
                  onClick={() => {
                    showToast("আপনার আবেদনটি গ্রহণ করা হয়েছে (ডেমো)। আপনার টোকেন DLAS-2025-0992।");
                    setCurrentView("home");
                  }}
                   className="w-full px-6 py-3 bg-emerald-700 text-white rounded-xl font-bold sm:w-auto"

                >
                  আবেদন জমা দিন →
                </button>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* 11. Government Footer */}
      <footer className="bg-slate-900 text-slate-300 pt-12 pb-8 border-t border-slate-800 text-xs">
        <div className="portal-wrap grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <img src="/assets/logo/logo-mark-white.png" alt="Bangladesh Govt" className="h-8 w-auto" />
              <div className="font-bold text-sm text-white">Bangladesh Legal Portal</div>
            </div>
            <p className="text-slate-400 leading-relaxed">
              আইন, অধিকার ও ন্যায়বিচার — সবার জন্য, এক ঠিকানায়। গণপ্রজাতন্ত্রী বাংলাদেশ সরকার।
            </p>
          </div>

          <div>
            <h5 className="font-bold text-white mb-2.5">নাগরিক সেবা</h5>
            <ul className="space-y-1.5 text-slate-400">
              <li><button onClick={onOpenSoftphone} className="hover:text-white">১৬৬৯৯ ভয়েস হেল্পলাইন</button></li>
              <li><button onClick={() => setCurrentView("apply")} className="hover:text-white">অনলাইন আবেদন</button></li>
              <li><a href="#mediation" className="hover:text-white">মধ্যস্থতা (ADR)</a></li>
              <li><a href="#lawyers" className="hover:text-white">প্যানেল আইনজীবী</a></li>
            </ul>
          </div>

          <div>
            <h5 className="font-bold text-white mb-2.5">জরুরি হটলাইন</h5>
            <ul className="space-y-1.5 text-slate-400">
              <li>১৬৬৯৯ — আইনি সহায়তা</li>
              <li>৯৯৯ — জাতীয় জরুরি সেবা</li>
              <li>১০৯ — নারী ও শিশু নির্যাতন</li>
              <li>১০৯৮ — চাইল্ড হেল্পলাইন</li>
            </ul>
          </div>

          <div>
            <h5 className="font-bold text-white mb-2.5">যোগাযোগ ও দপ্তর</h5>
            <p className="text-slate-400 leading-relaxed">
              জাতীয় আইনগত সহায়তা প্রদান সংস্থা (NLASO)<br />
              আইন ও বিচার বিভাগ, বাংলাদেশ সুপ্রিম কোর্ট প্রাঙ্গণ, ঢাকা।
            </p>
          </div>
        </div>

        <div className="portal-wrap pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between text-slate-500 text-[11px] gap-2">
          <span>© ২০২৬ Bangladesh Legal Portal • গণপ্রজাতন্ত্রী বাংলাদেশ সরকার</span>
          <span>সর্বস্বত্ব সংরক্ষিত • NLASO Telephony Voice Agent</span>
        </div>
      </footer>

       {/* 12. Floating SOS & Direct Call Button */}
       {!isCallActive && (
         <div className="floating-call-cta">
           <button
             onClick={onOpenSoftphone}
             className="floating-call-btn"
             aria-label="১৬৬৯৯ কল করুন"
           >
             <span className="text-xl">📞</span>
             <span>১৬৬৯৯ কল করুন</span>
           </button>
         </div>
       )}


      {/* SOS Modal */}
      {isSosOpen && (
        <div
           className="sos-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"

          onClick={() => setIsSosOpen(false)}
        >
          <div
             className="sos-dialog bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 space-y-4"

            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-rose-700 flex items-center gap-1.5">
                <span>🚨</span>
                <span>জরুরি সহায়তা নম্বরসমূহ</span>
              </h3>
               <button onClick={() => setIsSosOpen(false)} className="sos-close text-slate-400 hover:text-slate-700 font-bold">

                ✕
              </button>
            </div>
            <p className="text-xs text-slate-600">
              একবার ট্যাপ করলেই সরাসরি সংযোগ হবে। সব নম্বর বিনামূল্যে।
            </p>

            <div className="space-y-2">
              <div
                onClick={() => {
                  setIsSosOpen(false);
                  onOpenSoftphone();
                }}
                className="call-btn hot-16699 cursor-pointer"
              >
                <span className="num">১৬৬৯৯</span>
                <div>
                  <b className="text-emerald-900 block text-xs">আইনি সহায়তা হেল্পলাইন</b>
                  <small className="text-slate-500 text-[10px]">ভয়েস সহকারী • বিনামূল্যে সেবা</small>
                </div>
              </div>

              <a href="tel:999" className="call-btn">
                <span className="num">৯৯৯</span>
                <div>
                  <b className="text-rose-900 block text-xs">জাতীয় জরুরি সেবা</b>
                  <small className="text-slate-500 text-[10px]">পুলিশ, অ্যাম্বুলেন্স, ফায়ার</small>
                </div>
              </a>

              <a href="tel:109" className="call-btn">
                <span className="num">১০৯</span>
                <div>
                  <b className="text-rose-900 block text-xs">নারী ও শিশু নির্যাতন</b>
                  <small className="text-slate-500 text-[10px]">প্রতিরোধ ও পুনর্বাসন</small>
                </div>
              </a>
            </div>

            <button
              onClick={() => {
                window.location.replace("https://www.google.com");
              }}
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs transition"
            >
              দ্রুত পেজ বন্ধ করুন (Quick Exit)
            </button>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMsg && (
         <div className="fixed bottom-4 left-4 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl border border-slate-700 text-xs flex items-center gap-2 animate-bounce sm:left-6 sm:right-auto sm:w-auto">

          <span>🔔</span>
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
