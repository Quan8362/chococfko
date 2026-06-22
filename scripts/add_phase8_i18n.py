#!/usr/bin/env python3
# Inject Phase 8 (admin insights) i18n keys into all 5 locale files with parity.
import json, os

LOCALES = ['vi', 'en', 'ja', 'ko', 'zh']
MSG_DIR = os.path.join(os.path.dirname(__file__), '..', 'messages')

TR = {
  'admin_insights': {
    'title': {'vi':'Thống kê Explore','en':'Explore insights','ja':'Explore インサイト','ko':'Explore 인사이트','zh':'Explore 数据洞察'},
    'sub':   {'vi':'Chỉ số tìm kiếm, tương tác, lập kế hoạch, cộng đồng & chất lượng dữ liệu.','en':'Search, engagement, planning, community & data-quality metrics.','ja':'検索・エンゲージメント・計画・コミュニティ・データ品質の指標。','ko':'검색·참여·계획·커뮤니티·데이터 품질 지표.','zh':'搜索、互动、规划、社区与数据质量指标。'},
    'no_data':{'vi':'Chưa có dữ liệu','en':'No data yet','ja':'データなし','ko':'데이터 없음','zh':'暂无数据'},
    'search_heading':{'vi':'Chất lượng tìm kiếm','en':'Search quality','ja':'検索品質','ko':'검색 품질','zh':'搜索质量'},
    'total_searches':{'vi':'Tổng lượt tìm','en':'Total searches','ja':'検索総数','ko':'전체 검색','zh':'搜索总数'},
    'success_rate':{'vi':'Tỉ lệ có kết quả','en':'Success rate','ja':'成功率','ko':'성공률','zh':'成功率'},
    'zero_rate':{'vi':'Tỉ lệ 0 kết quả','en':'Zero-result rate','ja':'ゼロ件率','ko':'무결과율','zh':'零结果率'},
    'ctr':{'vi':'Tỉ lệ nhấp','en':'Click-through','ja':'クリック率','ko':'클릭률','zh':'点击率'},
    'top_queries':{'vi':'Truy vấn phổ biến','en':'Top queries','ja':'人気の検索語','ko':'인기 검색어','zh':'热门查询'},
    'unmatched_queries':{'vi':'Truy vấn không có kết quả','en':'Unmatched queries','ja':'結果なしの検索語','ko':'결과 없는 검색어','zh':'无结果查询'},
    'engagement_heading':{'vi':'Tương tác địa điểm','en':'Place engagement','ja':'場所のエンゲージメント','ko':'장소 참여','zh':'地点互动'},
    'ev_save':{'vi':'Lượt lưu','en':'Saves','ja':'保存','ko':'저장','zh':'收藏'},
    'ev_directions':{'vi':'Mở chỉ đường','en':'Directions','ja':'経路','ko':'길찾기','zh':'导航'},
    'ev_reserve':{'vi':'Nhấp đặt chỗ','en':'Reservation clicks','ja':'予約クリック','ko':'예약 클릭','zh':'预约点击'},
    'ev_share':{'vi':'Lượt chia sẻ','en':'Shares','ja':'シェア','ko':'공유','zh':'分享'},
    'planning_heading':{'vi':'Lập kế hoạch','en':'Planning','ja':'計画','ko':'계획','zh':'规划'},
    'lists_created':{'vi':'Danh sách đã tạo','en':'Lists created','ja':'作成リスト','ko':'생성된 목록','zh':'已创建清单'},
    'plans_created':{'vi':'Lịch trình đã tạo','en':'Plans created','ja':'作成プラン','ko':'생성된 일정','zh':'已创建行程'},
    'plans_shared':{'vi':'Lịch trình chia sẻ','en':'Plans shared','ja':'共有プラン','ko':'공유 일정','zh':'已分享行程'},
    'plan_stops':{'vi':'Điểm dừng','en':'Plan stops','ja':'立ち寄り地点','ko':'경유지','zh':'行程站点'},
    'community_heading':{'vi':'Cộng đồng','en':'Community','ja':'コミュニティ','ko':'커뮤니티','zh':'社区'},
    'questions':{'vi':'Câu hỏi','en':'Questions','ja':'質問','ko':'질문','zh':'问题'},
    'answer_rate':{'vi':'Tỉ lệ trả lời','en':'Answer rate','ja':'回答率','ko':'답변률','zh':'回答率'},
    'reports_pending':{'vi':'Báo cáo chờ duyệt','en':'Reports pending','ja':'未処理の報告','ko':'대기 신고','zh':'待处理报告'},
    'reports_resolved':{'vi':'Báo cáo đã xử lý','en':'Reports resolved','ja':'処理済み報告','ko':'처리된 신고','zh':'已处理报告'},
    'location_quality_heading':{'vi':'Chất lượng dữ liệu địa điểm','en':'Location data quality','ja':'場所データ品質','ko':'장소 데이터 품질','zh':'地点数据质量'},
    'location_quality_sub':{'vi':'{total} địa điểm · {issues} vấn đề cần xem','en':'{total} places · {issues} issues to review','ja':'{total}件 · 要確認 {issues}件','ko':'{total}곳 · 검토 {issues}건','zh':'{total}个地点 · {issues}个待查问题'},
    'location_quality_clean':{'vi':'Không phát hiện vấn đề.','en':'No issues detected.','ja':'問題は見つかりませんでした。','ko':'문제가 없습니다.','zh':'未发现问题。'},
    'dq_missing_identity':{'vi':'Thiếu thông tin định danh','en':'Missing identity fields','ja':'識別情報の不足','ko':'식별 정보 누락','zh':'缺少标识字段'},
    'dq_invalid_coordinates':{'vi':'Toạ độ không hợp lệ','en':'Invalid coordinates','ja':'座標が無効','ko':'잘못된 좌표','zh':'坐标无效'},
    'dq_missing_coordinates':{'vi':'Thiếu toạ độ','en':'Missing coordinates','ja':'座標なし','ko':'좌표 없음','zh':'缺少坐标'},
    'dq_invalid_url':{'vi':'URL không hợp lệ','en':'Invalid URL','ja':'URLが無効','ko':'잘못된 URL','zh':'链接无效'},
    'dq_contradictory_price':{'vi':'Giá mâu thuẫn','en':'Contradictory price','ja':'価格の矛盾','ko':'가격 모순','zh':'价格矛盾'},
    'dq_missing_price':{'vi':'Thiếu thông tin giá','en':'Missing price','ja':'価格なし','ko':'가격 없음','zh':'缺少价格'},
    'dq_missing_hours':{'vi':'Thiếu giờ mở cửa','en':'Missing hours','ja':'営業時間なし','ko':'영업시간 없음','zh':'缺少营业时间'},
    'dq_open_unknown_hours':{'vi':'Đang mở nhưng không rõ giờ','en':'Open with unknown hours','ja':'営業中だが時間不明','ko':'영업 중이나 시간 불명','zh':'营业但时间不明'},
    'dq_missing_official_link':{'vi':'Thiếu liên kết chính thức','en':'Missing official link','ja':'公式リンクなし','ko':'공식 링크 없음','zh':'缺少官方链接'},
    'dq_not_verified_recently':{'vi':'Chưa xác minh gần đây','en':'Not verified recently','ja':'最近未確認','ko':'최근 미확인','zh':'近期未核实'},
    'dq_duplicate_slug':{'vi':'Trùng slug','en':'Duplicate slug','ja':'slug重複','ko':'중복 slug','zh':'slug 重复'},
  },
}

for loc in LOCALES:
  path = os.path.join(MSG_DIR, loc + '.json')
  with open(path, encoding='utf-8') as f:
    data = json.load(f)
  for ns, keys in TR.items():
    data.setdefault(ns, {})
    for key, vals in keys.items():
      data[ns][key] = vals[loc]
  with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write('\n')
  print(f'updated {loc}.json')
print('done')
