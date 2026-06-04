interface Props {
  size?: number
  className?: string
}

export default function AnonAvatar({ size = 32, className = '' }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/anon-avatar.svg"
      alt="Anonymous"
      width={size}
      height={size}
      className={`rounded-full flex-none ${className}`}
      draggable={false}
    />
  )
}
