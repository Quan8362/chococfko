import Link from 'next/link'

export const metadata = { title: 'Mini Game · Chợ Cóc FKO' }

const GAMES = [
  {
    href: '/games/caro',
    emoji: '⚫',
    title: 'Cờ Caro Online',
    desc: 'Chơi cờ caro realtime với bạn bè. Tạo phòng, chia link mời và đấu ngay!',
    tag: 'HOT',
    tagColor: 'bg-rose text-white',
    players: '2 người chơi',
  },
]

export default function GamesPage() {
  return (
    <div className="max-w-[900px] mx-auto px-5 sm:px-6 py-10 pb-20">

      {/* Header */}
      <div className="mb-10">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-full mb-4">
          🎮 Mini Game
        </span>
        <h1 className="font-serif font-bold text-[clamp(28px,4vw,42px)] leading-tight tracking-[-0.4px] text-ink mb-2">
          Góc vui — Chơi cùng cộng đồng
        </h1>
        <p className="text-[15px] text-muted leading-relaxed max-w-[520px]">
          Các trò chơi nhỏ để giải trí cùng bạn bè trong cộng đồng FKO.
        </p>
      </div>

      {/* Game grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {GAMES.map((game) => (
          <Link
            key={game.href}
            href={game.href}
            className="group bg-paper border border-line rounded-2xl p-5 hover:border-rose/30 hover:shadow-[0_4px_24px_-6px_rgba(194,24,91,0.15)] transition-all hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose/15 to-teal/10 flex items-center justify-center text-[24px]">
                {game.emoji}
              </div>
              <div className="flex gap-1.5">
                {game.tag && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${game.tagColor}`}>
                    {game.tag}
                  </span>
                )}
              </div>
            </div>
            <h2 className="font-serif font-bold text-[17px] text-ink mb-1.5 group-hover:text-rose transition-colors">
              {game.title}
            </h2>
            <p className="text-[13px] text-muted leading-relaxed mb-3">{game.desc}</p>
            <div className="flex items-center gap-1.5 text-[12px] text-muted/70">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {game.players}
            </div>
          </Link>
        ))}

        {/* Coming soon placeholder */}
        <div className="bg-cream/50 border border-dashed border-line rounded-2xl p-5 flex flex-col items-center justify-center text-center gap-2 min-h-[160px]">
          <span className="text-[28px]">🎲</span>
          <p className="text-[13px] text-muted/60 font-medium">Sắp có thêm trò chơi mới…</p>
        </div>
      </div>
    </div>
  )
}
