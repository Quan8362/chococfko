#!/usr/bin/env python3
# Inject Phase 7 i18n keys into all 5 locale files with full parity.
import json, os

LOCALES = ['vi', 'en', 'ja', 'ko', 'zh']
MSG_DIR = os.path.join(os.path.dirname(__file__), '..', 'messages')

# namespace -> key -> {locale: text}
TR = {
  'explore_home': {
    'intent_heading':   {'vi':'Hôm nay bạn muốn làm gì?','en':'What do you want to do today?','ja':'今日は何をしますか？','ko':'오늘 무엇을 하고 싶나요?','zh':'今天想做什么？'},
    'intent_sub':       {'vi':'Chọn nhanh theo nhu cầu','en':'Quick picks by what you need','ja':'目的からすぐ選ぶ','ko':'필요에 따라 빠르게 선택','zh':'按需求快速选择'},
    'intent_near_me':   {'vi':'Gần tôi','en':'Near me','ja':'近くで','ko':'내 주변','zh':'我附近'},
    'intent_open_now':  {'vi':'Đang mở cửa','en':'Open now','ja':'営業中','ko':'영업 중','zh':'正在营业'},
    'intent_eat_cheap': {'vi':'Ăn dưới ¥3.000','en':'Eat under ¥3,000','ja':'¥3,000以下で食事','ko':'¥3,000 이하 식사','zh':'¥3,000以下用餐'},
    'intent_free':      {'vi':'Địa điểm miễn phí','en':'Free places','ja':'無料スポット','ko':'무료 장소','zh':'免费场所'},
    'intent_rainy':     {'vi':'Hoạt động ngày mưa','en':'Rainy-day activities','ja':'雨の日でも','ko':'비 오는 날','zh':'雨天活动'},
    'intent_family':    {'vi':'Hợp gia đình','en':'Family-friendly','ja':'家族向け','ko':'가족 친화','zh':'适合家庭'},
    'intent_night':     {'vi':'Hoạt động buổi tối','en':'Night activities','ja':'夜の楽しみ','ko':'야간 활동','zh':'夜间活动'},
    'intent_reservable':{'vi':'Đặt chỗ được','en':'Reservable','ja':'予約可','ko':'예약 가능','zh':'可预约'},
    'intent_camping_bbq':{'vi':'Cắm trại & BBQ','en':'Camping & BBQ','ja':'キャンプ & BBQ','ko':'캠핑 & BBQ','zh':'露营和烧烤'},
    'intent_vietnamese':{'vi':'Quán người Việt','en':'Vietnamese places','ja':'ベトナム系のお店','ko':'베트남 장소','zh':'越南店家'},
    'collections_heading':{'vi':'Bộ sưu tập hữu ích','en':'Useful collections','ja':'便利なコレクション','ko':'유용한 모음','zh':'实用合集'},
    'events_heading':   {'vi':'Sự kiện sắp tới','en':'Upcoming events','ja':'近日のイベント','ko':'다가오는 이벤트','zh':'即将举行的活动'},
    'community_heading': {'vi':'Hoạt động cộng đồng','en':'Community activity','ja':'コミュニティの動き','ko':'커뮤니티 활동','zh':'社区动态'},
    'questions_heading':{'vi':'Câu hỏi cần giải đáp','en':'Questions needing answers','ja':'回答募集中の質問','ko':'답변이 필요한 질문','zh':'待解答的问题'},
    'popular_saved_heading':{'vi':'Được lưu nhiều','en':'Popular saved places','ja':'よく保存される場所','ko':'많이 저장된 장소','zh':'热门收藏地点'},
    'recently_updated_heading':{'vi':'Mới cập nhật thông tin','en':'Recently updated','ja':'最近更新された情報','ko':'최근 업데이트','zh':'最近更新'},
    'for_you_heading':  {'vi':'Dành cho bạn','en':'For you','ja':'あなたへ','ko':'추천','zh':'为你推荐'},
    'see_all':          {'vi':'Xem tất cả','en':'See all','ja':'すべて見る','ko':'전체 보기','zh':'查看全部'},
    'region_label':     {'vi':'Khu vực','en':'Area','ja':'エリア','ko':'지역','zh':'地区'},
    'region_all':       {'vi':'Mọi nơi','en':'Anywhere','ja':'すべて','ko':'전체','zh':'全部'},
    'personalize_on':   {'vi':'Cá nhân hoá: Bật','en':'Personalized: On','ja':'パーソナライズ: オン','ko':'개인화: 켜짐','zh':'个性化：开'},
    'personalize_off':  {'vi':'Cá nhân hoá: Tắt','en':'Personalized: Off','ja':'パーソナライズ: オフ','ko':'개인화: 꺼짐','zh':'个性化：关'},
    'why_link':         {'vi':'Vì sao tôi thấy mục này?','en':'Why am I seeing this?','ja':'なぜ表示される？','ko':'왜 보이나요?','zh':'为什么看到这些？'},
    'why_explainer':    {'vi':'Gợi ý dựa trên địa điểm bạn đã lưu, đã xem gần đây và khu vực bạn chọn — chỉ lưu trên thiết bị này, không lập hồ sơ. Bạn có thể tắt bất cứ lúc nào.','en':'Suggestions are based on places you saved, recently viewed, and your selected area — kept on this device only, no profiling. You can turn it off anytime.','ja':'保存・最近見た場所・選択エリアに基づく提案です。この端末内のみで、プロファイリングはしません。いつでもオフにできます。','ko':'저장·최근 본 장소·선택 지역을 기반으로 한 추천입니다. 이 기기에만 저장되며 프로파일링하지 않습니다. 언제든 끌 수 있습니다.','zh':'根据你收藏、最近浏览的地点和所选地区推荐——仅保存在本设备，不做画像。可随时关闭。'},
    'continue_plans':   {'vi':'Tiếp tục lịch trình','en':'Continue planning','ja':'計画を続ける','ko':'계획 계속하기','zh':'继续行程'},
    'continue_lists':   {'vi':'Danh sách của tôi','en':'My lists','ja':'マイリスト','ko':'내 목록','zh':'我的清单'},
    'saved_heading':    {'vi':'Địa điểm đã lưu','en':'Saved places','ja':'保存した場所','ko':'저장한 장소','zh':'已收藏地点'},
    'recent_heading':   {'vi':'Đã xem gần đây','en':'Recently viewed','ja':'最近見た場所','ko':'최근 본 장소','zh':'最近浏览'},
    'recommended_heading':{'vi':'Gợi ý cho bạn','en':'Recommended for you','ja':'おすすめ','ko':'추천','zh':'为你推荐'},
    'why_saved_category':{'vi':'Vì bạn đã lưu địa điểm {category}','en':'Because you saved {category} places','ja':'{category}を保存したため','ko':'{category}을(를) 저장했기 때문','zh':'因为你收藏了{category}'},
    'why_recent_category':{'vi':'Vì bạn vừa xem {category}','en':'Because you recently viewed {category}','ja':'最近{category}を見たため','ko':'최근 {category}을(를) 봤기 때문','zh':'因为你最近浏览了{category}'},
    'why_region':       {'vi':'Phổ biến ở {region}','en':'Popular in {region}','ja':'{region}で人気','ko':'{region}에서 인기','zh':'{region}热门'},
    'why_discover':     {'vi':'Khám phá thêm','en':'Discover more','ja':'もっと見つける','ko':'더 둘러보기','zh':'发现更多'},
    'collections_empty':{'vi':'Chưa có địa điểm phù hợp.','en':'No matching places yet.','ja':'該当する場所がまだありません。','ko':'아직 일치하는 장소가 없습니다.','zh':'暂无匹配地点。'},
    'collection_count': {'vi':'{count} địa điểm','en':'{count} places','ja':'{count}件','ko':'{count}곳','zh':'{count}个地点'},
    'refine_in_search': {'vi':'Lọc thêm trong tìm kiếm','en':'Refine in search','ja':'検索で絞り込む','ko':'검색에서 더 좁히기','zh':'在搜索中细化'},
  },
  'collections': {
    'page_title':       {'vi':'Bộ sưu tập','en':'Collections','ja':'コレクション','ko':'모음','zh':'合集'},
    'page_sub':         {'vi':'Danh sách tuyển chọn theo nhu cầu thực tế','en':'Curated lists for real needs','ja':'実用目的別のおすすめリスト','ko':'실제 필요에 맞춘 선별 목록','zh':'按实际需求精选'},
    'rainy_day_title':  {'vi':'Ngày mưa vẫn vui','en':'Great for rainy days','ja':'雨の日にぴったり','ko':'비 오는 날 좋은 곳','zh':'雨天好去处'},
    'rainy_day_desc':   {'vi':'Hoạt động trong nhà khi trời mưa','en':'Indoor spots when it rains','ja':'雨でも楽しめる屋内スポット','ko':'비 올 때 실내 명소','zh':'下雨天的室内去处'},
    'free_title':       {'vi':'Điểm tham quan miễn phí','en':'Free attractions','ja':'無料スポット','ko':'무료 명소','zh':'免费景点'},
    'free_desc':        {'vi':'Vui chơi không tốn tiền','en':'Fun that costs nothing','ja':'お金をかけずに楽しむ','ko':'돈 안 드는 즐길거리','zh':'不花钱的乐趣'},
    'cheap_eats_title': {'vi':'Ăn ngon giá rẻ','en':'Cheap eats','ja':'安くて美味しい','ko':'저렴한 맛집','zh':'平价美食'},
    'cheap_eats_desc':  {'vi':'Quán ăn dưới ¥3.000','en':'Meals under ¥3,000','ja':'¥3,000以下の食事','ko':'¥3,000 이하 식사','zh':'¥3,000以下用餐'},
    'family_title':     {'vi':'Cuối tuần cho gia đình','en':'Family weekend','ja':'家族で週末','ko':'가족 주말','zh':'家庭周末'},
    'family_desc':      {'vi':'Hợp cho trẻ em','en':'Good for kids','ja':'子ども連れに最適','ko':'아이와 함께','zh':'适合孩子'},
    'camping_bbq_title':{'vi':'Cắm trại & BBQ','en':'Camping with BBQ','ja':'BBQできるキャンプ','ko':'BBQ 캠핑','zh':'露营烧烤'},
    'camping_bbq_desc': {'vi':'Khu cắm trại có BBQ','en':'Campsites with BBQ','ja':'BBQ可のキャンプ場','ko':'BBQ 가능 캠핑장','zh':'可烧烤的营地'},
    'onsen_title':      {'vi':'Onsen thư giãn','en':'Relaxing onsen','ja':'癒しの温泉','ko':'힐링 온천','zh':'放松温泉'},
    'onsen_desc':       {'vi':'Suối nước nóng để nghỉ ngơi','en':'Hot springs to unwind','ja':'ゆったり温泉','ko':'쉬어가는 온천','zh':'泡汤放松'},
  },
  'events': {
    'page_title':   {'vi':'Sự kiện','en':'Events','ja':'イベント','ko':'이벤트','zh':'活动'},
    'page_sub':     {'vi':'Sự kiện được kiểm duyệt, nguồn xác minh','en':'Curated events with verified sources','ja':'出典確認済みの厳選イベント','ko':'출처가 확인된 선별 이벤트','zh':'经核实来源的精选活动'},
    'view_today':   {'vi':'Hôm nay','en':'Today','ja':'今日','ko':'오늘','zh':'今天'},
    'view_weekend': {'vi':'Cuối tuần','en':'This weekend','ja':'今週末','ko':'이번 주말','zh':'本周末'},
    'view_upcoming':{'vi':'Sắp tới','en':'Upcoming','ja':'近日','ko':'예정','zh':'即将'},
    'view_free':    {'vi':'Miễn phí','en':'Free','ja':'無料','ko':'무료','zh':'免费'},
    'all_areas':    {'vi':'Mọi khu vực','en':'All areas','ja':'すべてのエリア','ko':'전체 지역','zh':'所有地区'},
    'empty':        {'vi':'Chưa có sự kiện nào.','en':'No events yet.','ja':'イベントはまだありません。','ko':'아직 이벤트가 없습니다.','zh':'暂无活动。'},
    'free':         {'vi':'Miễn phí','en':'Free','ja':'無料','ko':'무료','zh':'免费'},
    'jst':          {'vi':'(giờ Nhật)','en':'(JST)','ja':'(日本時間)','ko':'(일본 시간)','zh':'(日本时间)'},
    'view_place':   {'vi':'Xem địa điểm','en':'View place','ja':'場所を見る','ko':'장소 보기','zh':'查看地点'},
    'register':     {'vi':'Đăng ký','en':'Register','ja':'申し込み','ko':'등록','zh':'报名'},
    'source':       {'vi':'Nguồn','en':'Source','ja':'出典','ko':'출처','zh':'来源'},
    'last_verified':{'vi':'Xác minh: {date}','en':'Verified: {date}','ja':'確認日: {date}','ko':'확인: {date}','zh':'核实：{date}'},
    'cancelled':    {'vi':'Đã huỷ','en':'Cancelled','ja':'中止','ko':'취소됨','zh':'已取消'},
    'admin_title':  {'vi':'Quản lý sự kiện','en':'Manage events','ja':'イベント管理','ko':'이벤트 관리','zh':'活动管理'},
    'admin_sub':    {'vi':'Tạo sự kiện thủ công với nguồn xác minh. Không tự động lấy từ web.','en':'Create events manually with verified sources. No scraping.','ja':'出典を確認して手動で作成。スクレイピングなし。','ko':'출처를 확인해 수동 생성. 스크래핑 없음.','zh':'手动创建并核实来源，不抓取网页。'},
    'admin_new':    {'vi':'Sự kiện mới','en':'New event','ja':'新規イベント','ko':'새 이벤트','zh':'新建活动'},
    'admin_edit':   {'vi':'Sửa','en':'Edit','ja':'編集','ko':'편집','zh':'编辑'},
    'admin_all':    {'vi':'Tất cả sự kiện','en':'All events','ja':'すべてのイベント','ko':'전체 이벤트','zh':'所有活动'},
    'admin_empty':  {'vi':'Chưa có sự kiện.','en':'No events yet.','ja':'イベントはまだありません。','ko':'아직 이벤트가 없습니다.','zh':'暂无活动。'},
    'admin_save':   {'vi':'Lưu','en':'Save','ja':'保存','ko':'저장','zh':'保存'},
    'admin_required':{'vi':'Cần tiêu đề và thời gian bắt đầu.','en':'Title and start time are required.','ja':'タイトルと開始時刻は必須です。','ko':'제목과 시작 시간은 필수입니다.','zh':'标题和开始时间为必填。'},
    'admin_publish':{'vi':'Đăng','en':'Publish','ja':'公開','ko':'게시','zh':'发布'},
    'admin_unpublish':{'vi':'Ẩn','en':'Unpublish','ja':'非公開','ko':'게시 취소','zh':'取消发布'},
    'admin_cancel': {'vi':'Đánh dấu huỷ','en':'Mark cancelled','ja':'中止にする','ko':'취소 표시','zh':'标记取消'},
    'admin_uncancel':{'vi':'Bỏ huỷ','en':'Un-cancel','ja':'中止解除','ko':'취소 해제','zh':'恢复'},
    'admin_delete': {'vi':'Xoá','en':'Delete','ja':'削除','ko':'삭제','zh':'删除'},
    'admin_delete_confirm':{'vi':'Xoá sự kiện này?','en':'Delete this event?','ja':'このイベントを削除しますか？','ko':'이 이벤트를 삭제할까요?','zh':'删除此活动？'},
    'f_title':      {'vi':'Tiêu đề','en':'Title','ja':'タイトル','ko':'제목','zh':'标题'},
    'f_description':{'vi':'Mô tả','en':'Description','ja':'説明','ko':'설명','zh':'描述'},
    'f_starts':     {'vi':'Bắt đầu (JST)','en':'Starts (JST)','ja':'開始 (JST)','ko':'시작 (JST)','zh':'开始 (JST)'},
    'f_ends':       {'vi':'Kết thúc (JST)','en':'Ends (JST)','ja':'終了 (JST)','ko':'종료 (JST)','zh':'结束 (JST)'},
    'f_venue':      {'vi':'Địa điểm','en':'Venue','ja':'会場','ko':'장소','zh':'场地'},
    'f_area':       {'vi':'Khu vực','en':'Area','ja':'エリア','ko':'지역','zh':'地区'},
    'f_prefecture': {'vi':'Tỉnh (mã)','en':'Prefecture (code)','ja':'都道府県(コード)','ko':'현(코드)','zh':'都道府县(代码)'},
    'f_place_slug': {'vi':'Slug địa điểm liên kết','en':'Linked place slug','ja':'関連スポットのslug','ko':'연결 장소 slug','zh':'关联地点 slug'},
    'f_price_type': {'vi':'Loại giá','en':'Price type','ja':'料金種別','ko':'가격 유형','zh':'价格类型'},
    'f_currency':   {'vi':'Tiền tệ','en':'Currency','ja':'通貨','ko':'통화','zh':'货币'},
    'f_price_min':  {'vi':'Giá thấp nhất','en':'Min price','ja':'最低料金','ko':'최저 가격','zh':'最低价'},
    'f_price_max':  {'vi':'Giá cao nhất','en':'Max price','ja':'最高料金','ko':'최고 가격','zh':'最高价'},
    'f_source':     {'vi':'URL nguồn chính thức','en':'Official source URL','ja':'公式出典URL','ko':'공식 출처 URL','zh':'官方来源链接'},
    'f_registration':{'vi':'URL đăng ký','en':'Registration URL','ja':'申込URL','ko':'등록 URL','zh':'报名链接'},
    'f_last_verified':{'vi':'Ngày xác minh','en':'Last verified date','ja':'確認日','ko':'확인일','zh':'核实日期'},
    'f_slug':       {'vi':'Slug','en':'Slug','ja':'スラッグ','ko':'슬러그','zh':'Slug'},
    'f_published':  {'vi':'Công khai','en':'Published','ja':'公開','ko':'게시','zh':'发布'},
  },
  'notif_prefs': {
    'title':  {'vi':'Tuỳ chọn thông báo','en':'Notification preferences','ja':'通知設定','ko':'알림 설정','zh':'通知偏好'},
    'sub':    {'vi':'Chọn loại thông báo bạn muốn nhận.','en':'Choose which notifications you want.','ja':'受け取る通知を選べます。','ko':'받을 알림을 선택하세요.','zh':'选择想接收的通知。'},
    'back':   {'vi':'Trang chủ','en':'Home','ja':'ホーム','ko':'홈','zh':'首页'},
    'default_note':{'vi':'Thông báo nhắc nhở cuối tuần và sự kiện mặc định TẮT để tránh làm phiền.','en':'Weekend and event reminders are OFF by default to avoid noise.','ja':'週末・イベント通知は既定でオフです（通知過多を防ぐため）。','ko':'주말·이벤트 알림은 기본적으로 꺼져 있습니다(과도한 알림 방지).','zh':'周末与活动提醒默认关闭，以免打扰。'},
    'type_place_answer':{'vi':'Trả lời câu hỏi địa điểm','en':'Answer to a place question','ja':'場所の質問への回答','ko':'장소 질문 답변','zh':'地点问题的回答'},
    'type_place_answer_desc':{'vi':'Khi câu hỏi của bạn có câu trả lời mới','en':'When your question gets a new answer','ja':'あなたの質問に回答がついたとき','ko':'질문에 새 답변이 달릴 때','zh':'你的问题有新回答时'},
    'type_place_closed':{'vi':'Địa điểm đã lưu tạm đóng cửa','en':'Saved place temporarily closed','ja':'保存した場所が臨時休業','ko':'저장한 장소 임시 휴업','zh':'收藏地点临时关闭'},
    'type_place_closed_desc':{'vi':'Khi một địa điểm bạn lưu được xác nhận đóng cửa','en':'When a place you saved is confirmed closed','ja':'保存した場所が休業と確認されたとき','ko':'저장한 장소가 휴업으로 확인될 때','zh':'当你收藏的地点确认关闭时'},
    'type_place_updated':{'vi':'Cập nhật thông tin địa điểm đã lưu','en':'Saved place info updated','ja':'保存した場所の情報更新','ko':'저장한 장소 정보 업데이트','zh':'收藏地点信息更新'},
    'type_place_updated_desc':{'vi':'Khi thông tin địa điểm bạn lưu được cập nhật','en':'When info for a place you saved changes','ja':'保存した場所の情報が更新されたとき','ko':'저장한 장소 정보가 바뀔 때','zh':'当你收藏地点的信息变更时'},
    'type_plan_reminder':{'vi':'Nhắc lịch trình','en':'Trip plan reminder','ja':'予定リマインダー','ko':'일정 알림','zh':'行程提醒'},
    'type_plan_reminder_desc':{'vi':'Nhắc khi lịch trình của bạn sắp diễn ra','en':'A reminder when your plan is coming up','ja':'予定が近づいたら通知','ko':'일정이 다가오면 알림','zh':'行程临近时提醒'},
    'type_weekend_collection':{'vi':'Gợi ý cuối tuần','en':'Weekend collection','ja':'週末のおすすめ','ko':'주말 추천','zh':'周末合集'},
    'type_weekend_collection_desc':{'vi':'Bộ sưu tập phù hợp cho cuối tuần','en':'A relevant collection for the weekend','ja':'週末向けのコレクション','ko':'주말에 어울리는 모음','zh':'适合周末的合集'},
    'type_event_soon':{'vi':'Sự kiện sắp bắt đầu','en':'Event starting soon','ja':'まもなく始まるイベント','ko':'곧 시작하는 이벤트','zh':'活动即将开始'},
    'type_event_soon_desc':{'vi':'Khi một sự kiện liên quan sắp bắt đầu','en':'When a relevant event is about to start','ja':'関連イベントが間もなく始まるとき','ko':'관련 이벤트가 곧 시작될 때','zh':'相关活动即将开始时'},
  },
}

