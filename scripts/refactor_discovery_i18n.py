#!/usr/bin/env python3
# UI/UX refactor: update discovery i18n labels (terminology + ¥3,000 + new keys)
# and fix the VI category label that mixed English.
import json, os
MSG = os.path.join(os.path.dirname(__file__), '..', 'messages')

# explore_home updates/additions per locale
EH = {
  'intent_eat_cheap':  {'vi':'Dưới ¥3,000','en':'Under ¥3,000','ja':'¥3,000以下','ko':'¥3,000 이하','zh':'¥3,000以下'},
  'intent_free':       {'vi':'Miễn phí','en':'Free','ja':'無料','ko':'무료','zh':'免费'},
  'intent_rainy':      {'vi':'Phù hợp ngày mưa','en':'Good in the rain','ja':'雨の日OK','ko':'비 오는 날 좋음','zh':'适合雨天'},
  'intent_family':     {'vi':'Phù hợp gia đình','en':'Family-friendly','ja':'家族向け','ko':'가족 친화','zh':'适合家庭'},
  'intent_reservable': {'vi':'Có thể đặt chỗ','en':'Reservable','ja':'予約可','ko':'예약 가능','zh':'可预约'},
  'intent_parking':    {'vi':'Có chỗ đậu xe','en':'Parking available','ja':'駐車場あり','ko':'주차 가능','zh':'有停车位'},
  'intent_near_me':    {'vi':'Gần tôi','en':'Near me','ja':'近くで','ko':'내 주변','zh':'我附近'},
  'intent_open_now':   {'vi':'Đang mở cửa','en':'Open now','ja':'営業中','ko':'영업 중','zh':'营业中'},
  'quick_needs_heading':      {'vi':'Chọn nhanh theo nhu cầu','en':'Pick by what you need','ja':'目的から探す','ko':'필요에 따라 빠르게','zh':'按需求快速筛选'},
  'categories_browse_heading':{'vi':'Khám phá theo chủ đề','en':'Explore by category','ja':'カテゴリーで探す','ko':'카테고리로 탐색','zh':'按分类探索'},
  'discover_sub':      {'vi':'Tìm nhanh theo nhu cầu hoặc khám phá theo chủ đề','en':'Search by need, or explore by category','ja':'目的から探す、またはカテゴリーで探す','ko':'필요로 찾거나 카테고리로 탐색하세요','zh':'按需求查找，或按分类探索'},
  'show_more':         {'vi':'Xem thêm','en':'Show more','ja':'もっと見る','ko':'더 보기','zh':'查看更多'},
  'show_less':         {'vi':'Thu gọn','en':'Show less','ja':'閉じる','ko':'접기','zh':'收起'},
  'quick_needs_more_aria': {'vi':'Hiện thêm bộ lọc nhu cầu','en':'Show more quick filters','ja':'クイックフィルターをさらに表示','ko':'빠른 필터 더 보기','zh':'显示更多快捷筛选'},
}

# Fix VI category label that mixed English "Camping".
CAT = { 'camp_full': {'vi':'Cắm trại & picnic'} }

for loc in ['vi','en','ja','ko','zh']:
  p = os.path.join(MSG, loc + '.json')
  d = json.load(open(p, encoding='utf-8'))
  d.setdefault('explore_home', {})
  for k, v in EH.items():
    d['explore_home'][k] = v[loc]
  for k, v in CAT.items():
    if loc in v:
      d.setdefault('categories', {})[k] = v[loc]
  json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
  open(p, 'a', encoding='utf-8').write('\n')
  print('updated', loc)
print('done')
