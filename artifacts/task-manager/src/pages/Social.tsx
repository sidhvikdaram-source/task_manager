import React, { useState } from 'react';
import { Activity, Search, UserPlus, Users } from 'lucide-react';

export default function Social() {
  const [section, setSection] = useState<'friends' | 'activity'>('friends');
  const [query, setQuery] = useState('');
  return <div className="space-y-5">
    <section className="bento-card p-5 sm:p-6"><div className="flex items-center gap-2 text-xs font-black uppercase text-primary"><Users className="h-4 w-4" /> Social</div><h1 className="tech-title mt-2 text-3xl sm:text-5xl">Your circle</h1><p className="mt-2 max-w-xl text-sm text-muted-foreground">Connect around progress without exposing private task data.</p></section>
    <section className="bento-card overflow-hidden"><div className="flex gap-2 border-b border-border p-3"><button onClick={() => setSection('friends')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${section === 'friends' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}><Users className="h-4 w-4" />Friends</button><button onClick={() => setSection('activity')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${section === 'activity' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}><Activity className="h-4 w-4" />Activity</button></div>
      {section === 'friends' ? <div className="p-5"><label className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by username, display name, or friend code" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label><div className="mt-5 rounded-xl border border-dashed border-border p-8 text-center"><UserPlus className="mx-auto h-7 w-7 text-primary" /><p className="mt-3 font-bold">Friend connections are private by design</p><p className="mt-1 text-sm text-muted-foreground">Search, requests, invite links, blocking, reporting, and mutual-friend visibility are being connected to the server-side social graph.</p></div></div> : <div className="p-10 text-center"><Activity className="mx-auto h-7 w-7 text-primary" /><p className="mt-3 font-bold">Friends-only activity</p><p className="mt-1 text-sm text-muted-foreground">Milestones, streaks, focus goals, and weekly challenges will appear here once you connect with friends.</p></div>}
    </section>
  </div>;
}
