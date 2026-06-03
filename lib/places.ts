export type Fee = 'free' | 'paid' | null;
export interface Place {
  slug: string; name: string; area: string; desc: string;
  category: string; categoryLabel: string; fee: Fee;
  mapUrl: string; photoUrl: string; img: string; imgFallback: string;
  body?: string | null; // rich text HTML mô tả chi tiết (từ DB)
}
export interface Category { code: string; short: string; full: string; }

export const categories: Category[] = [
  { "code": "landmark", "short": "Du lịch",   "full": "Du lịch" },
  { "code": "food",     "short": "Ăn đêm",    "full": "Ăn uống & đi đêm" },
  { "code": "sea",      "short": "Biển",       "full": "Biển & BBQ" },
  { "code": "camp",     "short": "Camping",    "full": "Camping & picnic" },
  { "code": "mountain", "short": "Leo núi",    "full": "Leo núi" },
  { "code": "park",     "short": "Công viên",  "full": "Công viên" },
  { "code": "viet",     "short": "Quán Việt",  "full": "Quán Việt" },
  { "code": "grocery",  "short": "Tạp hóa",   "full": "Tạp hoá Việt" },
  { "code": "izakaya",  "short": "Izakaya",    "full": "Quán nhậu Nhật" },
  { "code": "japanese", "short": "Quán Nhật",  "full": "Quán Nhật" },
  { "code": "thai",     "short": "Quán Thái",  "full": "Quán Thái" },
  { "code": "chinese",  "short": "Quán Trung", "full": "Quán Trung" },
  { "code": "korean",   "short": "Quán Hàn",   "full": "Quán Hàn" },
  { "code": "cafe_milk_tea", "short": "Cà phê & trà sữa", "full": "Cà phê & trà sữa" },
];

