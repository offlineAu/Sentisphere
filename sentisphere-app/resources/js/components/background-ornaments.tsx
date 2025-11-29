import React from "react";
import {
  CalendarDays,
  BookOpen,
  Heart,
  PartyPopper,
  Bell,
  Smile,
  MapPin,
  Ticket,
  GraduationCap,
  MessageCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const items = [
  { Icon: CalendarDays, top: "7%", left: "8%", color: "text-emerald-600" },
  { Icon: BookOpen, top: "16%", left: "34%", color: "text-sky-600" },
  { Icon: Ticket, top: "30%", left: "10%", color: "text-indigo-600" },
  { Icon: MapPin, top: "18%", right: "9%", color: "text-amber-600" },
  { Icon: Heart, top: "38%", left: "46%", color: "text-rose-600" },
  { Icon: Smile, top: "58%", left: "14%", color: "text-emerald-600" },
  { Icon: PartyPopper, top: "54%", right: "12%", color: "text-fuchsia-600" },
  { Icon: Bell, bottom: "12%", right: "8%", color: "text-emerald-600" },
  { Icon: GraduationCap, top: "26%", right: "30%", color: "text-emerald-700" },
  { Icon: MessageCircle, bottom: "22%", left: "20%", color: "text-sky-600" },
  { Icon: ShieldCheck, bottom: "18%", left: "46%", color: "text-emerald-700" },
  { Icon: Sparkles, bottom: "28%", right: "30%", color: "text-amber-600" },
];

export default function BackgroundOrnaments() {
  return (
    <div aria-hidden className="pointer-events-none select-none absolute inset-0 -z-10 overflow-hidden">
      <style>{`
        @keyframes floatSlow { 0%,100%{ transform: translateY(0) } 50%{ transform: translateY(-6px) } }
        @keyframes floatFast { 0%,100%{ transform: translateY(0) } 50%{ transform: translateY(-10px) } }
        .animate-float-slow { animation: floatSlow 8s ease-in-out infinite; }
        .animate-float-fast { animation: floatFast 6s ease-in-out infinite; }
      `}</style>
      <div className="absolute inset-0">
        {items.map((it, i) => (
          <div
            key={i}
            className={`absolute animate-float-${i % 2 ? "fast" : "slow"}`}
            style={{ top: it.top as any, left: it.left as any, right: it.right as any, bottom: it.bottom as any }}
          >
            <div className="rounded-full bg-white/98 shadow-[0_8px_28px_rgba(16,24,40,0.10)] ring-1 ring-border size-14 flex items-center justify-center">
              <it.Icon className={`size-6 ${it.color}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
