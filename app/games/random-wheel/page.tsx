import { getTranslations } from 'next-intl/server'
import RandomWheelClient from './RandomWheelClient'

export async function generateMetadata() {
  const t = await getTranslations('games.random_wheel')
  return { title: `${t('title')}` }
}

export default function RandomWheelPage() {
  return <RandomWheelClient />
}
