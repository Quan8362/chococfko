import { getTranslations } from 'next-intl/server'
import Game2048 from './Game2048'

export async function generateMetadata() {
  const t = await getTranslations('games.game2048')
  return { title: `${t('title')} · Mini Game · Chợ Cóc FKO` }
}

export default function Page2048() {
  return (
    <div className="min-h-[calc(100vh-160px)] bg-cream">
      <Game2048 />
    </div>
  )
}
