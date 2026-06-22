// Reviewed, STATIC Japanese phrase templates (no dynamic generation → never
// produces unsafe/incorrect Japanese). Selected by place category; merged with
// any Admin-managed per-place phrases on the detail page.
import { categoryFieldRelevance } from './placeFields.ts';

export interface Phrase { id: string; ja: string; romaji: string; vi: string }

export const PHRASE_TEMPLATES: Record<string, Phrase> = {
  reservation:      { id: 'reservation',      ja: '予約したいのですが。',                 romaji: 'Yoyaku shitai no desu ga.',          vi: 'Tôi muốn đặt chỗ.' },
  private_room:     { id: 'private_room',      ja: '個室はありますか？',                   romaji: 'Koshitsu wa arimasu ka?',            vi: 'Có phòng riêng không?' },
  parking:          { id: 'parking',          ja: '駐車場はありますか？',                 romaji: 'Chūshajō wa arimasu ka?',            vi: 'Có chỗ đỗ xe không?' },
  payment_card:     { id: 'payment_card',      ja: 'カードで払えますか？',                 romaji: 'Kādo de haraemasu ka?',              vi: 'Trả bằng thẻ được không?' },
  payment_paypay:   { id: 'payment_paypay',    ja: 'ペイペイは使えますか？',               romaji: 'PayPay wa tsukaemasu ka?',           vi: 'Dùng PayPay được không?' },
  allergies:        { id: 'allergies',         ja: 'アレルギーがあります。',               romaji: 'Arerugī ga arimasu.',                vi: 'Tôi bị dị ứng.' },
  english_menu:     { id: 'english_menu',      ja: '英語のメニューはありますか？',         romaji: 'Eigo no menyū wa arimasu ka?',       vi: 'Có thực đơn tiếng Anh không?' },
  vegetarian:       { id: 'vegetarian',        ja: 'ベジタリアン料理はありますか？',       romaji: 'Bejitarian ryōri wa arimasu ka?',    vi: 'Có món chay không?' },
  recommend:        { id: 'recommend',         ja: 'おすすめは何ですか？',                 romaji: 'Osusume wa nan desu ka?',            vi: 'Món nào nên gọi?' },
  bill:             { id: 'bill',              ja: 'お会計をお願いします。',               romaji: 'Okaikei o onegai shimasu.',          vi: 'Cho tôi thanh toán.' },
  children:         { id: 'children',          ja: '子ども連れでも大丈夫ですか？',         romaji: 'Kodomo-zure demo daijōbu desu ka?',  vi: 'Đi cùng trẻ em có được không?' },
  tattoo:           { id: 'tattoo',            ja: 'タトゥーがあっても入れますか？',       romaji: 'Tatū ga atte mo hairemasu ka?',      vi: 'Có hình xăm vào được không?' },
  campsite_checkin: { id: 'campsite_checkin',  ja: 'チェックインは何時からですか？',       romaji: 'Chekku-in wa nanji kara desu ka?',   vi: 'Mấy giờ được nhận chỗ (check-in)?' },
};

/** Pick category-relevant reviewed phrases (parking + card are broadly useful). */
export function phrasesForCategory(category: string): Phrase[] {
  const r = categoryFieldRelevance(category);
  const ids = new Set<string>(['parking', 'payment_card']);
  if (r.reservation) {
    for (const id of ['reservation', 'private_room', 'allergies', 'english_menu', 'vegetarian', 'recommend', 'bill', 'payment_paypay']) ids.add(id);
  }
  if (r.kids) ids.add('children');
  if (r.tattoo) ids.add('tattoo');
  if (r.camping) ids.add('campsite_checkin');
  return Array.from(ids).map((id) => PHRASE_TEMPLATES[id]).filter(Boolean);
}
