import Link from 'next/link'

// Renders a member's display name. When `userId` is provided (i.e. a real,
// non-anonymous account) the name links to that member's public profile.
// Anonymous authors pass no userId and render as plain, non-clickable text.
export default function AuthorLink({
  userId,
  name,
  className = '',
}: {
  userId?: string | null
  name: string
  className?: string
}) {
  if (!userId) return <span className={className}>{name}</span>
  return (
    <Link
      href={`/nguoi-dung/${userId}`}
      className={`${className} hover:text-rose transition-colors`}
    >
      {name}
    </Link>
  )
}
