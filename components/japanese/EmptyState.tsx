interface EmptyStateProps {
  emoji?: string
  text: string
}

export default function EmptyState({ emoji = '📭', text }: EmptyStateProps) {
  return (
    <div className="text-center py-16">
      <div className="text-[40px] mb-3" aria-hidden>{emoji}</div>
      <p className="text-[15px] text-muted">{text}</p>
    </div>
  )
}