# Keys to MERGE into the existing `notifications` namespace.
NOTIF_ADD = {
  'community_notif_title_place_closed':   {'vi':'Địa điểm đã lưu tạm đóng cửa','en':'A saved place is temporarily closed','ja':'保存した場所が臨時休業','ko':'저장한 장소가 임시 휴업','zh':'收藏地点临时关闭'},
  'community_notif_title_place_updated':  {'vi':'Cập nhật địa điểm đã lưu','en':'A saved place was updated','ja':'保存した場所が更新されました','ko':'저장한 장소가 업데이트됨','zh':'收藏地点已更新'},
  'community_notif_title_plan_reminder':  {'vi':'Nhắc lịch trình','en':'Trip plan reminder','ja':'予定リマインダー','ko':'일정 알림','zh':'行程提醒'},
  'community_notif_title_weekend_collection':{'vi':'Gợi ý cuối tuần','en':'Weekend picks for you','ja':'週末のおすすめ','ko':'주말 추천','zh':'周末推荐'},
  'community_notif_title_event_soon':     {'vi':'Sự kiện sắp bắt đầu','en':'An event is starting soon','ja':'まもなく始まるイベント','ko':'곧 시작하는 이벤트','zh':'活动即将开始'},
}

for loc in LOCALES:
  path = os.path.join(MSG_DIR, loc + '.json')
  with open(path, encoding='utf-8') as f:
    data = json.load(f)
  for ns, keys in TR.items():
    data.setdefault(ns, {})
    for key, vals in keys.items():
      data[ns][key] = vals[loc]
  data.setdefault('notifications', {})
  for key, vals in NOTIF_ADD.items():
    data['notifications'][key] = vals[loc]
  with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write('\n')
  print(f'updated {loc}.json')

print('done')