export const places: Place[] = [
  {
    "slug": "dazaifu-tenmangu",
    "name": "Dazaifu Tenmangu",
    "area": "Dazaifu",
    "desc": "Đền nổi tiếng, cầu may học hành, ăn umegae-mochi",
    "category": "landmark",
    "categoryLabel": "Du lịch",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Dazaifu%20Tenmangu%20Shrine%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Dazaifu%20Tenmangu%20Shrine%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Dazaifu,Tenmangu,japan,landmark,temple?lock=1000",
    "imgFallback": "https://picsum.photos/seed/choco1000/680/460"
  },
  {
    "slug": "canal-city-hakata",
    "name": "Canal City Hakata",
    "area": "Hakata",
    "desc": "Shopping, ăn uống, xem nhạc nước",
    "category": "landmark",
    "categoryLabel": "Du lịch",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Canal%20City%20Hakata%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Canal%20City%20Hakata%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Canal,City,Hakata,japan,landmark,temple?lock=1001",
    "imgFallback": "https://picsum.photos/seed/choco1001/680/460"
  },
  {
    "slug": "fukuoka-tower",
    "name": "Fukuoka Tower",
    "area": "Momochi",
    "desc": "Ngắm toàn cảnh thành phố và biển",
    "category": "landmark",
    "categoryLabel": "Du lịch",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Fukuoka%20Tower%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Fukuoka%20Tower%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Fukuoka,Tower,japan,landmark,temple?lock=1002",
    "imgFallback": "https://picsum.photos/seed/choco1002/680/460"
  },
  {
    "slug": "ohori-park",
    "name": "Ohori Park",
    "area": "Chuo-ku",
    "desc": "Đi dạo, hẹn hò, chạy bộ, cafe",
    "category": "landmark",
    "categoryLabel": "Du lịch",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Ohori%20Park%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Ohori%20Park%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Ohori,Park,japan,landmark,temple?lock=1003",
    "imgFallback": "https://picsum.photos/seed/choco1003/680/460"
  },
  {
    "slug": "maizuru-park-fukuoka-castle-ruins",
    "name": "Maizuru Park / Fukuoka Castle Ruins",
    "area": "Gần Ohori",
    "desc": "Ngắm hoa anh đào, đi bộ, chụp ảnh",
    "category": "landmark",
    "categoryLabel": "Du lịch",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Maizuru%20Park%20Fukuoka%20Castle%20Ruins%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Maizuru%20Park%20Fukuoka%20Castle%20Ruins%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Maizuru,Park,Fukuoka,japan,landmark,temple?lock=1004",
    "imgFallback": "https://picsum.photos/seed/choco1004/680/460"
  },
  {
    "slug": "kushida-shrine",
    "name": "Kushida Shrine",
    "area": "Hakata",
    "desc": "Đền cổ, gần khu phố Hakata",
    "category": "landmark",
    "categoryLabel": "Du lịch",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Kushida%20Shrine%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Kushida%20Shrine%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Kushida,Shrine,japan,landmark,temple?lock=1005",
    "imgFallback": "https://picsum.photos/seed/choco1005/680/460"
  },
  {
    "slug": "uminonakamichi-seaside-park",
    "name": "Uminonakamichi Seaside Park",
    "area": "Higashi-ku",
    "desc": "Công viên rất rộng, đi xe đạp, picnic, gia đình",
    "category": "landmark",
    "categoryLabel": "Du lịch",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Uminonakamichi%20Seaside%20Park%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Uminonakamichi%20Seaside%20Park%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Uminonakamichi,Seaside,Park,japan,landmark,temple?lock=1006",
    "imgFallback": "https://picsum.photos/seed/choco1006/680/460"
  },
  {
    "slug": "marine-world-uminonakamichi",
    "name": "Marine World Uminonakamichi",
    "area": "Higashi-ku",
    "desc": "Thủy cung, phù hợp đi chơi cuối tuần",
    "category": "landmark",
    "categoryLabel": "Du lịch",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Marine%20World%20Uminonakamichi%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Marine%20World%20Uminonakamichi%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Marine,World,Uminonakamichi,japan,landmark,temple?lock=1007",
    "imgFallback": "https://picsum.photos/seed/choco1007/680/460"
  },
  {
    "slug": "mojiko-retro",
    "name": "Mojiko Retro",
    "area": "Kitakyushu",
    "desc": "Khu phố cổ, cảng biển, chụp ảnh đẹp",
    "category": "landmark",
    "categoryLabel": "Du lịch",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Mojiko%20Retro%20Kitakyushu%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Mojiko%20Retro%20Kitakyushu%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Mojiko,Retro,japan,landmark,temple?lock=1008",
    "imgFallback": "https://picsum.photos/seed/choco1008/680/460"
  },
  {
    "slug": "yanagawa",
    "name": "Yanagawa",
    "area": "Yanagawa",
    "desc": "Đi thuyền trên kênh, ăn lươn nướng unagi",
    "category": "landmark",
    "categoryLabel": "Du lịch",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Yanagawa%20boat%20ride%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Yanagawa%20boat%20ride%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Yanagawa,japan,landmark,temple?lock=1009",
    "imgFallback": "https://picsum.photos/seed/choco1009/680/460"
  },
  {
    "slug": "nakasu-yatai",
    "name": "Nakasu Yatai",
    "area": "Tối",
    "desc": "Khu quầy ăn đêm nổi tiếng nhất Fukuoka",
    "category": "food",
    "categoryLabel": "Ăn đêm",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Nakasu%20Yatai%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Nakasu%20Yatai%20Fukuoka",
    "img": "https://loremflickr.com/680/460/yatai,street,food,japan?lock=1010",
    "imgFallback": "https://picsum.photos/seed/choco1010/680/460"
  },
  {
    "slug": "tenjin-yatai",
    "name": "Tenjin Yatai",
    "area": "Tối",
    "desc": "Dễ đi, nhiều quán, tiện sau giờ làm",
    "category": "food",
    "categoryLabel": "Ăn đêm",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Tenjin%20Yatai%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Tenjin%20Yatai%20Fukuoka",
    "img": "https://loremflickr.com/680/460/yatai,street,food,japan?lock=1011",
    "imgFallback": "https://picsum.photos/seed/choco1011/680/460"
  },
  {
    "slug": "nagahama-yatai",
    "name": "Nagahama Yatai",
    "area": "Tối",
    "desc": "Gần khu ramen Nagahama",
    "category": "food",
    "categoryLabel": "Ăn đêm",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Nagahama%20Yatai%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Nagahama%20Yatai%20Fukuoka",
    "img": "https://loremflickr.com/680/460/yatai,street,food,japan?lock=1012",
    "imgFallback": "https://picsum.photos/seed/choco1012/680/460"
  },
  {
    "slug": "hakata-station",
    "name": "Hakata Station",
    "area": "Trưa / Tối",
    "desc": "Nhiều nhà hàng, ramen, izakaya, tiện tàu",
    "category": "food",
    "categoryLabel": "Ăn đêm",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Hakata%20Station%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Hakata%20Station%20Fukuoka",
    "img": "https://loremflickr.com/680/460/yatai,street,food,japan?lock=1013",
    "imgFallback": "https://picsum.photos/seed/choco1013/680/460"
  },
  {
    "slug": "tenjin-daimyo",
    "name": "Tenjin / Daimyo",
    "area": "Tối",
    "desc": "Izakaya, bar, cafe, shopping",
    "category": "food",
    "categoryLabel": "Ăn đêm",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Daimyo%20Tenjin%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Daimyo%20Tenjin%20Fukuoka",
    "img": "https://loremflickr.com/680/460/yatai,street,food,japan?lock=1014",
    "imgFallback": "https://picsum.photos/seed/choco1014/680/460"
  },
  {
    "slug": "imaizumi-yakuin",
    "name": "Imaizumi / Yakuin",
    "area": "Tối",
    "desc": "Quán nhỏ, quán rượu, cafe đẹp",
    "category": "food",
    "categoryLabel": "Ăn đêm",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Yakuin%20Imaizumi%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Yakuin%20Imaizumi%20Fukuoka",
    "img": "https://loremflickr.com/680/460/yatai,street,food,japan?lock=1015",
    "imgFallback": "https://picsum.photos/seed/choco1015/680/460"
  },
  {
    "slug": "nakasu-kawabata",
    "name": "Nakasu Kawabata",
    "area": "Tối",
    "desc": "Ăn nhậu, nightlife, gần sông",
    "category": "food",
    "categoryLabel": "Ăn đêm",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Nakasu%20Kawabata%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Nakasu%20Kawabata%20Fukuoka",
    "img": "https://loremflickr.com/680/460/yatai,street,food,japan?lock=1016",
    "imgFallback": "https://picsum.photos/seed/choco1016/680/460"
  },
  {
    "slug": "momochi-seaside-park",
    "name": "Momochi Seaside Park",
    "area": "Gần Fukuoka Tower",
    "desc": "Dễ đi nhất trong city, ngắm biển, cafe",
    "category": "sea",
    "categoryLabel": "Biển",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Momochi%20Seaside%20Park%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Momochi%20Seaside%20Park%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Momochi,Seaside,Park,beach,sea,coast,japan?lock=1017",
    "imgFallback": "https://picsum.photos/seed/choco1017/680/460"
  },
  {
    "slug": "itoshima-futamigaura",
    "name": "Itoshima / Futamigaura",
    "area": "Itoshima",
    "desc": "Cổng torii trắng, đá đôi Meoto Iwa, hoàng hôn đẹp",
    "category": "sea",
    "categoryLabel": "Biển",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Futamigaura%20Itoshima%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Futamigaura%20Itoshima%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Itoshima,Futamigaura,beach,sea,coast,japan?lock=1018",
    "imgFallback": "https://picsum.photos/seed/choco1018/680/460"
  },
  {
    "slug": "keya-beach",
    "name": "Keya Beach",
    "area": "Itoshima",
    "desc": "Biển đẹp, mùa hè đông vui (gửi xe có phí mùa hè)",
    "category": "sea",
    "categoryLabel": "Biển",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Keya%20Beach%20Itoshima%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Keya%20Beach%20Itoshima%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Keya,Beach,beach,sea,coast,japan?lock=1019",
    "imgFallback": "https://picsum.photos/seed/choco1019/680/460"
  },
  {
    "slug": "nogita-beach",
    "name": "Nogita Beach",
    "area": "Itoshima",
    "desc": "Cafe biển, lái xe đi rất chill",
    "category": "sea",
    "categoryLabel": "Biển",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Nogita%20Beach%20Itoshima%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Nogita%20Beach%20Itoshima%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Nogita,Beach,beach,sea,coast,japan?lock=1020",
    "imgFallback": "https://picsum.photos/seed/choco1020/680/460"
  },
  {
    "slug": "shikanoshima",
    "name": "Shikanoshima",
    "area": "Higashi-ku",
    "desc": "Đảo gần thành phố, đi biển, đi xe đạp",
    "category": "sea",
    "categoryLabel": "Biển",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Shikanoshima%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Shikanoshima%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Shikanoshima,beach,sea,coast,japan?lock=1021",
    "imgFallback": "https://picsum.photos/seed/choco1021/680/460"
  },
  {
    "slug": "uminonakamichi-saitozaki",
    "name": "Uminonakamichi / Saitozaki",
    "area": "Higashi-ku",
    "desc": "Bãi Saitozaki free; công viên Uminonakamichi có phí",
    "category": "sea",
    "categoryLabel": "Biển",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Saitozaki%20Uminonakamichi%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Saitozaki%20Uminonakamichi%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Uminonakamichi,Saitozaki,beach,sea,coast,japan?lock=1022",
    "imgFallback": "https://picsum.photos/seed/choco1022/680/460"
  },
  {
    "slug": "miyajihama-beach",
    "name": "Miyajihama Beach",
    "area": "Fukutsu",
    "desc": "Biển rộng, hoàng hôn đẹp",
    "category": "sea",
    "categoryLabel": "Biển",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Miyajihama%20Beach%20Fukutsu%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Miyajihama%20Beach%20Fukutsu%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Miyajihama,Beach,beach,sea,coast,japan?lock=1023",
    "imgFallback": "https://picsum.photos/seed/choco1023/680/460"
  },
  {
    "slug": "fukuma-beach",
    "name": "Fukuma Beach",
    "area": "Fukutsu",
    "desc": "Biển đẹp, nhiều cafe ven biển",
    "category": "sea",
    "categoryLabel": "Biển",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Fukuma%20Beach%20Fukutsu%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Fukuma%20Beach%20Fukutsu%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Fukuma,Beach,beach,sea,coast,japan?lock=1024",
    "imgFallback": "https://picsum.photos/seed/choco1024/680/460"
  },
  {
    "slug": "kanezakihama",
    "name": "Kanezakihama",
    "area": "Munakata",
    "desc": "Biển, surf, không khí thoáng",
    "category": "sea",
    "categoryLabel": "Biển",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Kanezaki%20Beach%20Munakata%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Kanezaki%20Beach%20Munakata%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Kanezakihama,beach,sea,coast,japan?lock=1025",
    "imgFallback": "https://picsum.photos/seed/choco1025/680/460"
  },
  {
    "slug": "nata-beach",
    "name": "奈多海岸 / Nata Beach",
    "area": "Higashi-ku",
    "desc": "Biển gần city, picnic/BBQ tùy khu & mùa",
    "category": "sea",
    "categoryLabel": "Biển",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=%E5%A5%88%E5%A4%9A%E6%B5%B7%E5%B2%B8%20Nata%20Beach%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=%E5%A5%88%E5%A4%9A%E6%B5%B7%E5%B2%B8%20Nata%20Beach%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Nata,Beach,beach,sea,coast,japan?lock=1026",
    "imgFallback": "https://picsum.photos/seed/choco1026/680/460"
  },
  {
    "slug": "shingu-beach",
    "name": "Shingu Beach / 新宮海岸",
    "area": "Shingu-machi",
    "desc": "Bãi rộng, đẹp, hợp tắm biển và BBQ (gửi xe có phí mùa hè)",
    "category": "sea",
    "categoryLabel": "Biển",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=%E6%96%B0%E5%AE%AE%E6%B5%B7%E6%B0%B4%E6%B5%B4%E5%A0%B4%20Shingu%20Beach%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=%E6%96%B0%E5%AE%AE%E6%B5%B7%E6%B0%B4%E6%B5%B4%E5%A0%B4%20Shingu%20Beach%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Shingu,Beach,beach,sea,coast,japan?lock=1027",
    "imgFallback": "https://picsum.photos/seed/choco1027/680/460"
  },
  {
    "slug": "camp-umi-machi-gan-dazaifu",
    "name": "一本松公園 (昭和の森)",
    "area": "Umi-machi · gần Dazaifu",
    "desc": "Camping, BBQ, picnic, chơi suối, leo núi. Cắm trại & BBQ free, gửi xe ¥500 vào mùa hè",
    "category": "camp",
    "categoryLabel": "Camping",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=%E6%98%AD%E5%92%8C%E3%81%AE%E6%A3%AE%20%E4%B8%80%E6%9C%AC%E6%9D%BE%E5%85%AC%E5%9C%92%20%E7%A6%8F%E5%B2%A1%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=%E6%98%AD%E5%92%8C%E3%81%AE%E6%A3%AE%20%E4%B8%80%E6%9C%AC%E6%9D%BE%E5%85%AC%E5%9C%92%20%E7%A6%8F%E5%B2%A1%20Fukuoka",
    "img": "https://loremflickr.com/680/460/camping,bbq,outdoor,nature?lock=1028",
    "imgFallback": "https://picsum.photos/seed/choco1028/680/460"
  },
  {
    "slug": "aburayama-fukuoka",
    "name": "ABURAYAMA FUKUOKA",
    "area": "Minami-ku",
    "desc": "Gần city, picnic, BBQ, đi bộ thiên nhiên (có thể tốn phí gửi xe)",
    "category": "camp",
    "categoryLabel": "Camping",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Aburayama%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Aburayama%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/ABURAYAMA,FUKUOKA,camping,bbq,outdoor,nature?lock=1029",
    "imgFallback": "https://picsum.photos/seed/choco1029/680/460"
  },
  {
    "slug": "uminonakamichi-seaside-park-2",
    "name": "Uminonakamichi Seaside Park",
    "area": "Higashi-ku",
    "desc": "Picnic, đi xe đạp, gia đình. Vào cửa ¥450 (≤ THCS miễn phí)",
    "category": "camp",
    "categoryLabel": "Camping",
    "fee": "paid",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Uminonakamichi%20Seaside%20Park%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Uminonakamichi%20Seaside%20Park%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Uminonakamichi,Seaside,Park,camping,bbq,outdoor,nature?lock=1030",
    "imgFallback": "https://picsum.photos/seed/choco1030/680/460"
  },
  {
    "slug": "nokonoshima-island-park",
    "name": "Nokonoshima Island Park",
    "area": "Đảo Nokonoshima",
    "desc": "Hoa, picnic, view biển. Vào cửa ¥1.500 + vé phà",
    "category": "camp",
    "categoryLabel": "Camping",
    "fee": "paid",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Nokonoshima%20Island%20Park%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Nokonoshima%20Island%20Park%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Nokonoshima,Island,Park,camping,bbq,outdoor,nature?lock=1031",
    "imgFallback": "https://picsum.photos/seed/choco1031/680/460"
  },
  {
    "slug": "itoshima-area",
    "name": "Itoshima area",
    "area": "Itoshima",
    "desc": "Biển, BBQ, camping, cafe. Biển free; khu cắm trại tùy nơi",
    "category": "camp",
    "categoryLabel": "Camping",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Itoshima%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Itoshima%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Itoshima,area,camping,bbq,outdoor,nature?lock=1032",
    "imgFallback": "https://picsum.photos/seed/choco1032/680/460"
  },
  {
    "slug": "shikanoshima-2",
    "name": "Shikanoshima",
    "area": "Higashi-ku",
    "desc": "Đi biển, camping nhẹ, lái xe. Bãi biển free",
    "category": "camp",
    "categoryLabel": "Camping",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Shikanoshima%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Shikanoshima%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Shikanoshima,camping,bbq,outdoor,nature?lock=1033",
    "imgFallback": "https://picsum.photos/seed/choco1033/680/460"
  },
  {
    "slug": "hoshinofurusato-park",
    "name": "Hoshinofurusato Park",
    "area": "Yame",
    "desc": "Camping, ngắm sao, thiên nhiên. Khu cắm trại có phí",
    "category": "camp",
    "categoryLabel": "Camping",
    "fee": "paid",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Hoshino%20Furusato%20Park%20Yame%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Hoshino%20Furusato%20Park%20Yame%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Hoshinofurusato,Park,camping,bbq,outdoor,nature?lock=1034",
    "imgFallback": "https://picsum.photos/seed/choco1034/680/460"
  },
  {
    "slug": "greenpia-yame",
    "name": "Greenpia Yame",
    "area": "Yame",
    "desc": "Camping, resort, gia đình (onsen, cottage có phí)",
    "category": "camp",
    "categoryLabel": "Camping",
    "fee": "paid",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Greenpia%20Yame%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Greenpia%20Yame%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Greenpia,Yame,camping,bbq,outdoor,nature?lock=1035",
    "imgFallback": "https://picsum.photos/seed/choco1035/680/460"
  },
  {
    "slug": "kyushu-geibunkan-chikugo",
    "name": "Kyushu Geibunkan / Chikugo",
    "area": "Chikugo",
    "desc": "Picnic, đi chơi xa nhẹ. Vào cửa khu chính miễn phí",
    "category": "camp",
    "categoryLabel": "Camping",
    "fee": "free",
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Kyushu%20Geibunkan%20Chikugo%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Kyushu%20Geibunkan%20Chikugo%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Kyushu,Geibunkan,Chikugo,camping,bbq,outdoor,nature?lock=1036",
    "imgFallback": "https://picsum.photos/seed/choco1036/680/460"
  },
  {
    "slug": "mount-homan",
    "name": "Mount Homan (宝満山)",
    "area": "Trung bình · rất nổi tiếng",
    "desc": "Đỉnh núi nổi tiếng nhất vùng Dazaifu",
    "category": "mountain",
    "categoryLabel": "Leo núi",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Mount%20Homan%20Dazaifu%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Mount%20Homan%20Dazaifu%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Mount,Homan,mountain,hiking,forest?lock=1037",
    "imgFallback": "https://picsum.photos/seed/choco1037/680/460"
  },
  {
    "slug": "mount-tenpaizan",
    "name": "Mount Tenpaizan (天拝山)",
    "area": "Dễ · hợp người mới",
    "desc": "Leo nhẹ nhàng, lý tưởng cho người mới bắt đầu",
    "category": "mountain",
    "categoryLabel": "Leo núi",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Mount%20Tenpaizan%20Chikushino%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Mount%20Tenpaizan%20Chikushino%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Mount,Tenpaizan,mountain,hiking,forest?lock=1038",
    "imgFallback": "https://picsum.photos/seed/choco1038/680/460"
  },
  {
    "slug": "mount-aburayama",
    "name": "Mount Aburayama (油山)",
    "area": "Dễ–TB · gần thành phố",
    "desc": "Gần Fukuoka city, dễ tiếp cận",
    "category": "mountain",
    "categoryLabel": "Leo núi",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Aburayama%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Aburayama%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Mount,Aburayama,mountain,hiking,forest?lock=1039",
    "imgFallback": "https://picsum.photos/seed/choco1039/680/460"
  },
  {
    "slug": "mount-sefuri",
    "name": "Mount Sefuri (背振山)",
    "area": "Trung bình · thiên nhiên đẹp",
    "desc": "Ranh giới Fukuoka–Saga, cảnh đẹp",
    "category": "mountain",
    "categoryLabel": "Leo núi",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Mount%20Sefuri%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Mount%20Sefuri%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Mount,Sefuri,mountain,hiking,forest?lock=1040",
    "imgFallback": "https://picsum.photos/seed/choco1040/680/460"
  },
  {
    "slug": "mount-raizan",
    "name": "Mount Raizan (雷山)",
    "area": "Trung bình · mùa lá đỏ",
    "desc": "Itoshima, đẹp nhất mùa lá đỏ",
    "category": "mountain",
    "categoryLabel": "Leo núi",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Mount%20Raizan%20Itoshima%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Mount%20Raizan%20Itoshima%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Mount,Raizan,mountain,hiking,forest?lock=1041",
    "imgFallback": "https://picsum.photos/seed/choco1041/680/460"
  },
  {
    "slug": "mount-tachibana",
    "name": "Mount Tachibana (立花山)",
    "area": "Dễ–TB",
    "desc": "Higashi-ku, đường mòn dễ chịu",
    "category": "mountain",
    "categoryLabel": "Leo núi",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Mount%20Tachibana%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Mount%20Tachibana%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Mount,Tachibana,mountain,hiking,forest?lock=1042",
    "imgFallback": "https://picsum.photos/seed/choco1042/680/460"
  },
  {
    "slug": "mount-kaya",
    "name": "Mount Kaya (可也山)",
    "area": "Trung bình · view biển",
    "desc": "Nhìn ra biển Itoshima",
    "category": "mountain",
    "categoryLabel": "Leo núi",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Mount%20Kaya%20Itoshima%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Mount%20Kaya%20Itoshima%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Mount,Kaya,mountain,hiking,forest?lock=1043",
    "imgFallback": "https://picsum.photos/seed/choco1043/680/460"
  },
  {
    "slug": "sarakurayama",
    "name": "Sarakurayama (皿倉山)",
    "area": "Có cáp treo · ngắm đêm",
    "desc": "View đêm tuyệt đẹp ở Kitakyushu",
    "category": "mountain",
    "categoryLabel": "Leo núi",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Sarakurayama%20Kitakyushu%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Sarakurayama%20Kitakyushu%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Sarakurayama,mountain,hiking,forest?lock=1044",
    "imgFallback": "https://picsum.photos/seed/choco1044/680/460"
  },
  {
    "slug": "ohori-park-2",
    "name": "Ohori Park",
    "area": "Chuo-ku",
    "desc": "Hồ lớn, đi dạo, chạy bộ, cafe",
    "category": "park",
    "categoryLabel": "Công viên",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Ohori%20Park%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Ohori%20Park%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Ohori,Park,park,garden,flowers?lock=1045",
    "imgFallback": "https://picsum.photos/seed/choco1045/680/460"
  },
  {
    "slug": "maizuru-park",
    "name": "Maizuru Park",
    "area": "Chuo-ku",
    "desc": "Di tích thành Fukuoka, hoa anh đào",
    "category": "park",
    "categoryLabel": "Công viên",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Maizuru%20Park%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Maizuru%20Park%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Maizuru,Park,park,garden,flowers?lock=1046",
    "imgFallback": "https://picsum.photos/seed/choco1046/680/460"
  },
  {
    "slug": "nishi-park",
    "name": "Nishi Park",
    "area": "Chuo-ku",
    "desc": "Hoa anh đào, view biển / thành phố",
    "category": "park",
    "categoryLabel": "Công viên",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Nishi%20Park%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Nishi%20Park%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Nishi,Park,park,garden,flowers?lock=1047",
    "imgFallback": "https://picsum.photos/seed/choco1047/680/460"
  },
  {
    "slug": "uminonakamichi-seaside-park-3",
    "name": "Uminonakamichi Seaside Park",
    "area": "Higashi-ku",
    "desc": "Rất rộng, hoa, xe đạp, gia đình",
    "category": "park",
    "categoryLabel": "Công viên",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Uminonakamichi%20Seaside%20Park%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Uminonakamichi%20Seaside%20Park%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Uminonakamichi,Seaside,Park,park,garden,flowers?lock=1048",
    "imgFallback": "https://picsum.photos/seed/choco1048/680/460"
  },
  {
    "slug": "nokonoshima-island-park-2",
    "name": "Nokonoshima Island Park",
    "area": "Nokonoshima",
    "desc": "Hoa theo mùa, view biển",
    "category": "park",
    "categoryLabel": "Công viên",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Nokonoshima%20Island%20Park%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Nokonoshima%20Island%20Park%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Nokonoshima,Island,Park,park,garden,flowers?lock=1049",
    "imgFallback": "https://picsum.photos/seed/choco1049/680/460"
  },
  {
    "slug": "island-city-central-park",
    "name": "Island City Central Park",
    "area": "Higashi-ku",
    "desc": "Hiện đại, rộng, hợp gia đình",
    "category": "park",
    "categoryLabel": "Công viên",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Island%20City%20Central%20Park%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Island%20City%20Central%20Park%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Island,City,Central,park,garden,flowers?lock=1050",
    "imgFallback": "https://picsum.photos/seed/choco1050/680/460"
  },
  {
    "slug": "yusentei-park",
    "name": "Yusentei Park",
    "area": "Jonan-ku",
    "desc": "Vườn Nhật yên tĩnh",
    "category": "park",
    "categoryLabel": "Công viên",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Yusentei%20Park%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Yusentei%20Park%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Yusentei,Park,park,garden,flowers?lock=1051",
    "imgFallback": "https://picsum.photos/seed/choco1051/680/460"
  },
  {
    "slug": "katsuma-seaside-park",
    "name": "Katsuma Seaside Park",
    "area": "Shikanoshima",
    "desc": "Biển và công viên",
    "category": "park",
    "categoryLabel": "Công viên",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Katsuma%20Beach%20Shikanoshima%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Katsuma%20Beach%20Shikanoshima%20Fukuoka",
    "img": "https://loremflickr.com/680/460/Katsuma,Seaside,Park,park,garden,flowers?lock=1052",
    "imgFallback": "https://picsum.photos/seed/choco1052/680/460"
  },
  {
    "slug": "tre-xanh",
    "name": "Tre Xanh / チェーサイン",
    "area": "Hakata",
    "desc": "Quán Việt nổi tiếng gần Hakata (có cơ sở gần 博多駅東 & 博多駅前)",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Tre%20Xanh%20%E3%83%81%E3%82%A7%E3%83%BC%E3%82%B5%E3%82%A4%E3%83%B3%20Hakata%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Tre%20Xanh%20%E3%83%81%E3%82%A7%E3%83%BC%E3%82%B5%E3%82%A4%E3%83%B3%20Hakata%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1053",
    "imgFallback": "https://picsum.photos/seed/choco1053/680/460"
  },
  {
    "slug": "tre-xanh-2-2",
    "name": "Tre Xanh 2 / チェーサイン2号",
    "area": "Hakata Ekimae",
    "desc": "Gần Hakata Ekimae, hợp đi ăn nhóm",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Tre%20Xanh%202%20%E3%83%81%E3%82%A7%E3%83%BC%E3%82%B5%E3%82%A4%E3%83%B3%20Hakata%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Tre%20Xanh%202%20%E3%83%81%E3%82%A7%E3%83%BC%E3%82%B5%E3%82%A4%E3%83%B3%20Hakata%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1054",
    "imgFallback": "https://picsum.photos/seed/choco1054/680/460"
  },
  {
    "slug": "ga-sai-gon",
    "name": "Gà Sài Gòn / ガーサイゴン",
    "area": "Hakata Ekimae",
    "desc": "Quán Việt khu Hakata Ekimae",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Ga%20Sai%20Gon%20%E3%82%AC%E3%83%BC%E3%82%B5%E3%82%A4%E3%82%B4%E3%83%B3%20Hakata%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Ga%20Sai%20Gon%20%E3%82%AC%E3%83%BC%E3%82%B5%E3%82%A4%E3%82%B4%E3%83%B3%20Hakata%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1055",
    "imgFallback": "https://picsum.photos/seed/choco1055/680/460"
  },
  {
    "slug": "au-viet-restaurant",
    "name": "Âu Việt Restaurant",
    "area": "Higashi-Hie",
    "desc": "Khu Higashi-Hie, gần Hakata",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Au%20Viet%20Restaurant%20Higashi-Hie%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Au%20Viet%20Restaurant%20Higashi-Hie%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1056",
    "imgFallback": "https://picsum.photos/seed/choco1056/680/460"
  },
  {
    "slug": "lotus-palace-hakata",
    "name": "Lotus Palace Hakata",
    "area": "Hakata",
    "desc": "Dễ đi từ ga Hakata, hợp đi với người Nhật",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Lotus%20Palace%20Hakata%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Lotus%20Palace%20Hakata%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1057",
    "imgFallback": "https://picsum.photos/seed/choco1057/680/460"
  },
  {
    "slug": "ban-mai",
    "name": "Ban Mai / バンマイ",
    "area": "Hakata / Higashi-Hie",
    "desc": "Quán Việt khu Hakata / Higashi-Hie",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Ban%20Mai%20%E3%83%90%E3%83%B3%E3%83%9E%E3%82%A4%20Hakata%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Ban%20Mai%20%E3%83%90%E3%83%B3%E3%83%9E%E3%82%A4%20Hakata%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1058",
    "imgFallback": "https://picsum.photos/seed/choco1058/680/460"
  },
  {
    "slug": "vietnamese-cuisine",
    "name": "VIETNAMESE CUISINE",
    "area": "Nakasu",
    "desc": "Khu Nakasu / Nakasu-Kawabata, gần trung tâm",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Vietnamese%20Cuisine%20Nakasu%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Vietnamese%20Cuisine%20Nakasu%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1059",
    "imgFallback": "https://picsum.photos/seed/choco1059/680/460"
  },
  {
    "slug": "39",
    "name": "39 ベトナム料理",
    "area": "Ohashi",
    "desc": "Quán Việt ở Ohashi",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=39%20%E3%83%99%E3%83%88%E3%83%8A%E3%83%A0%E6%96%99%E7%90%86%20Ohashi%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=39%20%E3%83%99%E3%83%88%E3%83%8A%E3%83%A0%E6%96%99%E7%90%86%20Ohashi%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1060",
    "imgFallback": "https://picsum.photos/seed/choco1060/680/460"
  },
  {
    "slug": "goc-viet",
    "name": "Góc Việt / ゴックベト",
    "area": "Ohashi",
    "desc": "Quán Việt khu Ohashi",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Goc%20Viet%20%E3%82%B4%E3%83%83%E3%82%AF%E3%83%99%E3%83%88%20Ohashi%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Goc%20Viet%20%E3%82%B4%E3%83%83%E3%82%AF%E3%83%99%E3%83%88%20Ohashi%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1061",
    "imgFallback": "https://picsum.photos/seed/choco1061/680/460"
  },
  {
    "slug": "lotus-palace-daimyo-garden-city",
    "name": "Lotus Palace Daimyo Garden City",
    "area": "Daimyo / Tenjin",
    "desc": "Vị trí đẹp ngay khu Daimyo",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Lotus%20Palace%20Daimyo%20Garden%20City%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Lotus%20Palace%20Daimyo%20Garden%20City%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1062",
    "imgFallback": "https://picsum.photos/seed/choco1062/680/460"
  },
  {
    "slug": "xin-chao",
    "name": "Xin Chao / シンチャオ",
    "area": "Ropponmatsu",
    "desc": "Quán Việt khu Ropponmatsu",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Xin%20Chao%20%E3%82%B7%E3%83%B3%E3%83%81%E3%83%A3%E3%82%AA%20Ropponmatsu%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Xin%20Chao%20%E3%82%B7%E3%83%B3%E3%83%81%E3%83%A3%E3%82%AA%20Ropponmatsu%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1063",
    "imgFallback": "https://picsum.photos/seed/choco1063/680/460"
  },
  {
    "slug": "vietnam-bistro-asiatico",
    "name": "Vietnam Bistro Asiatico",
    "area": "Tenjin",
    "desc": "Quán Việt / châu Á",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Vietnam%20Bistro%20Asiatico%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Vietnam%20Bistro%20Asiatico%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1064",
    "imgFallback": "https://picsum.photos/seed/choco1064/680/460"
  },
  {
    "slug": "miss-saigon",
    "name": "Miss Saigon",
    "area": "Tenjin",
    "desc": "Quán Việt",
    "category": "viet",
    "categoryLabel": "Quán Việt",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=Miss%20Saigon%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=Miss%20Saigon%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/vietnamese,pho,food?lock=1065",
    "imgFallback": "https://picsum.photos/seed/choco1065/680/460"
  },
  {
    "slug": "hsc-station-cho-viet",
    "name": "HSC STATION / Chợ Việt",
    "area": "Hakozaki · Hakata · Shingu",
    "desc": "Cửa hàng Việt nổi trong cộng đồng",
    "category": "grocery",
    "categoryLabel": "Tạp hóa",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=HSC%20STATION%20Cho%20Viet%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=HSC%20STATION%20Cho%20Viet%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/asian,grocery,store?lock=1066",
    "imgFallback": "https://picsum.photos/seed/choco1066/680/460"
  },
  {
    "slug": "tam-market",
    "name": "TAM MARKET",
    "area": "Fukuoka",
    "desc": "Tạp hóa Việt Nam (tìm: TAM MARKET 福岡)",
    "category": "grocery",
    "categoryLabel": "Tạp hóa",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=TAM%20MARKET%20%E7%A6%8F%E5%B2%A1%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=TAM%20MARKET%20%E7%A6%8F%E5%B2%A1%20Fukuoka",
    "img": "https://loremflickr.com/680/460/asian,grocery,store?lock=1067",
    "imgFallback": "https://picsum.photos/seed/choco1067/680/460"
  },
  {
    "slug": "asia-no-eki",
    "name": "Asia no Eki / アジアの駅",
    "area": "Chiyo · Hakata-ku",
    "desc": "Thực phẩm châu Á, có hàng Việt",
    "category": "grocery",
    "categoryLabel": "Tạp hóa",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=%E3%82%A2%E3%82%B8%E3%82%A2%E3%81%AE%E9%A7%85%20Chiyo%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=%E3%82%A2%E3%82%B8%E3%82%A2%E3%81%AE%E9%A7%85%20Chiyo%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/asian,grocery,store?lock=1068",
    "imgFallback": "https://picsum.photos/seed/choco1068/680/460"
  },
  {
    "slug": "ahihi",
    "name": "Ahihi / あひひ",
    "area": "Fukuoka",
    "desc": "Hàng Việt được cộng đồng biết đến",
    "category": "grocery",
    "categoryLabel": "Tạp hóa",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=%E3%81%82%E3%81%B2%E3%81%B2%20%E3%83%99%E3%83%88%E3%83%8A%E3%83%A0%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=%E3%81%82%E3%81%B2%E3%81%B2%20%E3%83%99%E3%83%88%E3%83%8A%E3%83%A0%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/asian,grocery,store?lock=1069",
    "imgFallback": "https://picsum.photos/seed/choco1069/680/460"
  },
  {
    "slug": "bach-hoa-akt-akt-store",
    "name": "Bách Hóa AKT / AKT STORE",
    "area": "Fukuoka",
    "desc": "Tạp hóa Việt Nam",
    "category": "grocery",
    "categoryLabel": "Tạp hóa",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=AKT%20STORE%20%E3%83%99%E3%83%88%E3%83%8A%E3%83%A0%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=AKT%20STORE%20%E3%83%99%E3%83%88%E3%83%8A%E3%83%A0%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/asian,grocery,store?lock=1070",
    "imgFallback": "https://picsum.photos/seed/choco1070/680/460"
  },
  {
    "slug": "sk",
    "name": "SK 中越物産",
    "area": "Hakata / Higashi-Hie",
    "desc": "Bán hàng Việt và châu Á",
    "category": "grocery",
    "categoryLabel": "Tạp hóa",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=SK%20%E4%B8%AD%E8%B6%8A%E7%89%A9%E7%94%A3%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=SK%20%E4%B8%AD%E8%B6%8A%E7%89%A9%E7%94%A3%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/asian,grocery,store?lock=1071",
    "imgFallback": "https://picsum.photos/seed/choco1071/680/460"
  },
  {
    "slug": "vinahouse",
    "name": "Vinahouse / ビナハウス",
    "area": "Tojinmachi",
    "desc": "Gần Ohori, bán thực phẩm Việt",
    "category": "grocery",
    "categoryLabel": "Tạp hóa",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=%E3%83%93%E3%83%8A%E3%83%8F%E3%82%A6%E3%82%B9%20%E5%94%90%E4%BA%BA%E7%94%BA%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=%E3%83%93%E3%83%8A%E3%83%8F%E3%82%A6%E3%82%B9%20%E5%94%90%E4%BA%BA%E7%94%BA%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/asian,grocery,store?lock=1072",
    "imgFallback": "https://picsum.photos/seed/choco1072/680/460"
  },
  {
    "slug": "san-pham-viet-fukuoka",
    "name": "Sản Phẩm Việt Fukuoka",
    "area": "Fukuoka",
    "desc": "Bán hàng Việt (thường thấy trên Facebook)",
    "category": "grocery",
    "categoryLabel": "Tạp hóa",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=San%20Pham%20Viet%20Fukuoka%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=San%20Pham%20Viet%20Fukuoka%20Fukuoka",
    "img": "https://loremflickr.com/680/460/asian,grocery,store?lock=1073",
    "imgFallback": "https://picsum.photos/seed/choco1073/680/460"
  },
  {
    "slug": "izakaya-hakata",
    "name": "新時代 博多駅前店",
    "area": "Hakata · 博多口",
    "desc": "Gần phía Hakata Station mặt trước",
    "category": "izakaya",
    "categoryLabel": "Izakaya",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=%E6%96%B0%E6%99%82%E4%BB%A3%20%E5%8D%9A%E5%A4%9A%E9%A7%85%E5%89%8D%E5%BA%97%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=%E6%96%B0%E6%99%82%E4%BB%A3%20%E5%8D%9A%E5%A4%9A%E9%A7%85%E5%89%8D%E5%BA%97%20Fukuoka",
    "img": "https://loremflickr.com/680/460/izakaya,beer,japanese,pub?lock=1074",
    "imgFallback": "https://picsum.photos/seed/choco1074/680/460"
  },
  {
    "slug": "izakaya-fko",
    "name": "新時代 博多駅東店",
    "area": "筑紫口 · 駅東",
    "desc": "Gần phía mặt sau ga Hakata",
    "category": "izakaya",
    "categoryLabel": "Izakaya",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=%E6%96%B0%E6%99%82%E4%BB%A3%20%E5%8D%9A%E5%A4%9A%E9%A7%85%E6%9D%B1%E5%BA%97%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=%E6%96%B0%E6%99%82%E4%BB%A3%20%E5%8D%9A%E5%A4%9A%E9%A7%85%E6%9D%B1%E5%BA%97%20Fukuoka",
    "img": "https://loremflickr.com/680/460/izakaya,beer,japanese,pub?lock=1075",
    "imgFallback": "https://picsum.photos/seed/choco1075/680/460"
  },
  {
    "slug": "izakaya-tenjin-imaizumi",
    "name": "新時代 福岡天神店",
    "area": "Tenjin · Imaizumi",
    "desc": "Gần khu Tenjin, dễ đi nhậu sau giờ làm",
    "category": "izakaya",
    "categoryLabel": "Izakaya",
    "fee": null,
    "mapUrl": "https://www.google.com/maps/search/?api=1&query=%E6%96%B0%E6%99%82%E4%BB%A3%20%E7%A6%8F%E5%B2%A1%E5%A4%A9%E7%A5%9E%E5%BA%97%20Fukuoka",
    "photoUrl": "https://www.google.com/search?tbm=isch&q=%E6%96%B0%E6%99%82%E4%BB%A3%20%E7%A6%8F%E5%B2%A1%E5%A4%A9%E7%A5%9E%E5%BA%97%20Fukuoka",
    "img": "https://loremflickr.com/680/460/izakaya,beer,japanese,pub?lock=1076",
    "imgFallback": "https://picsum.photos/seed/choco1076/680/460"
  }
];

