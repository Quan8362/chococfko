# -*- coding: utf-8 -*-
"""Build N2 ready wave 035 — work, employment, salary, HR, workplace, labor."""
import os
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "japanese", "jmdict-n2-vi-ready-035.csv")
HEADER = "word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,source_id,license,attribution,example_jp,example_reading,example_vi,example_en,review_status,meaning_source"
LIC = "CC BY-SA 3.0 — verify at edrdg.org before production use"
def q(v): return '"' + str(v).replace('"','""') + '"'
def row(w,r,p,vi,en,s):
    return ",".join([q(w),q(r),q(""),q("N2"),q(p),q(vi),q(en),q(""),q("0"),q("jmdict"),q(s),q(LIC),q("JMdict/EDRDG"),q(""),q(""),q(""),q(""),q("ai_draft"),q("jmdict_ai")])
DATA = [
    ("勤労","きんろう","n|vs|vi","lao động | sự cần lao | làm việc chuyên cần","labor | exertion | diligent service","1241160"),
    ("稼業","かぎょう","n","nghề nghiệp | nghề kiếm sống | việc làm ăn","trade | business | occupation","1194470"),
    ("副業","ふくぎょう","n","nghề tay trái | nghề phụ | việc làm thêm","side job | sideline","1500380"),
    ("本業","ほんぎょう","n","nghề chính | công việc chính","principal occupation | core business","1522410"),
    ("専業","せんぎょう","n","nghề chuyên | nghề chính | độc quyền","special occupation | specialty | monopoly","1389770"),
    ("兼業","けんぎょう","n|vs|vt","làm thêm nghề khác | kiêm nhiệm | nghề tay trái","pursuing as a side business | side business","1578300"),
    ("自営業","じえいぎょう","n","kinh doanh tự do | tự làm chủ","independent business | self-employment","1609850"),
    ("分業","ぶんぎょう","n|vs|vt|vi","phân công lao động | chuyên môn hóa","division of labor | specialization","1503390"),
    ("作業","さぎょう","n|vs|vi","công việc | thao tác | tác nghiệp","work | operation | task","1297540"),
    ("責務","せきむ","n","trách nhiệm | nghĩa vụ | bổn phận","duty | obligation","1383230"),
    ("激務","げきむ","n","công việc vất vả | việc nặng nhọc | nhiệm vụ căng","exhausting work | hard work","1592770"),
    ("雑務","ざつむ","n","việc vặt | công việc lặt vặt | việc tạp nham","miscellaneous duties | odd jobs","1813820"),
    ("要職","ようしょく","n","chức vụ quan trọng | vị trí then chốt","important post | key position","1836270"),
    ("役職","やくしょく","n","chức vụ | chức quản lý | vị trí điều hành","post | managerial position","1538040"),
    ("受け持ち","うけもち","n|adj-no","phụ trách | việc đảm nhận | phần việc của mình","charge (of something) | one's assignment","1588070"),
    ("持ち場","もちば","n","vị trí phụ trách | chỗ làm | địa bàn | ca trực","one's post | one's station | one's beat","1315620"),
    ("人事","じんじ","n","nhân sự | việc đời | việc của con người","personnel affairs | human resources | human affairs","1367870"),
    ("異動","いどう","n|vs|vt|vi","điều động | luân chuyển | thuyên chuyển (nhân sự)","(personnel) change | transfer | reassignment","1157970"),
    ("出向","しゅっこう","n|vs|vi","biệt phái | điều chuyển tạm | cử đi","temporary transfer (of an employee) | secondment","1338870"),
    ("単身赴任","たんしんふにん","n|vs|vi","đi làm xa một mình | xa gia đình vì công việc","taking up a post away from one's family","1417660"),
    ("徹夜","てつや","n|vs|vi|adj-no","thức trắng đêm | thâu đêm","staying up all night","1437700"),
    ("在籍","ざいせき","n|vs|vi","có tên trong danh sách | đang theo học | là thành viên","being enrolled | being registered | being a member","1296530"),
    ("日当","にっとう","n","tiền công ngày | phụ cấp theo ngày","daily allowance | daily wages","1464310"),
    ("時給","じきゅう","n","lương theo giờ","hourly pay | hourly wage","1316100"),
    ("月給","げっきゅう","n","lương tháng","monthly salary","1255560"),
    ("年俸","ねんぽう","n","lương năm | mức lương hằng năm","annual salary","1469170"),
    ("基本給","きほんきゅう","n","lương cơ bản","base pay","1756680"),
    ("歩合","ぶあい","n","tỷ lệ | phần trăm | hoa hồng | tiền công khoán","rate | percentage | commission","1514400"),
    ("退職金","たいしょくきん","n","tiền trợ cấp thôi việc | tiền nghỉ hưu (một lần)","severance payment | retirement money","1661130"),
    ("応募","おうぼ","n|vs|vt|vi","ứng tuyển | đăng ký | dự thi | đăng lính","application | entry | enlistment","1180030"),
    ("採否","さいひ","n","nhận hay không | sự tuyển chọn hoặc từ chối","adoption or rejection","1294860"),
    ("見習い","みならい","n","tập sự | học việc | thử việc | người học nghề","apprenticeship | probation | trainee","1604640"),
    ("試用","しよう","n|vs|vt","dùng thử | thử việc | dùng thử nghiệm","trial | trying out","1312550"),
    ("本採用","ほんさいよう","n","tuyển dụng chính thức | nhận làm nhân viên chính","permanent employment | being hired as regular","2838836"),
    ("正社員","せいしゃいん","n","nhân viên chính thức | nhân viên biên chế","regular employee | full-time employee","1377330"),
    ("派遣社員","はけんしゃいん","n","nhân viên phái cử | nhân viên thời vụ (qua công ty)","temporary employee (from an agency)","1999690"),
    ("契約社員","けいやくしゃいん","n","nhân viên hợp đồng","contract employee","1991390"),
    ("非正規","ひせいき","n|adj-no|adj-f","phi chính thức | không chính quy | thời vụ (việc làm)","irregular employment | non-regular","2828628"),
    ("雇用契約","こようけいやく","n","hợp đồng lao động","contract of employment","1934740"),
    ("就業規則","しゅうぎょうきそく","n","nội quy lao động | quy chế làm việc","work regulations","1331600"),
    ("労使","ろうし","n","lao động và quản lý | giới chủ và người lao động","labour and management","1560330"),
    ("労組","ろうそ","n","công đoàn | nghiệp đoàn lao động","labor union | trade union","1560350"),
    ("組合","くみあい","n","hội | hiệp hội | công đoàn | nghiệp đoàn","association | union | guild","1397620"),
    ("団交","だんこう","n","thương lượng tập thể | đàm phán tập thể","collective bargaining","1654310"),
    ("ストライキ","ストライキ","n|vs|vi","đình công | bãi công","strike (industrial action)","1071180"),
    ("過労死","かろうし","n|vs|vi","chết do làm việc quá sức","karōshi | death from overwork","1196500"),
    ("労災","ろうさい","n","tai nạn lao động | bệnh nghề nghiệp | bảo hiểm lao động","work-related injury | workers' compensation","1560290"),
    ("職場","しょくば","n","nơi làm việc | chỗ làm","place of work | workplace","1357540"),
    ("事業所","じぎょうしょ","n","cơ sở kinh doanh | nơi làm việc | văn phòng","establishment | place of business | office","1313740"),
    ("出先","でさき","n","nơi đến | điểm công tác | văn phòng đại diện","one's destination | branch office","1339510"),
    ("窓口","まどぐち","n","quầy giao dịch | cửa sổ | đầu mối liên hệ","counter | window | point of contact","1401420"),
    ("管理者","かんりしゃ","n","người quản lý | người phụ trách | quản trị viên","manager | administrator | supervisor","1214230"),
    ("創業者","そうぎょうしゃ","n","người sáng lập (công ty)","founder (of a company)","1398350"),
    ("後継者","こうけいしゃ","n","người kế nhiệm | người kế tục","successor","1269600"),
    ("社員","しゃいん","n","nhân viên công ty | thành viên công ty","company employee | member of a corporation","1322670"),
    ("新入社員","しんにゅうしゃいん","n|adj-no","nhân viên mới | nhân viên mới vào | lính mới","new employee | new hire","1362250"),
    ("中途採用","ちゅうとさいよう","n","tuyển dụng giữa chừng | tuyển người có kinh nghiệm","mid-career recruitment","2059610"),
    ("即戦力","そくせんりょく","n","lực lượng dùng được ngay | người làm được việc ngay","immediate asset (to a team or firm)","2727760"),
]
rows=[row(*d) for d in DATA]
open(OUT,"w",encoding="utf-8",newline="\n").write(HEADER+"\n"+"\n".join(rows)+"\n")
print(f"Written {len(rows)} rows")
