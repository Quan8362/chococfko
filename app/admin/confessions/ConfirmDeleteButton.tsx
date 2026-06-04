'use client'

interface Props {
  message: string
  label: string
  className?: string
}

export default function ConfirmDeleteButton({ message, label, className }: Props) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault()
      }}
      className={className}
    >
      {label}
    </button>
  )
}
