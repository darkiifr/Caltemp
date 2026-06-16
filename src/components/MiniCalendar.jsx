import React from 'react';
import { CalendarDays } from 'lucide-react';
import { getOccurrencesOnDate } from '../domain/events';

export default function MiniCalendar({ events = [], settings = {} }) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return {
      date,
      events: getOccurrencesOnDate(events, date),
    };
  });
  const totalEvents = days.reduce((sum, day) => sum + day.events.length, 0);

  return (
    <main className="h-screen w-screen overflow-hidden bg-[#101010] text-slate-50">
      <div data-tauri-drag-region className="h-full p-3">
        <header className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex min-w-0 items-center gap-2">
            <CalendarDays size={16} className="shrink-0 text-sky-300" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">Caltemp mini</div>
              <div className="truncate text-[11px] text-white/40">
                {today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
            </div>
          </div>
          <span className="rounded-full bg-white/[0.08] px-2 py-1 text-[11px] font-medium text-white/55">
            {totalEvents}
          </span>
        </header>

        <div className="mt-3 grid gap-1.5">
          {days.map(day => (
            <section key={day.date.toISOString()} className="grid grid-cols-[48px_minmax(0,1fr)_24px] items-start gap-2 border-b border-white/[0.06] py-2 last:border-b-0">
              <div>
                <div className="text-[11px] font-semibold uppercase text-white/65">
                  {day.date.toLocaleDateString('fr-FR', { weekday: 'short' })}
                </div>
                <div className="text-lg font-semibold leading-none text-white">
                  {day.date.getDate()}
                </div>
              </div>

              <div className="min-w-0 space-y-1">
                {day.events.length === 0 ? (
                  <div className="pt-1 text-[11px] text-white/25">Libre</div>
                ) : day.events.slice(0, 2).map(event => (
                  <div key={`${event.id}-${event.date}`} className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: event.color || settings.categoryLegend?.[event.category]?.color || '#93c5fd' }}
                    />
                    <span className="truncate text-[11px] text-white/80">
                      {event.title}
                    </span>
                  </div>
                ))}
                {day.events.length > 2 && (
                  <div className="text-[10px] text-white/35">+{day.events.length - 2} autre(s)</div>
                )}
              </div>

              <div className="pt-0.5 text-right text-[10px] text-white/35">
                {day.events.length || ''}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
