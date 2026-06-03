import { permanentRedirect } from 'next/navigation'

// Route đã đổi sang /privacy-policy — redirect vĩnh viễn (308)
export default function ChinhSach() {
  permanentRedirect('/privacy-policy')
}
