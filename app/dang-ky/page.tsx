import Link from 'next/link'
import { signUp } from '@/app/auth/actions'
import SocialLoginButtons from '@/components/SocialLoginButtons'

export const metadata = { title: 'Đăng ký · Chợ Cóc FKO' }

export default function DangKy({
  searchParams,
}: {
  searchParams: { error?: string; success?: string }
}) {
  if (searchParams.success) {
    return (
      <section className="min-h-[calc(100vh-160px)] flex items-center justify-center py-12">
        <div className="w-full max-w-[440px] mx-auto px-7 text-center">
          <div className="text-5xl mb-5">📬</div>
          <h1 className="font-serif font-black text-[28px] mb-3">
            Kiểm tra email của bạn!
          </h1>
          <p className="text-muted text-[15px] mb-6">
            Chúng mình đã gửi link xác nhận. Bấm vào link trong email để hoàn
            tất đăng ký và đăng nhập.
          </p>
          <Link
            href="/dang-nhap"
            className="inline-block font-semibold text-[14px] px-6 py-3 rounded-full bg-rose text-white hover:bg-rose-deep transition-all"
          >
            Về trang đăng nhập
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="min-h-[calc(100vh-160px)] flex items-center justify-center py-12">
      <div className="w-full max-w-[440px] mx-auto px-7">
        <div className="text-center mb-8">
          <h1 className="font-serif font-black text-[clamp(28px,4vw,38px)] tracking-[-0.5px] mb-2">
            Tạo tài khoản
          </h1>
          <p className="text-muted text-[15px]">
            Tham gia cộng đồng người Việt tại Fukuoka.
          </p>
        </div>

        {searchParams.error && (
          <div className="bg-[#fff4f6] border border-[#f3cdd9] rounded-xl p-3.5 text-[13.5px] text-rose-deep mb-5">
            {decodeURIComponent(searchParams.error)}
          </div>
        )}

        <form action={signUp} className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
              Tên hiển thị
            </label>
            <input
              type="text"
              name="display_name"
              required
              placeholder="VD: Nguyễn Văn A"
              className="w-full text-[14.5px] px-3.5 py-3 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose"
            />
          </div>
          <div>
            <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
              Email
            </label>
            <input
              type="email"
              name="email"
              required
              placeholder="ban@example.com"
              className="w-full text-[14.5px] px-3.5 py-3 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose"
            />
          </div>
          <div>
            <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
              Mật khẩu
            </label>
            <input
              type="password"
              name="password"
              required
              minLength={6}
              placeholder="Ít nhất 6 ký tự"
              className="w-full text-[14.5px] px-3.5 py-3 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose"
            />
          </div>
          <button
            type="submit"
            className="w-full font-semibold text-[15px] py-3.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all mt-2"
          >
            Đăng ký
          </button>
        </form>

        <SocialLoginButtons label="Hoặc đăng ký với" />

        <p className="text-center text-[14px] text-muted mt-6">
          Đã có tài khoản?{' '}
          <Link href="/dang-nhap" className="text-rose font-semibold hover:underline">
            Đăng nhập
          </Link>
        </p>
      </div>
    </section>
  )
}