export function getPlace(slug: string): Place | undefined {
  return places.find((p) => p.slug === slug);
}
export function placesByCategory(code: string): Place[] {
  return places.filter((p) => p.category === code);
}
export function relatedPlaces(p: Place, n = 3): Place[] {
  return places.filter((x) => x.category === p.category && x.slug !== p.slug).slice(0, n);
}

// ── Supabase DB helpers ──────────────────────────────────────────────────────

interface DbPlace {
  slug: string; name: string; area: string; description: string | null;
  body: string | null; category: string; category_label: string;
  fee: string | null; map_url: string | null; photo_url: string | null;
  img: string | null; img_fallback: string | null; sort_order: number;
}

function mapDbPlace(row: DbPlace): Place {
  return {
    slug: row.slug,
    name: row.name,
    area: row.area,
    desc: row.description ?? '',
    body: row.body,
    category: row.category,
    categoryLabel: row.category_label,
    fee: (row.fee as Fee) ?? null,
    mapUrl: row.map_url ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.name + ' Fukuoka')}`,
    photoUrl: row.photo_url ?? `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(row.name)}`,
    img: row.img ?? `https://loremflickr.com/680/460/${row.category},japan?lock=${row.slug.charCodeAt(0) * 99}`,
    imgFallback: row.img_fallback ?? `https://picsum.photos/seed/${row.slug.slice(0, 8)}/680/460`,
  };
}

export async function getAllPlacesFromDb(): Promise<Place[] | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = createClient();
    const { data, error } = await supabase
      .from('places')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error || !data?.length) return null;
    return (data as DbPlace[]).map(mapDbPlace);
  } catch { return null; }
}

export async function getPlaceFromDb(slug: string): Promise<Place | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = createClient();
    const { data, error } = await supabase
      .from('places')
      .select('*')
      .eq('slug', slug)
      .single();
    if (error || !data) return null;
    return mapDbPlace(data as DbPlace);
  } catch { return null; }
}
