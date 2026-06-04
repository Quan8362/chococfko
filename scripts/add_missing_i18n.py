import json

# New keys to add per language
ADDITIONS = {
  "vi": {
    "auth": {
      "provider_disabled": "{provider} chưa được kích hoạt. Vui lòng dùng đăng nhập bằng email.",
      "auth_error": "Lỗi: {message}",
      "email_placeholder": "ban@example.com",
      "display_name_placeholder": "VD: Nguyễn Văn A"
    },
    "confessions": {
      "leaveComment": "Để lại bình luận",
      "loginAnonHint": "Bạn có thể bình luận ẩn danh sau khi đăng nhập.",
      "editor": {
        "gifSearch": "Tìm GIF…",
        "gifNotFound": "Không tìm thấy GIF",
        "gifNoKey": "Thêm NEXT_PUBLIC_GIPHY_API_KEY vào .env.local để dùng GIF.",
        "gif": "Chèn GIF"
      }
    }
  },
  "en": {
    "auth": {
      "provider_disabled": "{provider} is not enabled. Please use email to sign in.",
      "auth_error": "Error: {message}",
      "email_placeholder": "you@example.com",
      "display_name_placeholder": "e.g. John Doe"
    },
    "confessions": {
      "leaveComment": "Leave a comment",
      "loginAnonHint": "You can comment anonymously after signing in.",
      "editor": {
        "gifSearch": "Search GIF…",
        "gifNotFound": "No GIFs found",
        "gifNoKey": "Add NEXT_PUBLIC_GIPHY_API_KEY to .env.local to use GIFs.",
        "gif": "Insert GIF"
      }
    }
  },
  "ja": {
    "auth": {
      "provider_disabled": "{provider}は有効になっていません。メールでログインしてください。",
      "auth_error": "エラー: {message}",
      "email_placeholder": "you@example.com",
      "display_name_placeholder": "例: 山田太郎"
    },
    "confessions": {
      "leaveComment": "コメントを残す",
      "loginAnonHint": "ログイン後、匿名でコメントできます。",
      "editor": {
        "gifSearch": "GIFを検索…",
        "gifNotFound": "GIFが見つかりません",
        "gifNoKey": ".env.localにNEXT_PUBLIC_GIPHY_API_KEYを追加してGIFを使用してください。",
        "gif": "GIFを挿入"
      }
    }
  },
  "ko": {
    "auth": {
      "provider_disabled": "{provider}이 활성화되어 있지 않습니다. 이메일로 로그인해주세요.",
      "auth_error": "오류: {message}",
      "email_placeholder": "you@example.com",
      "display_name_placeholder": "예: 홍길동"
    },
    "confessions": {
      "leaveComment": "댓글 남기기",
      "loginAnonHint": "로그인 후 익명으로 댓글을 달 수 있습니다.",
      "editor": {
        "gifSearch": "GIF 검색…",
        "gifNotFound": "GIF를 찾을 수 없습니다",
        "gifNoKey": ".env.local에 NEXT_PUBLIC_GIPHY_API_KEY를 추가하여 GIF를 사용하세요.",
        "gif": "GIF 삽입"
      }
    }
  },
  "zh": {
    "auth": {
      "provider_disabled": "{provider}未启用。请使用邮箱登录。",
      "auth_error": "错误: {message}",
      "email_placeholder": "you@example.com",
      "display_name_placeholder": "例如: 张三"
    },
    "confessions": {
      "leaveComment": "留下评论",
      "loginAnonHint": "登录后可以匿名评论。",
      "editor": {
        "gifSearch": "搜索GIF…",
        "gifNotFound": "未找到GIF",
        "gifNoKey": "在.env.local中添加NEXT_PUBLIC_GIPHY_API_KEY以使用GIF。",
        "gif": "插入GIF"
      }
    }
  }
}

def deep_merge(base, additions):
    """Merge additions into base dict recursively."""
    for key, value in additions.items():
        if key in base and isinstance(base[key], dict) and isinstance(value, dict):
            deep_merge(base[key], value)
        else:
            base[key] = value

for lang, adds in ADDITIONS.items():
    path = f"messages/{lang}.json"
    with open(path, encoding="utf-8") as f:
        content = json.load(f)
    deep_merge(content, adds)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(content, f, ensure_ascii=False, indent=2)
    print(f"Updated {lang}.json")

print("Done")
